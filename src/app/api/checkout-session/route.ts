/**
 * Create a Checkout Session for the embedded Payment Element (ui_mode: 'elements').
 *
 * This is the Stripe-recommended surface (over a raw PaymentIntent): Stripe owns
 * dynamic payment methods, wallets and billing-field rules. VAT, however, we
 * calculate ourselves (Stripe Tax is OFF) to avoid its 0.5%/txn fee: we apply a
 * Danish VAT Tax Rate to DK + EU buyers and 0% to non-EU buyers, classified from
 * the IP country. See [[vat]] for the jurisdiction rule. We keep our own GMP
 * order code as the identifier by writing it to the session + the underlying
 * PaymentIntent (description + metadata).
 */

import Stripe from 'stripe'
import { getCatalog } from '@/lib/shop'
import { stripe } from '@/lib/stripe-server'
import { generateOrderCode } from '@/lib/downloads'
import { vatOutcome, HOME_COUNTRY, type BusinessVat } from '@/lib/vat'
import { verifyVatNumber, verifyVatToken } from '@/lib/vies'
import { getVatRate, getVatTaxRateId, setVatTaxRateId } from '@/lib/shop-settings'

interface RequestItem { sku: string }

/**
 * Resolve (creating + caching on first use) the Stripe Tax Rate id for a given
 * VAT percentage in the current Stripe mode. Tax Rate objects are immutable and
 * mode-specific, so the cache is keyed by (mode, pct).
 */
