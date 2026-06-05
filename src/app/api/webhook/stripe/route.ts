import type Stripe from 'stripe'
import { stripe, cryptoProvider } from '@/lib/stripe-server'
import { issueGrant, resolveDownloadItems, originConfigured } from '@/lib/downloads'

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? ''

/** Buyer email — from the charge's billing details, falling back to receipt. */
function chargeEmail(intent: Stripe.PaymentIntent): string | null {
  const charge = intent.latest_charge
  if (charge && typeof charge !== 'string') {
    return charge.billing_details?.email ?? intent.receipt_email ?? null
  }
  return intent.receipt_email ?? null
}

export async function POST(req: Request) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      body, sig, webhookSecret, undefined, cryptoProvider,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    console.error('[stripe webhook] signature verification failed:', msg)
    return Response.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as Stripe.PaymentIntent

    const items = await resolveDownloadItems((intent.metadata.skus ?? '').split(','))

    // Physical-only orders have nothing to deliver digitally.
    if (items.length > 0 && originConfigured()) {
      try {
        // Expand the charge so we can read the buyer's email.
        const full = await stripe.paymentIntents.retrieve(intent.id, {
          expand: ['latest_charge'],
        })
        const orderCode = intent.metadata.orderCode
        if (!orderCode) {
          console.error('[stripe] missing orderCode metadata on', intent.id)
          return Response.json({ error: 'order code missing' }, { status: 400 })
        }
        await issueGrant({
          orderId: orderCode,
          paymentId: intent.id,
          email: chargeEmail(full),
          locale: intent.metadata.locale || 'en',
          items,
        })
        console.log('[stripe] download grant issued for', orderCode)
      } catch (err) {
        // Return 500 so Stripe retries — issuing is idempotent on orderId.
        console.error('[stripe] failed to issue download grant:', err)
        return Response.json({ error: 'fulfilment failed' }, { status: 500 })
      }
    }
  }

  return Response.json({ received: true })
}
