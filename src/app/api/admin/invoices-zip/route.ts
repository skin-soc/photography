/**
 * Admin: accounting export — proxy a ZIP of all invoices between two dates in a
 * chosen language (Danish default / English) from the origin. Session-gated.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'
import { fetchInvoicesZip } from '@/lib/downloads'

export async function GET(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value
  if (!(await verifySessionToken(token, process.env.ADMIN_PASSWORD ?? ''))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') ?? ''
  const to = searchParams.get('to') ?? ''
  const lang = searchParams.get('lang') === 'en' ? 'en' : 'da'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'invalid from/to (use YYYY-MM-DD)' }, { status: 400 })
  }
  const result = await fetchInvoicesZip(from, to, lang)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return new NextResponse(result.bytes, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${result.filename}"`,
    },
  })
}
