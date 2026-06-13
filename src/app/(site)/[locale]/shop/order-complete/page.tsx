import type Stripe from 'stripe'
import { Link } from '@/i18n/navigation'
import { setRequestLocale } from 'next-intl/server'
import { stripe } from '@/lib/stripe-server'
import { resolveDownloadItems } from '@/lib/downloads'

type Params = Promise<{ locale: string }>
type SearchParams = Promise<{ session_id?: string }>

export default async function OrderComplete({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  const { locale } = await params
  const { session_id } = await searchParams
  setRequestLocale(locale)

  let session: Stripe.Checkout.Session | null = null
  if (session_id) {
    try {
      session = await stripe.checkout.sessions.retrieve(session_id)
    } catch {
      // retrieval failed — show generic error below
    }
  }

  const paid = session?.payment_status === 'paid'
  // Digital items rebuilt from the session's skus (the webhook issues the grant).
  const downloadItems = paid
    ? await resolveDownloadItems((session?.metadata?.skus ?? '').split(','))
    : []
  const hasPhysical = paid && session?.metadata?.hasPhysical === 'true'

  // Everything is keyed by our GMP order code, stored in session metadata, so the
  // downloads page lives at /shop/downloads/<orderCode>.
  const orderId = paid ? (session?.metadata?.orderCode ?? null) : null

  return (
    <main className="min-h-screen bg-bg text-foreground px-[6vw] pt-[calc(6vw+128px)] pb-32">
      <Link
        href="/shop"
        className="text-[10px] font-light tracking-[0.22em] uppercase text-foreground/35 hover:text-foreground/70 transition-colors"
      >
        ← Back to shop
      </Link>

      <div className="mt-16 max-w-lg">
        {paid ? (
          <>
            <p className="text-[9px] font-light tracking-[0.22em] uppercase text-[#931020] mb-2">
              Order confirmed
            </p>
            <h1 className="text-4xl font-mono-ibm font-[200] leading-tight tracking-tight text-foreground mb-6">
              Thank you.
            </h1>
            <p className="text-[14px] font-light text-foreground/50 leading-relaxed mb-8">
              {downloadItems.length > 0
                ? 'Your payment was received. We’ve emailed you a passcode — use it on the download page below to get your files.'
                : 'Your payment was received. A confirmation email is on its way.'}
            </p>

            {downloadItems.length > 0 && orderId && (
              <div className="rounded-[16px] border border-foreground/10 bg-foreground/[0.04] px-6 py-6 mb-8">
                <p className="text-[9px] font-light tracking-[0.22em] uppercase text-foreground/30 mb-3">
                  Digital downloads
                </p>
                <p className="text-[13px] font-light text-foreground/50 leading-relaxed mb-5">
                  {downloadItems.length === 1
                    ? '1 file is ready.'
                    : `${downloadItems.length} files are ready.`}{' '}
                  Your passcode was sent to your email. Links are valid for 30 days.
                </p>
                <Link
                  href={`/shop/downloads/${orderId}`}
                  className="inline-block text-[10px] font-light tracking-[0.22em] uppercase text-[#931020] hover:text-foreground transition-colors"
                >
                  Go to your downloads →
                </Link>
              </div>
            )}

            {hasPhysical && (
              <div className="rounded-[16px] border border-foreground/10 bg-foreground/[0.04] px-6 py-5 mb-8">
                <p className="text-[9px] font-light tracking-[0.22em] uppercase text-foreground/30 mb-2">
                  Shipping
                </p>
                <p className="text-[13px] font-light text-foreground/50 leading-relaxed">
                  Your print order is being prepared. You will receive a shipping confirmation once dispatched.
                </p>
              </div>
            )}

            <p className="text-[11px] font-light text-foreground/25 leading-relaxed">
              If you have any questions, use the contact form on this site.
            </p>
          </>
        ) : (
          <>
            <p className="text-[9px] font-light tracking-[0.22em] uppercase text-foreground/40 mb-2">
              Payment
            </p>
            <h1 className="text-4xl font-mono-ibm font-[200] leading-tight tracking-tight text-foreground mb-6">
              Something went wrong.
            </h1>
            <p className="text-[14px] font-light text-foreground/50 leading-relaxed mb-8">
              Your payment was not completed. No charge has been made. Please try again or
              contact us if the problem persists.
            </p>
            <Link
              href="/shop"
              className="text-[10px] font-light tracking-[0.22em] uppercase text-[#931020] hover:text-foreground transition-colors"
            >
              Return to shop →
            </Link>
          </>
        )}
      </div>
    </main>
  )
}
