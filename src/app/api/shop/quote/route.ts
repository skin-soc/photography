/**
 * Live shipping quote for physical (print / fine-art) cart items.
 *
 * Phase 2 of the print-fulfilment flow (docs/fap-print-fulfilment.md): given the
 * cart SKUs and a destination country, ask Prodigi for the real shipping cost and
 * the production location, then:
 *   • enforce the EU/NL routing rule PRE-CHARGE (never UK) — §7, and
 *   • convert the EUR shipping to a DKK client line via the ECB rate + FX buffer.
 *
 * Digital items don't ship; only products with a `providerSku` are quoted. If no
 * physical items are present, shipping is zero and ok. SERVER route — safe to use
 * the Prodigi key and node:crypto (via shop.ts).
 */

import { findProductBySku } from '@/lib/shop'
import { getQuote, checkEuFulfilment, prodigiConfigured, type QuoteItem } from '@/lib/prodigi'
import { getRates, eurToDkkOre, formatDKK } from '@/lib/currency'

interface QuoteRequest {
  items?: { sku: string; copies?: number }[]
  country?: string
}

export async function POST(req: Request) {
  let body: QuoteRequest
  try {
    body = (await req.json()) as QuoteRequest
  } catch {
    return Response.json({ error: 'invalid body' }, { status: 400 })
  }

  const country = (body.country ?? '').toUpperCase()
  const lines = Array.isArray(body.items) ? body.items : []
  if (!country || country.length !== 2) {
    return Response.json({ error: 'destination country required' }, { status: 400 })
  }

  // Resolve each cart SKU to its product; keep only physical items with a
  // providerSku (digital downloads and legacy non-provider prints don't ship).
  const quoteItems: QuoteItem[] = []
  for (const line of lines) {
    const found = await findProductBySku(line.sku)
    const p = found?.product
    if (p?.providerSku) {
      quoteItems.push({
        sku: p.providerSku,
        copies: Math.max(1, line.copies ?? 1),
        attributes: p.attributes ?? {},
      })
    }
  }

  // No physical items → nothing to ship.
  if (quoteItems.length === 0) {
    return Response.json({ ok: true, physical: false, shippingOre: 0, shippingText: formatDKK(0) })
  }

  if (!prodigiConfigured()) {
    return Response.json({ ok: false, error: 'fulfilment not configured' }, { status: 503 })
  }

  try {
    const quote = await getQuote({ items: quoteItems, destinationCountryCode: country, currencyCode: 'EUR' })

    // PRE-CHARGE routing guard — refuse anything that wouldn't produce in the EU.
    const routing = checkEuFulfilment(quote)
    if (!routing.ok) {
      return Response.json({
        ok: false,
        physical: true,
        blocked: 'routing',
        offending: routing.offending,
      })
    }

    const rates = await getRates()
    const shippingOre = eurToDkkOre(quote.shippingMinor, rates)
    return Response.json({
      ok: true,
      physical: true,
      shippingOre,
      shippingText: formatDKK(shippingOre),
      carrier: quote.fulfilments[0]?.carrier ?? null,
      fulfilmentCountry: quote.fulfilments[0]?.countryCode ?? null,
    })
  } catch (err) {
    console.error('[shop/quote] prodigi quote failed:', err)
    return Response.json({ ok: false, error: 'quote failed' }, { status: 502 })
  }
}
