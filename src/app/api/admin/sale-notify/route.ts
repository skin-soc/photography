/**
 * Admin sale-notification settings — whether to email the owner on each real
 * (live) sale, and where. Session-gated; persisted to Cloudflare KV.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'
import { getSaleNotify, setSaleNotify } from '@/lib/shop-settings'

async function authed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ADMIN_COOKIE)?.value
  return verifySessionToken(token, process.env.ADMIN_PASSWORD ?? '')
}

export async function GET(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json(await getSaleNotify())
}

export async function POST(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { enabled?: boolean; email?: string }
  const enabled = body.enabled === true
  const email = String(body.email ?? '').trim()
  if (enabled && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'a valid notification email is required' }, { status: 400 })
  }
  const ok = await setSaleNotify({ enabled, email })
  if (!ok) return NextResponse.json({ error: 'settings store unavailable' }, { status: 503 })
  return NextResponse.json({ ok: true, enabled, email })
}
