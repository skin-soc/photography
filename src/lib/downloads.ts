/**
 * Digital-download fulfilment — Worker-side helpers.
 *
 * The Worker is a thin, secret-gated proxy in front of the LAN origin, which
 * owns the grant store, file generation, metadata embedding and email. These
 * helpers wrap the origin's fulfilment endpoints and sign/verify the
 * proof-of-passcode cookie that gates the file-download route.
 *
 * SERVER-SIDE ONLY — uses node:crypto and the origin shared secret.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type Stripe from 'stripe'
import type { ShopProduct } from '@/lib/shop'

const ORIGIN = process.env.SHOP_ORIGIN_URL ?? ''
const ORIGIN_SECRET = process.env.SHOP_ORIGIN_SECRET ?? ''
const LINK_SECRET = process.env.DOWNLOAD_LINK_SECRET ?? ''

export interface DownloadItem {
  sku: string
  token: string
  format: 'jpeg' | 'tiff'
  label: string
  slug: string
}

/** One charged order line (digital or physical), net of discount. */
export interface OrderLine {
  sku: string
  /** Primary description (photo title — paper/tier), built from the catalog. */
  label: string
  qty: number
  net: number
  /** Muted sub-line: physical → "21 × 29.7 cm · paper blurb"; digital →
   *  "JPEG · 6626 × 8282 px". Absent when the sku can't be resolved. */
  detail?: string | null
  /** Digital deliverable filename (e.g. GMP-THOR-ECHNZ.jpg) — shown in italic
   *  parentheses on the invoice for audit. Absent for physical lines. */
  filename?: string | null
}

/**
 * Enrich raw charged lines (sku + Stripe description + net) with a fuller,
 * catalog-derived description: the paper/variant for posters, and the format +
 * pixel dimensions + deliverable filename for digital downloads. Falls back to
 * the Stripe label when a sku can't be resolved. Used by both fulfilment routes
 * before the invoice is built.
 */
export async function describeOrderLines(lines: OrderLine[]): Promise<OrderLine[]> {
  if (lines.length === 0) return lines
  const { getCatalog, displayTitle } = await import('@/lib/shop')
  const catalog = await getCatalog()
  const idx = new Map<string, { product: ShopProduct; title: string }>()
  for (const photo of catalog) {
    for (const p of photo.products) idx.set(p.sku, { product: p, title: displayTitle(photo) })
  }
  return lines.map((l) => {
    const hit = idx.get(l.sku)
    if (!hit) return l
    const p = hit.product
    if (p.type === 'digital') {
      const fmt = p.format === 'tiff' ? '16-bit TIFF' : 'JPEG'
      const dims = p.dimensions ? `${p.dimensions.w} × ${p.dimensions.h} px` : null
      const ext = p.format === 'tiff' ? 'tiff' : 'jpg'
      return {
        ...l,
        label: `${hit.title} — ${p.label}`,
        detail: [fmt, dims].filter(Boolean).join(' · ') || null,
        filename: p.downloadToken ? `${p.downloadToken}.${ext}` : null,
      }
    }
    // Physical (poster / fine art): paper + size up front, cm + blurb beneath.
    const size = p.label || (p.providerSku ? p.providerSku.split('-').pop() : null)
    const paper = p.paperLabel || p.material || 'Print'
    const cm = p.printSize ? `${p.printSize.w} × ${p.printSize.h} cm` : null
    return {
      ...l,
      label: `${hit.title} — ${paper}${size ? ` (${size})` : ''}`,
      detail: [cm, p.paperBlurb].filter(Boolean).join(' · ') || null,
      filename: null,
    }
  })
}

/** Shipping recipient collected at checkout (physical orders). */
export interface OrderShipping {
  name: string | null
  address: {
    line1: string | null
    line2: string | null
    city: string | null
    state: string | null
    postalCode: string | null
    country: string | null
  }
}

/**
 * Build the itemised order lines (net, excluding the VAT line) + the shipping
 * name/address from a paid Checkout Session. Requires the session retrieved with
 * `line_items.data.price.product` expanded. Shared by the webhook and the
 * synchronous issue route so an order records identically whichever wins the
 * race. The checkout bakes any coupon into the per-line nets and adds a single
 * VAT line (sku 'vat', dropped here), so the lines reconcile to the order net.
 */
