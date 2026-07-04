/**
 * Shop-level settings backed by Cloudflare KV (binding: SHOP_SETTINGS).
 *
 * Currently just the online/offline switch the admin uses to hide the shop from
 * the nav. Lives in KV (not on the NAS origin) so it works even when the origin
 * is unreachable — which is exactly when you might want to take the shop down.
 */

import { getCloudflareContext } from '@opennextjs/cloudflare'

interface KVLike {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
}

const SHOP_ONLINE_KEY = 'shop:online'
const SALE_NOTIFY_KEY = 'sale:notify'
const SALE_NOTIFY_EMAIL_KEY = 'sale:notifyEmail'
const DEFAULT_NOTIFY_EMAIL = 'email@gusmcewan.com'
const REFUND_UNDOWNLOADED_DEFAULT_KEY = 'refund:undownloadedDefault'
const VAT_RATE_KEY = 'vat:rate'
const DEFAULT_VAT_RATE = 25
const THEME_KEY = 'site:theme'
const POSTER_TRANSLATIONS_KEY = 'poster:translations'

async function settingsKV(): Promise<KVLike | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true })
    return (env as unknown as { SHOP_SETTINGS?: KVLike }).SHOP_SETTINGS
  } catch {
    return undefined
  }
}

// ── In-isolate read memo ──────────────────────────────────────────────────────
// The layout reads theme + shop-online on EVERY server render (and getPricing
// reads on every catalog build), which was ~5 KV reads per SSR view — the KV
// free tier is 100k reads/day, so settings were the binding constraint, not
// requests. Values change at most a few times a day (admin edits), so a warm
// isolate re-reads each key at most once per minute. Setters update the memo,
// so the admin who changed a value sees it immediately; other isolates converge
// within the TTL.
const MEMO_TTL_MS = 60_000
const _memo = new Map<string, { v: string | null; exp: number }>()

async function readCached(kv: KVLike, key: string): Promise<string | null> {
  const hit = _memo.get(key)
  if (hit && hit.exp > Date.now()) return hit.v
  const v = await kv.get(key)
  _memo.set(key, { v, exp: Date.now() + MEMO_TTL_MS })
  return v
}

function memoWrite(key: string, v: string): void {
  _memo.set(key, { v, exp: Date.now() + MEMO_TTL_MS })
}

/**
 * Is the shop currently shown in the nav? Defaults to ONLINE whenever the flag
 * is unset or KV is unavailable, so a transient glitch never hides the shop —
 * only an explicit "off" takes it down.
 */
export async function getShopOnline(): Promise<boolean> {
  const kv = await settingsKV()
  if (!kv) return true
  try {
    return (await readCached(kv, SHOP_ONLINE_KEY)) !== 'off'
  } catch {
    return true
  }
}

/** Set the shop online/offline. Returns false if KV isn't available. */
export async function setShopOnline(online: boolean): Promise<boolean> {
  const kv = await settingsKV()
  if (!kv) return false
  const v = online ? 'on' : 'off'
  await kv.put(SHOP_ONLINE_KEY, v)
  memoWrite(SHOP_ONLINE_KEY, v)
  return true
}

export interface SaleNotify {
  enabled: boolean
  email: string
}

/** Owner sale-notification settings: whether to email on each real (live) sale,
 *  and where. Defaults to off, email@gusmcewan.com. */
export async function getSaleNotify(): Promise<SaleNotify> {
  const kv = await settingsKV()
  if (!kv) return { enabled: false, email: DEFAULT_NOTIFY_EMAIL }
  try {
    const [flag, email] = await Promise.all([
      readCached(kv, SALE_NOTIFY_KEY),
      readCached(kv, SALE_NOTIFY_EMAIL_KEY),
    ])
    return { enabled: flag === 'on', email: email || DEFAULT_NOTIFY_EMAIL }
  } catch {
    return { enabled: false, email: DEFAULT_NOTIFY_EMAIL }
  }
}

/** Update the sale-notification settings. Returns false if KV isn't available. */
export async function setSaleNotify(input: SaleNotify): Promise<boolean> {
  const kv = await settingsKV()
  if (!kv) return false
  const flag = input.enabled ? 'on' : 'off'
  await Promise.all([
    kv.put(SALE_NOTIFY_KEY, flag),
    kv.put(SALE_NOTIFY_EMAIL_KEY, input.email),
  ])
  memoWrite(SALE_NOTIFY_KEY, flag)
  memoWrite(SALE_NOTIFY_EMAIL_KEY, input.email)
  return true
}

