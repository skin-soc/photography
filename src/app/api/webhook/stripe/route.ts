import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? ''

export async function POST(req: Request) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    console.error('[stripe webhook] signature verification failed:', msg)
    return Response.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as Stripe.PaymentIntent
    console.log('[stripe] payment succeeded:', {
      id: intent.id,
      amount: intent.amount,
      currency: intent.currency,
      sku: intent.metadata.sku,
      downloadToken: intent.metadata.downloadToken,
    })
    // TODO: trigger digital download delivery once LAN origin fulfillment is ready
  }

  return Response.json({ received: true })
}
