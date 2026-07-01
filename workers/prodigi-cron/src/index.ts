/**
 * Two scheduled jobs, both calling the main app with the shared CRON_SECRET:
 *   - "10 6 * * *"    -> POST /api/admin/prodigi-validate (daily catalogue check)
 *   - "*\/15 * * * *" -> POST /api/admin/prodigi-payout   (no-float funding check)
 * event.cron tells scheduled() which trigger fired.
 *
 * Also exposes fetch() so you can trigger either manually for testing:
 *   https://prodigi-cron.<acct>.workers.dev/?key=<CRON_SECRET>&job=validate
 *   https://prodigi-cron.<acct>.workers.dev/?key=<CRON_SECRET>&job=payout
 */

interface Env {
  VALIDATE_URL: string
  PAYOUT_URL: string
  CRON_SECRET: string
  /** Service binding to the main app worker (calls cross-worker on one account
   *  must use a binding, not a public fetch — Cloudflare error 1042). */
  MAIN: { fetch(input: string, init?: RequestInit): Promise<Response> }
}

async function call(env: Env, url: string): Promise<Response> {
  return env.MAIN.fetch(url, {
    method: 'POST',
    headers: { 'x-cron-secret': env.CRON_SECRET },
  })
}

const DAILY_VALIDATE_CRON = '10 6 * * *'

export default {
  async scheduled(event: { cron: string }, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    const isValidate = event.cron === DAILY_VALIDATE_CRON
    const [label, url] = isValidate ? ['validate', env.VALIDATE_URL] : ['payout', env.PAYOUT_URL]
    ctx.waitUntil(
      (async () => {
        try {
          const res = await call(env, url)
          console.log(`[prodigi-cron] ${label} ->`, res.status, (await res.text()).slice(0, 500))
        } catch (err) {
          console.error(`[prodigi-cron] ${label} failed:`, err)
        }
      })(),
    )
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const u = new URL(req.url)
    const key = u.searchParams.get('key')
    if (!env.CRON_SECRET || key !== env.CRON_SECRET) {
      return new Response('unauthorized', { status: 401 })
    }
    const job = u.searchParams.get('job') === 'payout' ? 'payout' : 'validate'
    const res = await call(env, job === 'payout' ? env.PAYOUT_URL : env.VALIDATE_URL)
    return new Response(await res.text(), {
      status: res.status,
      headers: { 'content-type': 'application/json' },
    })
  },
}
