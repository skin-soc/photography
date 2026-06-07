/**
 * Admin order management — look up download orders, re-send the link email, or
 * extend an order's expiry. Guarded by the admin session cookie (the /api/*
 * matcher is excluded from middleware), then proxied to the LAN origin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'
import { stripe } from '@/lib/stripe-server'
import { getCatalog } from '@/lib/shop'
import { adminLookupOrders, adminRecentOrders, adminResendOrder, adminExtendOrder, markRefund } from '@/lib/downloads'

async function authed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ADMIN_COOKIE)?.value
  return verifySessionToken(token, process.env.ADMIN_PASSWORD ?? '')
}

export async function GET(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // ?recent=90 → the full recent-orders list for the table; ?q=… → a search.
  const recent = req.nextUrl.searchParams.get('recent')
  if (recent !== null) {
    const days = Math.min(3650, Math.max(1, parseInt(recent, 10) || 90))
    return NextResponse.json({ orders: await adminRecentOrders(days) })
  }
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ error: 'missing query' }, { status: 400 })
  return NextResponse.json({ orders: await adminLookupOrders(q) })
}

export async function POST(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as {
    action?: 'resend' | 'extend' | 'refund' | 'refund-full'
    orderId?: string
    email?: string
    paymentId?: string
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
