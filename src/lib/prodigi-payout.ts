/**
 * No-float funding trigger for LIVE physical orders. SERVER ONLY.
 *
 * Per the standing no-float requirement (docs/fap-print-fulfilment.md §4):
 * a physical order must never be sent to Prodigi ahead of that customer's own
 * payment actually settling into the real bank account. In LIVE mode the
 * Stripe webhook (src/app/api/webhook/stripe/route.ts) deliberately does NOT
 * call submitProdigiOrder immediately — it defers to this module (step 1,
 * called on a schedule by the prodigi-cron Worker) and to the `payout.paid`
 * webhook handler (step 2, in the same webhook route file) for completion.
 *
 * IMPORTANT: creating a Payout is NOT the same as funds arriving in the bank.
 * A manual/standard payout typically takes 1-4 business days to actually
 * land — `stripe.payouts.create()` returns immediately with `status:
 * 'pending'`. Submitting to Prodigi (which charges the linked debit card)
 * before the payout has actually posted would risk a declined charge and
 * reintroduce float. So this module ONLY creates the payout and records an
 * interim "awaiting arrival" state; the actual Prodigi submission happens
 * later, triggered by Stripe's `payout.paid` event (see the webhook route),
 * not by a fixed delay or another poll.
 *
 * Step 1 (this module, every 15 min):
 *   1. Is the charge's balance transaction 'available' (settled), not
 *      'pending'? If not, leave it — check again next run.
 *   2. Create a manual STANDARD payout (not instant — this account isn't
 *      confirmed eligible for Instant Payouts) for that charge's net amount.
 *      No cost/markup split needed: the whole settled amount lands in the
 *      bank account, and Prodigi is paid separately from a debit card linked
 *      to that same account, so markup/VAT sit in the bank untouched.
 *   3. Record `fulfilment.prodigiId = "payout-pending:<payoutId>"` — a
 *      sentinel marking "payout created, not yet arrived", reusing the
 *      existing fulfilment fields rather than requiring a LAN-origin schema
 *      change (which would need its own NAS rebuild).
 *
 * Step 2 (webhook route, on `payout.paid`): looks up the order by
 * `payout.metadata.orderId`, confirms the sentinel matches this payout, THEN
 * calls submitProdigiOrder — only now is the debit card actually funded.
 *
 * SANDBOX MODE IS A NO-OP HERE — sandbox needs no funding (see
 * prodigiMode() gate below); the webhook's immediate submitProdigiOrder call
 * still handles sandbox orders synchronously, unchanged.
 */

import { stripe } from './stripe-server'
import { prodigiMode } from './prodigi'
import { recordFulfilment, adminRecentOrders, adminLookupOrders, prodigiCallbackUrl } from './downloads'
import { hasPhysicalItems, submitProdigiOrder } from './prodigi-fulfil'
import { SITE_URL } from '@/i18n/seo'

/** Sentinel prefix stored in fulfilment.prodigiId while a payout has been
 *  created but hasn't posted yet — distinguishes "funding in flight" from
 *  both "not started" (field absent) and "actually sent to Prodigi" (a real
 *  Prodigi order id, which never has this prefix). */
const PAYOUT_PENDING_PREFIX = 'payout-pending:'

export function payoutIdFromSentinel(prodigiId: string | null | undefined): string | null {
  if (!prodigiId || !prodigiId.startsWith(PAYOUT_PENDING_PREFIX)) return null
  return prodigiId.slice(PAYOUT_PENDING_PREFIX.length)
}

/** How far back to look for orders still awaiting settlement/funding. Orders
 *  older than this with no fulfilment are a sign something's stuck — they'll
 *  show up in the admin card as physical-with-no-prodigiId past this window,
 *  worth a manual look rather than silently retrying forever. */
const WINDOW_DAYS = 14

export interface PayoutCheckResult {
  orderId: string
  action: 'awaiting-settlement' | 'payout-created' | 'awaiting-arrival' | 'payout-failed'
  detail?: string
}

/** Whether a PaymentIntent's charge has actually settled (its balance
 *  transaction is 'available', not 'pending') — i.e. genuinely spendable, not
 *  just captured. Returns the settled net amount + currency when true. */
async function settledAmount(
  paymentId: string,
): Promise<{ settled: boolean; amount?: number; currency?: string }> {
  const pi = await stripe.paymentIntents.retrieve(paymentId, {
    expand: ['latest_charge.balance_transaction'],
  })
  const charge = typeof pi.latest_charge === 'string' ? null : pi.latest_charge
  const bt =
    charge && charge.balance_transaction && typeof charge.balance_transaction !== 'string'
      ? charge.balance_transaction
      : null
  if (!bt) return { settled: false }
  const settled = bt.status === 'available' && bt.available_on * 1000 <= Date.now()
  return { settled, amount: bt.net, currency: bt.currency }
}

/**
 * Submit an order to Prodigi once its payout has actually posted. Called from
 * the `payout.paid` webhook handler (the normal path), and as a fallback by
 * the cron loop below in case a webhook delivery was ever missed. Verifies
 * the order's fulfilment sentinel matches THIS payout before acting, so a
 * stale/duplicate event can't double-submit. createOrder itself is also
 * idempotent on orderCode as a second line of defence.
 */
