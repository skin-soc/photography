import type Stripe from 'stripe'
import { stripe, cryptoProvider } from '@/lib/stripe-server'
import { issueGrant, orderCodeFor, originConfigured, type DownloadItem } from '@/lib/downloads'

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

    let items: DownloadItem[] = []
    try {
      items = intent.metadata.downloadItems
        ? (JSON.parse(intent.metadata.downloadItems) as DownloadItem[])
        : []
    } catch {
      console.error('[stripe] bad downloadItems metadata on', intent.id)
    }

    // Physical-only orders have nothing to deliver digitally.
    if (items.length > 0 && originConfigured()) {
      try {
        // Expand the charge so we can read the buyer's email.
        const full = await stripe.paymentIntents.retrieve(intent.id, {
          expand: ['latest_charge'],
        })
        await issueGrant({
          orderId: orderCodeFor(intent.id),
          paymentId: intent.id,
          email: chargeEmail(full),
          locale: intent.metadata.locale || 'en',
          items,
        })
        console.log('[stripe] download grant issued for', intent.id)
      } catch (err) {
        // Return 500 so Stripe retries — issuing is idempotent on orderId.
        console.error('[stripe] failed to issue download grant:', err)
        return Response.json({ error: 'fulfilment failed' }, { status: 500 })
      }
    }
  }

  return Response.json({ received: true })
}
