/**
 * Preview proxy — keeps the LAN origin URL private.
 *
 * The browser requests /api/preview/:id (optionally with ?max=N). This handler
 * forwards to the LAN origin with the shared-secret header and streams the
 * watermarked JPEG back; the origin URL is never exposed to the client.
 *
 * Two performance measures:
 *  - The body is STREAMED through (not buffered with arrayBuffer), so the image
 *    starts arriving immediately and the worker never holds the whole file.
 *  - Responses are stored in the Cloudflare edge cache (immutable previews), so
 *    a cold visitor is served from the edge and never reaches the NAS.
 */

import { NextRequest, NextResponse, after } from 'next/server'

const ORIGIN        = process.env.SHOP_ORIGIN_URL  ?? ''
const ORIGIN_SECRET = process.env.SHOP_ORIGIN_SECRET ?? ''

/** The Cloudflare per-data-centre cache, when running on Workers. */
function edgeCache(): Cache | undefined {
  try {
    return (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default
  } catch {
    return undefined
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    return new NextResponse(null, { status: 400 })
  }
  if (!ORIGIN) {
    // Dev mode — no origin configured, return 404 gracefully.
    return new NextResponse(null, { status: 404 })
  }

  // Edge cache keyed by the public request URL (includes ?max=N).
  const cache = edgeCache()
  const cacheKey = new Request(request.url, { method: 'GET' })
  if (cache) {
    const hit = await cache.match(cacheKey).catch(() => undefined)
    if (hit) return hit
  }

  const upstreamUrl = new URL(`${ORIGIN}/preview/${id}`)
  const max = request.nextUrl.searchParams.get('max')
  if (max) upstreamUrl.searchParams.set('max', max)

  let upstreamRes: Response
  try {
    upstreamRes = await fetch(upstreamUrl.toString(), {
      headers: { 'x-shop-secret': ORIGIN_SECRET },
      // No fetch-level caching — the origin already caches on disk, and we
      // manage the shared cache explicitly via the edge Cache API below.
      cache: 'no-store',
    })
  } catch {
    return new NextResponse(null, { status: 502 })
  }

  if (!upstreamRes.ok || !upstreamRes.body) {
    return new NextResponse(null, { status: upstreamRes.status || 502 })
  }

  const headers: Record<string, string> = {
    'Content-Type':  upstreamRes.headers.get('Content-Type') ?? 'image/jpeg',
    'Cache-Control': 'public, max-age=31536000, immutable',
  }
  const len = upstreamRes.headers.get('Content-Length')
  if (len) headers['Content-Length'] = len

  const res = new NextResponse(upstreamRes.body, { status: 200, headers })

  // Persist a copy at the edge after responding, so subsequent cold visitors
  // are served without touching the NAS. Best-effort — never blocks the stream.
  if (cache) {
    const toStore = res.clone()
    after(() => cache.put(cacheKey, toStore).catch(() => {}))
  }
  return res
}
