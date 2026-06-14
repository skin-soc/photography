/**
 * Admin asset audit — reconcile the masters + poster-asset folders against the
 * catalog. GET returns the report (missing masters, orphan masters, orphan poster
 * assets); POST { scope } prunes the orphans of that scope. Session-gated, proxies
 * the origin.
 */
import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'
import { adminAssetAudit, adminAssetPrune } from '@/lib/downloads'

async function authed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ADMIN_COOKIE)?.value
  return verifySessionToken(token, process.env.ADMIN_PASSWORD ?? '')
}

export async function GET(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const audit = await adminAssetAudit()
  if (!audit) return NextResponse.json({ error: 'origin unavailable' }, { status: 502 })
  return NextResponse.json(audit)
}

export async function POST(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { scope?: string }
  if (body.scope !== 'poster-assets' && body.scope !== 'masters') {
    return NextResponse.json({ error: 'bad scope' }, { status: 400 })
  }
  const result = await adminAssetPrune(body.scope)
  if (!result) return NextResponse.json({ error: 'origin unavailable' }, { status: 502 })
  return NextResponse.json(result)
}
