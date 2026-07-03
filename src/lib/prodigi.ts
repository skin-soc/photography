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
// Environment is EXPLICIT via PRODIGI_MODE — never inferred from the key. Prodigi's
// (rotated) sandbox keys don't carry a 'test_' prefix, so prefix-sniffing wrongly
// routed sandbox keys to the live API → 401. Defaults to sandbox per the standing
// rule (live parked); set PRODIGI_MODE=live (with a live key) to switch.
const MODE: 'sandbox' | 'live' =
  (process.env.PRODIGI_MODE ?? 'sandbox').toLowerCase() === 'live' ? 'live' : 'sandbox'
const BASE = MODE === 'live'
  ? 'https://api.prodigi.com/v4.0'
  : 'https://api.sandbox.prodigi.com/v4.0'

export function prodigiConfigured(): boolean {
  return KEY.length > 0
}

/** Which environment the active key targets (explicit, not key-derived). */
export function prodigiMode(): 'sandbox' | 'live' {
  return MODE
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
    throw new Error(`prodigi ${path} responded ${res.status}: ${summariseProdigiError(body)}`)
  }
  return res.json() as Promise<T>
}

/** Collapse a Prodigi error body into a short, human line for the admin card.
 *  Validation errors come back as
 *  `{ outcome, failures: { "recipient.address.stateOrCounty": [{ code, providedValue }] } }`
 *  — we render that as `ValidationFailed — recipient.address.stateOrCounty: MustNotBeEmptyOrWhitespace`
 *  instead of dumping the raw JSON (incl. the noisy traceParent). Falls back to a
 *  trimmed slice of the body when it isn't the shape we expect. */
