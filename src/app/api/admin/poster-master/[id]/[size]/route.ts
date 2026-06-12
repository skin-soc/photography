/**
 * Admin preview of a poster MASTER — the print-ready A-series poster (photo +
 * typeset band, no watermark, 300 dpi) the origin composites for Prodigi.
 * Session-gated and streamed straight from the origin so the owner can eyeball a
 * real render.
 *
 * The path segment is the PRODUCT CODE (the gmp slug, e.g. gmp-a1b2c3d) — the
 * same code shown in Product lookup and the product URL. We resolve it to the
 * photo's master id here, so the origin keeps its id-based contract.
 * Open e.g. /api/admin/poster-master/gmp-a1b2c3d/A2 while signed in.
 */
import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'
import { getPhoto, getCatalog } from '@/lib/shop'

const ORIGIN = process.env.SHOP_ORIGIN_URL ?? ''
const ORIGIN_SECRET = process.env.SHOP_ORIGIN_SECRET ?? ''
const SIZES = new Set(['A4', 'A3', 'A2', 'A1', 'A0'])

/** Plain-text error so a failure is readable in the browser, not a blank page. */
function err(status: number, message: string): NextResponse {
  return new NextResponse(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; size: string }> },
) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value
  if (!(await verifySessionToken(token, process.env.ADMIN_PASSWORD ?? ''))) {
    return err(401, 'Not signed in. Open /admin and sign in in this browser, then retry.')
  }
  const { id: code, size } = await params
  if (!SIZES.has(size)) return err(400, `Bad size "${size}" — use one of A4, A3, A2, A1, A0.`)
  if (!/^[A-Za-z0-9_-]+$/.test(code)) return err(400, `Bad code "${code}".`)
  if (!ORIGIN) return err(503, 'Origin not configured.')

  // Resolve the product code (slug = gmp code) to the photo's master id; fall
  // back to a raw camera-filename id (exact case) for convenience.
  const photo =
    (await getPhoto(code.toLowerCase())) ?? (await getCatalog()).find((p) => p.id === code)
  if (!photo) {
    return err(404, `No photo matches "${code}". Use the product code (gmp-…) shown in Product lookup, or the exact original filename.`)
  }

  let up: Response
  try {
    up = await fetch(`${ORIGIN}/poster-master/${photo.id}/${size}`, {
      headers: { 'x-shop-secret': ORIGIN_SECRET },
      cache: 'no-store',
    })
  } catch {
    return err(502, 'Could not reach the origin (NAS).')
  }
  if (!up.ok || !up.body) {
    // Surface the origin's reason (e.g. "no master for … — export the master").
    const body = await up.text().catch(() => '')
    return err(up.status || 502, body || `Origin returned ${up.status}.`)
  }

  return new NextResponse(up.body, {
    status: 200,
    headers: {
      'Content-Type': up.headers.get('Content-Type') ?? 'image/jpeg',
      'Cache-Control': 'private, no-store',
    },
  })
}
