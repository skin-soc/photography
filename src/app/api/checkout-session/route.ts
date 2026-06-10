/**
 * Create a Checkout Session for the embedded Payment Element (ui_mode: 'elements').
 *
 * This is the Stripe-recommended surface (over a raw PaymentIntent): Stripe owns
 * dynamic payment methods, wallets and billing-field rules. VAT and discounts,
 * however, we compute ourselves — Stripe does NO calculation (see
 * [[stripe-payments-only]]). We add a self-computed VAT line for DK + EU buyers
 * (0% for non-EU, classified from the IP country, see [[vat]]) and apply our own
 * KV coupons to the net before tax, then hand Stripe one gross amount. We keep
 * our own GMP order code as the identifier by writing it to the session + the
 * underlying PaymentIntent (description + metadata).
 */

import Stripe from 'stripe'
import { getCatalog } from '@/lib/shop'
import { stripe } from '@/lib/stripe-server'
import { generateOrderCode } from '@/lib/downloads'
import { vatOutcome, type BusinessVat } from '@/lib/vat'
import { verifyVatNumber, verifyVatToken } from '@/lib/vies'
import { getVatRate } from '@/lib/shop-settings'
import { validateCoupon, discountFor } from '@/lib/coupons'
import { formatDKK } from '@/lib/currency'

interface RequestItem { sku: string }

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      items: RequestItem[]
      locale?: string
      couponCode?: string
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
    // Buyer IP — recorded with the country as our EU VAT place-of-supply evidence
    // (a single piece suffices under €100k cross-border; we're well under). Kept
    // on the order, never placed in a URL. cf-connecting-ip is the real client IP.
    const buyerIp =
      req.headers.get('cf-connecting-ip') ??
      req.headers.get('x-real-ip') ??
      ((req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null)
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
    // VAT place-of-supply evidence (Cloudflare geolocation). The webhook copies
    // these onto the order for the audit trail.
    if (country) metadata.buyerCountry = country
    if (buyerIp) metadata.buyerIp = buyerIp

    // Manual VAT decision (B2C by IP, or B2B reverse charge for a validated EU
    // business). DK + EU are taxable at the configured rate; reverse-charge /
    // non-EU are 0%. Catalog prices are net (ex-VAT).
    const outcome = vatOutcome(country, business)
    const rate = await getVatRate()
    const netTotal = items.reduce((s, i) => s + i.product.price, 0)

    // Our own coupon (Stripe does NO discount calc). Validate against this Stripe
    // mode's KV store; an invalid/expired code is surfaced to the client but
    // doesn't block checkout — the order just proceeds without a discount.
    let discountMinor = 0
    let appliedCoupon: string | null = null
    let couponError: string | null = null
    const couponCode = (body.couponCode ?? '').trim().toUpperCase()
    if (couponCode) {
      const v = await validateCoupon(couponCode, currency)
      if (v.ok) {
        discountMinor = discountFor(v.coupon, netTotal)
        appliedCoupon = v.coupon.code
      } else {
        couponError = v.reason
      }
    }

    const discountedNet = netTotal - discountMinor
    // A coupon that would zero the order isn't chargeable via the Payment Element.
    if (discountedNet <= 0) {
      return Response.json({ error: 'coupon too large for this order' }, { status: 400 })
    }
    // VAT computed by us on the discounted net (single rounding); 0% when not taxable.
    const taxMinor = outcome.taxable ? Math.round(discountedNet * rate / 100) : 0
    const gross = discountedNet + taxMinor

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
    // VAT + discount facts read back by fulfilment (webhook / issue route) — these
    // are the source of truth for the receipt, NOT any Stripe-computed tax.
    metadata.taxAmount = String(taxMinor)
    metadata.netAmount = String(discountedNet)
    metadata.vatRate = String(rate)
    if (appliedCoupon) {
      metadata.couponCode = appliedCoupon
      metadata.discountAmount = String(discountMinor)
    }

    // Spread the discounted net across the product lines (proportional to price),
    // reconciling rounding on the last line so the sum is exact — Stripe Checkout
    // has no negative line items, so the discount is baked into the line amounts.
    // A single self-computed VAT line follows; the invoice re-derives the discount
    // from (catalog sum − net), so no per-line discount record is needed.
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = []
    let allocated = 0
    items.forEach((i, idx) => {
      const lineNet = idx === items.length - 1
        ? discountedNet - allocated
        : Math.round(discountedNet * (i.product.price / netTotal))
      allocated += lineNet
      lineItems.push({
        quantity: 1,
        price_data: {
          currency,
          unit_amount: lineNet,
          product_data: {
            name: `${i.photo.title} — ${i.product.label}`,
            metadata: { sku: i.product.sku },
          },
        },
      })
    })
    if (taxMinor > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency,
          unit_amount: taxMinor,
          product_data: { name: `VAT (${rate}%)`, metadata: { sku: 'vat' } },
        },
      })
    }

    const session = await stripe.checkout.sessions.create({
      ui_mode: 'elements',
      mode: 'payment',
      line_items: lineItems,
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

    // Display strings come from US (Stripe computes no tax/discount now). The
    // shop charges DKK; format accordingly, with a generic fallback.
    const money = (minor: number) =>
      currency === 'dkk'
        ? formatDKK(minor)
        : new Intl.NumberFormat('en', { style: 'currency', currency: currency.toUpperCase() }).format(minor / 100)

    return Response.json({
      clientSecret: session.client_secret,
      downloadItems,
      hasPhysical,
      currency,
      billingCountry: country,
      reverseCharge: outcome.reverseCharge,
      businessName: business?.name ?? null,
      summary: {
        vatRate: rate,
        subtotalMinor: netTotal,
        discountMinor,
        vatMinor: taxMinor,
        totalMinor: gross,
        subtotal: money(netTotal),
        discount: money(discountMinor),
        vat: money(taxMinor),
        total: money(gross),
      },
      coupon: appliedCoupon
        ? { code: appliedCoupon, error: null as string | null }
        : couponError
          ? { code: couponCode, error: couponError }
          : null,
    })
  } catch (err) {
    const message = err instanceof Stripe.errors.StripeError
      ? `Stripe ${err.type}: ${err.message}`
      : String(err)
    console.error('[checkout-session] error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
