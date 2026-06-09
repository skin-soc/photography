/**
 * Admin: serve an order's standalone licence (Terms) PDF (proxied from the
 * origin). Session-gated.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'
import { fetchLicensePdf } from '@/lib/downloads'

export async function GET(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value
  if (!(await verifySessionToken(token, process.env.ADMIN_PASSWORD ?? ''))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { orderId } = await params
  const lic = await fetchLicensePdf(orderId)
  if (!lic) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return new NextResponse(lic.bytes, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${lic.filename}"`,
    },
  })
}
