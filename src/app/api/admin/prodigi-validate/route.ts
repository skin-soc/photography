/**
 * Run the daily Prodigi validation (or trigger it on demand).
 *
 * Auth: either an admin session cookie (manual run from the dashboard) OR an
 * `x-cron-secret` header matching CRON_SECRET (the scheduled cron worker). On any
 * detected change it emails the owner. Returns the full report.
 *
 * GET returns the last stored snapshot without re-probing Prodigi.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'
import { validateRange, lastValidation } from '@/lib/prodigi-validate'
import { getSaleNotify } from '@/lib/shop-settings'
import { notifyOwnerChange } from '@/lib/downloads'

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
  const report = await validateRange()

  if (report.changes.length > 0) {
    try {
      const notify = await getSaleNotify()
      if (notify.email) {
        await notifyOwnerChange({ to: notify.email, changes: report.changes })
      }
    } catch (err) {
      console.error('[prodigi-validate] change email failed (non-fatal):', err)
    }
  }
  console.log(`[prodigi-validate] checked ${report.items.length} SKUs, ${report.changes.length} change(s)`)
  return NextResponse.json(report)
}

export async function GET(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return NextResponse.json(await lastValidation())
}
