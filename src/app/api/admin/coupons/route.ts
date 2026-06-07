/**
 * Admin coupons — create/list/deactivate Stripe promotion codes (each backed by
 * a Coupon). Session-gated. Codes apply at checkout via the promo-code field.
 * Mode follows the secret key (test on preview, live in production).
 */

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'
import { stripe } from '@/lib/stripe-server'

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

function discountOf(p: Stripe.PromotionCode): string {
  if (p.metadata?.discount) return p.metadata.discount
  // `coupon` isn't on the SDK type for this API version (moved under promotion);
  // read it defensively for codes created outside our admin.
  const c = (p as unknown as { coupon?: Stripe.Coupon }).coupon
  if (c) {
    if (c.percent_off) return `${c.percent_off}% off`
    if (c.amount_off) return `${(c.amount_off / 100).toFixed(2)} ${(c.currency ?? '').toUpperCase()} off`
  }
  return '—'
}

export async function GET(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const list = await stripe.promotionCodes.list({ limit: 100 })
    const codes: PromoView[] = list.data
      // Hide dead records: a code whose backing coupon was deleted (Stripe can't
      // delete promotion codes themselves, so cleanup leaves these dangling).
      .filter((p) => {
        const c = (p as unknown as { coupon?: (Stripe.Coupon & { deleted?: boolean }) | null }).coupon
        return c != null && c.deleted !== true
      })
      .map((p) => ({
        id: p.id,
        code: p.code,
        active: p.active,
        discount: discountOf(p),
        used: p.times_redeemed,
        max: p.max_redemptions ?? null,
        expiresAt: p.expires_at ?? null,
        created: p.created,
      }))
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
    try {
      await stripe.promotionCodes.update(body.id, { active: false })
      return NextResponse.json({ ok: true })
    } catch (err) {
      return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'failed' }, { status: 502 })
    }
  }

  // Create (default action)
  const currency = (body.currency || 'dkk').toLowerCase()
  let discountLabel: string
  let couponParams: Stripe.CouponCreateParams
  if (body.type === 'amount') {
    const minor = Math.round((body.amount ?? 0) * 100)
    if (minor <= 0) return NextResponse.json({ error: 'amount must be greater than 0' }, { status: 400 })
    discountLabel = `${(minor / 100).toFixed(2)} ${currency.toUpperCase()} off`
    couponParams = { duration: 'once', amount_off: minor, currency, name: discountLabel }
  } else {
    const pct = body.percent ?? 0
    if (pct <= 0 || pct > 100) return NextResponse.json({ error: 'percent must be 1–100' }, { status: 400 })
    discountLabel = `${pct}% off`
    couponParams = { duration: 'once', percent_off: pct, name: discountLabel }
  }

  try {
    const coupon = await stripe.coupons.create(couponParams)
    // `promotion: { type:'coupon', coupon }` is the current API shape (newer than
    // the SDK's flat `coupon` param), so cast through unknown.
    const promoParams = {
      promotion: { type: 'coupon', coupon: coupon.id },
      ...(body.code ? { code: body.code.trim().toUpperCase() } : {}),
      ...(body.maxRedemptions && body.maxRedemptions > 0 ? { max_redemptions: body.maxRedemptions } : {}),
      ...(body.expiresAt ? { expires_at: body.expiresAt } : {}),
      metadata: { discount: discountLabel },
    }
    const promo = await stripe.promotionCodes.create(promoParams as unknown as Stripe.PromotionCodeCreateParams)
    return NextResponse.json({ ok: true, code: promo.code, id: promo.id })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'failed' }, { status: 502 })
  }
}
