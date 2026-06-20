/**
 * Live shipping options for a physical basket + destination.
 *
 * Prodigi shipping depends on the WHOLE order (sizes/qty) and the country, so we
 * quote every shipment method for the full set of physical items at once and
 * present them to the customer. Each option's price is Prodigi's ex-tax shipping
 * (EUR→DKK with the FX buffer) plus the admin handling fee. Methods that would
 * be produced outside the EU are dropped (§7 routing guard). DISPLAY ONLY — the
 * checkout-session route re-quotes server-side for the chosen method, so the
 * amount here is never trusted for charging.
 */

import { getQuotes, checkEuFulfilment } from '@/lib/prodigi'
import { quoteItemsForSkus } from '@/lib/prodigi-fulfil'
import { getRates, eurToDkkOre } from '@/lib/currency'
import { getPricing } from '@/lib/pricing'

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { skus?: string[]; destinationCountry?: string }
    const skus = Array.isArray(body.skus) ? body.skus.map(String) : []
    const destinationCountry = String(body.destinationCountry ?? '').toUpperCase()
    if (skus.length === 0 || destinationCountry.length !== 2) {
      return Response.json({ error: 'missing items or destination' }, { status: 400 })
    }

    const items = await quoteItemsForSkus(skus)
    if (items.length === 0) {
      // No Prodigi-fulfillable items — caller shouldn't have asked, but be safe.
      return Response.json({ options: [] })
    }

    const [quotes, rates, pricing] = await Promise.all([
      getQuotes({ items, destinationCountryCode: destinationCountry }),
      getRates(),
      getPricing(),
    ])
    const handling = pricing.shippingHandlingMinor

    const options = quotes
      // Only methods that produce entirely within the EU (never the UK).
      .filter((q) => checkEuFulfilment(q).ok)
      .map((q) => ({
        method: q.method,
        label: q.method,
        amountMinor: eurToDkkOre(q.shippingMinor, rates) + handling,
        currency: 'dkk',
      }))
      .sort((a, b) => a.amountMinor - b.amountMinor)

    if (options.length === 0) {
      return Response.json({ error: 'no shipping options available to this destination' }, { status: 422 })
    }
    return Response.json({ options })
  } catch (err) {
    console.error('[shipping-quotes] error:', err instanceof Error ? err.message : String(err))
    return Response.json({ error: 'shipping quote unavailable' }, { status: 502 })
  }
}
