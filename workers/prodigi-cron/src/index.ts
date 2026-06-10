/**
 * Scheduled trigger for the daily Prodigi validation. Calls the main app's
 * POST /api/admin/prodigi-validate with the shared CRON_SECRET; that route does
 * the Prodigi probing, KV snapshot/diff, and emails the owner on any change.
 *
 * Also exposes fetch() so you can trigger a run manually for testing:
 *   https://prodigi-cron.<acct>.workers.dev/?key=<CRON_SECRET>
 */

interface Env {
  VALIDATE_URL: string
  CRON_SECRET: string
  /** Service binding to the main app worker (calls cross-worker on one account
   *  must use a binding, not a public fetch — Cloudflare error 1042). */
  MAIN: { fetch(input: string, init?: RequestInit): Promise<Response> }
}

async function runValidation(env: Env): Promise<Response> {
  return env.MAIN.fetch(env.VALIDATE_URL, {
    method: 'POST',
    headers: { 'x-cron-secret': env.CRON_SECRET },
  })
}

export default {
  async scheduled(_event: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    ctx.waitUntil(
      (async () => {
        try {
          const res = await runValidation(env)
          console.log('[prodigi-cron] validate ->', res.status, (await res.text()).slice(0, 500))
        } catch (err) {
          console.error('[prodigi-cron] failed:', err)
        }
      })(),
    )
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const key = new URL(req.url).searchParams.get('key')
    if (!env.CRON_SECRET || key !== env.CRON_SECRET) {
      return new Response('unauthorized', { status: 401 })
    }
    const res = await runValidation(env)
    return new Response(await res.text(), {
      status: res.status,
      headers: { 'content-type': 'application/json' },
    })
  },
}
