import Stripe from 'stripe'
import { getCatalog } from '@/lib/shop'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

interface RequestItem { sku: string }

export async function POST(req: Request) {
  const body = await req.json() as { items: RequestItem[]; locale?: string }
  const locale = body.locale ?? 'en'
  const skus = body.items.map((i) => i.sku)

  if (skus.length === 0) {
    return Response.json({ error: 'no items' }, { status: 400 })
  }

  const catalog = await getCatalog()

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

  // All items must share the same currency (enforced by catalog design).
  const currency = items[0].product.currency.toLowerCase()
  const amount = items.reduce((sum, i) => sum + i.product.price, 0)

  const downloadItems = items
    .filter((i) => i.product.downloadToken)
    .map((i) => ({
      token: i.product.downloadToken!,
      format: i.product.format ?? 'jpeg',
      label: i.product.label,
      slug: i.photo.slug,
    }))

  const intent = await stripe.paymentIntents.create({
    amount,
    currency,
    automatic_payment_methods: { enabled: true },
    metadata: {
      locale,
      skus: skus.join(','),
      hasPhysical: String(hasPhysical),
      downloadItems: JSON.stringify(downloadItems),
    },
  })

  return Response.json({
    clientSecret: intent.client_secret,
    amount,
    currency,
    downloadItems,
    hasPhysical,
  })
}
