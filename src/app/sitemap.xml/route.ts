/**
 * Sitemap as an explicit route handler, EDGE-CACHED.
 *
 * This was a Next `sitemap.ts` metadata route with `force-dynamic`: ~2,600
 * products × 18 hreflang alternates + the category tree, rebuilt and
 * re-serialized into multi-MB XML on every crawler fetch — the single most
 * CPU-expensive request on the site against the free-tier 10ms budget. The
 * body only changes when the catalog does, so it's cached in `caches.default`
 * keyed by the catalog version (same pattern as /api/shop/catalog): a version
 * change is a new key, an unchanged catalog is a cache hit.
 *
 * Generated at request time from the live catalog (cheap — the catalog is
 * edge-cached + memoised), so new products appear without a redeploy and the
 * build never depends on origin reachability.
 */

import { buildSitemapEntries, SITE_URL } from '@/i18n/seo'
import { getCatalog, catalogVersion, photoTypes, mockupAssetVersion, type ShopPhoto } from '@/lib/shop'
import { fineArtHeroVariant } from '@/lib/shop-cards'
import { fineArtMockupUrl } from '@/lib/mockup-url'
import { PRODUCT_TYPE_ORDER } from '@/lib/product-types'
import { categoryUrl } from '@/lib/shop-url'
import { routing } from '@/i18n/routing'

interface SitemapEntry {
  url: string
  lastModified: Date
  changeFrequency?: string
  priority?: number
  alternates?: { languages: Record<string, string> }
  images?: string[]
}

/** hreflang alternates for a site-relative path (e.g. `/shop/gmp-…`). */
function langMap(pathTail: string): Record<string, string> {
  const map: Record<string, string> = {}
  for (const l of routing.locales) {
    const prefix = l === routing.defaultLocale ? '' : `/${l}`
    map[l] = `${SITE_URL}${prefix}${pathTail}`
  }
  map['x-default'] = `${SITE_URL}${pathTail}`
  return map
}

/** Absolute image URL — preview URLs are already absolute (loki host). */
const absImg = (u: string) => (u.startsWith('http') ? u : `${SITE_URL}${u}`)

/** Representative image for a collection: prefer a green-labelled (key) hero —
 *  Lightroom's green label marks the photo to lead with — else the first photo. */
function heroImage(photos: ShopPhoto[]): string | undefined {
  const hero = photos.find((p) => p.key) ?? photos[0]
  return hero ? absImg(hero.previewUrl) : undefined
}

/**
 * Full sitemap: the static marketing routes PLUS every sellable product and the
 * shop category pages, each with hreflang alternates and an image entry (green
 * heroes for collections) so the catalog is discoverable in web + image search.
 * Best-effort — if the catalog can't be fetched we still emit the static routes.
 */