export function extractOrderLines(session: Stripe.Checkout.Session): {
  lineItems: OrderLine[]
  shipping: OrderShipping | null
} {
  const lineItems: OrderLine[] = (session.line_items?.data ?? [])
    .map((li) => {
      const prod = li.price?.product
      const sku = typeof prod === 'object' && prod && 'metadata' in prod ? prod.metadata?.sku ?? '' : ''
      return { sku, label: li.description ?? '', qty: li.quantity ?? 1, net: li.amount_subtotal ?? 0 }
    })
    .filter((l) => l.sku !== 'vat')

  // Address source, in order: Stripe's collected shipping details (legacy flow),
  // then the recipient we set on the PaymentIntent ourselves (current flow — the
  // address is captured in our pre-payment shipping step), then the legacy field.
  const pi = session.payment_intent
  const piShip = pi && typeof pi === 'object' ? (pi as Stripe.PaymentIntent).shipping ?? null : null
  const ship =
    session.collected_information?.shipping_details ??
    piShip ??
    (session as unknown as { shipping_details?: { name?: string | null; address?: Stripe.Address | null } })
      .shipping_details ??
    null
  const shipping: OrderShipping | null = ship
    ? {
        name: ship.name ?? null,
        address: {
          line1: ship.address?.line1 ?? null,
          line2: ship.address?.line2 ?? null,
          city: ship.address?.city ?? null,
          state: ship.address?.state ?? null,
          postalCode: ship.address?.postal_code ?? null,
          country: ship.address?.country ?? null,
        },
      }
    : null

  return { lineItems, shipping }
}

/** Item as surfaced to the download page (no secrets). */
export interface OrderMetaItem {
  sku: string
  label: string
  format: 'jpeg' | 'tiff'
  slug: string
  filename: string
  dimensions?: { w: number; h: number } | null
  bytes?: number | null
}

export interface OrderMeta {
  orderId: string
  expiresAt: number
  items: OrderMetaItem[]
}

function originHeaders(extra?: Record<string, string>): HeadersInit {
  return { 'x-shop-secret': ORIGIN_SECRET, ...extra }
}

export function originConfigured(): boolean {
  return Boolean(ORIGIN)
}

/**
 * Rebuild the digital download items for an order from its SKUs, via the live
 * catalog. We put the compact `skus` list in Stripe metadata (not the full item
 * JSON, which blows past Stripe's 500-char-per-value metadata limit on larger
 * carts), then resolve the rest — token, format, label, slug — here at
 * fulfilment. Only products that are actually digital (have a download token)
 * come back.
 */
export async function resolveDownloadItems(skus: string[]): Promise<DownloadItem[]> {
  const wanted = skus.map((s) => s.trim()).filter(Boolean)
  if (wanted.length === 0) return []
  const { getCatalog } = await import('@/lib/shop')
  const catalog = await getCatalog()
  const bySku = new Map<string, DownloadItem>()
  for (const photo of catalog) {
    for (const p of photo.products) {
      if (p.downloadToken) {
        bySku.set(p.sku, {
          sku: p.sku,
          token: p.downloadToken,
          format: p.format ?? 'jpeg',
          label: p.label,
          slug: photo.slug,
        })
      }
    }
  }
  const out: DownloadItem[] = []
  for (const sku of wanted) {
    const item = bySku.get(sku)
    if (item) out.push(item)
  }
  return out
}

// ── Customer-facing order code ────────────────────────────────────────────────
// GMP-<NORSE GOD>-<5 base32 chars>, e.g. GMP-TYR-72R4E. Minted up front at
// PaymentIntent creation and written to the PI's description + metadata, so it —
// not Stripe's pi_ id — is the identifier everywhere: the dashboard, tax/CSV
// exports, the grant key, and the /shop/downloads/<code> URL. The issue route
// and webhook read it back from PI metadata. ASCII/uppercase so it's URL- and
// filename-safe; three segments distinguish it from product refs (GMP-XXXXXXX).
const ORDER_GODS = [
  'ODIN', 'THOR', 'TYR', 'HEIMDALL', 'BRAGI', 'FORSETI', 'ULL',
  'VIDAR', 'VALI', 'HOD', 'BALDER', 'LOKI', 'HOENIR', 'MIMIR',
]
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ' // Crockford — no ambiguous O/0/I/1

