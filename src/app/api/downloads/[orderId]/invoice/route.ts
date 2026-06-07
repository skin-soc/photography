/**
 * Customer: serve the VAT invoice PDF for an unlocked order. Gated by the same
 * proof-of-passcode cookie that protects the downloads page — available even
 * after the download link expires (an invoice is a permanent record).
 */

import { NextRequest, NextResponse } from 'next/server'
import { fetchInvoicePdf, cookieName, verifyOrderCookie } from '@/lib/downloads'

export async function GET(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  const cookie = req.cookies.get(cookieName(orderId))?.value
  if (!verifyOrderCookie(orderId, cookie)) {
    return NextResponse.json({ error: 'locked' }, { status: 403 })
  }
  const inv = await fetchInvoicePdf(orderId)
  if (!inv) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return new NextResponse(inv.bytes, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${inv.filename}"`,
    },
  })
}
