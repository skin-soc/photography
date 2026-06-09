/**
 * Customer: serve the standalone licensing Terms (licence) PDF for an unlocked
 * order. Gated by the same proof-of-passcode cookie as the downloads page —
 * available even after the download link expires (a permanent record).
 */

import { NextRequest, NextResponse } from 'next/server'
import { fetchLicensePdf, cookieName, verifyOrderCookie } from '@/lib/downloads'

export async function GET(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  const cookie = req.cookies.get(cookieName(orderId))?.value
  if (!verifyOrderCookie(orderId, cookie)) {
    return NextResponse.json({ error: 'locked' }, { status: 403 })
  }
  const lic = await fetchLicensePdf(orderId)
  if (!lic) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return new NextResponse(lic.bytes, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${lic.filename}"`,
    },
  })
}
