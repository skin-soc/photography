/** Admin — list active Stripe Tax registrations (where the shop collects tax).
 *  Session-gated; read-only. Mode follows the secret key (test on preview). */
import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'
import { stripe } from '@/lib/stripe-server'

async function authed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ADMIN_COOKIE)?.value
  return verifySessionToken(token, process.env.ADMIN_PASSWORD ?? '')
}

export async function GET(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const list = await stripe.tax.registrations.list({ limit: 100 })
    const registrations = list.data.map((r) => ({
      id: r.id,
      country: r.country,
      status: r.status,
      livemode: r.livemode,
      activeFrom: r.active_from ?? null,
    }))
    return NextResponse.json({ registrations })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
