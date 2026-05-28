import { loadStripe } from '@stripe/stripe-js'

// Singleton — created once, reused across the session.
export const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''
)
