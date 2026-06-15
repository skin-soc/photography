/**
 * Edge-cached catalog for the client-side shop grid.
 *
 * The `/shop` page no longer inlines the whole catalog (2,600+ photos) into its
 * server-rendered props — serializing that on every request blew the Worker CPU
 * limit (error 1102). Instead the page renders only its shell + category tree,
 * and `ShopGrid` fetches the photo tiles from here once, client-side.
 *
 * The body is identical for every visitor of a given catalog version, so we
 * cache it at the Cloudflare edge keyed by the `?v=` (the catalog version the
 * page passed). A new version → new URL → cache miss → recompute once per colo;
 * otherwise the Worker never reprocesses or re-serializes the catalog.
 */

import { getCatalog, fromPrice, photoTypes, displayTitle } from '@/lib/shop'
import { getRates, formatDKK, approxLine } from '@/lib/currency'

/** The Cloudflare edge cache (per colo), or undefined where it's unavailable —
 *  same access pattern as the preview route + getCatalog. */
const edgeCache = (globalThis as { caches?: { default?: Cache } }).caches?.default

export async function GET(req: Request): Promise<Response> {
  try {
    // Key on a NATIVE Request built from the URL — the framework Request object
    // isn't a valid Cache API key (it can't derive a URL from it).
    const cacheKey = new Request(req.url, { method: 'GET' })
    if (edgeCache) {
      const hit = await edgeCache.match(cacheKey).catch(() => undefined)
      if (hit) return hit
    }

    const [catalog, rates] = await Promise.all([getCatalog(), getRates()])
    const photos = catalog.map((p) => {
      const lo = fromPrice(p)
      return {
        id: p.id,
        slug: p.slug,
        title: displayTitle(p),
        location: p.location,
        caption: p.caption,
        types: photoTypes(p),
        previewUrl: p.previewUrl,
        fromText: formatDKK(lo.price),
        fromApprox: approxLine(lo.price, rates),
        category: p.category,
        key: p.key,
        salePct: p.salePct,
        captureDate: p.captureDate,
      }
    })

    const res = new Response(JSON.stringify({ photos }), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        // Versioned URL ⇒ safe to cache hard. SWR serves a stale copy while a
        // fresh one is fetched on the rare miss.
        'cache-control': 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800',
      },
    })
    if (edgeCache) await edgeCache.put(cacheKey, res.clone()).catch(() => {})
    return res
  } catch (err) {
    console.error('[shop/catalog] error:', err)
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
