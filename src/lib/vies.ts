/**
 * EU VAT-number validation via the official VIES REST API.
 *
 *   GET https://ec.europa.eu/taxation_customs/vies/rest-api/ms/{cc}/vat/{number}
 *
 * Used for B2B checkout: a valid VAT id from another EU member state lets us
 * apply the intra-EU reverse charge (0% VAT — the customer self-accounts). We
 * carefully separate three outcomes:
 *   - valid       → real, registered VAT id (with business name/address)
 *   - invalid     → VIES says the number isn't registered → treat as B2C
 *   - unavailable → VIES (or the member state) was down → we CANNOT grant the
 *                   reverse charge on an unverified number; ask them to retry
 *
 * We send our own VAT id as the VIES *requester*, so a successful check returns
 * an official **consultation number** (`requestIdentifier`) — legal proof that
 * we validated the customer's VAT on that date, which we store on the order.
 *
 * SERVER-SIDE ONLY (called from /api/vat/verify and the checkout route).
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { SELLER } from './seller'

// VIES VAT-prefix namespace. Note it differs from ISO 3166: Greece is **EL**
// (not GR), and **XI** is Northern Ireland. These are the codes VIES accepts.
const VIES_PREFIXES: ReadonlySet<string> = new Set([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR',
  'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO',
  'SE', 'SI', 'SK', 'XI',
])

export type ViesStatus = 'valid' | 'invalid' | 'unavailable' | 'malformed'

export interface ViesResult {
  status: ViesStatus
  /** VIES country prefix, e.g. "DE" (EL for Greece, XI for N. Ireland). */
  countryCode: string
  /** VAT number without the country prefix. */
  vatNumber: string
  /** Normalised full id, e.g. "DE811569869". */
  fullId: string
  /** Registered name/address — only on `valid`. */
  name?: string | null
  address?: string | null
  /** VIES consultation number (proof of the check) — only on `valid`. */
  consultationNumber?: string | null
}

/** Split a user-entered VAT id into prefix + number, uppercased, punctuation
 *  stripped. Returns null if it doesn't look like an EU VAT id at all. */
export function parseVatId(raw: string): { countryCode: string; number: string } | null {
  const cleaned = (raw || '').toUpperCase().replace(/[\s.\-]/g, '')
  const m = /^([A-Z]{2})([0-9A-Z]{2,14})$/.exec(cleaned)
  if (!m) return null
  return { countryCode: m[1], number: m[2] }
}

function clean(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return !s || s === '---' ? null : s
}

/** Validate an EU VAT id against VIES. Never throws — maps everything to a
 *  ViesResult status. */
export async function verifyVatNumber(raw: string): Promise<ViesResult> {
  const parsed = parseVatId(raw)
  if (!parsed) {
    return { status: 'malformed', countryCode: '', vatNumber: '', fullId: (raw || '').toUpperCase().replace(/[\s.\-]/g, '') }
  }
  const { countryCode, number } = parsed
  const fullId = countryCode + number
  if (!VIES_PREFIXES.has(countryCode)) {
    return { status: 'malformed', countryCode, vatNumber: number, fullId }
  }

  // POST check-vat-number with our VAT id as requester → response includes a
  // `requestIdentifier` (consultation number) we keep as proof of the check.
  let data: Record<string, unknown>
  try {
    const res = await fetch('https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        countryCode,
        vatNumber: number,
        requesterMemberStateCode: SELLER.vatCountry,
        requesterNumber: SELLER.vatNumber,
      }),
      cache: 'no-store',
      // VIES member-state services can be slow (DK has been 14–16s); give it room.
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return { status: 'unavailable', countryCode, vatNumber: number, fullId }
    data = (await res.json()) as Record<string, unknown>
  } catch {
    return { status: 'unavailable', countryCode, vatNumber: number, fullId }
  }

  // This endpoint uses `valid` (the GET endpoint used `isValid`) — accept both.
  const isValid = data.valid === true || data.isValid === true
  const err = String(data.userError ?? '').toUpperCase()
  if (isValid) {
    return {
      status: 'valid',
      countryCode, vatNumber: number, fullId,
      name: clean(data.name),
      address: clean(data.address),
      consultationNumber: clean(data.requestIdentifier),
    }
  }
  if (err === 'INVALID_INPUT') {
    return { status: 'malformed', countryCode, vatNumber: number, fullId }
  }
  // The POST endpoint only flags service errors via `userError`; when it's a
  // recognised outage we say "unavailable" (so we never grant the reverse charge
  // on an unverified number). Everything else is a genuine "invalid".
  if (err && err !== 'VALID' && err !== 'INVALID') {
    return { status: 'unavailable', countryCode, vatNumber: number, fullId }
  }
  return { status: 'invalid', countryCode, vatNumber: number, fullId }
}

// ── Signed validation token ───────────────────────────────────────────────────
// VIES is slow (10–20s), so we validate ONCE at cart-time and hand the browser a
// short-lived, server-signed token carrying the validated details. Checkout then
// trusts the token instead of calling VIES a second time — fast, and the client
// can't forge it (HMAC). Falls back to a fresh VIES check if the token is absent.

export interface VatToken {
  vatCountry: string
  vatId: string
  name: string | null
  address: string | null
  consultation: string | null
}

const VAT_TOKEN_TTL_MS = 30 * 60_000 // 30 min — enough to complete checkout
const vatSecret = () => process.env.DOWNLOAD_LINK_SECRET ?? ''

export function signVatToken(p: VatToken): string {
  const body = Buffer.from(JSON.stringify({ ...p, exp: Date.now() + VAT_TOKEN_TTL_MS })).toString('base64url')
  const sig = createHmac('sha256', vatSecret()).update(`vat:${body}`).digest('hex')
  return `${body}.${sig}`
}

/** Verify a token from the cart. Returns the validated details or null. */
export function verifyVatToken(token: string | undefined | null): VatToken | null {
  if (!token) return null
  const [body, sig] = String(token).split('.')
  if (!body || !sig) return null
  const expected = createHmac('sha256', vatSecret()).update(`vat:${body}`).digest('hex')
  const a = Buffer.from(sig, 'hex')
  const b = Buffer.from(expected, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as VatToken & { exp?: number }
    if (!p.exp || Date.now() > p.exp) return null
    return { vatCountry: p.vatCountry, vatId: p.vatId, name: p.name ?? null, address: p.address ?? null, consultation: p.consultation ?? null }
  } catch {
    return null
  }
}