function base32(bytes: Buffer, n: number): string {
  let bits = 0
  let val = 0
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    val = (val << 8) | bytes[i]
    bits += 8
    while (bits >= 5) {
      out += B32[(val >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  return out.slice(0, n)
}

/** Mint a fresh random order code. Stored on the PaymentIntent so all systems
 *  read the same value — no derivation needed. */
export function generateOrderCode(): string {
  const d = randomBytes(8)
  const god = ORDER_GODS[d[0] % ORDER_GODS.length]
  return `GMP-${god}-${base32(d.subarray(1), 5)}`
}

/**
 * Ask the origin to issue a grant (generate passcode + email the buyer).
 * Returns true on success. Throws on transport/server failure so the Stripe
 * webhook returns non-200 and Stripe retries.
 */
export async function issueGrant(input: {
  orderId: string
  paymentId: string
  email: string | null
  locale: string
  items: DownloadItem[]
  /** Payment facts captured for the admin orders table (reconciliation/tax). */
  livemode?: boolean
  amount?: number | null
  currency?: string | null
  taxAmount?: number | null
  taxCountry?: string | null
  /** Card-issuer country — second piece of EU VAT location evidence, to
   *  reconcile against the IP-derived taxCountry. */
  cardCountry?: string | null
  /** Cloudflare-geolocation IP + country — our primary VAT place-of-supply
   *  evidence (a single piece suffices below the €100k cross-border threshold). */
  buyerIp?: string | null
  buyerCountry?: string | null
  /** Receipt facts: when the order was paid and by what method (e.g. 'card').
   *  Orders are only granted once paid in full, so there are no payment terms. */
  paidAt?: number | null
  paymentMethod?: string | null
  /** Snapshot of the licensing terms (the `licensing` message namespace) in the
   *  buyer's language, embedded as page 2 of the invoice/receipt PDF. */
  terms?: Record<string, string> | null
  /** B2B: validated VAT id, business name, and whether VAT was reverse-charged
   *  (0%, intra-EU). Present only for business purchases. */
  vatId?: string | null
  businessName?: string | null
  /** Registered business address from VIES (kept for auditing). */
  businessAddress?: string | null
  reverseCharge?: boolean
  /** VIES consultation number — audit proof of the VAT check. */
  vatConsultation?: string | null
  /** All charged order lines (digital + physical), net of discount — drives the
   *  itemised, mixed-order invoice. Reconciles to the order net by construction
   *  (the checkout bakes any coupon into the per-line nets). */
  lineItems?: OrderLine[]
  /** Shipping name + address collected at checkout (physical orders) — the
   *  invoice "Bill To" and the Prodigi recipient. */
  shipping?: OrderShipping | null
}): Promise<{ passcode: string | null }> {
  if (!ORIGIN) return { passcode: null }
  const res = await fetch(`${ORIGIN}/orders`, {
    method: 'POST',
    headers: originHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify(input),
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`origin /orders responded ${res.status}`)
  }
  const data = (await res.json().catch(() => ({}))) as { passcode?: string }
  return { passcode: data.passcode ?? null }
}

/** Token for the public poster-asset URL — HMAC over (photoId, size, orderCode),
 *  verified by the origin. Bound to the order so a URL can't be reused for
 *  another. */
export function posterAssetToken(photoId: string, size: string, orderCode: string): string {
  return createHmac('sha256', ORIGIN_SECRET || 'dev')
    .update(`${photoId}:${size}:${orderCode}`)
    .digest('hex')
    .slice(0, 32)
}

/** Public, token-gated URL Prodigi fetches the print-ready poster MASTER from.
 *  Headerless (Prodigi can't send our secret), so it's secured by the per-order
 *  token above. Served by the origin's `/fulfil/poster/:id/:size` endpoint. */
export function posterAssetUrl(photoId: string, size: string, orderCode: string): string {
  const u = new URL(`${ORIGIN}/fulfil/poster/${encodeURIComponent(photoId)}/${encodeURIComponent(size)}`)
  u.searchParams.set('o', orderCode)
  u.searchParams.set('t', posterAssetToken(photoId, size, orderCode))
  return u.toString()
}

/** Token for the fine-art print-asset URL — HMAC over (photoId, orderCode). One
 *  asset per photo (Prodigi fill-crops it to each size), so no size is bound. */
export function fineArtAssetToken(photoId: string, orderCode: string): string {
  return createHmac('sha256', ORIGIN_SECRET || 'dev')
    .update(`${photoId}:${orderCode}`)
    .digest('hex')
    .slice(0, 32)
}

/** Public, token-gated URL Prodigi fetches the FULL-RES fine-art master from. The
 *  origin pre-crops it to `aspect` ("W:H", keep bottom + centre sides) so Prodigi
 *  doesn't centre-crop. Served by the origin's `/fulfil/fineart/:id`. */
export function fineArtAssetUrl(photoId: string, orderCode: string, aspect?: string): string {
  const u = new URL(`${ORIGIN}/fulfil/fineart/${encodeURIComponent(photoId)}`)
  u.searchParams.set('o', orderCode)
  u.searchParams.set('t', fineArtAssetToken(photoId, orderCode))
  if (aspect) u.searchParams.set('ar', aspect)
  return u.toString()
}

/** Token for the mockup-source URL — HMAC over (`mockup:`, photoId). No order. */
export function mockupSrcToken(photoId: string): string {
  return createHmac('sha256', ORIGIN_SECRET || 'dev')
    .update(`mockup:${photoId}`)
    .digest('hex')
    .slice(0, 32)
}

/** Public, token-gated URL the Prodigi mockup generator fetches the medium
 *  no-logo artwork from. The origin pre-crops it to `aspect` ("W:H") so the mockup
 *  crop matches the print. Served by the origin's `/mockup-src/:id`. */
export function mockupSrcUrl(photoId: string, aspect?: string): string {
  const u = new URL(`${ORIGIN}/mockup-src/${encodeURIComponent(photoId)}`)
  u.searchParams.set('t', mockupSrcToken(photoId))
  if (aspect) u.searchParams.set('ar', aspect)
  return u.toString()
}

/** One shipment's tracking, surfaced from a Prodigi status callback. */
export interface FulfilmentTracking {
  carrier?: string | null
  number?: string | null
  url?: string | null
}

/** Token for the Prodigi status-callback URL — HMAC over the order code. Prodigi
 *  callbacks are unauthenticated (no signature), so the only thing securing the
 *  endpoint is this unguessable per-order token in the URL we hand them. */
export function prodigiCallbackToken(orderCode: string): string {
  return createHmac('sha256', ORIGIN_SECRET || 'dev')
    .update(`prodigi-callback:${orderCode}`)
    .digest('hex')
    .slice(0, 32)
}

/** Constant-time check of a callback token against the order code. */
export function verifyProdigiCallback(orderCode: string, token: string): boolean {
  const expected = prodigiCallbackToken(orderCode)
  if (!token || token.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  } catch {
    return false
  }
}

/** Public callback URL Prodigi POSTs CloudEvents status updates to. `base` is the
 *  Worker's own public origin (derived from the inbound request), since the
 *  callback hits the Worker, not the LAN origin. */
export function prodigiCallbackUrl(base: string, orderCode: string): string {
  const u = new URL('/api/webhook/prodigi', base)
  u.searchParams.set('o', orderCode)
  u.searchParams.set('t', prodigiCallbackToken(orderCode))
  return u.toString()
}

/** Persist a fulfilment (Prodigi order) result onto the order, for the admin
 *  card + status tracking. Best-effort — never throws. `tracking` (from a status
 *  callback) is only sent when present; the origin keeps any prior value. */
export async function recordFulfilment(
  orderId: string,
  data: {
    provider: string
    prodigiId: string | null
    stage: string
    outcome: string
    mode: string
    error?: string | null
    tracking?: FulfilmentTracking[] | null
    /** ISO country where Prodigi produced the order (e.g. 'NL'). */
    productionCountry?: string | null
    /** Dispatch date from the shipment (ISO string), when shipped. */
    shippedAt?: string | null
  },
): Promise<void> {
  if (!ORIGIN) return
  await fetch(`${ORIGIN}/orders/${encodeURIComponent(orderId)}/fulfilment`, {
    method: 'POST',
    headers: originHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify(data),
    cache: 'no-store',
  }).catch(() => {})
}

/** Fetch the order's invoice PDF from the origin (regenerated from the grant).
 *  Returns the bytes + filename, or null if unavailable. */
export async function fetchInvoicePdf(orderId: string): Promise<{ bytes: ArrayBuffer; filename: string } | null> {
  if (!ORIGIN) return null
  const res = await fetch(`${ORIGIN}/orders/${encodeURIComponent(orderId)}/invoice`, {
    headers: originHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) return null
  const cd = res.headers.get('content-disposition') ?? ''
  const m = /filename="([^"]+)"/.exec(cd)
  return { bytes: await res.arrayBuffer(), filename: m?.[1] ?? `Invoice-${orderId}.pdf` }
}

/** Fetch the order's standalone licence (Terms) PDF from the origin. Returns the
 *  bytes + filename, or null if unavailable (e.g. legacy orders with no terms). */
export async function fetchLicensePdf(orderId: string): Promise<{ bytes: ArrayBuffer; filename: string } | null> {
  if (!ORIGIN) return null
  const res = await fetch(`${ORIGIN}/orders/${encodeURIComponent(orderId)}/license`, {
    headers: originHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) return null
  const cd = res.headers.get('content-disposition') ?? ''
  const m = /filename="([^"]+)"/.exec(cd)
  return { bytes: await res.arrayBuffer(), filename: m?.[1] ?? `Licence-${orderId}.pdf` }
}

/** Fetch the order's refund credit-note PDF from the origin, or null if the
 *  order has no recorded refund. */
export async function fetchRefundPdf(orderId: string): Promise<{ bytes: ArrayBuffer; filename: string } | null> {
  if (!ORIGIN) return null
  const res = await fetch(`${ORIGIN}/orders/${encodeURIComponent(orderId)}/refund`, {
    headers: originHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) return null
  const cd = res.headers.get('content-disposition') ?? ''
  const m = /filename="([^"]+)"/.exec(cd)
  return { bytes: await res.arrayBuffer(), filename: m?.[1] ?? `Refund-${orderId}.pdf` }
}

