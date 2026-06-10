/**
 * Daily Prodigi validation — keeps the displayed range honest so the customer is
 * never surprised at checkout (docs/fap-print-fulfilment.md).
 *
 * For every SKU in the bundled range it confirms: still EXISTS, current ex-tax
 * COST (vs recorded), production ROUTES in the EU (never UK), and the NL shipping
 * figure. Results are snapshotted in KV; the run diffs against the previous
 * snapshot and returns a list of human-readable CHANGES (the cron emails those).
 * SERVER ONLY.
 */

import { getCloudflareContext } from '@opennextjs/cloudflare'
import { PRINT_RANGE } from '@/config/product-range'
import { getProductDetails, getQuote, checkEuFulfilment, prodigiConfigured } from '@/lib/prodigi'

interface KVLike {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
}

const SNAPSHOT_KEY = 'prodigi:validation:latest'

export interface SkuStatus {
  providerSku: string
  label: string
  exists: boolean
  /** Current ex-tax item cost (EUR minor) from a live quote, or null on failure. */
  cost: number | null
  /** Recorded cost from the range, for drift comparison. */
  recordedCost: number
  routesEu: boolean
  fulfilCountry: string | null
  shipNlMinor: number | null
  error?: string
}

export interface ValidationReport {
  checkedAt: number
  configured: boolean
  items: SkuStatus[]
  /** Human-readable change lines vs the previous snapshot (empty = no change). */
  changes: string[]
}

async function kv(): Promise<KVLike | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true })
    return (env as unknown as { SHOP_SETTINGS?: KVLike }).SHOP_SETTINGS
  } catch {
    return undefined
  }
}

const eur = (minor: number | null | undefined) =>
  minor == null ? '—' : `€${(minor / 100).toFixed(2)}`

/** Run the full validation pass: probe Prodigi, diff vs last snapshot, persist. */
export async function validateRange(): Promise<ValidationReport> {
  const checkedAt = Date.now()
  if (!prodigiConfigured()) {
    return { checkedAt, configured: false, items: [], changes: [] }
  }

  const items: SkuStatus[] = []
  for (const r of PRINT_RANGE) {
    const s: SkuStatus = {
      providerSku: r.providerSku,
      label: r.label,
      exists: false,
      cost: null,
      recordedCost: r.cost,
      routesEu: false,
      fulfilCountry: null,
      shipNlMinor: null,
    }
    try {
      await getProductDetails(r.providerSku) // throws if the SKU is gone
      s.exists = true
      const quote = await getQuote({
        items: [{ sku: r.providerSku, copies: 1, attributes: r.attributes }],
        destinationCountryCode: 'NL',
        currencyCode: 'EUR',
      })
      s.cost = quote.itemsMinor
      s.shipNlMinor = quote.shippingMinor
      s.routesEu = checkEuFulfilment(quote).ok
      s.fulfilCountry = quote.fulfilments[0]?.countryCode ?? null
    } catch (err) {
      s.error = err instanceof Error ? err.message.slice(0, 160) : 'error'
    }
    items.push(s)
  }

  // Diff against the previous snapshot.
  const store = await kv()
  let prev: Record<string, SkuStatus> = {}
  if (store) {
    const raw = await store.get(SNAPSHOT_KEY)
    if (raw) {
      try {
        prev = (JSON.parse(raw) as { itemsBySku?: Record<string, SkuStatus> }).itemsBySku ?? {}
      } catch {
        /* ignore a corrupt snapshot */
      }
    }
  }

  const changes: string[] = []
  for (const s of items) {
    const p = prev[s.providerSku]
    if (p) {
      if (p.exists && !s.exists) changes.push(`❌ ${s.providerSku} (${s.label}) — no longer available${s.error ? ` [${s.error}]` : ''}`)
      else if (!p.exists && s.exists) changes.push(`✅ ${s.providerSku} (${s.label}) — back in catalogue`)
      if (p.cost != null && s.cost != null && p.cost !== s.cost) changes.push(`💶 ${s.providerSku} (${s.label}) — cost ${eur(p.cost)} → ${eur(s.cost)}`)
      if (p.routesEu && !s.routesEu) changes.push(`⚠️ ${s.providerSku} (${s.label}) — now routes OUTSIDE the EU (${s.fulfilCountry})`)
      if (p.shipNlMinor != null && s.shipNlMinor != null && p.shipNlMinor !== s.shipNlMinor) changes.push(`📦 ${s.providerSku} (${s.label}) — NL shipping ${eur(p.shipNlMinor)} → ${eur(s.shipNlMinor)}`)
    }
    // Always surface a current EU-routing failure (even if unchanged) — it blocks sales.
    if (s.exists && !s.routesEu && !changes.some((c) => c.includes(s.providerSku))) {
      changes.push(`⚠️ ${s.providerSku} (${s.label}) — routes ${s.fulfilCountry ?? '?'} (not EU)`)
    }
  }

  // Persist the new snapshot.
  if (store) {
    const itemsBySku: Record<string, SkuStatus> = {}
    for (const s of items) itemsBySku[s.providerSku] = s
    await store.put(SNAPSHOT_KEY, JSON.stringify({ checkedAt, itemsBySku }))
  }

  return { checkedAt, configured: true, items, changes }
}

/** Read the last stored validation snapshot (for the admin UI), without re-probing. */
export async function lastValidation(): Promise<{ checkedAt: number; items: SkuStatus[] } | null> {
  const store = await kv()
  if (!store) return null
  const raw = await store.get(SNAPSHOT_KEY)
  if (!raw) return null
  try {
    const d = JSON.parse(raw) as { checkedAt: number; itemsBySku: Record<string, SkuStatus> }
    return { checkedAt: d.checkedAt, items: Object.values(d.itemsBySku ?? {}) }
  } catch {
    return null
  }
}
