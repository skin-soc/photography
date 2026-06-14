/**
 * Admin master download — streams a photo's edited master (JPEG) or original
 * (TIFF) straight from the origin's MASTERS_DIR. Session-gated; the path segment
 * is the PRODUCT CODE (the gmp slug, as shown in Product lookup), resolved here
 * to the photo's master id so the origin keeps its id-based contract.
 * Open e.g. /api/admin/master/gmp-a1b2c3d/jpeg while signed in.
 */
import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'
import { getPhoto, getCatalog } from '@/lib/shop'

const ORIGIN = process.env.SHOP_ORIGIN_URL ?? ''
const ORIGIN_SECRET = process.env.SHOP_ORIGIN_SECRET ?? ''

function err(status: number, message: string): NextResponse {
  return new NextResponse(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; format: string }> },
) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value
  if (!(await verifySessionToken(token, process.env.ADMIN_PASSWORD ?? ''))) {
    return err(401, 'Not signed in. Open /admin and sign in in this browser, then retry.')
  }
  const { id: code, format } = await params
  if (format !== 'jpeg' && format !== 'tiff') return err(400, `Bad format "${format}" — use jpeg or tiff.`)
  if (!/^[A-Za-z0-9_-]+$/.test(code)) return err(400, `Bad code "${code}".`)
  if (!ORIGIN) return err(503, 'Origin not configured.')

  const photo =
    (await getPhoto(code.toLowerCase())) ?? (await getCatalog()).find((p) => p.id === code)
  if (!photo) return err(404, `No photo matches "${code}".`)

  let up: Response
  try {
    up = await fetch(`${ORIGIN}/admin/master/${photo.id}/${format}`, {
      headers: { 'x-shop-secret': ORIGIN_SECRET },
      cache: 'no-store',
    })
  } catch {
    return err(502, 'Could not reach the origin (NAS).')
  }
  if (!up.ok || !up.body) {
    const body = await up.text().catch(() => '')
    return err(up.status || 502, body || `Origin returned ${up.status}.`)
  }

  return new NextResponse(up.body, {
    status: 200,
    headers: {
      'Content-Type': up.headers.get('Content-Type') ?? 'application/octet-stream',
      'Content-Disposition': up.headers.get('Content-Disposition') ?? 'inline',
      'Cache-Control': 'private, no-store',
    },
  })
}
