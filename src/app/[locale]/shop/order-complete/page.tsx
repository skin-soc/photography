import Stripe from 'stripe'
import { Link } from '@/i18n/navigation'
import { setRequestLocale } from 'next-intl/server'

type Params = Promise<{ locale: string }>
type SearchParams = Promise<{
  payment_intent?: string
  payment_intent_client_secret?: string
  redirect_status?: string
}>

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export default async function OrderComplete({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  const { locale } = await params
  const { payment_intent_client_secret, redirect_status } = await searchParams
  setRequestLocale(locale)

  let intent: Stripe.PaymentIntent | null = null
  if (payment_intent_client_secret) {
    try {
      intent = await stripe.paymentIntents.retrieve(
        payment_intent_client_secret.split('_secret_')[0],
      )
    } catch {
      // retrieving failed — show generic error below
    }
  }

  const succeeded = redirect_status === 'succeeded' && intent?.status === 'succeeded'
  const token = intent?.metadata?.downloadToken
  const photoSlug = intent?.metadata?.photoSlug
  const productLabel = intent?.metadata?.productLabel
  const format = intent?.metadata?.format ?? 'jpeg'
  const photoTitle = photoSlug ?? ''

  return (
    <main className="min-h-screen bg-black text-white px-[6vw] pt-[calc(6vw+128px)] pb-32">
      <Link
        href="/shop"
        className="text-[10px] font-light tracking-[0.22em] uppercase text-white/35 hover:text-white/70 transition-colors"
      >
        ← Back to shop
      </Link>

      <div className="mt-16 max-w-lg">
        {succeeded ? (
          <>
            <p className="text-[9px] font-light tracking-[0.22em] uppercase text-accent mb-2">
              Order confirmed
            </p>
            <h1 className="text-4xl font-mono-ibm font-[200] leading-tight tracking-tight text-white mb-6">
              Thank you.
            </h1>
            <p className="text-[14px] font-light text-white/50 leading-relaxed mb-8">
              Your payment was received. Your digital download will be prepared shortly.
              Keep this page — your file reference is below.
            </p>

            {token && (
              <div className="rounded-[16px] border border-white/10 bg-white/[0.04] p-6">
                <p className="text-[9px] font-light tracking-[0.22em] uppercase text-white/30 mb-3">
                  File reference
                </p>
                <p className="font-mono-ibm text-[22px] font-[200] tracking-wide text-accent mb-1">
                  {token}.{format === 'tiff' ? 'tiff' : 'jpg'}
                </p>
                {productLabel && (
                  <p className="text-[11px] font-light tracking-wide text-white/30 mt-1">
                    {productLabel} — {format === 'tiff' ? '16-bit TIFF' : 'JPEG'}
                  </p>
                )}
                <p className="mt-4 text-[11px] font-light text-white/25 leading-relaxed">
                  A confirmation email is on its way. If you have any questions, reply to that email
                  or use the contact form on this site.
                </p>
              </div>
            )}

            {photoSlug && (
              <Link
                href={`/shop/${photoSlug}`}
                className="mt-8 inline-block text-[10px] font-light tracking-[0.22em] uppercase text-white/35 hover:text-white/70 transition-colors"
              >
                ← Back to {photoTitle}
              </Link>
            )}
          </>
        ) : (
          <>
            <p className="text-[9px] font-light tracking-[0.22em] uppercase text-white/40 mb-2">
              Payment
            </p>
            <h1 className="text-4xl font-mono-ibm font-[200] leading-tight tracking-tight text-white mb-6">
              Something went wrong.
            </h1>
            <p className="text-[14px] font-light text-white/50 leading-relaxed mb-8">
              Your payment was not completed. No charge has been made. Please try again or
              contact us if the problem persists.
            </p>
            <Link
              href="/shop"
              className="text-[10px] font-light tracking-[0.22em] uppercase text-accent hover:text-white transition-colors"
            >
              Return to shop →
            </Link>
          </>
        )}
      </div>
    </main>
  )
}
