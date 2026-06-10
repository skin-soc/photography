/**
 * Prodigi print-fulfilment adapter — SERVER ONLY (uses the API key).
 *
 * Never import this into a client component. It reads PRODIGI_API_KEY and talks
 * to the Prodigi Print API v4. The base URL is derived from the key: a sandbox
 * key (`test_…`) hits api.sandbox.prodigi.com, otherwise live. Per the standing
 * rule, the live key stays parked — build/test on sandbox only.
 *
 * Design: docs/fap-print-fulfilment.md. This is the Prodigi implementation; a
 * provider-agnostic interface can wrap it when a second lab (e.g. WhiteWall) is
 * added. For now it exposes product details, quotes, and the EU/NL routing guard
 * (§7) — the read-only half. Order creation + the no-float funding pipeline come
 * later, gated on Stripe Issuing.
 */

import { isEU } from './vat'

const KEY = process.env.PRODIGI_API_KEY ?? ''
const BASE = KEY.startsWith('test_')
  ? 'https://api.sandbox.prodigi.com/v4.0'
  : 'https://api.prodigi.com/v4.0'

export function prodigiConfigured(): boolean {
  return KEY.length > 0
}

/** Which environment the active key targets. */
export function prodigiMode(): 'sandbox' | 'live' {
  return KEY.startsWith('test_') ? 'sandbox' : 'live'
}

async function prodigiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'X-API-Key': KEY,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    signal: controller.signal,
  }).finally(() => clearTimeout(timer))
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`prodigi ${path} responded ${res.status}: ${body.slice(0, 300)}`)
  }
  return res.json() as Promise<T>
}

/** Parse a Prodigi money string ("48.00") to minor units (cents/øre). */
function toMinor(amount: string | number | null | undefined): number {
  const n = typeof amount === 'string' ? Number(amount) : amount ?? 0
  return Math.round((n || 0) * 100)
}

// ── Product details ──────────────────────────────────────────────────────────

export interface ProdigiVariant {
  attributes: Record<string, string>
  shipsTo: string[]
}

export interface ProdigiProduct {
  sku: string
  description: string
  dimensions: { width: number; height: number; units: string } | null
  /** Available option values per attribute, e.g. { color: ['black', …] }. */
  attributes: Record<string, string[]>
  variants: ProdigiVariant[]
}

interface ProductDetailsResponse {
  outcome: string
  product: {
    sku: string
    description: string
    productDimensions?: { width: number; height: number; units: string }
    attributes?: Record<string, string[]>
    variants?: { attributes: Record<string, string>; shipsTo: string[] }[]
  }
}

export async function getProductDetails(sku: string): Promise<ProdigiProduct> {
  const d = await prodigiFetch<ProductDetailsResponse>(`/products/${encodeURIComponent(sku)}`)
  const p = d.product
  return {
    sku: p.sku,
    description: p.description,
    dimensions: p.productDimensions ?? null,
    attributes: p.attributes ?? {},
    variants: (p.variants ?? []).map((v) => ({ attributes: v.attributes, shipsTo: v.shipsTo })),
  }
}

// ── Quotes ─────────────────────────────────────────────────────────────────--

export interface QuoteItem {
  sku: string
  copies: number
  /** Chosen variant attributes (e.g. { color: 'black' }). */
  attributes?: Record<string, string>
  printArea?: string
}

/** Where Prodigi would produce a shipment — the lab/country (§7 routing guard). */
export interface ProdigiFulfilment {
  countryCode: string
  labCode: string
  carrier?: string
}

/**
 * Normalised quote. All amounts are minor units in `currency`. `itemsMinor` and
 * `shippingMinor` are EX-TAX; `taxMinor` is Prodigi's (reclaimable) VAT;
 * `totalMinor` is what Prodigi actually charges us (incl. their tax).
 */
export interface ProdigiQuote {
  currency: string
  itemsMinor: number
  shippingMinor: number
  taxMinor: number
  totalMinor: number
  fulfilments: ProdigiFulfilment[]
}

interface QuoteResponse {
  outcome: string
  quotes: {
    shipmentMethod: string
    costSummary: {
      items?: { amount: string; currency: string }
      shipping?: { amount: string; currency: string }
      totalCost?: { amount: string; currency: string }
      totalTax?: { amount: string; currency: string }
    }
    shipments?: {
      carrier?: { name?: string; service?: string }
      fulfillmentLocation?: { countryCode: string; labCode: string }
    }[]
  }[]
}

export async function getQuote({
  items,
  destinationCountryCode,
  shippingMethod = 'Budget',
  currencyCode = 'EUR',
}: {
  items: QuoteItem[]
  destinationCountryCode: string
  shippingMethod?: string
  currencyCode?: string
}): Promise<ProdigiQuote> {
  const body = {
    shippingMethod,
    destinationCountryCode,
    currencyCode,
    items: items.map((i) => ({
      sku: i.sku,
      copies: i.copies,
      attributes: i.attributes ?? {},
      assets: [{ printArea: i.printArea ?? 'default' }],
    })),
  }
  const d = await prodigiFetch<QuoteResponse>('/quotes', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  // Prefer the quote for the requested method; fall back to the first returned.
  const q = d.quotes.find((x) => x.shipmentMethod === shippingMethod) ?? d.quotes[0]
  if (!q) throw new Error('prodigi quote returned no quotes')
  const cs = q.costSummary
  const fulfilments: ProdigiFulfilment[] = (q.shipments ?? [])
    .filter((s) => s.fulfillmentLocation)
    .map((s) => ({
      countryCode: s.fulfillmentLocation!.countryCode,
      labCode: s.fulfillmentLocation!.labCode,
      carrier: s.carrier?.name,
    }))
  return {
    currency: cs.totalCost?.currency ?? currencyCode,
    itemsMinor: toMinor(cs.items?.amount),
    shippingMinor: toMinor(cs.shipping?.amount),
    taxMinor: toMinor(cs.totalTax?.amount),
    totalMinor: toMinor(cs.totalCost?.amount),
    fulfilments,
  }
}

// ── EU/NL routing guard (§7) ──────────────────────────────────────────────────

export interface RoutingCheck {
  /** True when EVERY shipment is produced in the EU (NL ideal) and never the UK. */
  ok: boolean
  /** Shipments that would be produced outside the EU (the reason for a block). */
  offending: ProdigiFulfilment[]
}

/**
 * Hard requirement: produce in the EU, never the UK (a VAT/customs correctness
 * rule — see docs §7). Read the quote's per-shipment production location and
 * reject anything outside the EU. Call this PRE-CHARGE; if !ok, don't sell.
 * `isEU` already excludes GB.
 */
export function checkEuFulfilment(quote: ProdigiQuote): RoutingCheck {
  const offending = quote.fulfilments.filter((f) => !isEU(f.countryCode))
  return { ok: offending.length === 0 && quote.fulfilments.length > 0, offending }
}
