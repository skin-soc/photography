import type Stripe from 'stripe'
import { stripe, cryptoProvider } from '@/lib/stripe-server'
import { issueGrant, resolveDownloadItems, originConfigured, markRefund, notifyOwnerSale } from '@/lib/downloads'
import { getSaleNotify } from '@/lib/shop-settings'
import { getInvoiceTerms } from '@/lib/terms'

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? ''

/** Issue the download grant for a paid Checkout Session. Idempotent on the order
 *  code, so the synchronous issue route and this webhook can't double-fulfil.
 *  Re-retrieves the session with the charge expanded to read the card-issuer
 *  country (second VAT location evidence). */
async function fulfilSession(sessionId: string): Promise<void> {
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['payment_intent.latest_charge'],
  })
  const orderCode = session.metadata?.orderCode
  if (!orderCode) {
    throw new Error(`missing orderCode on session ${session.id}`)
  }
  const items = await resolveDownloadItems((session.metadata?.skus ?? '').split(','))
  if (items.length === 0 || !originConfigured()) return

  const pi = session.payment_intent
  const paymentId = typeof pi === 'string' ? pi : pi?.id ?? ''
  const charge =
    typeof pi !== 'string' && pi?.latest_charge && typeof pi.latest_charge !== 'string'
      ? pi.latest_charge
      : null

  // Payment facts for the receipt: when it was paid and by what method. The
  // session is only fulfilled on payment_status === 'paid', so this is always a
  // settled, paid-in-full charge — there are no payment terms.
  const locale = session.metadata?.locale || 'en'
  const paidAt = charge?.created ? charge.created * 1000 : (session.created ? session.created * 1000 : null)
  const paymentMethod = charge?.payment_method_details?.type ?? null

  await issueGrant({
    orderId: orderCode,
    paymentId,
    email: session.customer_details?.email ?? null,
    locale,
    items,
    livemode: session.livemode,
    amount: session.amount_total,
    currency: session.currency,
    taxAmount: session.total_details?.amount_tax ?? null,
    taxCountry: session.customer_details?.address?.country ?? null,
    cardCountry: charge?.payment_method_details?.card?.country ?? null,
    // VAT place-of-supply evidence (Cloudflare geolocation, set at checkout).
    buyerIp: session.metadata?.buyerIp ?? null,
    buyerCountry: session.metadata?.buyerCountry ?? null,
    // Receipt facts.
    paidAt,
    paymentMethod,
    // Snapshot of the licensing terms in force at purchase (for the PDF page 2).
    terms: await getInvoiceTerms(locale),
    vatId: session.metadata?.vatId ?? null,
    businessName: session.metadata?.businessName ?? null,
    businessAddress: session.metadata?.businessAddress ?? null,
    reverseCharge: session.metadata?.reverseCharge === 'true',
    vatConsultation: session.metadata?.vatConsultation ?? null,
  })
  console.log('[stripe] download grant issued for', orderCode)
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

  // checkout.session.completed → card/instant methods (paid immediately).
  // checkout.session.async_payment_succeeded → delayed methods (e.g. Klarna)
  // once the funds clear. Stripe Tax records the tax transaction itself, so no
  // manual createFromCalculation is needed.
  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded'
  ) {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.payment_status === 'paid') {
      try {
        await fulfilSession(session.id)
      } catch (err) {
        // Return 500 so Stripe retries — issuing is idempotent on the order code.
        console.error('[stripe] failed to issue download grant:', err)
        return Response.json({ error: 'fulfilment failed' }, { status: 500 })
      }
      // Owner sale notification — REAL (live) sales only, if enabled. Non-fatal.
      if (session.livemode) {
        try {
          const notify = await getSaleNotify()
          if (notify.enabled && notify.email) {
            const amountText = new Intl.NumberFormat('en-GB', {
              style: 'currency',
              currency: (session.currency ?? 'eur').toUpperCase(),
            }).format((session.amount_total ?? 0) / 100)
            await notifyOwnerSale({
              to: notify.email,
              orderId: session.metadata?.orderCode ?? session.id,
              amountText,
              buyerEmail: session.customer_details?.email ?? null,
              itemCount: (session.metadata?.skus ?? '').split(',').filter(Boolean).length,
            })
          }
        } catch (err) {
          console.error('[stripe] sale notification failed (non-fatal):', err)
        }
      }
    }
  }

  // Refunds (Dashboard- or API-initiated) → mark the order; a full refund
  // revokes download access. VAT is refunded proportionally with the charge
  // amount (the tax was applied as an exclusive tax_rate on the line items), so
  // we just update our records — the Finances tab nets refunds out per period.
  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge
    const piId = typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : charge.payment_intent?.id
    if (piId) {
      try {
        const pi = await stripe.paymentIntents.retrieve(piId)
        const orderCode = pi.metadata?.orderCode
        if (orderCode) {
          await markRefund(orderCode, {
            amountRefunded: charge.amount_refunded,
            fullyRefunded: charge.refunded === true,
          })
          console.log('[stripe] refund recorded for', orderCode, `(${charge.amount_refunded} refunded)`)
        }
      } catch (err) {
        console.error('[stripe] failed to record refund:', err)
        return Response.json({ error: 'refund record failed' }, { status: 500 })
      }
    }
  }

  return Response.json({ received: true })
}
