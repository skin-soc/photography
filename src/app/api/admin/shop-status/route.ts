/**
 * Admin shop online/offline switch. Guarded by the admin session cookie (the
 * /api/* matcher is excluded from middleware). Persists to Cloudflare KV; the
 * site layout reads it to show/hide the SHOP link in the nav.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'
import { getShopOnline, setShopOnline } from '@/lib/shop-settings'

async function authed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ADMIN_COOKIE)?.value
  return verifySessionToken(token, process.env.ADMIN_PASSWORD ?? '')
}

export async function GET(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json({ online: await getShopOnline() })
}

export async function POST(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { online?: boolean }
  if (typeof body.online !== 'boolean') {
    return NextResponse.json({ error: 'missing online (boolean)' }, { status: 400 })
  }
  const ok = await setShopOnline(body.online)
  if (!ok) return NextResponse.json({ error: 'settings store unavailable' }, { status: 503 })
  return NextResponse.json({ ok: true, online: body.online })
}
