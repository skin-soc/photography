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
