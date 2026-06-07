/** Admin preferences (Cloudflare KV). Session-gated. */
import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'
import { getRefundUndownloadedDefault, setRefundUndownloadedDefault } from '@/lib/shop-settings'

async function authed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ADMIN_COOKIE)?.value
  return verifySessionToken(token, process.env.ADMIN_PASSWORD ?? '')
}

export async function GET(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json({ refundUndownloadedDefault: await getRefundUndownloadedDefault() })
}

export async function POST(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { refundUndownloadedDefault?: boolean }
  if (typeof body.refundUndownloadedDefault === 'boolean') {
    await setRefundUndownloadedDefault(body.refundUndownloadedDefault)
  }
  return NextResponse.json({ ok: true, refundUndownloadedDefault: await getRefundUndownloadedDefault() })
}