function summariseProdigiError(body: string): string {
  try {
    const j = JSON.parse(body) as {
      outcome?: string
      failures?: Record<string, Array<{ code?: string }>>
      message?: string
    }
    const fields = j.failures
      ? Object.entries(j.failures)
          .map(([field, errs]) => `${field}: ${(errs ?? []).map((e) => e?.code).filter(Boolean).join(', ') || 'invalid'}`)
          .join('; ')
      : ''
    const head = j.outcome || j.message || 'error'
    const out = fields ? `${head} — ${fields}` : head
    return out.slice(0, 300)
  } catch {
    return body.slice(0, 300)
  }
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

/** One shipment method's quote (a row of the customer's delivery-option picker). */
export interface ProdigiMethodQuote extends ProdigiQuote {
  /** Prodigi shipment method, e.g. 'Budget' | 'Standard' | 'Express'. */
  method: string
}

/** Normalise one raw quote row into a ProdigiQuote. */
function parseQuoteRow(q: QuoteResponse['quotes'][number], currencyCode: string): ProdigiQuote {
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

/**
 * Quote EVERY available shipment method for an order + destination (Prodigi
 * returns one quote per method). Used to present the customer their delivery
 * options with prices. Shipping cost depends on the WHOLE basket (sizes/qty), so
 * pass all physical items together. Caller applies the EU production guard
 * (`checkEuFulfilment`) per method and converts the ex-tax `shippingMinor`.
 */
export async function getQuotes({
  items,
  destinationCountryCode,
  currencyCode = 'EUR',
}: {
  items: QuoteItem[]
  destinationCountryCode: string
  currencyCode?: string
}): Promise<ProdigiMethodQuote[]> {
  const body = {
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
  return (d.quotes ?? []).map((q) => ({ method: q.shipmentMethod, ...parseQuoteRow(q, currencyCode) }))
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

// ── Order creation (POST /orders) ─────────────────────────────────────────────

export interface ProdigiRecipient {
  name: string
  email?: string | null
  address: {
    line1: string
    line2?: string | null
    townOrCity: string
    stateOrCounty?: string | null
    postalOrZipCode: string
    /** ISO-2 country code. */
    countryCode: string
  }
}

export interface ProdigiOrderItem {
  /** Prodigi product SKU (e.g. 'GLOBAL-PAP-A4'). */
  sku: string
  copies: number
  attributes?: Record<string, string>
  /** Print assets — each a publicly-fetchable URL Prodigi pulls the file from. */
  assets: { printArea: string; url: string }[]
  sizing?: string
  /** Our own line reference (the shop SKU), echoed back for reconciliation. */
  merchantReference?: string
}

export interface ProdigiOrderResult {
  /** Prodigi order id (ord_…). */
  id: string
  /** Production stage, e.g. 'InProgress'. */
  stage: string
  /** Creation outcome, e.g. 'Created' | 'CreatedWithIssues'. */
  outcome: string
  mode: 'sandbox' | 'live'
}

// ── Order status/charges (GET /orders/{id}) ───────────────────────────────────

export interface ProdigiOrderCharge {
  /** Prodigi's own invoice number for this charge (appears on their invoice). */
  invoiceNumber: string | null
  totalMinor: number
  currency: string
}

export interface ProdigiOrderStatus {
  id: string
  stage: string
  /** What Prodigi has actually charged for this order (production + shipping).
   *  Compare against the recorded ex-VAT quote: equal totals mean the VAT was
   *  reverse-charged (0%); ~21%/25% higher means Prodigi added VAT. */
  charges: ProdigiOrderCharge[]
  chargesTotalMinor: number
  currency: string | null
  carrier: string | null
  tracking: string | null
}

interface GetOrderResponse {
  outcome: string
  order: {
    id: string
    status?: { stage?: string }
    charges?: Array<{
      prodigiInvoiceNumber?: string | null
      totalCost?: { amount?: string | number; currency?: string } | null
    }>
    shipments?: Array<{
      carrier?: { name?: string | null } | null
      tracking?: { number?: string | null } | null
    }>
  }
}

/** Fetch a submitted order's live status + actual charges from Prodigi. Used by
 *  the admin to monitor fulfilment and verify VAT reverse-charging on the
 *  first live orders. */
export async function getOrder(id: string): Promise<ProdigiOrderStatus> {
  const d = await prodigiFetch<GetOrderResponse>(`/orders/${encodeURIComponent(id)}`)
  const charges: ProdigiOrderCharge[] = (d.order.charges ?? []).map((c) => ({
    invoiceNumber: c.prodigiInvoiceNumber ?? null,
    totalMinor: toMinor(c.totalCost?.amount),
    currency: (c.totalCost?.currency ?? 'EUR').toUpperCase(),
  }))
  const ship = (d.order.shipments ?? [])[0]
  return {
    id: d.order.id,
    stage: d.order.status?.stage ?? 'Unknown',
    charges,
    chargesTotalMinor: charges.reduce((s, c) => s + c.totalMinor, 0),
    currency: charges[0]?.currency ?? null,
    carrier: ship?.carrier?.name ?? null,
    tracking: ship?.tracking?.number ?? null,
  }
}

interface CreateOrderResponse {
  outcome: string
  order: { id: string; status?: { stage?: string } }
}

/**
 * Submit an order to Prodigi (`POST /orders`). Idempotent on `merchantReference`
 * (our order code) via the Idempotency-Key header, so webhook retries never
 * double-order. Sandbox vs live follows the API key. Per the standing rule the
 * live key stays parked — this is exercised on sandbox only for now (no Stripe
 * Issuing funding step; that's a live-only concern).
 */
export async function createOrder(input: {
  merchantReference: string
  recipient: ProdigiRecipient
  items: ProdigiOrderItem[]
  shippingMethod?: string
  /** Per-order CloudEvents callback (status updates) — token-secured by us. */
  callbackUrl?: string
  metadata?: Record<string, string>
  /** Overrides the Idempotency-Key (default: merchantReference). Only for a
   *  deliberate resubmission after the previous Prodigi order was cancelled. */
  idempotencyKey?: string
}): Promise<ProdigiOrderResult> {
  const body = {
    merchantReference: input.merchantReference,
    shippingMethod: input.shippingMethod ?? 'Budget',
    recipient: input.recipient,
    items: input.items.map((i) => ({
      sku: i.sku,
      copies: i.copies,
      sizing: i.sizing ?? 'fillPrintArea',
      attributes: i.attributes ?? {},
      assets: i.assets,
      ...(i.merchantReference ? { merchantReference: i.merchantReference } : {}),
    })),
    ...(input.callbackUrl ? { callbackUrl: input.callbackUrl } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  }
  const d = await prodigiFetch<CreateOrderResponse>('/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': input.idempotencyKey ?? input.merchantReference },
    body: JSON.stringify(body),
  })
  return {
    id: d.order.id,
    stage: d.order.status?.stage ?? 'Unknown',
    outcome: d.outcome,
    mode: prodigiMode(),
  }
}
