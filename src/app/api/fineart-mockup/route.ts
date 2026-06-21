/**
 * Fine-art room-mockup proxy. The hero requests a mockup by (photo slug, family,
 * frame colour); we resolve the slug → photo and stream the PRE-RENDERED PNG from
 * the origin's NAS cache (populated by the admin "Generate fine-art mockups"
 * batch → Prodigi PIG), edge-caching it so repeat views never hit the origin.
 * 404 when it hasn't been pre-rendered → the hero falls back to the preview.
 */
import { getCatalog } from '@/lib/shop'
import { fetchOriginMockup } from '@/lib/downloads'
import { canMockup, mockupColor, MOCKUP_VERSION } from '@/lib/mockups'

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const slug = (url.searchParams.get('photo') ?? '').toLowerCase()
  const family = url.searchParams.get('family') ?? ''
  const color = url.searchParams.get('color') ?? ''
  if (!slug || !family || !color || !canMockup(family, color)) {
    return new Response('bad request', { status: 400 })
  }
  const assetColor = mockupColor(family, color)

  // The proxied PNG is identical for everyone; cache at the edge. The version lets
  // a MOCKUP_VERSION bump bust stale renders.
  const cacheKey = new Request(
    new URL(`/api/fineart-mockup?photo=${slug}&family=${family}&color=${assetColor}&v=${MOCKUP_VERSION}`, url.origin).toString(),
  )
  const cache = (caches as unknown as { default?: Cache }).default
  const cached = await cache?.match(cacheKey)
  if (cached) return cached

  const catalog = await getCatalog()
  const photo = catalog.find((p) => p.slug === slug)
  if (!photo) return new Response('not found', { status: 404 })

  let upstream: Response
  try {
    upstream = await fetchOriginMockup(photo.id, family, assetColor)
  } catch {
    return new Response('mockup unavailable', { status: 502 })
  }
  // Not pre-rendered yet → 404 (hero shows the preview); other errors → don't cache.
  if (!upstream.ok) return new Response('mockup unavailable', { status: upstream.status === 404 ? 404 : 502 })

  const png = await upstream.arrayBuffer()
  const res = new Response(png, {
    status: 200,
    headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable' },
  })
  await cache?.put(cacheKey, res.clone())
  return res
}
