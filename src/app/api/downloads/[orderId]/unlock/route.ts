/**
 * Unlock a download order with its passcode.
 *
 * Forwards the passcode to the LAN origin for verification. On success, sets an
 * httpOnly, signed cookie proving this browser unlocked this order — the
 * file-download route checks it. Grant expiry is enforced origin-side.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyPasscode, signOrder, cookieName } from '@/lib/downloads'

const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 // 30 days, matches the grant TTL

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params
  const body = (await req.json().catch(() => ({}))) as { passcode?: string }
  const passcode = String(body.passcode ?? '').trim()

  if (!passcode) {
    return NextResponse.json({ error: 'missing passcode' }, { status: 400 })
  }

  const ok = await verifyPasscode(orderId, passcode)
  if (!ok) {
    return NextResponse.json({ error: 'invalid passcode' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(cookieName(orderId), signOrder(orderId), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })
  return res
}
