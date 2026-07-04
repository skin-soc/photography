/**
 * Fine-art mockup URLs, CLIENT-SAFE (no node imports).
 *
 * Mockups are pre-rendered JPEGs on the origin NAS, public-by-design and served
 * from the cache-ruled loki host (`/mockup/<id>/<family>/<size>/<colour>`) — the
 * same off-Worker path previews use. Every grid tile / hero image through the
 * Worker's /api/fineart-mockup proxy was a full Worker invocation (a cache HIT
 * still runs the Worker), the single biggest consumer of the free-tier 100k
 * requests/day. The loki host is derived from the photo's previewUrl, so the
 * right origin is used in every env; when previews aren't on a public host
 * (local dev without SHOP_PREVIEW_BASE_URL) we fall back to the Worker proxy,
 * which stays in place.
 */

export interface MockupTarget {
  id: string
  slug: string
  /** Absolute loki preview URL (prod/preview) or worker-relative /api/preview
   *  fallback — the mockup host is derived from it. */
  previewUrl?: string
}

export type MockupView = 'room07' | 'cover'

/** Frame colour that actually has a rendered cover (canvas only renders black). */
export function mockupAssetColor(family: string, color: string): string {
  return family === 'canvas' ? 'black' : color
}

/** URL of the pre-rendered mockup for a (photo, family, size, colour, view).
 *  `v` is the mockup-asset version — busts the 1-year immutable cache. */
export function fineArtMockupUrl(
  photo: MockupTarget,
  family: string,
  size: string,
  color: string,
  view: MockupView,
  v: number | string,
): string {
  const assetColor = mockupAssetColor(family, color)
  // The origin route only accepts alphanumeric sizes (18X24, A2, …).
  const cleanSize = size.replace(/[^A-Za-z0-9]/g, '')
  if (photo.previewUrl && /^https?:\/\//.test(photo.previewUrl)) {
    const base = new URL(photo.previewUrl).origin
    return `${base}/mockup/${encodeURIComponent(photo.id)}/${encodeURIComponent(family)}/${cleanSize}/${encodeURIComponent(assetColor)}?view=${view}&v=${v}`
  }
  // No public preview host configured → the Worker proxy (slug-keyed).
  return `/api/fineart-mockup?photo=${encodeURIComponent(photo.slug)}&family=${encodeURIComponent(family)}&size=${encodeURIComponent(cleanSize)}&color=${encodeURIComponent(assetColor)}${view === 'cover' ? '&view=cover' : ''}&v=${v}`
}
