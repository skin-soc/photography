/**
 * Danger-zone cleanup: delete every TEST-mode coupon from our KV store.
 *
 * Refuses to run against a live key — this only ever clears test clutter before
 * going live. Coupons live in our own KV (not Stripe) and are mode-scoped, so we
 * just delete the `coupon:test:*` keys. Session-gated. See [[stripe-payments-only]].
 */

import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'
import { listCoupons, deleteCoupon } from '@/lib/coupons'

async function authed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ADMIN_COOKIE)?.value
  return verifySessionToken(token, process.env.ADMIN_PASSWORD ?? '')
}

export async function POST(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Safety: never touch live coupons. This button is test-only.
  if ((process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_live')) {
    return NextResponse.json({ error: 'refused: live mode — test coupons only' }, { status: 400 })
  }

  try {
    const codes = await listCoupons('test')
    let deleted = 0
    for (const c of codes) {
      if (await deleteCoupon(c.code, 'test')) deleted += 1
    }
    return NextResponse.json({ deleted, deactivated: 0 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 502 })
  }
}