/** Accounting export: ZIP of all invoices between two dates (YYYY-MM-DD) in a
 *  single language ('da'|'en'). Returns bytes + filename, or an error status. */
export async function fetchInvoicesZip(
  from: string, to: string, lang: 'da' | 'en',
): Promise<{ bytes: ArrayBuffer; filename: string } | { error: string; status: number }> {
  if (!ORIGIN) return { error: 'origin not configured', status: 503 }
  const qs = new URLSearchParams({ from, to, lang }).toString()
  const res = await fetch(`${ORIGIN}/admin/invoices/zip?${qs}`, {
    headers: originHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    return { error: body.error ?? 'export failed', status: res.status }
  }
  const cd = res.headers.get('content-disposition') ?? ''
  const m = /filename="([^"]+)"/.exec(cd)
  return { bytes: await res.arrayBuffer(), filename: m?.[1] ?? `Invoices-${from}_${to}-${lang}.zip` }
}

/** Fetch non-secret order metadata for the download page. */
export async function getOrderMeta(orderId: string): Promise<OrderMeta | null> {
  if (!ORIGIN) return null
  const res = await fetch(`${ORIGIN}/orders/${encodeURIComponent(orderId)}/meta`, {
    headers: originHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) return null
  return (await res.json()) as OrderMeta
}

/** Verify the buyer's passcode against the origin. */
export async function verifyPasscode(orderId: string, passcode: string): Promise<boolean> {
  if (!ORIGIN) return false
  const res = await fetch(`${ORIGIN}/orders/${encodeURIComponent(orderId)}/verify`, {
    method: 'POST',
    headers: originHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ passcode }),
    cache: 'no-store',
  })
  return res.ok
}

