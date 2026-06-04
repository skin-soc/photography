/**
 * Stream a purchased file.
 *
 * Gated by the signed proof-of-passcode cookie set by the unlock route. The
 * origin generates (once, cached) the copyright-embedded deliverable and
 * streams it back; we pipe the body straight through — never buffering, since
 * full-resolution TIFFs are large.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyOrderCookie, cookieName, fetchOrderFile } from '@/lib/downloads'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string; sku: string }> },
) {
  const { orderId, sku } = await params

  if (!verifyOrderCookie(orderId, req.cookies.get(cookieName(orderId))?.value)) {
    return new NextResponse(null, { status: 401 })
  }

  const upstream = await fetchOrderFile(orderId, sku)
  if (!upstream.ok || !upstream.body) {
    return new NextResponse(null, { status: upstream.status || 502 })
  }

  const headers: Record<string, string> = {
    'Content-Type': upstream.headers.get('Content-Type') ?? 'application/octet-stream',
    'Content-Disposition':
      upstream.headers.get('Content-Disposition') ?? `attachment; filename="${sku}"`,
    'Cache-Control': 'private, no-store',
  }
  // Forward the exact byte length so the browser knows when the download is
  // complete and closes the connection cleanly (otherwise the tab spinner
  // hangs after the last byte and errors with "couldn't connect").
  const len = upstream.headers.get('Content-Length')
  if (len) headers['Content-Length'] = len

  return new NextResponse(upstream.body, { status: 200, headers })
}
