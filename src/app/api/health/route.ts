// Lightweight liveness probe. Has no upstream (NAS / Stripe) dependency, so it
// answers instantly whenever the worker itself is reachable. The navigation
// overlay uses it to tell "slow but alive" apart from "server down".
export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({ ok: true }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
