/**
 * Fine-art room-mockup proxy. The hero requests a mockup by (photo slug, family,
 * SIZE, frame colour); we resolve the slug → photo and stream the PRE-RENDERED PNG
 * from the origin's NAS cache (populated by the admin "Generate fine-art mockups"
 * batch → Prodigi PIG), edge-caching it. Per-size so the room scene shows the real
 * scale. 404 when not pre-rendered / unsupported by the generator → the hero falls
 * back to the preview.
 */
import { getCatalog } from '@/lib/shop'
import { fetchOriginMockup } from '@/lib/downloads'
import { canMockup, mockupColor, MOCKUP_VERSION } from '@/lib/mockups'

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const slug = (url.searchParams.get('photo') ?? '').toLowerCase()
  const family = url.searchParams.get('family') ?? ''
  const size = (url.searchParams.get('size') ?? '').replace(/[^A-Za-z0-9]/g, '')
  const color = url.searchParams.get('color') ?? ''
  if (!slug || !family || !size || !color || !canMockup(family, color)) {
    return new Response('bad request', { status: 400 })
  }
  const assetColor = mockupColor(family, color)

  const cacheKey = new Request(
    new URL(`/api/fineart-mockup?photo=${slug}&family=${family}&size=${size}&color=${assetColor}&v=${MOCKUP_VERSION}`, url.origin).toString(),
  )
  const cache = (caches as unknown as { default?: Cache }).default
  const cached = await cache?.match(cacheKey)
  if (cached) return cached

  const catalog = await getCatalog()
  const photo = catalog.find((p) => p.slug === slug)
  if (!photo) return new Response('not found', { status: 404 })

  let upstream: Response
  try {
    upstream = await fetchOriginMockup(photo.id, family, size, assetColor)
  } catch {
    return new Response('mockup unavailable', { status: 502 })
  }
  if (!upstream.ok) return new Response('mockup unavailable', { status: upstream.status === 404 ? 404 : 502 })

  const png = await upstream.arrayBuffer()
  const res = new Response(png, {
    status: 200,
    headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable' },
  })
  await cache?.put(cacheKey, res.clone())
  return res
}
