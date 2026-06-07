/**
 * EU OSS distance-selling threshold tracker.
 *
 * Sums this calendar year's LIVE cross-border B2C sales to EU buyers OUTSIDE
 * Denmark, valued in EUR at Danmarks Nationalbank's official daily rate per
 * transaction date, ex-VAT (the basis the €10,000/yr threshold is measured on).
 * Once this (or the previous year) exceeds €10,000 the shop must switch from the
 * Danish rate to OSS + destination rates. Session-gated. See [[manual-vat-approach]].
 */

import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'
import { adminRecentOrders, type AdminOrder } from '@/lib/downloads'
import { vatJurisdiction } from '@/lib/vat'
import { fetchEurRatesForYear, rateForDate, dkkMinorToEur, type EurRate } from '@/lib/fx'

const THRESHOLD_EUR = 10_000

async function authed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ADMIN_COOKIE)?.value
  return verifySessionToken(token, process.env.ADMIN_PASSWORD ?? '')
}

/** EU-excl-DK net (ex-VAT) EUR total for a calendar year, from already-fetched
 *  orders + rates. Skips test, fully-refunded, and non-EU/DK orders. */
function eurTotalForYear(orders: AdminOrder[], rates: EurRate[], year: number): { total: number; count: number; ratesMissing: boolean } {
  let total = 0
  let count = 0
  let ratesMissing = false
  for (const o of orders) {
    if (o.livemode !== true || o.refunded) continue
    if (vatJurisdiction(o.taxCountry ?? o.cardCountry ?? null) !== 'EU') continue
    const iso = new Date(o.createdAt).toISOString()
    if (new Date(iso).getUTCFullYear() !== year) continue

    // Net of VAT and net of any partial refund.
    const amount = o.amount ?? 0
    const refunded = o.refundedAmount ?? 0
    const grossEff = Math.max(0, amount - refunded)
    const taxEff = amount > 0 ? Math.round((o.taxAmount ?? 0) * (grossEff / amount)) : 0
    const netMinor = Math.max(0, grossEff - taxEff)

    const cur = (o.currency ?? 'dkk').toLowerCase()
    if (cur === 'eur') {
      total += netMinor / 100
    } else if (cur === 'dkk') {
      const rate = rateForDate(rates, iso.slice(0, 10))
      if (rate == null) { ratesMissing = true; continue }
      total += dkkMinorToEur(netMinor, rate)
    } else {
      // Unexpected currency for this shop — flag rather than mis-convert.
      ratesMissing = true
      continue
    }
    count += 1
  }
  return { total: Math.round(total * 100) / 100, count, ratesMissing }
}

export async function GET(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const now = new Date()
  const year = now.getUTCFullYear()
  // ~13 months of orders covers this year plus a tail of last year.
  const orders = await adminRecentOrders(400)
  const [ratesThis, ratesLast] = await Promise.all([
    fetchEurRatesForYear(year),
    fetchEurRatesForYear(year - 1),
  ])

  const current = eurTotalForYear(orders, ratesThis, year)
  const previous = eurTotalForYear(orders, ratesLast, year - 1)

  return NextResponse.json({
    threshold: THRESHOLD_EUR,
    year,
    current: { eurTotal: current.total, count: current.count },
    previous: { year: year - 1, eurTotal: previous.total, count: previous.count },
    // True if either year exceeded — OSS becomes mandatory.
    exceeded: current.total >= THRESHOLD_EUR || previous.total >= THRESHOLD_EUR,
    ratesMissing: current.ratesMissing || previous.ratesMissing,
    asOf: now.toISOString(),
  })
}
