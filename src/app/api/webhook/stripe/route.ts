import type Stripe from 'stripe'
import { stripe, cryptoProvider } from '@/lib/stripe-server'
import { issueGrant, resolveDownloadItems, originConfigured, markRefund, notifyOwnerSale, extractOrderLines, describeOrderLines, recordFulfilment, prodigiCallbackUrl } from '@/lib/downloads'
import { submitProdigiOrder } from '@/lib/prodigi-fulfil'
import { prodigiMode } from '@/lib/prodigi'
import { getSaleNotify } from '@/lib/shop-settings'
import { redeemCoupon } from '@/lib/coupons'
import { getInvoiceTerms } from '@/lib/terms'

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? ''

/** Issue the download grant for a paid Checkout Session. Idempotent on the order
 *  code, so the synchronous issue route and this webhook can't double-fulfil.
 *  Re-retrieves the session with the charge expanded to read the card-issuer
 *  country (second VAT location evidence). */
async function fulfilSession(sessionId: string, workerBase: string): Promise<void> {
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['payment_intent.latest_charge', 'line_items.data.price.product'],
  })
  const orderCode = session.metadata?.orderCode
  if (!orderCode) {
    throw new Error(`missing orderCode on session ${session.id}`)
  }
  const items = await resolveDownloadItems((session.metadata?.skus ?? '').split(','))
  if (!originConfigured()) return

  // Full itemised order (digital + physical, reconciling to the net) + the
  // collected shipping name/address — for the mixed-order invoice + Prodigi.
  // Enrich each line with the catalog description (paper/size, format/px/file).
  const raw = extractOrderLines(session)
  const shipping = raw.shipping
  const lineItems = await describeOrderLines(raw.lineItems)

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
    // Full itemised order (digital + physical) for the invoice, and the
    // collected shipping name/address for Bill To + Prodigi fulfilment.
    lineItems,
    shipping,
    livemode: session.livemode,
    amount: session.amount_total,
    currency: session.currency,
    // VAT we computed at checkout (Stripe does no tax calc) — read from metadata,
    // not Stripe's total_details. amount_total is the gross actually charged.
    taxAmount: Number(session.metadata?.taxAmount ?? '') || 0,
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

  // Physical items → submit to Prodigi (sandbox). Best-effort: a failure is
  // logged + recorded on the order, NOT escalated to a 500 (the grant is already
  // issued; the print order can be retried). createOrder is idempotent on the
  // order code, so webhook retries never double-order.
  try {
    const result = await submitProdigiOrder({
      orderCode,
      lineItems,
      shipping,
      email: session.customer_details?.email ?? null,
      // Prodigi POSTs CloudEvents status updates here; secured by a per-order
      // token (their callbacks carry no signature). Worker origin, not the LAN one.
      callbackUrl: prodigiCallbackUrl(workerBase, orderCode),
    })
    if (result) {
      await recordFulfilment(orderCode, {
        provider: 'prodigi',
        prodigiId: result.id,
        stage: result.stage,
        outcome: result.outcome,
        mode: result.mode,
      })
      console.log('[prodigi] order created for', orderCode, result.id, `(${result.mode})`)
    }
  } catch (err) {
    console.error('[prodigi] order submission failed for', orderCode, err)
    await recordFulfilment(orderCode, {
      provider: 'prodigi',
      prodigiId: null,
      stage: 'Failed',
      outcome: 'error',
      mode: prodigiMode(),
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // Count one coupon redemption on the authoritative (webhook) fulfilment only —
  // the synchronous issue route deliberately doesn't, so a code isn't double-counted.
  const couponCode = session.metadata?.couponCode
  if (couponCode) {
    try { await redeemCoupon(couponCode) } catch (err) {
      console.error('[stripe] coupon redeem failed (non-fatal):', err)
    }
  }
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
  // once the funds clear. Both are gated on payment_status === 'paid', so a
  // failed/expired/abandoned session never fulfils and needs no event. VAT is
  // ours (a line item), recorded from metadata — Stripe computes no tax.
  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded'
  ) {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.payment_status === 'paid') {
      try {
        // The inbound (Stripe) request hits this Worker's public host, so its
        // origin is the right base for the Prodigi callback URL we register.
        await fulfilSession(session.id, new URL(req.url).origin)
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
