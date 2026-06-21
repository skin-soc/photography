/**
 * Fine-art room-mockup proxy. The client requests a mockup by (photo slug, family,
 * frame colour); we resolve the slug → photo, build the Prodigi PIG render URL
 * (which embeds a TOKEN-GATED no-logo source URL — kept server-side, never sent to
 * the browser), fetch the composited PNG, and return it with an immutable cache
 * header. Stored in the Cloudflare edge cache so repeat views never re-hit Prodigi.
 */
import { getCatalog } from '@/lib/shop'
import { mockupRenderUrl, MOCKUP_VERSION } from '@/lib/mockups'

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const slug = (url.searchParams.get('photo') ?? '').toLowerCase()
  const family = url.searchParams.get('family') ?? ''
  const color = url.searchParams.get('color') ?? ''
  if (!slug || !family || !color) return new Response('bad request', { status: 400 })

  // The proxied PNG is identical for everyone, so cache it at the edge. The
  // version in the key lets a MOCKUP_VERSION bump bust stale/bad renders.
  const cacheKey = new Request(
    new URL(`/api/fineart-mockup?photo=${slug}&family=${family}&color=${color}&v=${MOCKUP_VERSION}`, url.origin).toString(),
  )
  const cache = (caches as unknown as { default?: Cache }).default
  const cached = await cache?.match(cacheKey)
  if (cached) return cached

  const catalog = await getCatalog()
  const photo = catalog.find((p) => p.slug === slug)
  if (!photo) return new Response('not found', { status: 404 })

  const portrait = photo.height >= photo.width
  const render = mockupRenderUrl({ photoId: photo.id, family, color, portrait })
  if (!render) return new Response('not available', { status: 404 })

  let upstream: Response
  try {
    upstream = await fetch(render)
  } catch {
    return new Response('mockup unavailable', { status: 502 })
  }
  if (!upstream.ok) return new Response('mockup unavailable', { status: 502 })

  const png = await upstream.arrayBuffer()
  // Cache for a day (not immutable): mockups rarely change, but a bad render
  // (e.g. the source was briefly unreachable) then self-heals next day rather
  // than being stuck forever. A MOCKUP_VERSION bump busts it immediately.
  const res = new Response(png, {
    status: 200,
    headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' },
  })
  await cache?.put(cacheKey, res.clone())
  return res
}