async function resolveVatRateId(pct: number): Promise<string> {
  const mode: 'live' | 'test' = (process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_live') ? 'live' : 'test'
  const cached = await getVatTaxRateId(mode, pct)
  if (cached) return cached
  const rate = await stripe.taxRates.create({
    display_name: 'VAT',
    description: `Danish VAT ${pct}%`,
    percentage: pct,
    inclusive: false, // exclusive — added on top of the catalog price
    country: HOME_COUNTRY,
    tax_type: 'vat',
  })
  await setVatTaxRateId(mode, pct, rate.id)
  return rate.id
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      items: RequestItem[]
      locale?: string
      business?: { vatId?: string; token?: string; declaredName?: string; declaredAddress?: string }
    }
    const locale = body.locale ?? 'en'
    // Buyer country from Cloudflare's IP geolocation (as the old flow did), so we
    // can set it on the session for tax WITHOUT making the buyer fill an address
    // form for a digital download. EU tax needs only the country. Dev has no
    // header, so default to DK to exercise VAT locally.
    const country =
      req.headers.get('cf-ipcountry') ??
      (process.env.NODE_ENV === 'development' ? 'DK' : null)
    const skus = (body.items ?? []).map((i) => i.sku)
    if (skus.length === 0) {
      return Response.json({ error: 'no items' }, { status: 400 })
    }

    const catalog = await getCatalog()
    if (catalog.length === 0) {
      console.error('[checkout-session] catalog empty — origin unreachable?')
      return Response.json({ error: 'catalog unavailable' }, { status: 503 })
    }

    const resolved = skus.map((sku) => {
      for (const photo of catalog) {
        const product = photo.products.find((p) => p.sku === sku)
        if (product) return { photo, product }
      }
      return null
    })
    if (resolved.some((r) => r === null)) {
      return Response.json({ error: 'one or more products not found' }, { status: 404 })
    }
    const items = resolved as NonNullable<(typeof resolved)[number]>[]

    const hasPhysical = items.some((i) => i.product.type !== 'digital')
    const currency = items[0].product.currency.toLowerCase()

    // Digital download items, surfaced to the success screen.
    const downloadItems = items
      .filter((i) => i.product.downloadToken)
      .map((i) => ({
        sku: i.product.sku,
        token: i.product.downloadToken!,
        format: i.product.format ?? 'jpeg',
        label: i.product.label,
        slug: i.photo.slug,
      }))

    // B2B: re-validate the VAT id against VIES SERVER-SIDE — never trust the
    // client's "valid" claim, or a buyer could fake a VAT id to dodge VAT (our
    // tax liability). Only a confirmed-valid id grants business treatment; if
    // VIES says invalid OR is unavailable, we fall back to consumer VAT.
    let business: (BusinessVat & { vatId: string; name: string | null; address: string | null; consultation: string | null }) | null = null
    // Prefer the signed token from the cart's VIES check (fast, unforgeable) so
    // we don't hit slow VIES twice. Only fall back to a fresh VIES call if the
    // token is missing/expired — never trust a raw client "valid" claim.
    const tokenData = verifyVatToken(body.business?.token)
    if (tokenData) {
      business = { vatCountry: tokenData.vatCountry, vatId: tokenData.vatId, name: tokenData.name, address: tokenData.address, consultation: tokenData.consultation }
    } else if (body.business?.vatId) {
      const v = await verifyVatNumber(body.business.vatId)
      if (v.status === 'valid') {
        business = { vatCountry: v.countryCode, vatId: v.fullId, name: v.name ?? null, address: v.address ?? null, consultation: v.consultationNumber ?? null }
      } else {
        console.warn('[checkout-session] VAT id not validated server-side:', v.status, v.fullId)
      }
    }
    // Some member states (e.g. Germany) validate the VAT id but don't disclose
    // the name/address. Fall back to the buyer-declared details ONLY to fill
    // those gaps — never to override what VIES authoritatively returned.
    if (business) {
      if (!business.name && body.business?.declaredName) business.name = String(body.business.declaredName).slice(0, 200)
      if (!business.address && body.business?.declaredAddress) business.address = String(body.business.declaredAddress).replace(/\s+/g, ' ').trim().slice(0, 350)
    }

    // Our customer-facing order code — written to the session AND the
    // PaymentIntent so it (not cs_/pi_) is the identifier everywhere.
    const orderCode = generateOrderCode()
    const metadata: Record<string, string> = {
      orderCode,
      locale,
      skus: skus.join(','),
      hasPhysical: String(hasPhysical),
    }

    // Manual VAT decision (B2C by IP, or B2B reverse charge for a validated EU
    // business). When taxable we attach a Stripe Tax Rate (exclusive) to every
    // line item so Stripe computes the tax line; reverse-charge / non-EU get no
    // rate (0%). We supply the rate ourselves instead of paying for Stripe Tax.
    const outcome = vatOutcome(country, business)
    const vatRateId = outcome.taxable ? await resolveVatRateId(await getVatRate()) : null

    // Record business + VAT treatment on the order for receipts and reporting
    // (reverse-charge EU sales go on the EC Sales List).
    if (business) {
      metadata.vatId = business.vatId
      if (business.name) metadata.businessName = business.name.slice(0, 200)
      if (business.address) metadata.businessAddress = business.address.replace(/\s+/g, ' ').trim().slice(0, 350)
      metadata.vatCountry = business.vatCountry
      if (business.consultation) metadata.vatConsultation = business.consultation
    }
    metadata.reverseCharge = String(outcome.reverseCharge)

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = items.map((i) => ({
      quantity: 1,
      ...(vatRateId ? { tax_rates: [vatRateId] } : {}),
      price_data: {
        currency,
        unit_amount: i.product.price,
        product_data: {
          name: `${i.photo.title} — ${i.product.label}`,
          metadata: { sku: i.product.sku },
        },
      },
    }))

    const session = await stripe.checkout.sessions.create({
      ui_mode: 'elements',
      mode: 'payment',
      line_items: lineItems,
      allow_promotion_codes: true, // buyer can enter a promo code at checkout
      // No billing_address_collection: 'required' — for a digital download we set
      // the country (from IP) client-side via updateBillingAddress instead of
      // showing an address form. Physical orders still collect a shipping address.
      ...(hasPhysical
        ? {
            shipping_address_collection: {
              allowed_countries: ['GB', 'DK', 'DE', 'FR', 'NL', 'SE', 'NO', 'US', 'CA', 'AU', 'JP'],
            },
          }
        : {}),
      return_url: `${new URL(req.url).origin}/${locale}/shop/order-complete?session_id={CHECKOUT_SESSION_ID}`,
      metadata,
      payment_intent_data: {
        description: `Order ${orderCode}`,
        metadata,
      },
    })

    return Response.json({
      clientSecret: session.client_secret,
      downloadItems,
      hasPhysical,
      currency,
      billingCountry: country,
      reverseCharge: outcome.reverseCharge,
      businessName: business?.name ?? null,
    })
  } catch (err) {
    const message = err instanceof Stripe.errors.StripeError
      ? `Stripe ${err.type}: ${err.message}`
      : String(err)
    console.error('[checkout-session] error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