/**
 * Mint a short-lived, signed DIRECT-download URL on the origin.
 *
 * The buyer's browser is redirected here so the file streams browser ↔ origin
 * directly — never proxied through the Worker, whose CPU budget can't absorb
 * large (tens–hundreds of MB) image files. The HMAC signature + expiry let the
 * origin accept this one URL without the x-shop-secret header.
 */
export function signedFileUrl(orderId: string, sku: string, ttlMs = 5 * 60_000): string | null {
  if (!ORIGIN) return null
  const exp = Date.now() + ttlMs
  const sig = createHmac('sha256', ORIGIN_SECRET)
    .update(`${orderId}:${sku}:${exp}`)
    .digest('hex')
  const u = new URL(
    `${ORIGIN}/orders/${encodeURIComponent(orderId)}/file/${encodeURIComponent(sku)}`,
  )
  u.searchParams.set('exp', String(exp))
  u.searchParams.set('sig', sig)
  return u.toString()
}

// ── Admin order management (proxied to the origin) ────────────────────────────

export interface AdminOrderItem {
  sku: string
  label: string
  format: 'jpeg' | 'tiff'
  filename: string
  downloads: number
  /** True once this item has been refunded (undownloaded-only refund). */
  refunded?: boolean
  /** Ex-VAT catalog price in minor units. */
  price?: number | null
}
export interface AdminOrder {
  orderId: string
  paymentId: string | null
  email: string | null
  passcode: string
  emailed: boolean
  createdAt: number
  expiresAt: number
  expired: boolean
  downloadUrl: string
  items: AdminOrderItem[]
  /** Payment facts (present on orders placed after this feature shipped). */
  livemode?: boolean | null
  amount?: number | null
  currency?: string | null
  taxAmount?: number | null
  taxCountry?: string | null
  /** Card-issuer country — second VAT location evidence (vs taxCountry). */
  cardCountry?: string | null
  /** Cloudflare-geolocation VAT evidence captured at checkout. */
  buyerIp?: string | null
  buyerCountry?: string | null
  /** Receipt facts: paid timestamp (ms) + method (e.g. 'card'). */
  paidAt?: number | null
  paymentMethod?: string | null
  /** B2B fields — validated VAT id, business name, reverse-charge (0%) flag,
   *  and the VIES consultation number (audit proof of the check). */
  vatId?: string | null
  businessName?: string | null
  /** Registered business address from VIES (auditing). */
  businessAddress?: string | null
  reverseCharge?: boolean
  vatConsultation?: string | null
  /** Sequential invoice number (live orders) + issue date (ms). */
  invoiceNumber?: string | null
  invoiceDate?: number | null
  /** Sequential credit-note number + date (set on the first refund of a live order). */
  creditNumber?: string | null
  creditDate?: number | null
  /** Refund state. `refunded` = fully refunded (access revoked); refundedAmount
   *  in minor units covers partial refunds too. */
  refunded?: boolean
  refundedAmount?: number | null
  refundedAt?: number | null
  /** A partial refund that didn't go through our whole-line-item flow (e.g. an
   *  arbitrary amount refunded in the Stripe Dashboard) — needs manual review. */
  refundUnmatched?: boolean
  revoked?: boolean
  /** SKUs refunded (and access-revoked) by an undownloaded-only refund. */
  revokedSkus?: string[]
  /** Shipping recipient + full itemised order + Prodigi fulfilment (physical). */
  shipping?: OrderShipping | null
  lineItems?: OrderLine[] | null
  fulfilment?: {
    provider: string
    prodigiId: string | null
    stage: string | null
    outcome: string | null
    mode: string | null
    error?: string | null
    tracking?: FulfilmentTracking[] | null
    productionCountry?: string | null
    shippedAt?: string | null
    updatedAt?: number
  } | null
}

