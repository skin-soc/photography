/**
 * Coupon store — backed by Cloudflare KV (binding: SHOP_SETTINGS).
 *
 * We run our own coupons rather than Stripe promotion codes so that Stripe does
 * NO calculation at checkout: we validate the code, compute the discount on the
 * net ourselves, and hand Stripe a single gross amount (see [[stripe-payments-only]]).
 *
 * Preview (test) and production (live) share ONE KV namespace, so keys are
 * namespaced by Stripe mode — a code created in test must never apply in live.
 */

import { getCloudflareContext } from '@opennextjs/cloudflare'

interface KVLike {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  list(opts: { prefix: string }): Promise<{ keys: { name: string }[] }>
}

export interface Coupon {
  code: string // uppercase, also the KV key suffix
  type: 'percent' | 'amount'
  percent?: number // 1–100, when type === 'percent'
  amount?: number // minor units, when type === 'amount'
  currency?: string // lowercase ISO, when type === 'amount'
  active: boolean
  maxRedemptions: number | null
  timesRedeemed: number
  expiresAt: number | null // unix seconds
  created: number // unix seconds
}

export type CouponMode = 'live' | 'test'

/** Stripe mode the worker is running in — coupons are scoped to it. */
export function couponMode(): CouponMode {
  return (process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_live') ? 'live' : 'test'
}

function keyFor(mode: CouponMode, code: string): string {
  return `coupon:${mode}:${code.trim().toUpperCase()}`
}

async function couponsKV(): Promise<KVLike | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true })
    return (env as unknown as { SHOP_SETTINGS?: KVLike }).SHOP_SETTINGS
  } catch {
    return undefined
  }
}

export async function getCoupon(code: string, mode = couponMode()): Promise<Coupon | null> {
  const kv = await couponsKV()
  if (!kv || !code) return null
  try {
    const raw = await kv.get(keyFor(mode, code))
    return raw ? (JSON.parse(raw) as Coupon) : null
  } catch {
    return null
  }
}

export async function listCoupons(mode = couponMode()): Promise<Coupon[]> {
  const kv = await couponsKV()
  if (!kv) return []
  try {
    const { keys } = await kv.list({ prefix: `coupon:${mode}:` })
    const out: Coupon[] = []
    for (const k of keys) {
      const raw = await kv.get(k.name)
      if (raw) out.push(JSON.parse(raw) as Coupon)
    }
    return out.sort((a, b) => b.created - a.created)
  } catch {
    return []
  }
}

export interface CreateCouponInput {
  code: string
  type: 'percent' | 'amount'
  percent?: number
  amount?: number // minor units
  currency?: string
  maxRedemptions?: number | null
  expiresAt?: number | null
}

export type CreateResult =
  | { ok: true; coupon: Coupon }
  | { ok: false; error: string }

export async function createCoupon(input: CreateCouponInput, mode = couponMode()): Promise<CreateResult> {
  const kv = await couponsKV()
  if (!kv) return { ok: false, error: 'KV unavailable' }
  const code = input.code.trim().toUpperCase()
  if (!/^[A-Z0-9_-]{2,40}$/.test(code)) return { ok: false, error: 'code must be 2–40 chars (A–Z, 0–9, - _)' }
  if (input.type === 'percent') {
    const pct = Number(input.percent)
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return { ok: false, error: 'percent must be 1–100' }
  } else {
    const minor = Number(input.amount)
    if (!Number.isInteger(minor) || minor <= 0) return { ok: false, error: 'amount must be greater than 0' }
    if (!input.currency) return { ok: false, error: 'currency required for an amount discount' }
  }
  if (await getCoupon(code, mode)) return { ok: false, error: `code ${code} already exists` }
  const coupon: Coupon = {
    code,
    type: input.type,
    ...(input.type === 'percent' ? { percent: Number(input.percent) } : { amount: Number(input.amount), currency: input.currency!.toLowerCase() }),
    active: true,
    maxRedemptions: input.maxRedemptions && input.maxRedemptions > 0 ? Math.floor(input.maxRedemptions) : null,
    timesRedeemed: 0,
    expiresAt: input.expiresAt && input.expiresAt > 0 ? Math.floor(input.expiresAt) : null,
    created: Math.floor(Date.now() / 1000),
  }
  await kv.put(keyFor(mode, code), JSON.stringify(coupon))
  return { ok: true, coupon }
}

export async function deactivateCoupon(code: string, mode = couponMode()): Promise<boolean> {
  const kv = await couponsKV()
  if (!kv) return false
  const c = await getCoupon(code, mode)
  if (!c) return false
  c.active = false
  await kv.put(keyFor(mode, code), JSON.stringify(c))
  return true
}

export async function deleteCoupon(code: string, mode = couponMode()): Promise<boolean> {
  const kv = await couponsKV()
  if (!kv) return false
  try {
    await kv.delete(keyFor(mode, code))
    return true
  } catch {
    return false
  }
}

export type CouponInvalidReason = 'not_found' | 'inactive' | 'expired' | 'exhausted' | 'currency_mismatch'

export type CouponValidation =
  | { ok: true; coupon: Coupon }
  | { ok: false; reason: CouponInvalidReason }

/**
 * Validate a code for use against an order in `currency`. Does NOT mutate the
 * coupon — redemption is counted only once the order is paid (in the webhook).
 */
export async function validateCoupon(code: string, currency: string, mode = couponMode()): Promise<CouponValidation> {
  const c = await getCoupon(code, mode)
  if (!c) return { ok: false, reason: 'not_found' }
  if (!c.active) return { ok: false, reason: 'inactive' }
  if (c.expiresAt != null && Date.now() / 1000 > c.expiresAt) return { ok: false, reason: 'expired' }
  if (c.maxRedemptions != null && c.timesRedeemed >= c.maxRedemptions) return { ok: false, reason: 'exhausted' }
  if (c.type === 'amount' && c.currency && c.currency !== currency.toLowerCase()) {
    return { ok: false, reason: 'currency_mismatch' }
  }
  return { ok: true, coupon: c }
}

/**
 * The discount in minor units a (valid) coupon applies to a `netMinor` subtotal.
 * Never exceeds the subtotal (an amount coupon larger than the order zeroes it).
 */
export function discountFor(coupon: Coupon, netMinor: number): number {
  const raw = coupon.type === 'percent'
    ? Math.round(netMinor * (coupon.percent ?? 0) / 100)
    : (coupon.amount ?? 0)
  return Math.max(0, Math.min(raw, netMinor))
}

/** Count one redemption once an order is paid. Best-effort read-modify-write. */
export async function redeemCoupon(code: string, mode = couponMode()): Promise<void> {
  const kv = await couponsKV()
  if (!kv) return
  const c = await getCoupon(code, mode)
  if (!c) return
  c.timesRedeemed = (c.timesRedeemed ?? 0) + 1
  await kv.put(keyFor(mode, code), JSON.stringify(c))
}
