/**
 * Admin GMP lookup — reverse-resolves a typed code to its photo.
 * Guarded in-handler (the /api/* matcher is excluded from middleware).
 */

import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'
import { lookupByReference, fetchAssetInfo } from '@/lib/shop'

export async function GET(request: NextRequest) {
  const token = request.cookies.get(ADMIN_COOKIE)?.value
  const ok = await verifySessionToken(token, process.env.ADMIN_PASSWORD ?? '')
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ error: 'missing query' }, { status: 400 })

  const result = await lookupByReference(q)
  if (!result) return NextResponse.json({ found: false })

  // Which posters are pre-rendered + which masters exist (origin filesystem).
  const assets = await fetchAssetInfo(result.filename)

  return NextResponse.json({ found: true, result, assets })
}
