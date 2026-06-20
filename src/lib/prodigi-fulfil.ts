/**
 * Submit a paid order's physical items to Prodigi. SERVER ONLY.
 *
 * Resolves our shop SKUs to Prodigi SKUs + a token-gated print asset (the poster
 * MASTER the origin composites), builds the recipient from the checkout shipping
 * address, and creates the order (idempotent on the order code). Digital lines
 * are ignored. Per the standing rule this runs on the Prodigi SANDBOX only — no
 * Stripe Issuing funding step (that's a live-only concern).
 */

import { getCatalog, type ShopProduct } from './shop'
import { createOrder, prodigiConfigured, type ProdigiOrderResult, type QuoteItem } from './prodigi'
import { posterAssetUrl, type OrderLine, type OrderShipping } from './downloads'

const A_SIZES = new Set(['A4', 'A3', 'A2', 'A1', 'A0'])

/** Map our shop SKUs to Prodigi quote items (provider 'prodigi' A-size posters),
 *  grouping duplicates into copies. Shared by the shipping-quote endpoint and any
 *  pre-charge quoting; quoting needs only sku + copies + attributes (no asset). */
export async function quoteItemsForSkus(skus: string[]): Promise<QuoteItem[]> {
  if (skus.length === 0) return []
  const catalog = await getCatalog()
  const bySku = new Map<string, ShopProduct>()
  for (const photo of catalog) {
    for (const p of photo.products) {
      if (p.provider === 'prodigi' && p.providerSku) bySku.set(p.sku, p)
    }
  }
  // Group by providerSku (+ attribute signature) so repeats become copies.
  const grouped = new Map<string, QuoteItem>()
  for (const sku of skus) {
    const p = bySku.get(sku)
    if (!p?.providerSku) continue
    const size = p.providerSku.split('-').pop() ?? ''
    if (!A_SIZES.has(size)) continue
    const attributes = p.attributes ?? {}
    const key = `${p.providerSku}|${JSON.stringify(attributes)}`
    const existing = grouped.get(key)
    if (existing) existing.copies += 1
    else grouped.set(key, { sku: p.providerSku, copies: 1, attributes })
  }
  return Array.from(grouped.values())
}

interface PhysicalItem {
  providerSku: string
  photoId: string
  size: string
  copies: number
  attributes: Record<string, string>
  ourSku: string
}

/** Map paid line items to Prodigi-fulfillable physical items (catalog products
 *  with provider 'prodigi'). The poster A-size is the providerSku suffix. */
async function resolvePhysicalItems(lineItems: OrderLine[]): Promise<PhysicalItem[]> {
  if (lineItems.length === 0) return []
  const catalog = await getCatalog()
  const bySku = new Map<string, { product: ShopProduct; photoId: string }>()
  for (const photo of catalog) {
    for (const p of photo.products) {
      if (p.provider === 'prodigi' && p.providerSku) bySku.set(p.sku, { product: p, photoId: photo.id })
    }
  }
  const out: PhysicalItem[] = []
  for (const li of lineItems) {
    const hit = bySku.get(li.sku)
    if (!hit) continue
    const providerSku = hit.product.providerSku!
    const size = providerSku.split('-').pop() ?? ''
    if (!A_SIZES.has(size)) continue
    out.push({
      providerSku,
      photoId: hit.photoId,
      size,
      copies: li.qty || 1,
      attributes: hit.product.attributes ?? {},
      ourSku: li.sku,
    })
  }
  return out
}

/** True when the order has at least one Prodigi-fulfillable physical line. */
export async function hasPhysicalItems(lineItems: OrderLine[]): Promise<boolean> {
  return (await resolvePhysicalItems(lineItems)).length > 0
}

/**
 * Build + submit the Prodigi order for a paid order's physical items. Returns
 * the Prodigi result, or null when there's nothing physical / Prodigi isn't
 * configured. Throws only when there ARE physical items but no usable shipping
 * address (caller records the failure).
 */
export async function submitProdigiOrder(input: {
  orderCode: string
  lineItems: OrderLine[]
  shipping: OrderShipping | null
  email: string | null
  callbackUrl?: string
  /** Shipment method the customer paid for (Budget/Standard/Express). */
  shippingMethod?: string
}): Promise<ProdigiOrderResult | null> {
  if (!prodigiConfigured()) return null
  const physical = await resolvePhysicalItems(input.lineItems)
  if (physical.length === 0) return null

  const addr = input.shipping?.address
  if (!input.shipping || !addr?.line1 || !addr.country) {
    throw new Error(`order ${input.orderCode} has physical items but no shipping address`)
  }

  const items = physical.map((p) => ({
    sku: p.providerSku,
    copies: p.copies,
    attributes: p.attributes,
    merchantReference: p.ourSku,
    assets: [{ printArea: 'default', url: posterAssetUrl(p.photoId, p.size, input.orderCode) }],
  }))

  // Prodigi rejects empty/whitespace strings on optional address fields (e.g.
  // stateOrCounty for countries that have no state, like DK → 400
  // ValidationFailed). Stripe sends "" rather than null for those, and `?? ''`
  // would pass it straight through — so trim and omit anything blank entirely.
  const clean = (v: string | null | undefined): string | undefined => {
    const s = (v ?? '').trim()
    return s.length ? s : undefined
  }
  const recipient = {
    name: input.shipping.name || 'Customer',
    email: clean(input.email),
    address: {
      line1: clean(addr.line1) ?? '',
      line2: clean(addr.line2),
      townOrCity: clean(addr.city) ?? '',
      stateOrCounty: clean(addr.state),
      postalOrZipCode: clean(addr.postalCode) ?? '',
      countryCode: addr.country,
    },
  }

  return createOrder({
    merchantReference: input.orderCode,
    recipient,
    items,
    callbackUrl: input.callbackUrl,
    ...(input.shippingMethod ? { shippingMethod: input.shippingMethod } : {}),
  })
}
