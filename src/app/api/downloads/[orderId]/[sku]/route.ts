/**
 * Authorise a download, then redirect to a signed direct-origin URL.
 *
 * Gated by the signed proof-of-passcode cookie set by the unlock route. We do
 * NOT stream the file through the Worker — full-resolution masters are far too
 * large for the Worker's CPU budget and would be killed mid-transfer (broken
 * downloads + the worker tripping "Exceeded CPU Time Limits"). Instead we mint
 * a short-lived signed URL and 302 the browser straight to the origin, which
 * streams the file directly over the Cloudflare tunnel.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyOrderCookie, cookieName, signedFileUrl } from '@/lib/downloads'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string; sku: string }> },
) {
  const { orderId, sku } = await params

  if (!verifyOrderCookie(orderId, req.cookies.get(cookieName(orderId))?.value)) {
    return new NextResponse(null, { status: 401 })
  }

  const url = signedFileUrl(orderId, sku)
  if (!url) return new NextResponse(null, { status: 503 })

  // 302 + no-store so the browser always re-mints a fresh (unexpired) URL.
  return NextResponse.redirect(url, {
    status: 302,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
