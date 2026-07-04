import type { MetadataRoute } from 'next'
import { buildSitemapEntries, SITE_URL } from '@/i18n/seo'
import { getCatalog, photoTypes, mockupAssetVersion, type ShopPhoto } from '@/lib/shop'
import { fineArtHeroVariant } from '@/lib/shop-cards'
import { PRODUCT_TYPE_ORDER } from '@/lib/product-types'
import { categoryUrl } from '@/lib/shop-url'
import { routing } from '@/i18n/routing'

// Generated at request time from the live catalog (cheap — the catalog is
// edge-cached + memoised), so new products appear without a redeploy and the
// build never depends on origin reachability.
export const dynamic = 'force-dynamic'

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
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = buildSitemapEntries()

  let catalog: ShopPhoto[]
  try {
    catalog = await getCatalog()
  } catch {
    return entries
  }

  const now = new Date()
  // Lightroom epoch (2001-01-01 UTC) → Date. Stable per-photo dates instead of
  // "now" on every fetch, so Google sees real changes rather than daily churn.
  const LR_EPOCH = 978307200
  const photoDate = (p: ShopPhoto): Date =>
    p.captureDate ? new Date((p.captureDate + LR_EPOCH) * 1000) : now

  // Product pages — the money pages. One canonical entry each, with alternates.
  // Fine-art products also list their room07 mockup — the in-room scenes are
  // the image-search asset competitors' listings don't have.
  for (const photo of catalog) {
    const tail = `/shop/${photo.slug}`
    const images = [absImg(photo.previewUrl)]
    const fa = fineArtHeroVariant(photo)
    if (fa) {
      images.push(
        `${SITE_URL}/api/fineart-mockup?photo=${encodeURIComponent(photo.slug)}&family=${encodeURIComponent(fa.family)}&size=${encodeURIComponent(fa.size)}&color=${encodeURIComponent(fa.color)}&v=${mockupAssetVersion()}`,
      )
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
