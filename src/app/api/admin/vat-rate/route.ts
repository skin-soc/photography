/**
 * Admin VAT rate — read/update the manual Danish VAT percentage applied at
 * checkout to DK + EU buyers (non-EU buyers are charged 0%). Stripe Tax is off;
 * we calculate VAT ourselves. Session-gated. See [[vat]].
 */

import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'
import { getVatRate, setVatRate } from '@/lib/shop-settings'

async function authed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ADMIN_COOKIE)?.value
  return verifySessionToken(token, process.env.ADMIN_PASSWORD ?? '')
}

export async function GET(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json({ rate: await getVatRate() })
}

export async function POST(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { rate?: number }
  const rate = Number(body.rate)
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    return NextResponse.json({ error: 'rate must be 0–100' }, { status: 400 })
  }
  const ok = await setVatRate(rate)
  return NextResponse.json({ ok, rate }, { status: ok ? 200 : 502 })
}
