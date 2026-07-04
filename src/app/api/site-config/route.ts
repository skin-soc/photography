/**
 * Tiny public runtime config: the owner theme + the shop kill-switch.
 *
 * The marketing pages are served PRERENDERED (static-assets incremental cache),
 * so the layout's server-side KV reads for these two values are frozen at build
 * time there. This endpoint keeps them live: the Nav fetches it client-side
 * (browser-cached 60s) and overrides the baked-in defaults — so taking the shop
 * offline or switching the site theme still applies everywhere without a
 * redeploy. Reads are the in-isolate-memoized getters, so this costs ~no KV.
 */

import { getShopOnline, getThemePref } from '@/lib/shop-settings'

export async function GET(): Promise<Response> {
  const [theme, shopOnline] = await Promise.all([getThemePref(), getShopOnline()])
  return Response.json(
    { theme, shopOnline },
    { headers: { 'cache-control': 'public, max-age=60' } },
  )
}
