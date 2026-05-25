/**
 * Preview proxy — keeps the LAN origin URL private.
 *
 * The browser requests /api/preview/:id (optionally with ?max=N).
 * This handler forwards the request to the LAN origin with the shared
 * secret header and streams the watermarked JPEG back. The origin URL
 * is never exposed to the client.
 */

import { NextRequest, NextResponse } from 'next/server'

const ORIGIN        = process.env.SHOP_ORIGIN_URL  ?? ''
const ORIGIN_SECRET = process.env.SHOP_ORIGIN_SECRET ?? ''

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

  const upstreamUrl = new URL(`${ORIGIN}/preview/${id}`)
  const max = request.nextUrl.searchParams.get('max')
  if (max) upstreamUrl.searchParams.set('max', max)

  let upstreamRes: Response
  try {
    upstreamRes = await fetch(upstreamUrl.toString(), {
      headers: { 'x-shop-secret': ORIGIN_SECRET },
      // No fetch-level caching — the origin already caches on disk.
      cache: 'no-store',
    })
  } catch {
    return new NextResponse(null, { status: 502 })
  }

  if (!upstreamRes.ok) {
    return new NextResponse(null, { status: upstreamRes.status })
  }

  const body = await upstreamRes.arrayBuffer()
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type':  upstreamRes.headers.get('Content-Type') ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
