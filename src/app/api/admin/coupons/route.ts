/**
 * Admin coupons — create/list/deactivate discount codes held in our own KV store
 * (not Stripe), so Stripe does no discount/tax calculation at checkout. Codes are
 * scoped to the current Stripe mode (test on preview, live in production) and
 * applied by us at session creation. Session-gated. See [[stripe-payments-only]].
 */

import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'
import { listCoupons, createCoupon, deactivateCoupon, type Coupon } from '@/lib/coupons'

async function authed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ADMIN_COOKIE)?.value
  return verifySessionToken(token, process.env.ADMIN_PASSWORD ?? '')
}

interface PromoView {
  id: string
  code: string
  active: boolean
  discount: string
  used: number
  max: number | null
  expiresAt: number | null
  created: number
}

function discountLabel(c: Coupon): string {
  if (c.type === 'percent') return `${c.percent}% off`
  return `${((c.amount ?? 0) / 100).toFixed(2)} ${(c.currency ?? '').toUpperCase()} off`
}

function toView(c: Coupon): PromoView {
  return {
    id: c.code,
    code: c.code,
    active: c.active,
    discount: discountLabel(c),
    used: c.timesRedeemed,
    max: c.maxRedemptions,
    expiresAt: c.expiresAt,
    created: c.created,
  }
}

export async function GET(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const codes = (await listCoupons()).map(toView)
    return NextResponse.json({ codes })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 502 })
  }
}

export async function POST(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as {
    action?: 'create' | 'deactivate'
    id?: string
    type?: 'percent' | 'amount'
    percent?: number
    amount?: number // major units
    currency?: string
    code?: string
    maxRedemptions?: number
    expiresAt?: number // unix seconds
  }

  if (body.action === 'deactivate') {
    if (!body.id) return NextResponse.json({ error: 'missing id' }, { status: 400 })
    const ok = await deactivateCoupon(body.id)
    return NextResponse.json({ ok }, { status: ok ? 200 : 502 })
  }

  // Create (default action)
  if (!body.code) return NextResponse.json({ error: 'code required' }, { status: 400 })
  const res = await createCoupon({
    code: body.code,
    type: body.type === 'amount' ? 'amount' : 'percent',
    percent: body.percent,
    amount: body.type === 'amount' ? Math.round((body.amount ?? 0) * 100) : undefined,
    currency: (body.currency || 'dkk').toLowerCase(),
    maxRedemptions: body.maxRedemptions,
    expiresAt: body.expiresAt,
  })
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 })
  return NextResponse.json({ ok: true, code: res.coupon.code, id: res.coupon.code })
}
