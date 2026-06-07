import Stripe from 'stripe'

// Lazily construct the Stripe client so importing this module never requires the
// secret key. `next build` evaluates every route module at build time, where the
// key is absent (it's a runtime-only Worker secret, not a build var) — eager
// construction would throw "Neither apiKey nor config.authenticator provided"
// and fail the production build. The Proxy defers construction to first use (at
// request time), keeping all `stripe.x.y()` call sites unchanged.
//
// The Cloudflare Workers runtime has no Node `http`/`https` modules, so the
// Stripe SDK's default HTTP client hangs/fails there; the fetch-based client
// makes the SDK work on Workers (and is harmless under Node dev).
let _stripe: Stripe | null = null
function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      httpClient: Stripe.createFetchHttpClient(),
    })
  }
  return _stripe
}

export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const client = getStripe() as unknown as Record<string | symbol, unknown>
    const value = client[prop]
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(client)
      : value
  },
})

// Web Crypto signature verification is async — required for webhook
// verification on Workers (the sync `constructEvent` uses Node crypto). No key
// needed, so it's safe to construct eagerly at module load.
export const cryptoProvider = Stripe.createSubtleCryptoProvider()
