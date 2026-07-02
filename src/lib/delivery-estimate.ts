/**
 * Delivery estimate for made-to-order physical products (posters / fine art),
 * shown on the product page as a "{min}–{max} weeks" range.
 *
 * The estimate is the sum of three sequential stages, in CALENDAR days:
 *
 *  1. No-float funding delay — the shop only submits to Prodigi after the
 *     Stripe charge has settled AND the manual payout covering it has been
 *     paid out (see docs/fap-print-fulfilment.md and src/lib/prodigi-payout.ts).
 *     Steady-state: balance available ≈ 2–5 business days + payout arrival
 *     ≈ 1–2 business days (+ up to 15 min cron granularity). A brand-new
 *     Stripe account's very first settlements can take ~7 days — the max
 *     below absorbs that comfortably once converted to weeks.
 *  2. Prodigi production — their API returns no lead times, so these come
 *     from Prodigi's published SLAs: posters typically 1–2 business days,
 *     canvas/framed fine art 3–5 business days.
 *  3. Shipping — EU standard methods, typically 2–6 calendar days.
 *
 * Tune the constants here; everything downstream recomputes.
 */

const NO_FLOAT_DAYS = { min: 4, max: 9 }
const SHIPPING_DAYS = { min: 2, max: 6 }
const PRODUCTION_DAYS: Record<'print' | 'fine-art', { min: number; max: number }> = {
  print: { min: 1, max: 4 },
  'fine-art': { min: 3, max: 7 },
}

/** Whole-week range for the product page, e.g. { min: 1, max: 3 } → "1–3 weeks". */
export function deliveryEstimateWeeks(type: 'print' | 'fine-art'): { min: number; max: number } {
  const prod = PRODUCTION_DAYS[type]
  const minDays = NO_FLOAT_DAYS.min + prod.min + SHIPPING_DAYS.min
  const maxDays = NO_FLOAT_DAYS.max + prod.max + SHIPPING_DAYS.max
  return {
    min: Math.max(1, Math.ceil(minDays / 7)),
    max: Math.max(1, Math.ceil(maxDays / 7)),
  }
}
