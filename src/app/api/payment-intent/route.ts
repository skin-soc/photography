import Stripe from 'stripe'
import { getCatalog } from '@/lib/shop'
import { stripe } from '@/lib/stripe-server'

// Stripe tax code for digital images / art
const TAX_CODE_DIGITAL = 'txcd_10103001'

interface RequestItem { sku: string }

export async function POST(req: Request) {
  try {
    const body = await req.json() as { items: RequestItem[]; locale?: string }
    const locale = body.locale ?? 'en'
    // Detect country from Cloudflare's IP geolocation header (populated in Workers;
    // falls back to null in local dev where the header is absent).
    // In local dev there is no cf-ipcountry header, so tax would always be
    // skipped. Default to Germany there so the VAT/OSS logic is exercisable
    // locally. This branch never runs in production (NODE_ENV !== 'development').
    const country =
      req.headers.get('cf-ipcountry') ??
      (process.env.NODE_ENV === 'development' ? 'DE' : null)
    const skus = body.items.map((i) => i.sku)

    if (skus.length === 0) {
      return Response.json({ error: 'no items' }, { status: 400 })
    }

    const catalog = await getCatalog()

    if (catalog.length === 0) {
      console.error('[payment-intent] catalog is empty — origin unreachable?')
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
      console.error('[payment-intent] unknown SKUs:', skus.filter((sku) =>
        !catalog.some((photo) => photo.products.some((p) => p.sku === sku))
      ))
      return Response.json({ error: 'one or more products not found' }, { status: 404 })
    }
    const items = resolved as NonNullable<typeof resolved[number]>[]

    const hasPhysical = items.some((i) => i.product.type !== 'digital')
    const currency = items[0].product.currency.toLowerCase()
    const subtotal = items.reduce((sum, i) => sum + i.product.price, 0)

    // ── Tax calculation ────────────────────────────────────────────────────────
    // Stripe Tax via the Tax Calculations API (automatic_tax is not available on
    // raw PaymentIntents — only on Checkout Sessions / Invoices / Quotes).
    let amount = subtotal
    let taxAmount = 0
    let calculationId: string | null = null

    if (country) {
      try {
        const calculation = await (stripe.tax.calculations as unknown as {
          create(params: object): Promise<{ id: string; amount_total: number; tax_amount_exclusive: number }>
        }).create({
          currency,
          line_items: items.map((i) => ({
            amount: i.product.price,
            reference: i.product.sku,
            tax_behavior: 'exclusive',
            ...(i.product.type === 'digital' ? { tax_code: TAX_CODE_DIGITAL } : {}),
          })),
          customer_details: {
            address: { country },
            address_source: hasPhysical ? 'shipping' : 'billing',
          },
        })
        amount = calculation.amount_total
        taxAmount = calculation.tax_amount_exclusive
        calculationId = calculation.id
        console.log(`[payment-intent] tax calculated for ${country}: ${taxAmount} ${currency} (calc ${calculationId})`)
      } catch (taxErr) {
        // Non-fatal — fall through with base amount so checkout isn't blocked
        console.warn('[payment-intent] tax calculation failed, proceeding without tax:', taxErr)
      }
    }

    const downloadItems = items
      .filter((i) => i.product.downloadToken)
      .map((i) => ({
        sku: i.product.sku,
        token: i.product.downloadToken!,
        format: i.product.format ?? 'jpeg',
        label: i.product.label,
        slug: i.photo.slug,
      }))

    const metadata: Record<string, string> = {
      locale,
      skus: skus.join(','),
      hasPhysical: String(hasPhysical),
      downloadItems: JSON.stringify(downloadItems),
    }
    if (calculationId) metadata.taxCalculationId = calculationId
    if (country) metadata.billingCountry = country

    const intent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: { enabled: true },
      metadata,
      // Link the tax calculation so Stripe records the tax transaction on
      // payment, reverses it on refund, and includes tax on the receipt.
      ...(calculationId
        ? { hooks: { inputs: { tax: { calculation: calculationId } } } }
        : {}),
    } as Stripe.PaymentIntentCreateParams)

    return Response.json({
      clientSecret: intent.client_secret,
      amount,
      subtotal,
      taxAmount,
      currency,
      downloadItems,
      hasPhysical,
    })
  } catch (err) {
    const message = err instanceof Stripe.errors.StripeError
      ? `Stripe ${err.type}: ${err.message}`
      : String(err)
    console.error('[payment-intent] error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
