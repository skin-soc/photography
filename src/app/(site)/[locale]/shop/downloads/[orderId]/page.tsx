import { cookies } from 'next/headers'
import { Link } from '@/i18n/navigation'
import { setRequestLocale } from 'next-intl/server'
import { getOrderMeta, verifyOrderCookie, cookieName } from '@/lib/downloads'
import DownloadsClient from './DownloadsClient'

type Params = Promise<{ locale: string; orderId: string }>

export const dynamic = 'force-dynamic'

export default async function DownloadsPage({ params }: { params: Params }) {
  const { locale, orderId } = await params
  setRequestLocale(locale)

  const meta = await getOrderMeta(orderId)

  const cookieStore = await cookies()
  const unlocked = meta
    ? verifyOrderCookie(orderId, cookieStore.get(cookieName(orderId))?.value)
    : false

  const expiry = meta
    ? new Date(meta.expiresAt).toLocaleDateString(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null

  return (
    <main className="min-h-screen bg-black text-white px-[6vw] pt-[calc(6vw+128px)] pb-32">
      <Link
        href="/shop"
        className="text-[10px] font-light tracking-[0.22em] uppercase text-white/35 hover:text-white/70 transition-colors"
      >
        ← Back to shop
      </Link>

      <div className="mt-16 max-w-lg">
        {meta ? (
          <>
            <p className="text-[9px] font-light tracking-[0.22em] uppercase text-[#931020] mb-2">
              Your downloads
            </p>
            <h1 className="text-4xl font-mono-ibm font-[200] leading-tight tracking-tight text-white mb-6">
              Download your files.
            </h1>
            <p className="text-[14px] font-light text-white/50 leading-relaxed mb-10">
              Each file is licensed to you and carries embedded copyright. This link is
              valid until {expiry}.
            </p>

            <DownloadsClient orderId={orderId} items={meta.items} initiallyUnlocked={unlocked} />

            <p className="mt-12 text-[11px] font-light text-white/25 leading-relaxed">
              If a download fails or your link has expired, use the contact form on this
              site and we&rsquo;ll sort it out.
            </p>
          </>
        ) : (
          <>
            <p className="text-[9px] font-light tracking-[0.22em] uppercase text-white/40 mb-2">
              Downloads
            </p>
            <h1 className="text-4xl font-mono-ibm font-[200] leading-tight tracking-tight text-white mb-6">
              Link not available.
            </h1>
            <p className="text-[14px] font-light text-white/50 leading-relaxed mb-8">
              This download link is invalid or has expired. Download links are valid for
              30 days after purchase. If you need access again, please use the contact
              form on this site.
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
