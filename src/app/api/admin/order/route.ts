/**
 * Admin order management — look up download orders, re-send the link email, or
 * extend an order's expiry. Guarded by the admin session cookie (the /api/*
 * matcher is excluded from middleware), then proxied to the LAN origin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'
import { stripe } from '@/lib/stripe-server'
import { getCatalog } from '@/lib/shop'
import { adminLookupOrders, adminRecentOrders, adminResendOrder, adminExtendOrder, markRefund, recordFulfilment, prodigiCallbackUrl, type AdminOrder } from '@/lib/downloads'
import { hasPhysicalItems, submitProdigiOrder } from '@/lib/prodigi-fulfil'
import { payoutIdFromSentinel, checkoutFactsForPayment } from '@/lib/prodigi-payout'
import { getOrder as getProdigiOrder } from '@/lib/prodigi'
import { SITE_URL } from '@/i18n/seo'

async function authed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ADMIN_COOKIE)?.value
  return verifySessionToken(token, process.env.ADMIN_PASSWORD ?? '')
}

/** Attach a catalog preview image to each order line so the admin can show a
 *  thumbnail per item (like the cart does). Resolved at read time by sku —
 *  never stored with the order. */
async function withLinePreviews(orders: AdminOrder[]): Promise<AdminOrder[]> {
  if (!orders.some((o) => o.lineItems?.length)) return orders
  try {
    const catalog = await getCatalog()
    const bySku = new Map<string, string>()
    for (const photo of catalog) for (const p of photo.products) bySku.set(p.sku, photo.previewUrl)
    return orders.map((o) =>
      o.lineItems?.length
        ? { ...o, lineItems: o.lineItems.map((l) => ({ ...l, previewUrl: bySku.get(l.sku) ?? null })) }
        : o,
    )
  } catch {
    return orders // previews are cosmetic — never fail the lookup over them
  }
}

export async function GET(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // ?prodigi=<orderId> → live Prodigi status + actual charges for that order's
  // fulfilment (admin monitoring: stage, invoice totals, VAT reverse-charge check).
  const prodigiFor = req.nextUrl.searchParams.get('prodigi')?.trim()
  if (prodigiFor) {
    const order = (await adminLookupOrders(prodigiFor)).find((o) => o.orderId === prodigiFor)
    if (!order) return NextResponse.json({ error: 'order not found' }, { status: 404 })
    const pid = order.fulfilment?.prodigiId
    if (!pid || payoutIdFromSentinel(pid)) {
      return NextResponse.json({ error: 'order not yet submitted to Prodigi' }, { status: 400 })
    }
    try {
      const status = await getProdigiOrder(pid)
      // The recorded ex-VAT cost quote (EUR minor) from checkout, for comparison.
      return NextResponse.json({ ok: true, status })
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'prodigi fetch failed' }, { status: 502 })
    }
  }
  // ?recent=90 → the full recent-orders list for the table; ?q=… → a search.
  const recent = req.nextUrl.searchParams.get('recent')
  if (recent !== null) {
    const days = Math.min(3650, Math.max(1, parseInt(recent, 10) || 90))
    return NextResponse.json({ orders: await withLinePreviews(await adminRecentOrders(days)) })
  }
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ error: 'missing query' }, { status: 400 })
  return NextResponse.json({ orders: await withLinePreviews(await adminLookupOrders(q)) })
}

