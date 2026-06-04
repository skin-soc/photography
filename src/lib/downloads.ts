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

import { createHmac, timingSafeEqual } from 'node:crypto'

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
 * Ask the origin to issue a grant (generate passcode + email the buyer).
 * Returns true on success. Throws on transport/server failure so the Stripe
 * webhook returns non-200 and Stripe retries.
 */
export async function issueGrant(input: {
  orderId: string
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

/** Stream a purchased file from the origin (the route pipes the body through). */
export async function fetchOrderFile(orderId: string, sku: string): Promise<Response> {
  if (!ORIGIN) return new Response(null, { status: 404 })
  return fetch(
    `${ORIGIN}/orders/${encodeURIComponent(orderId)}/file/${encodeURIComponent(sku)}`,
    { headers: originHeaders(), cache: 'no-store' },
  )
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
  email: string | null
  passcode: string
  emailed: boolean
  createdAt: number
  expiresAt: number
  expired: boolean
  downloadUrl: string
  items: AdminOrderItem[]
}

/** Look up orders by order id or buyer email. */
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