/** Whether the admin Refund button defaults to undownloaded-only (true) or full
 *  (false). Defaults to true. */
export async function getRefundUndownloadedDefault(): Promise<boolean> {
  const kv = await settingsKV()
  if (!kv) return true
  try {
    return (await readCached(kv, REFUND_UNDOWNLOADED_DEFAULT_KEY)) !== 'off'
  } catch {
    return true
  }
}

export async function setRefundUndownloadedDefault(value: boolean): Promise<boolean> {
  const kv = await settingsKV()
  if (!kv) return false
  const v = value ? 'on' : 'off'
  await kv.put(REFUND_UNDOWNLOADED_DEFAULT_KEY, v)
  memoWrite(REFUND_UNDOWNLOADED_DEFAULT_KEY, v)
  return true
}

// ── Manual VAT rate (Stripe Tax disabled) ─────────────────────────────────────
// We compute VAT ourselves: the home (Danish) rate applies to DK + EU buyers
// (under the OSS threshold), 0% to non-EU. The rate is editable here, defaulting
// to 25%. See [[vat]] for the jurisdiction logic.

/** Current VAT percentage charged to DK + EU buyers. Defaults to 25. */
export async function getVatRate(): Promise<number> {
  const kv = await settingsKV()
  if (!kv) return DEFAULT_VAT_RATE
  try {
    const raw = await readCached(kv, VAT_RATE_KEY)
    const n = raw == null ? NaN : Number(raw)
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : DEFAULT_VAT_RATE
  } catch {
    return DEFAULT_VAT_RATE
  }
}

/** Set the VAT percentage (0–100). Returns false if KV isn't available. */
export async function setVatRate(pct: number): Promise<boolean> {
  const kv = await settingsKV()
  if (!kv) return false
  await kv.put(VAT_RATE_KEY, String(pct))
  memoWrite(VAT_RATE_KEY, String(pct))
  return true
}

// ── Site theme (light / dark / auto) ──────────────────────────────────────────
// A single global appearance choice set by the owner in admin. The root layout
// reads this server-side and stamps the matching class on <html>, so there's no
// flash and no client script. `auto` follows the visitor's OS via CSS
// `prefers-color-scheme`. Defaults to `dark` — the site's original look.

export type ThemePref = 'auto' | 'light' | 'dark'

function isThemePref(v: string | null): v is ThemePref {
  return v === 'auto' || v === 'light' || v === 'dark'
}

/** Current site theme preference. Defaults to `auto` (follow the visitor's OS)
 *  whenever unset or KV is unavailable. */
export async function getThemePref(): Promise<ThemePref> {
  const kv = await settingsKV()
  if (!kv) return 'auto'
  try {
    const raw = await readCached(kv, THEME_KEY)
    return isThemePref(raw) ? raw : 'auto'
  } catch {
    return 'auto'
  }
}

/** Set the site theme preference. Returns false if KV isn't available. */
export async function setThemePref(theme: ThemePref): Promise<boolean> {
  const kv = await settingsKV()
  if (!kv) return false
  await kv.put(THEME_KEY, theme)
  memoWrite(THEME_KEY, theme)
  return true
}

// ── Poster text translations ───────────────────────────────────────────────────
// Locale-specific title + caption for each poster photo. Stored as a JSON blob
// keyed by photoId → locale → { title, caption? }. English is always the live
// Lightroom value and is never persisted here; the KV blob only holds the
// non-English translations so it stays small.

import type { PosterTranslations } from './poster-translations'

/** Saved non-English translations for all poster photos. Returns {} when KV is
 *  unavailable or the key has never been written. */
export async function getPosterTranslations(): Promise<PosterTranslations> {
  const kv = await settingsKV()
  if (!kv) return {}
  try {
    const raw = await readCached(kv, POSTER_TRANSLATIONS_KEY)
    return raw ? (JSON.parse(raw) as PosterTranslations) : {}
  } catch {
    return {}
  }
}

/** Persist non-English translations. Returns false if KV isn't available. */
export async function setPosterTranslations(data: PosterTranslations): Promise<boolean> {
  const kv = await settingsKV()
  if (!kv) return false
  const body = JSON.stringify(data)
  await kv.put(POSTER_TRANSLATIONS_KEY, body)
  memoWrite(POSTER_TRANSLATIONS_KEY, body)
  return true
}
