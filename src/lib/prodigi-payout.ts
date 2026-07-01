/**
 * No-float funding trigger for LIVE physical orders. SERVER ONLY.
 *
 * Per the standing no-float requirement (docs/fap-print-fulfilment.md §4):
 * a physical order must never be sent to Prodigi ahead of that customer's own
 * payment actually settling into the real bank account. In LIVE mode the
 * Stripe webhook (src/app/api/webhook/stripe/route.ts) deliberately does NOT
 * call submitProdigiOrder immediately — it defers to this module, invoked on
 * a schedule by the prodigi-cron Worker.
 *
 * Flow per candidate order:
 *   1. Is the charge's balance transaction 'available' (settled), not
 *      'pending'? If not, leave it — check again next run.
 *   2. Create a manual STANDARD payout (not instant — this account isn't
 *      confirmed eligible for Instant Payouts) for that charge's net amount.
 *      No cost/markup split needed: the whole settled amount lands in the
 *      bank account, and Prodigi is paid separately from a debit card linked
 *      to that same account, so markup/VAT sit in the bank untouched.
 *   3. Submit the order to Prodigi (createOrder is idempotent on orderCode,
 *      so a re-run after a partial failure can't double-order).
 *
 * SANDBOX MODE IS A NO-OP HERE — sandbox needs no funding (see
 * prodigiMode() gate below); the webhook's immediate submitProdigiOrder call
 * still handles sandbox orders synchronously, unchanged.
 */

import { stripe } from './stripe-server'
import { prodigiMode } from './prodigi'
import { prodigiCallbackUrl, adminRecentOrders } from './downloads'
import { hasPhysicalItems, submitProdigiOrder } from './prodigi-fulfil'
import { SITE_URL } from '@/i18n/seo'

/** How far back to look for orders still awaiting settlement/funding. Orders
 *  older than this with no fulfilment are a sign something's stuck — they'll
 *  show up in the admin card as physical-with-no-prodigiId past this window,
 *  worth a manual look rather than silently retrying forever. */
const WINDOW_DAYS = 14

export interface PayoutCheckResult {
  orderId: string
  action: 'awaiting-settlement' | 'paid-out-and-submitted' | 'payout-failed' | 'submit-failed'
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
 * Scan recent live orders for physical ones awaiting funding, pay out +
 * submit whichever have settled. Called by /api/admin/prodigi-payout, which
 * the prodigi-cron Worker hits on a schedule. Best-effort per order — one
 * failure doesn't stop the batch.
 */
export async function checkAndFundPendingOrders(): Promise<PayoutCheckResult[]> {
  if (prodigiMode() !== 'live') return [] // sandbox needs no funding — webhook already handles it synchronously

  const orders = await adminRecentOrders(WINDOW_DAYS)
  const results: PayoutCheckResult[] = []

  for (const order of orders) {
    if (!order.livemode) continue
    if (order.refunded) continue
    if (order.fulfilment?.prodigiId) continue // already sent to Prodigi
    if (!order.paymentId || !order.lineItems) continue
    if (!(await hasPhysicalItems(order.lineItems))) continue

    try {
      const { settled, amount, currency } = await settledAmount(order.paymentId)
      if (!settled || !amount) {
        results.push({ orderId: order.orderId, action: 'awaiting-settlement' })
        continue
      }

      let payoutId: string
      try {
        const payout = await stripe.payouts.create({
          amount,
          currency: currency ?? 'dkk',
          metadata: { orderId: order.orderId },
          statement_descriptor: order.orderId.slice(0, 22),
        })
        payoutId = payout.id
      } catch (err) {
        results.push({
          orderId: order.orderId,
          action: 'payout-failed',
          detail: err instanceof Error ? err.message : String(err),
        })
        continue
      }

      // The shipping method isn't stored as its own AdminOrder field — it's
      // baked into the synthetic 'shipping' line's label as "Shipping — X"
      // (see checkout-session/route.ts). Extract it the same way Prodigi
      // needs it (Budget/Standard/Express/Overnight).
      const shippingLine = order.lineItems.find((l) => l.sku === 'shipping')
      const shippingMethod = shippingLine?.label.split('—')[1]?.trim()

      try {
        await submitProdigiOrder({
          orderCode: order.orderId,
          lineItems: order.lineItems,
          shipping: order.shipping ?? null,
          email: order.email,
          locale: 'en',
          shippingMethod,
          callbackUrl: prodigiCallbackUrl(SITE_URL, order.orderId),
        })
        results.push({ orderId: order.orderId, action: 'paid-out-and-submitted', detail: payoutId })
      } catch (err) {
        // Payout already sent — funds are in the bank. The order just needs a
        // retry (createOrder is idempotent on orderCode), not a repeat payout.
        results.push({
          orderId: order.orderId,
          action: 'submit-failed',
          detail: `payout ${payoutId} succeeded, Prodigi submit failed: ${err instanceof Error ? err.message : String(err)}`,
        })
      }
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
