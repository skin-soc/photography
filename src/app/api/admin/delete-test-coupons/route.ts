/**
 * Danger-zone cleanup: remove TEST-mode coupons + promotion codes.
 *
 * Refuses to run against a live key — this only ever clears test clutter before
 * going live. Stripe lets us delete coupons but not promotion codes, so we
 * delete every coupon (which invalidates its codes) and deactivate any remaining
 * active promotion codes. Session-gated.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'
import { stripe } from '@/lib/stripe-server'

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
    // Deactivate any active promotion codes (codes can't be deleted via the API).
    let deactivated = 0
    for await (const code of stripe.promotionCodes.list({ limit: 100 })) {
      if (code.active) {
        await stripe.promotionCodes.update(code.id, { active: false })
        deactivated += 1
      }
    }
    // Delete every coupon (this invalidates its promotion codes too).
    let deleted = 0
    for await (const coupon of stripe.coupons.list({ limit: 100 })) {
      await stripe.coupons.del(coupon.id)
      deleted += 1
    }
    return NextResponse.json({ deleted, deactivated })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 502 })
  }
}
