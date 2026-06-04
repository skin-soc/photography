/**
 * Admin order management — look up download orders, re-send the link email, or
 * extend an order's expiry. Guarded by the admin session cookie (the /api/*
 * matcher is excluded from middleware), then proxied to the LAN origin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'
import { adminLookupOrders, adminResendOrder, adminExtendOrder } from '@/lib/downloads'

async function authed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ADMIN_COOKIE)?.value
  return verifySessionToken(token, process.env.ADMIN_PASSWORD ?? '')
}

export async function GET(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ error: 'missing query' }, { status: 400 })
  return NextResponse.json({ orders: await adminLookupOrders(q) })
}

export async function POST(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as {
    action?: 'resend' | 'extend'
    orderId?: string
    email?: string
  }
  const orderId = String(body.orderId ?? '')
  if (!orderId) return NextResponse.json({ error: 'missing orderId' }, { status: 400 })

  if (body.action === 'resend') {
    const ok = await adminResendOrder(orderId, body.email)
    return NextResponse.json({ ok }, { status: ok ? 200 : 502 })
  }
  if (body.action === 'extend') {
    const ok = await adminExtendOrder(orderId)
    return NextResponse.json({ ok }, { status: ok ? 200 : 502 })
  }
  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