/** Look up orders by order code or buyer email. */
export async function adminLookupOrders(q: string): Promise<AdminOrder[]> {
  if (!ORIGIN) return []
  const res = await fetch(`${ORIGIN}/admin/orders?q=${encodeURIComponent(q)}`, {
    headers: originHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) return []
  const data = (await res.json()) as { orders: AdminOrder[] }
  return data.orders ?? []
}

/** All orders created within the last `days` (default 90), newest first. */
export async function adminRecentOrders(days = 90): Promise<AdminOrder[]> {
  if (!ORIGIN) return []
  const res = await fetch(`${ORIGIN}/admin/orders/recent?days=${days}`, {
    headers: originHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) return []
  const data = (await res.json()) as { orders: AdminOrder[] }
  return data.orders ?? []
}

/** Re-send the download email for an order. */
export async function adminResendOrder(orderId: string, email?: string): Promise<boolean> {
  if (!ORIGIN) return false
  const res = await fetch(`${ORIGIN}/admin/orders/${encodeURIComponent(orderId)}/resend`, {
    method: 'POST',
    headers: originHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify(email ? { email } : {}),
    cache: 'no-store',
  })
  return res.ok
}

/** Extend an order's download link by another TTL window. */
export async function adminExtendOrder(orderId: string): Promise<boolean> {
  if (!ORIGIN) return false
  const res = await fetch(`${ORIGIN}/admin/orders/${encodeURIComponent(orderId)}/extend`, {
    method: 'POST',
    headers: originHeaders(),
    cache: 'no-store',
  })
  return res.ok
}

/** Email the shop owner a notification of a new sale (origin sends it via SMTP). */
export async function notifyOwnerSale(input: {
  to: string
  orderId: string
  amountText: string
  buyerEmail: string | null
  itemCount: number
}): Promise<boolean> {
  if (!ORIGIN) return false
  const res = await fetch(`${ORIGIN}/admin/notify-sale`, {
    method: 'POST',
    headers: originHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify(input),
    cache: 'no-store',
  })
  return res.ok
}

/** Email the owner a summary of product price/availability/routing changes found
 *  by the daily Prodigi validator (origin sends it via SMTP). */
export async function notifyOwnerChange(input: {
  to: string
  changes: string[]
}): Promise<boolean> {
  if (!ORIGIN || !input.to || input.changes.length === 0) return false
  const res = await fetch(`${ORIGIN}/admin/notify-change`, {
    method: 'POST',
    headers: originHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify(input),
    cache: 'no-store',
  })
  return res.ok
}

/** Delete all test-mode orders (grants with livemode === false) from the origin
 *  store. Returns the number removed. */
export async function adminDeleteTestOrders(): Promise<{ deleted: number } | null> {
  if (!ORIGIN) return null
  const res = await fetch(`${ORIGIN}/admin/orders/delete-test`, {
    method: 'POST',
    headers: originHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) return null
  return (await res.json()) as { deleted: number }
}

/** Delete expired grants now. Returns the number removed. */
export async function adminPurgeExpired(): Promise<{ deleted: number } | null> {
  if (!ORIGIN) return null
  const res = await fetch(`${ORIGIN}/admin/orders/purge-expired`, {
    method: 'POST',
    headers: originHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) return null
  return (await res.json()) as { deleted: number }
}

/** Re-render any missing watermarked previews (best-effort, runs on the origin). */
export async function adminWarmPreviews(): Promise<boolean> {
  if (!ORIGIN) return false
  const res = await fetch(`${ORIGIN}/admin/cache/warm-previews`, {
    method: 'POST',
    headers: originHeaders(),
    cache: 'no-store',
  })
  return res.ok
}

/**
 * Force a re-render of watermarked previews: deletes the cached previews (for a
 * collection node, or all when `selection` is empty) so they regenerate from the
 * clean source. Returns how many photos matched and cache files were deleted.
 *
 * The picker tree is pegged to the top-tier folders, so `selection` is
 * `[type, ...subjectPrefix]`. We split the product type off the front and send it
 * to the origin as a separate filter (the origin matches the subject prefix
 * against `category`, which has the type root stripped).
 */
export async function adminRerenderPreviews(
  selection: string[] = [],
): Promise<{ matched: number; deleted: number } | null> {
  if (!ORIGIN) return null
  const type = selection.length > 0 ? selection[0] : undefined
  const path = selection.slice(1)
  const res = await fetch(`${ORIGIN}/admin/cache/rerender-previews`, {
    method: 'POST',
    headers: originHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ type, path }),
    cache: 'no-store',
  })
  if (!res.ok) return null
  return (await res.json()) as { matched: number; deleted: number }
}

/**
 * Kick off a background pre-render of poster print assets on the origin. The
 * caller enumerates the qualifying (photo, size) pairs (the worker owns the
 * resolution-gating range); the origin force-regenerates them. Returns how many
 * were queued (the render itself runs in the background on the NAS).
 */
export async function adminPrerenderPosters(
  items: { id: string; size: string }[],
): Promise<{ queued: number } | null> {
  if (!ORIGIN) return null
  const res = await fetch(`${ORIGIN}/admin/poster-prerender`, {
    method: 'POST',
    headers: originHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ items }),
    cache: 'no-store',
  })
  if (!res.ok) return null
  return (await res.json()) as { queued: number }
}

