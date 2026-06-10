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

async function settingsKV(): Promise<KVLike | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true })
    return (env as unknown as { SHOP_SETTINGS?: KVLike }).SHOP_SETTINGS
  } catch {
    return undefined
  }
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
    return (await kv.get(SHOP_ONLINE_KEY)) !== 'off'
  } catch {
    return true
  }
}

/** Set the shop online/offline. Returns false if KV isn't available. */
export async function setShopOnline(online: boolean): Promise<boolean> {
  const kv = await settingsKV()
  if (!kv) return false
  await kv.put(SHOP_ONLINE_KEY, online ? 'on' : 'off')
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
      kv.get(SALE_NOTIFY_KEY),
      kv.get(SALE_NOTIFY_EMAIL_KEY),
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
  await Promise.all([
    kv.put(SALE_NOTIFY_KEY, input.enabled ? 'on' : 'off'),
    kv.put(SALE_NOTIFY_EMAIL_KEY, input.email),
  ])
  return true
}

/** Whether the admin Refund button defaults to undownloaded-only (true) or full
 *  (false). Defaults to true. */
export async function getRefundUndownloadedDefault(): Promise<boolean> {
  const kv = await settingsKV()
  if (!kv) return true
  try {
    return (await kv.get(REFUND_UNDOWNLOADED_DEFAULT_KEY)) !== 'off'
  } catch {
    return true
  }
}

export async function setRefundUndownloadedDefault(value: boolean): Promise<boolean> {
  const kv = await settingsKV()
  if (!kv) return false
  await kv.put(REFUND_UNDOWNLOADED_DEFAULT_KEY, value ? 'on' : 'off')
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
    const raw = await kv.get(VAT_RATE_KEY)
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
  return true
}
