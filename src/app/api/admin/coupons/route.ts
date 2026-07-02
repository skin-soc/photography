/**
 * Admin coupons — create/list/deactivate discount codes held in our own KV store
 * (not Stripe), so Stripe does no discount/tax calculation at checkout. Codes are
 * scoped to the current Stripe mode (test on preview, live in production) and
 * applied by us at session creation. Session-gated. See [[stripe-payments-only]].
 */

import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'
import { listCoupons, createCoupon, deactivateCoupon, getCoupon, type Coupon } from '@/lib/coupons'

// Excludes visually-ambiguous characters (0/O, 1/I/L) — this code gets typed
// in by a customer at checkout, so legibility matters more than entropy.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** Random 8-char code for when the admin leaves the field blank (the field is
 *  labelled "optional" — this is what makes that true; it used to just
 *  reject with "code required"). Retries on the rare collision. */
async function generateUniqueCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    let candidate = ''
    for (let i = 0; i < 8; i++) candidate += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
    if (!(await getCoupon(candidate))) return candidate
  }
  throw new Error('could not generate a unique code, try again')
}

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

  // Create (default action). Code is genuinely optional — auto-generate one
  // when left blank, matching the "Code (optional)" label in the admin UI.
  let code = body.code
  if (!code) {
    try {
      code = await generateUniqueCode()
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'code generation failed' }, { status: 502 })
    }
  }
  const res = await createCoupon({
    code,
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