/**
 * Kick off a background pre-render of fine-art room mockups on the origin. The
 * caller (worker) enumerates fine-art photo × family × colour and builds the
 * Prodigi render URLs (it owns the SKU range); the origin fetches each + caches
 * the PNG on the NAS. Returns how many were queued.
 */
export async function adminPrerenderMockups(
  items: { id: string; family: string; size: string; color: string; url: string }[],
): Promise<{ queued: number } | null> {
  if (!ORIGIN) return null
  const res = await fetch(`${ORIGIN}/admin/mockup-prerender`, {
    method: 'POST',
    headers: originHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ items }),
    cache: 'no-store',
  })
  if (!res.ok) return null
  return (await res.json()) as { queued: number }
}

/** Fetch a pre-rendered fine-art mockup JPEG from the origin (secret-gated) for a
 *  given view (room07 hero / cover grid tile). 404 when it hasn't been pre-rendered
 *  / the size is unsupported by the generator. */
export async function fetchOriginMockup(photoId: string, family: string, size: string, color: string, view: string): Promise<Response> {
  return fetch(`${ORIGIN}/mockup/${encodeURIComponent(photoId)}/${family}/${size}/${color}?view=${encodeURIComponent(view)}`, {
    headers: originHeaders(),
    cache: 'no-store',
  })
}

