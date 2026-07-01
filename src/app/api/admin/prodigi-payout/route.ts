/**
 * Trigger the no-float funding check (or run it on demand from the admin
 * dashboard). See src/lib/prodigi-payout.ts for the full flow.
 *
 * Auth: either an admin session cookie (manual run) OR an `x-cron-secret`
 * header matching CRON_SECRET (the scheduled prodigi-cron Worker) — same
 * pattern as /api/admin/prodigi-validate.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'
import { checkAndFundPendingOrders } from '@/lib/prodigi-payout'

async function authorized(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET
  const provided = req.headers.get('x-cron-secret')
  if (cronSecret && provided && provided === cronSecret) return true
  const token = req.cookies.get(ADMIN_COOKIE)?.value
  return verifySessionToken(token, process.env.ADMIN_PASSWORD ?? '')
}

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const results = await checkAndFundPendingOrders()
  const funded = results.filter((r) => r.action === 'paid-out-and-submitted').length
  const failed = results.filter((r) => r.action === 'payout-failed' || r.action === 'submit-failed').length
  console.log(`[prodigi-payout] checked ${results.length} order(s), ${funded} funded, ${failed} failed`)
  return NextResponse.json({ results })
}
