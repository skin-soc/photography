import Stripe from 'stripe'
import { getCatalog } from '@/lib/shop'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

interface RequestItem { sku: string }

export async function POST(req: Request) {
  const body = await req.json() as
    | { items: RequestItem[]; locale?: string }
    | { sku: string; locale?: string }

  const locale = ('locale' in body && body.locale) ? body.locale : 'en'
  const skus: string[] = 'sku' in body
    ? [body.sku]
    : body.items.map((i) => i.sku)

  if (skus.length === 0) {
    return Response.json({ error: 'no items' }, { status: 400 })
  }

  const catalog = await getCatalog()

  // Resolve each SKU against the catalog
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
  const items = resolved as NonNullable<typeof resolved[number]>[]

  const hasPhysical = items.some((i) => i.product.type !== 'digital')

  const lineItems = items.map(({ photo, product }) => ({
    price_data: {
      currency: product.currency.toLowerCase(),
      product_data: {
        name: `${photo.title ?? photo.slug} — ${product.label}`,
        metadata: {
          sku: product.sku,
          photoSlug: photo.slug,
          downloadToken: product.downloadToken ?? '',
          format: product.format ?? 'jpeg',
        },
      },
      unit_amount: product.price,
    },
    quantity: 1,
  }))

  // Tokens for digital items — stored in session metadata for the order-complete page
  const downloadItems = items
    .filter((i) => i.product.downloadToken)
    .map((i) => ({
      token: i.product.downloadToken!,
      format: i.product.format ?? 'jpeg',
      label: i.product.label,
      slug: i.photo.slug,
    }))

  const origin = req.headers.get('origin') ?? 'https://gusmcewan.com'

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: lineItems,
    metadata: {
      locale,
      hasPhysical: String(hasPhysical),
      downloadItems: JSON.stringify(downloadItems),
    },
    success_url: `${origin}/${locale}/shop/order-complete?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/${locale}/shop`,
    ...(hasPhysical && {
      shipping_address_collection: {
        allowed_countries: ['GB', 'DK', 'DE', 'FR', 'NL', 'SE', 'NO', 'US', 'CA', 'AU', 'JP'],
      },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount' as const,
            fixed_amount: { amount: 0, currency: 'dkk' },
            display_name: 'Standard shipping',
            delivery_estimate: {
              minimum: { unit: 'business_day' as const, value: 5 },
              maximum: { unit: 'business_day' as const, value: 14 },
            },
          },
        },
      ],
    }),
  })

  return Response.json({ url: session.url })
}
