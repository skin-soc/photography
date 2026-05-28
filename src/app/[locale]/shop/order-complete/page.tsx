import Stripe from 'stripe'
import { Link } from '@/i18n/navigation'
import { setRequestLocale } from 'next-intl/server'

type Params = Promise<{ locale: string }>
type SearchParams = Promise<{ session_id?: string }>

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

interface DownloadItem {
  token: string
  format: 'jpeg' | 'tiff'
  label: string
  slug: string
}

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
  const downloadItems: DownloadItem[] = (() => {
    try {
      return paid && session?.metadata?.downloadItems
        ? (JSON.parse(session.metadata.downloadItems) as DownloadItem[])
        : []
    } catch {
      return []
    }
  })()
  const hasPhysical = paid && session?.metadata?.hasPhysical === 'true'

  return (
    <main className="min-h-screen bg-black text-white px-[6vw] pt-[calc(6vw+128px)] pb-32">
      <Link
        href="/shop"
        className="text-[10px] font-light tracking-[0.22em] uppercase text-white/35 hover:text-white/70 transition-colors"
      >
        ← Back to shop
      </Link>

      <div className="mt-16 max-w-lg">
        {paid ? (
          <>
            <p className="text-[9px] font-light tracking-[0.22em] uppercase text-[#931020] mb-2">
              Order confirmed
            </p>
            <h1 className="text-4xl font-mono-ibm font-[200] leading-tight tracking-tight text-white mb-6">
              Thank you.
            </h1>
            <p className="text-[14px] font-light text-white/50 leading-relaxed mb-8">
              {downloadItems.length > 0
                ? 'Your payment was received. Your digital download references are below — a confirmation email is on its way.'
                : 'Your payment was received. A confirmation email is on its way.'}
            </p>

            {downloadItems.length > 0 && (
              <div className="space-y-3 mb-8">
                <p className="text-[9px] font-light tracking-[0.22em] uppercase text-white/30 mb-4">
                  File references
                </p>
                {downloadItems.map((item) => (
                  <div
                    key={item.token}
                    className="rounded-[16px] border border-white/10 bg-white/[0.04] px-6 py-5"
                  >
                    <p className="font-mono-ibm text-[20px] font-[200] tracking-wide text-[#931020]">
                      {item.token}.{item.format === 'tiff' ? 'tiff' : 'jpg'}
                    </p>
                    <p className="mt-1 text-[11px] font-light tracking-wide text-white/30">
                      {item.label} — {item.format === 'tiff' ? '16-bit TIFF' : 'JPEG'}
                    </p>
                    <Link
                      href={`/shop/${item.slug}`}
                      className="mt-2 inline-block text-[10px] font-light tracking-[0.18em] uppercase text-white/25 hover:text-white/55 transition-colors"
                    >
                      View photo →
                    </Link>
                  </div>
                ))}
              </div>
            )}

            {hasPhysical && (
              <div className="rounded-[16px] border border-white/10 bg-white/[0.04] px-6 py-5 mb-8">
                <p className="text-[9px] font-light tracking-[0.22em] uppercase text-white/30 mb-2">
                  Shipping
                </p>
                <p className="text-[13px] font-light text-white/50 leading-relaxed">
                  Your print order is being prepared. You will receive a shipping confirmation once dispatched.
                </p>
              </div>
            )}

            <p className="text-[11px] font-light text-white/25 leading-relaxed">
              If you have any questions, use the contact form on this site.
            </p>
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
              className="text-[10px] font-light tracking-[0.22em] uppercase text-[#931020] hover:text-white transition-colors"
            >
              Return to shop →
            </Link>
          </>
        )}
      </div>
    </main>
  )
}
