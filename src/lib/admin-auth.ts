/**
 * Admin session auth — a single shared password (ADMIN_PASSWORD), no user store.
 *
 * On successful login we set an httpOnly cookie whose value is a signed,
 * expiring token:  "<expiryMs>.<hmacBase64url>".  The signature is
 * HMAC-SHA256 over the expiry string, keyed by ADMIN_PASSWORD itself — so no
 * separate signing secret is needed and rotating the password invalidates
 * every existing session.
 *
 * Uses Web Crypto (crypto.subtle) only, so the same code runs in edge
 * middleware and in route handlers on Cloudflare Workers.
 */

export const ADMIN_COOKIE = 'gm_admin'

/** Session lifetime — 8 hours. */
const SESSION_TTL_MS = 8 * 60 * 60 * 1000

function toBase64Url(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes)
  let bin = ''
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function hmac(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return toBase64Url(sig)
}

/** Constant-time string comparison to avoid leaking the signature via timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Mint a signed session token valid for SESSION_TTL_MS from now. */
export async function createSessionToken(secret: string): Promise<string> {
  const exp = Date.now() + SESSION_TTL_MS
  const sig = await hmac(String(exp), secret)
  return `${exp}.${sig}`
}

/** True when the token is well-formed, unexpired, and correctly signed. */
export async function verifySessionToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token || !secret) return false
  const dot = token.indexOf('.')
  if (dot <= 0) return false
  const expStr = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < Date.now()) return false
  const expected = await hmac(expStr, secret)
  return timingSafeEqual(sig, expected)
}

export { SESSION_TTL_MS }
