/** Live pre-render progress (posters + mockups) for the admin page. Session-gated;
 *  proxies the origin's in-memory batch progress. */
import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'
import { adminRenderProgress } from '@/lib/downloads'

export async function GET(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value
  if (!verifySessionToken(token, process.env.ADMIN_PASSWORD ?? '')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const progress = await adminRenderProgress()
  if (!progress) return NextResponse.json({ error: 'origin unavailable' }, { status: 502 })
  return NextResponse.json(progress)
}