function buildEntries(catalog: ShopPhoto[]): SitemapEntry[] {
  const entries = buildSitemapEntries() as SitemapEntry[]

  const now = new Date()
  // Lightroom epoch (2001-01-01 UTC) → Date. Stable per-photo dates instead of
  // "now" on every fetch, so Google sees real changes rather than daily churn.
  const LR_EPOCH = 978307200
  const photoDate = (p: ShopPhoto): Date =>
    p.captureDate ? new Date((p.captureDate + LR_EPOCH) * 1000) : now

  // Product pages — the money pages. One canonical entry each, with alternates.
  // Fine-art products also list their room07 mockup — the in-room scenes are
  // the image-search asset competitors' listings don't have. Mockups are now
  // loki URLs (crawlable — the old /api/fineart-mockup form was blocked by the
  // robots.txt /api/ disallow, so Google Images never fetched it).
  for (const photo of catalog) {
    const tail = `/shop/${photo.slug}`
    const images = [absImg(photo.previewUrl)]
    const fa = fineArtHeroVariant(photo)
    if (fa) {
      images.push(absImg(fineArtMockupUrl(photo, fa.family, fa.size, fa.color, 'room07', mockupAssetVersion())))
    }
    entries.push({
      url: `${SITE_URL}${tail}`,
      lastModified: photoDate(photo),
      changeFrequency: 'monthly',
      priority: 0.8,
      alternates: { languages: langMap(tail) },
      images,
    })
  }

  // Category pages — the type landings + every subject-folder prefix under each
  // type. High commercial intent ("copenhagen posters"), led by a green hero.
  for (const type of PRODUCT_TYPE_ORDER) {
    const ofType = catalog.filter((p) => photoTypes(p).includes(type))
    if (ofType.length === 0) continue

    const prefixes = new Set<string>(['[]']) // the type landing itself
    for (const p of ofType)
      for (const cat of p.category)
        for (let k = 1; k <= cat.length; k++) prefixes.add(JSON.stringify(cat.slice(0, k)))

    for (const key of Array.from(prefixes)) {
      const folders = JSON.parse(key) as string[]
      const url = categoryUrl([type, ...folders])
      const inCat = ofType.filter(
        (p) => folders.length === 0 || p.category.some((c) => folders.every((s, i) => c[i] === s)),
      )
      const hero = heroImage(inCat)
      // Newest photo in the set = the collection's real last change.
      const newest = inCat.reduce((m, p) => Math.max(m, p.captureDate ?? 0), 0)
      entries.push({
        url: `${SITE_URL}${url}`,
        lastModified: newest ? new Date((newest + LR_EPOCH) * 1000) : now,
        changeFrequency: 'weekly',
        priority: folders.length === 0 ? 0.7 : 0.6,
        alternates: { languages: langMap(url) },
        ...(hero ? { images: [hero] } : {}),
      })
    }
  }

  return entries
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

/** Serialize to the same XML shape Next's metadata route produced (urlset +
 *  xhtml:link alternates + image:image entries). */
function toXml(entries: SitemapEntry[]): string {
  const parts: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
  ]
  for (const e of entries) {
    parts.push('<url>')
    parts.push(`<loc>${esc(e.url)}</loc>`)
    for (const [hreflang, href] of Object.entries(e.alternates?.languages ?? {})) {
      parts.push(`<xhtml:link rel="alternate" hreflang="${esc(hreflang)}" href="${esc(href)}"/>`)
    }
    parts.push(`<lastmod>${e.lastModified.toISOString()}</lastmod>`)
    if (e.changeFrequency) parts.push(`<changefreq>${e.changeFrequency}</changefreq>`)
    if (e.priority != null) parts.push(`<priority>${e.priority}</priority>`)
    for (const img of e.images ?? []) {
      parts.push(`<image:image><image:loc>${esc(img)}</image:loc></image:image>`)
    }
    parts.push('</url>')
  }
  parts.push('</urlset>')
  return parts.join('\n')
}

// Render per-request (NOT prerendered at build): new products must appear
// without a redeploy, and the build must never depend on origin reachability.
// The CPU cost is absorbed by the per-colo edge cache below (keyed by catalog
// version), so a hit never re-serializes the multi-MB XML.
export const dynamic = 'force-dynamic'

const CACHE_PREFIX = 'https://shop-origin.internal/sitemap/'
const edgeCache = (): Cache | undefined =>
  (globalThis as { caches?: { default?: Cache } }).caches?.default

export async function GET(): Promise<Response> {
  let catalog: ShopPhoto[] = []
  try {
    catalog = await getCatalog()
  } catch {
    /* static entries only */
  }

  const cacheKey = CACHE_PREFIX + encodeURIComponent(catalogVersion() || 'static')
  const edge = edgeCache()
  if (edge) {
    const hit = await edge.match(cacheKey).catch(() => undefined)
    if (hit) return hit
  }

  const res = new Response(toXml(buildEntries(catalog)), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      // 1h TTL bounds staleness within an unchanged catalog version; a catalog
      // change is a new cache key immediately.
      'cache-control': 'public, max-age=3600',
    },
  })
  if (edge) await edge.put(cacheKey, res.clone()).catch(() => {})
  return res
}
