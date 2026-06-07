/**
 * Admin maintenance — delete all TEST-mode orders from the origin store.
 * Session-gated (the /api/* matcher is excluded from middleware).
 */

import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'
import { adminDeleteTestOrders } from '@/lib/downloads'

async function authed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ADMIN_COOKIE)?.value
  return verifySessionToken(token, process.env.ADMIN_PASSWORD ?? '')
}

export async function POST(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const result = await adminDeleteTestOrders()
  if (!result) return NextResponse.json({ ok: false, error: 'origin unavailable' }, { status: 502 })
  return NextResponse.json({ ok: true, deleted: result.deleted })
}
