/**
 * Admin pricing — read/update the retail price of every product line (posters,
 * fine art, digital downloads). Session-gated. A price can never be set below
 * the provider cost: POST re-validates against the live cost floors and rejects
 * the whole save (400) if any line is under water. Saving purges the catalog
 * cache so new prices show within the cache window. See [[manual-vat-approach]].
 */

import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'
import { getRates } from '@/lib/currency'
import {
  getPricing,
  setPricing,
  pricingFloors,
  type PricingConfig,
} from '@/lib/pricing'
import { purgeCatalogCache } from '@/lib/shop'

async function authed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ADMIN_COOKIE)?.value
  return verifySessionToken(token, process.env.ADMIN_PASSWORD ?? '')
}

export async function GET(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const [pricing, rates] = await Promise.all([getPricing(), getRates()])
  return NextResponse.json({ pricing, floors: pricingFloors(rates) })
}

export async function POST(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { pricing?: PricingConfig } | null
  if (!body?.pricing) {
    return NextResponse.json({ error: 'missing pricing' }, { status: 400 })
  }
  const floors = pricingFloors(await getRates())
  const { ok, errors, markupErrors } = await setPricing(body.pricing, floors)
  if (!ok && (errors.length > 0 || markupErrors.length > 0)) {
    // One or more lines below cost, or an invalid markup — reject the whole save.
    const parts = [
      errors.length > 0 ? 'Some prices are below cost' : '',
      markupErrors.length > 0 ? markupErrors.join(' ') : '',
    ].filter(Boolean)
    return NextResponse.json(
      { error: parts.join(' '), errors, markupErrors, floors },
      { status: 400 },
    )
  }
  if (!ok) {
    // KV unavailable (errors empty but not written).
    return NextResponse.json({ error: 'Could not save — storage unavailable' }, { status: 502 })
  }
  // New prices are baked at catalog-build time — purge so they appear promptly.
  await purgeCatalogCache()
  const pricing = await getPricing()
  return NextResponse.json({ ok: true, pricing, floors })
}
