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
