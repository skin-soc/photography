/**
 * Fine-art room-mockup proxy. The hero requests a mockup by (photo slug, family,
 * SIZE, frame colour); we resolve the slug → photo and stream the PRE-RENDERED JPEG
 * from the origin's NAS cache (populated by the admin "Generate fine-art mockups"
 * batch → Prodigi PIG), edge-caching it. Per-size so the room scene shows the real
 * scale. 404 when not pre-rendered / unsupported by the generator → the hero falls
 * back to the preview.
 */
import { getCatalog } from '@/lib/shop'
import { fetchOriginMockup } from '@/lib/downloads'
import { canMockup, mockupColor } from '@/lib/mockups'

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const slug = (url.searchParams.get('photo') ?? '').toLowerCase()
  const family = url.searchParams.get('family') ?? ''
  const size = (url.searchParams.get('size') ?? '').replace(/[^A-Za-z0-9]/g, '')
  const color = url.searchParams.get('color') ?? ''
  const view = url.searchParams.get('view') === 'cover' ? 'cover' : 'room07'
  // The mockup-asset version (set by the origin, passed by the client) is part of
  // the cache key, so a re-render's version bump naturally misses the old cache.
  const v = (url.searchParams.get('v') ?? '1').replace(/[^0-9]/g, '') || '1'
  if (!slug || !family || !size || !color || !canMockup(family, color)) {
    return new Response('bad request', { status: 400 })
  }
  const assetColor = mockupColor(family, color)

  const cacheKey = new Request(
    new URL(`/api/fineart-mockup?photo=${slug}&family=${family}&size=${size}&color=${assetColor}&view=${view}&v=${v}`, url.origin).toString(),
  )
  const cache = (caches as unknown as { default?: Cache }).default
  const cached = await cache?.match(cacheKey)
  if (cached) return cached

  const catalog = await getCatalog()
  const photo = catalog.find((p) => p.slug === slug)
  if (!photo) return new Response('not found', { status: 404 })

  let upstream: Response
  try {
    upstream = await fetchOriginMockup(photo.id, family, size, assetColor, view)
  } catch {
    return new Response('mockup unavailable', { status: 502 })
  }
  if (!upstream.ok) return new Response('mockup unavailable', { status: upstream.status === 404 ? 404 : 502 })

  const img = await upstream.arrayBuffer()
  // Only ever serve/cache a real JPEG. During the PNG→JPEG cutover the (not-yet-
  // rebuilt) origin may still return PNG bytes; treat anything that isn't a JPEG
  // (magic FF D8 FF) as not-ready → 404 (hero falls back to the framed preview)
  // and DON'T cache it, so the 1-year immutable cache never gets poisoned.
  const head = new Uint8Array(img.slice(0, 3))
  if (head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) {
    return new Response('mockup not ready', { status: 404 })
  }
  const res = new Response(img, {
    status: 200,
    headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' },
  })
  await cache?.put(cacheKey, res.clone())
  return res
}
