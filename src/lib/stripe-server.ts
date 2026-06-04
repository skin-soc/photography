import Stripe from 'stripe'

// The Cloudflare Workers runtime has no Node `http`/`https` modules, so the
// Stripe SDK's default HTTP client hangs/fails there. Using the fetch-based
// client makes the SDK work on Workers (and is harmless under Node dev).
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  httpClient: Stripe.createFetchHttpClient(),
})

// Web Crypto signature verification is async — required for webhook
// verification on Workers (the sync `constructEvent` uses Node crypto).
export const cryptoProvider = Stripe.createSubtleCryptoProvider()
