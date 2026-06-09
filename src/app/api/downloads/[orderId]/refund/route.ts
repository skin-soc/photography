/**
 * Customer: serve the refund credit-note PDF for an unlocked order. Gated by the
 * same proof-of-passcode cookie as the downloads page.
 */

import { NextRequest, NextResponse } from 'next/server'
import { fetchRefundPdf, cookieName, verifyOrderCookie } from '@/lib/downloads'

export async function GET(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  const cookie = req.cookies.get(cookieName(orderId))?.value
  if (!verifyOrderCookie(orderId, cookie)) {
    return NextResponse.json({ error: 'locked' }, { status: 403 })
  }
  const r = await fetchRefundPdf(orderId)
  if (!r) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return new NextResponse(r.bytes, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${r.filename}"`,
    },
  })
}