export async function submitAfterPayout(orderId: string, payoutId: string): Promise<void> {
  const matches = await adminLookupOrders(orderId)
  const order = matches.find((o) => o.orderId === orderId)
  if (!order) throw new Error(`submitAfterPayout: order ${orderId} not found`)
  if (payoutIdFromSentinel(order.fulfilment?.prodigiId) !== payoutId) {
    return // already submitted, or this event doesn't match the payout we're tracking
  }
  if (!order.lineItems) throw new Error(`submitAfterPayout: order ${orderId} has no lineItems`)

  // The shipping method isn't stored as its own AdminOrder field — it's
  // baked into the synthetic 'shipping' line's label as "Shipping — X" (see
  // checkout-session/route.ts). Extract it the same way Prodigi needs it
  // (Budget/Standard/Express/Overnight).
  const shippingLine = order.lineItems.find((l) => l.sku === 'shipping')
  const shippingMethod = shippingLine?.label.split('—')[1]?.trim()

  try {
    const result = await submitProdigiOrder({
      orderCode: orderId,
      lineItems: order.lineItems,
      shipping: order.shipping ?? null,
      email: order.email,
      locale: 'en',
      shippingMethod,
      callbackUrl: prodigiCallbackUrl(SITE_URL, orderId),
    })
    if (result) {
      await recordFulfilment(orderId, {
        provider: 'prodigi',
        prodigiId: result.id,
        stage: result.stage,
        outcome: result.outcome,
        mode: result.mode,
      })
    }
  } catch (err) {
    // Payout already landed — funds are in the bank, safe to retry the
    // Prodigi submission on the next cron pass (sentinel is still in place).
    await recordFulfilment(orderId, {
      provider: 'prodigi',
      prodigiId: `${PAYOUT_PENDING_PREFIX}${payoutId}`,
      stage: 'SubmitFailed',
      outcome: 'error',
      mode: prodigiMode(),
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

/**
 * Scan recent live orders for physical ones needing funding action. Called by
 * /api/admin/prodigi-payout, which the prodigi-cron Worker hits every 15 min.
 * Best-effort per order — one failure doesn't stop the batch.
 *
 *  - No fulfilment yet + settled → create a payout, record the sentinel.
 *  - Sentinel present (payout created, awaiting arrival) → fallback check:
 *    ask Stripe directly whether that payout has posted, in case the
 *    `payout.paid` webhook was missed, and complete it here if so.
 *  - Real prodigiId present → already fully submitted, skip.
 */
export async function checkAndFundPendingOrders(): Promise<PayoutCheckResult[]> {
  if (prodigiMode() !== 'live') return [] // sandbox needs no funding — webhook already handles it synchronously

  const orders = await adminRecentOrders(WINDOW_DAYS)
  const results: PayoutCheckResult[] = []

  for (const order of orders) {
    if (!order.livemode) continue
    if (order.refunded) continue
    if (!order.paymentId || !order.lineItems) continue
    if (!(await hasPhysicalItems(order.lineItems))) continue

    const pendingPayoutId = payoutIdFromSentinel(order.fulfilment?.prodigiId)
    if (pendingPayoutId) {
      // Fallback: the payout was created on a prior run. Normally
      // `payout.paid` completes this via the webhook, but double-check here
      // in case that event was ever missed.
      try {
        const payout = await stripe.payouts.retrieve(pendingPayoutId)
        if (payout.status === 'paid') {
          await submitAfterPayout(order.orderId, pendingPayoutId)
          results.push({ orderId: order.orderId, action: 'payout-created', detail: pendingPayoutId })
        } else if (payout.status === 'failed' || payout.status === 'canceled') {
          // Same recording the payout.failed/payout.canceled webhook does —
          // this is the fallback path in case that event was ever missed.
          await recordFulfilment(order.orderId, {
            provider: 'prodigi',
            prodigiId: null,
            stage: payout.status === 'failed' ? 'PayoutFailed' : 'PayoutCanceled',
            outcome: 'error',
            mode: 'live',
            error: payout.failure_message ?? `payout ${payout.status}`,
          })
          results.push({
            orderId: order.orderId,
            action: 'payout-failed',
            detail: `payout ${pendingPayoutId} status: ${payout.status}`,
          })
        } else {
          results.push({ orderId: order.orderId, action: 'awaiting-arrival', detail: pendingPayoutId })
        }
      } catch (err) {
        results.push({
          orderId: order.orderId,
          action: 'payout-failed',
          detail: err instanceof Error ? err.message : String(err),
        })
      }
      continue
    }

    if (order.fulfilment?.prodigiId) continue // real Prodigi order already submitted

    try {
      const { settled, amount, currency } = await settledAmount(order.paymentId)
      if (!settled || !amount) {
        results.push({ orderId: order.orderId, action: 'awaiting-settlement' })
        continue
      }

      const payout = await stripe.payouts.create({
        amount,
        currency: currency ?? 'dkk',
        metadata: { orderId: order.orderId },
        statement_descriptor: order.orderId.slice(0, 22),
      })
      await recordFulfilment(order.orderId, {
        provider: 'prodigi',
        prodigiId: `${PAYOUT_PENDING_PREFIX}${payout.id}`,
        stage: 'AwaitingPayout',
        outcome: 'payout-pending',
        mode: 'live',
      })
      results.push({ orderId: order.orderId, action: 'payout-created', detail: payout.id })
    } catch (err) {
      results.push({
        orderId: order.orderId,
        action: 'payout-failed',
        detail: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return results
}
