import Stripe from 'stripe'
import { getCatalog } from '@/lib/shop'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: Request) {
  const body = await req.json() as { sku?: string; locale?: string }
  const { sku, locale = 'en' } = body

  if (!sku) {
    return Response.json({ error: 'sku required' }, { status: 400 })
  }

  const catalog = await getCatalog()
  let matchedPhoto = null
  let matchedProduct = null
  for (const photo of catalog) {
    const product = photo.products.find((p) => p.sku === sku)
    if (product) { matchedPhoto = photo; matchedProduct = product; break }
  }

  if (!matchedPhoto || !matchedProduct) {
    return Response.json({ error: 'product not found' }, { status: 404 })
  }
  if (matchedProduct.type !== 'digital') {
    return Response.json({ error: 'only digital products can be purchased here' }, { status: 400 })
  }

  const intent = await stripe.paymentIntents.create({
    amount: matchedProduct.price,
    currency: matchedProduct.currency.toLowerCase(),
    automatic_payment_methods: { enabled: true },
    metadata: {
      sku,
      photoId: matchedPhoto.id,
      photoSlug: matchedPhoto.slug,
      productLabel: matchedProduct.label,
      downloadToken: matchedProduct.downloadToken ?? '',
      format: matchedProduct.format ?? 'jpeg',
      locale,
    },
  })

  return Response.json({ clientSecret: intent.client_secret })
}