export async function POST(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as {
    action?: 'resend' | 'extend' | 'refund' | 'refund-full' | 'refund-lines' | 'force-submit'
    orderId?: string
    email?: string
    paymentId?: string
    /** refund-lines: the charged line skus to refund (may include 'shipping'). */
    skus?: string[]
  }
  const orderId = String(body.orderId ?? '')
  if (!orderId) return NextResponse.json({ error: 'missing orderId' }, { status: 400 })

  if (body.action === 'resend') {
    const ok = await adminResendOrder(orderId, body.email)
    return NextResponse.json({ ok }, { status: ok ? 200 : 502 })
  }
  if (body.action === 'extend') {
    const ok = await adminExtendOrder(orderId)
    return NextResponse.json({ ok }, { status: ok ? 200 : 502 })
  }
  if (body.action === 'force-submit') {
    // MANUAL OVERRIDE of the no-float funding wait: submit this order to
    // Prodigi NOW, before its charge has settled / payout posted. The debit
    // card is charged immediately, so the admin is knowingly bridging the
    // float from their own funds. The automatic mechanism is untouched — once
    // a real Prodigi id is recorded, the funding cron skips this order (and a
    // later payout.paid event no-ops on the sentinel check), so no automatic
    // payout is ever created for it: transfer the settled funds manually.
    try {
      const order = (await adminLookupOrders(orderId)).find((o) => o.orderId === orderId)
      if (!order) return NextResponse.json({ error: 'order not found' }, { status: 404 })
      if (order.refunded) return NextResponse.json({ error: 'order is refunded' }, { status: 400 })
      if (!order.lineItems || !(await hasPhysicalItems(order.lineItems))) {
        return NextResponse.json({ error: 'order has no physical items' }, { status: 400 })
      }
      // Only a REAL Prodigi id blocks the override — absent fulfilment, the
      // awaiting-payout sentinel and failed states may all be forced through.
      const pid = order.fulfilment?.prodigiId
      if (pid && !payoutIdFromSentinel(pid)) {
        return NextResponse.json({ error: `already submitted to Prodigi (${pid})` }, { status: 400 })
      }
      // Locale / monochrome / shipping method from the Stripe session — the
      // deferred paths must NOT default these (an 'en' fallback here once sent
      // an English poster master for a Danish purchase).
      const facts = order.paymentId
        ? await checkoutFactsForPayment(order.paymentId)
        : { locale: 'en', bwSkus: new Set<string>(), shippingMethod: undefined }
      const shippingLine = order.lineItems.find((l) => l.sku === 'shipping')
      const shippingMethod = facts.shippingMethod ?? shippingLine?.label.split('—')[1]?.trim()
      const result = await submitProdigiOrder({
        orderCode: orderId,
        lineItems: order.lineItems,
        shipping: order.shipping ?? null,
        email: order.email,
        locale: facts.locale,
        bwSkus: facts.bwSkus,
        shippingMethod,
        callbackUrl: prodigiCallbackUrl(SITE_URL, orderId),
      })
      if (!result) return NextResponse.json({ error: 'Prodigi submission returned nothing' }, { status: 502 })
      await recordFulfilment(orderId, {
        provider: 'prodigi',
        prodigiId: result.id,
        stage: result.stage,
        outcome: result.outcome,
        mode: result.mode,
      })
      return NextResponse.json({ ok: true, prodigiId: result.id, stage: result.stage, mode: result.mode })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'force-submit failed'
      console.error('[admin/order] force-submit failed:', message)
      return NextResponse.json({ ok: false, error: message }, { status: 502 })
    }
  }
  if (body.action === 'refund-lines') {
    // Line-item refund for any composition — digital, poster, fine-art, mixed,
    // shipping. Refunds each selected line's gross share (net + its
    // proportional VAT, coupon already baked into the nets) and revokes
    // download access for any digital skus among them. Physical production is
    // NOT auto-cancelled — Prodigi cancellation stays a manual step.
    const paymentId = String(body.paymentId ?? '')
    const skus = Array.isArray(body.skus) ? body.skus.map(String) : []
    if (!paymentId) return NextResponse.json({ error: 'missing paymentId' }, { status: 400 })
    if (skus.length === 0) return NextResponse.json({ error: 'no items selected' }, { status: 400 })
    try {
      const order = (await adminLookupOrders(orderId))[0]
      if (!order) return NextResponse.json({ error: 'order not found' }, { status: 404 })
      if (order.refunded) return NextResponse.json({ error: 'order already fully refunded' }, { status: 400 })
      const lines = order.lineItems ?? []
      if (lines.length === 0) {
        return NextResponse.json(
          { error: 'This order has no recorded line items (pre-dates itemised orders) — use the full-refund override.' },
          { status: 400 },
        )
      }
      const already = new Set(order.revokedSkus ?? [])
      const totalNet = lines.reduce((s, l) => s + l.net, 0)
      const selected = lines.filter((l) => skus.includes(l.sku) && !already.has(l.sku))
      const selectedNet = selected.reduce((s, l) => s + l.net, 0)
      if (selected.length === 0 || totalNet <= 0 || selectedNet <= 0) {
        return NextResponse.json({ error: 'Selected items are already refunded or have no value.' }, { status: 400 })
      }
      // Covers everything not yet refunded → refund the remaining balance in
      // full (no amount = Stripe refunds the remainder) and revoke all access.
      const fully = lines.every((l) => already.has(l.sku) || skus.includes(l.sku))
      const amount = Math.round((order.amount ?? 0) * selectedNet / totalNet)
      const refund = await stripe.refunds.create({
        payment_intent: paymentId,
        ...(fully ? {} : { amount }),
      })
      await markRefund(orderId, {
        amountRefunded: refund.amount,
        fullyRefunded: fully,
        revokedSkus: selected.map((l) => l.sku),
      })
      return NextResponse.json({ ok: true, refunded: refund.amount, items: selected.length, mode: fully ? 'full' : 'partial' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'refund failed'
      console.error('[admin/order] refund-lines failed:', message)
      return NextResponse.json({ ok: false, error: message }, { status: 502 })
    }
  }
  if (body.action === 'refund' || body.action === 'refund-full') {
    // Stripe Tax reverses its own transaction automatically; we mark the grant
    // (revoking access) now for instant admin feedback — the charge.refunded
    // webhook reconciles too.
    const paymentId = String(body.paymentId ?? '')
    if (!paymentId) return NextResponse.json({ error: 'missing paymentId' }, { status: 400 })
    try {
      // Full-refund override — refund everything and revoke all access.
      if (body.action === 'refund-full') {
        const refund = await stripe.refunds.create({ payment_intent: paymentId })
        await markRefund(orderId, { amountRefunded: refund.amount, fullyRefunded: true })
        return NextResponse.json({ ok: true, refunded: refund.amount, mode: 'full' })
      }

      // Undownloaded-only refund: refund the value of items the buyer hasn't
      // downloaded (and isn't already refunded for), tax included proportionally.
      const order = (await adminLookupOrders(orderId))[0]
      if (!order) return NextResponse.json({ error: 'order not found' }, { status: 404 })
      const catalog = await getCatalog()
      const priceBySku = new Map<string, number>()
      for (const photo of catalog) for (const p of photo.products) priceBySku.set(p.sku, p.price)

      let subtotalSum = 0
      let undownloadedSum = 0
      const revokedSkus: string[] = []
      for (const it of order.items) {
        const price = priceBySku.get(it.sku) ?? 0
        subtotalSum += price
        if ((it.downloads ?? 0) === 0 && !it.refunded) {
          undownloadedSum += price
          revokedSkus.push(it.sku)
        }
      }
      if (revokedSkus.length === 0 || undownloadedSum <= 0) {
        return NextResponse.json(
          { ok: false, error: 'All items have been downloaded — nothing to refund. Use the full-refund override if needed.' },
          { status: 400 },
        )
      }
      // Proportional gross share of the undownloaded items (includes their tax).
      const fully = revokedSkus.length === order.items.length
      const amount = subtotalSum > 0 ? Math.round((order.amount ?? 0) * undownloadedSum / subtotalSum) : 0
      const refund = await stripe.refunds.create({
        payment_intent: paymentId,
        ...(fully ? {} : { amount }),
      })
      await markRefund(orderId, { amountRefunded: refund.amount, fullyRefunded: fully, revokedSkus })
      return NextResponse.json({ ok: true, refunded: refund.amount, items: revokedSkus.length, mode: fully ? 'full' : 'partial' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'refund failed'
      console.error('[admin/order] refund failed:', message)
      return NextResponse.json({ ok: false, error: message }, { status: 502 })
    }
  }
  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
