/**
 * Admin preview of a poster MASTER — the print-ready A-series poster (photo +
 * typeset band, no watermark, 300 dpi) the origin composites for Prodigi.
 * Session-gated and streamed straight from the origin so the owner can eyeball a
 * real render. Open e.g. /api/admin/poster-master/<photoId>/A2 while signed in.
 */
import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'

const ORIGIN = process.env.SHOP_ORIGIN_URL ?? ''
const ORIGIN_SECRET = process.env.SHOP_ORIGIN_SECRET ?? ''
const SIZES = new Set(['A4', 'A3', 'A2', 'A1', 'A0'])

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; size: string }> },
) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value
  if (!(await verifySessionToken(token, process.env.ADMIN_PASSWORD ?? ''))) {
    return new NextResponse(null, { status: 401 })
  }
  const { id, size } = await params
  if (!/^[A-Za-z0-9_-]+$/.test(id) || !SIZES.has(size)) {
    return new NextResponse(null, { status: 400 })
  }
  if (!ORIGIN) return new NextResponse(null, { status: 404 })

  let up: Response
  try {
    up = await fetch(`${ORIGIN}/poster-master/${id}/${size}`, {
      headers: { 'x-shop-secret': ORIGIN_SECRET },
      cache: 'no-store',
    })
  } catch {
    return new NextResponse(null, { status: 502 })
  }
  if (!up.ok || !up.body) return new NextResponse(null, { status: up.status || 502 })

  return new NextResponse(up.body, {
    status: 200,
    headers: {
      'Content-Type': up.headers.get('Content-Type') ?? 'image/jpeg',
      'Cache-Control': 'private, no-store',
    },
  })
}