/** Item for the mockup pre-render batch (worker builds the Prodigi render URL). */
export interface MockupPrerenderItem { id: string; family: string; size: string; color: string; view: string; url: string }

/** One batch's live render progress. */
export interface RenderProgressItem {
  total: number
  done: number
  failed: number
  running: boolean
  startedAt: number
  finishedAt: number
}
export interface RenderProgress {
  poster: RenderProgressItem
  mockup: RenderProgressItem
}

/** Poll the origin's live pre-render progress (posters + mockups). */
export async function adminRenderProgress(): Promise<RenderProgress | null> {
  if (!ORIGIN) return null
  const res = await fetch(`${ORIGIN}/admin/render-progress`, { headers: originHeaders(), cache: 'no-store' })
  if (!res.ok) return null
  return (await res.json()) as RenderProgress
}

/** Clear generated deliverables (they regenerate on next download). */
export async function adminClearFulfilCache(): Promise<{ deleted: number } | null> {
  if (!ORIGIN) return null
  const res = await fetch(`${ORIGIN}/admin/cache/clear-fulfil`, {
    method: 'POST',
    headers: originHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) return null
  return (await res.json()) as { deleted: number }
}

export interface AssetAudit {
  catalogCount: number
  /** Catalog photos missing a required master (JPEG always; TIFF when rawAvailable). */
  missingMasters: { id: string; ref: string; slug: string; title: string; needs: string[] }[]
  /** Master files with no catalog photo. */
  orphanMasters: string[]
  /** Pre-rendered poster files whose photo is gone or no longer a poster. */
  orphanPosterAssets: string[]
}

/** Reconcile masters + poster assets against the catalog (read-only report). */
export async function adminAssetAudit(): Promise<AssetAudit | null> {
  if (!ORIGIN) return null
  const res = await fetch(`${ORIGIN}/admin/asset-audit`, { headers: originHeaders(), cache: 'no-store' })
  if (!res.ok) return null
  return (await res.json()) as AssetAudit
}

/** Delete the orphans of one scope. `poster-assets` is safe; `masters` removes the
 *  deliverable source for deleted photos (confirm in the UI first). */
export async function adminAssetPrune(
  scope: 'poster-assets' | 'masters',
): Promise<{ deleted: number; total: number } | null> {
  if (!ORIGIN) return null
  const res = await fetch(`${ORIGIN}/admin/asset-prune`, {
    method: 'POST',
    headers: originHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ scope }),
    cache: 'no-store',
  })
  if (!res.ok) return null
  return (await res.json()) as { deleted: number; total: number }
}

/** Send a branded test download email (origin uses MAIL_FROM if no `to`). */
export async function adminSendTestEmail(to?: string): Promise<{ ok: boolean; to?: string; error?: string }> {
  if (!ORIGIN) return { ok: false, error: 'origin not configured' }
  const res = await fetch(`${ORIGIN}/admin/email-test`, {
    method: 'POST',
    headers: originHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify(to ? { to } : {}),
    cache: 'no-store',
  })
  const data = (await res.json().catch(() => ({}))) as { to?: string; error?: string }
  return { ok: res.ok, to: data.to, error: data.error }
}

/** Record a refund on an order (full refund revokes download access). Called by
 *  the Stripe webhook and the admin Refund button. Idempotent. */
export async function markRefund(
  orderId: string,
  input: { amountRefunded: number; fullyRefunded: boolean; revokedSkus?: string[] },
): Promise<boolean> {
  if (!ORIGIN) return false
  const res = await fetch(`${ORIGIN}/admin/orders/${encodeURIComponent(orderId)}/refund`, {
    method: 'POST',
    headers: originHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify(input),
    cache: 'no-store',
  })
  return res.ok
}

// ── Proof-of-passcode cookie ──────────────────────────────────────────────────
// After a correct passcode the Worker sets an httpOnly, signed cookie proving
// this browser unlocked this order. Expiry is enforced by the grant itself.

export function cookieName(orderId: string): string {
  return `dl_${orderId}`
}

export function signOrder(orderId: string): string {
  return createHmac('sha256', LINK_SECRET).update(orderId).digest('hex')
}

export function verifyOrderCookie(orderId: string, value: string | undefined): boolean {
  if (!value) return false
  const expected = signOrder(orderId)
  const a = Buffer.from(value, 'hex')
  const b = Buffer.from(expected, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
