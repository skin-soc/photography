/**
 * Admin site theme — read/update the global appearance preference
 * (auto / light / dark). The root layout reads this server-side and stamps the
 * matching class on <html>. Session-gated.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'
import { getThemePref, setThemePref, type ThemePref } from '@/lib/shop-settings'

async function authed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ADMIN_COOKIE)?.value
  return verifySessionToken(token, process.env.ADMIN_PASSWORD ?? '')
}

const VALID: ThemePref[] = ['auto', 'light', 'dark']

export async function GET(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json({ theme: await getThemePref() })
}

export async function POST(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { theme?: string }
  const theme = body.theme as ThemePref
  if (!VALID.includes(theme)) {
    return NextResponse.json({ error: 'theme must be auto | light | dark' }, { status: 400 })
  }
  const ok = await setThemePref(theme)
  return NextResponse.json({ ok, theme }, { status: ok ? 200 : 502 })
}
