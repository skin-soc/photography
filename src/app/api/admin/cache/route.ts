/** Admin cache controls — warm previews, clear deliverables, refresh catalog.
 *  Session-gated. */
import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'
import { adminWarmPreviews, adminClearFulfilCache } from '@/lib/downloads'

async function authed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ADMIN_COOKIE)?.value
  return verifySessionToken(token, process.env.ADMIN_PASSWORD ?? '')
}

export async function POST(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { action?: string }

  if (body.action === 'refresh-catalog') {
    revalidateTag('catalog')
    return NextResponse.json({ ok: true })
  }
  if (body.action === 'warm-previews') {
    const ok = await adminWarmPreviews()
    return NextResponse.json({ ok }, { status: ok ? 200 : 502 })
  }
  if (body.action === 'clear-fulfil') {
    const result = await adminClearFulfilCache()
    if (!result) return NextResponse.json({ ok: false, error: 'origin unavailable' }, { status: 502 })
    return NextResponse.json({ ok: true, deleted: result.deleted })
  }
  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
