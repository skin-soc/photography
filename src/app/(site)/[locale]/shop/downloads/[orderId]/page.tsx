import { cookies } from 'next/headers'
import { Link } from '@/i18n/navigation'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { getOrderMeta, verifyOrderCookie, cookieName } from '@/lib/downloads'
import DownloadsClient from './DownloadsClient'
import DownloadsHelp from './DownloadsHelp'

type Params = Promise<{ locale: string; orderId: string }>

export const dynamic = 'force-dynamic'

export default async function DownloadsPage({ params }: { params: Params }) {
  const { locale, orderId } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'downloads' })

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
        ← {t('returnToShop')}
      </Link>

      <div className="mt-16 max-w-lg">
        {meta ? (
          <>
            <p className="text-[9px] font-light tracking-[0.22em] uppercase text-[#931020] mb-2">
              {t('eyebrow')}
            </p>
            <h1 className="text-4xl font-mono-ibm font-[200] leading-tight tracking-tight text-white mb-6">
              {t('heading')}
            </h1>
            <p className="text-[14px] font-light text-white/50 leading-relaxed mb-10">
              {t('intro', { date: expiry ?? '' })}
            </p>

            <DownloadsClient orderId={orderId} items={meta.items} initiallyUnlocked={unlocked} />

            <DownloadsHelp orderId={orderId} />
          </>
        ) : (
          <>
            <p className="text-[9px] font-light tracking-[0.22em] uppercase text-white/40 mb-2">
              {t('unavailableEyebrow')}
            </p>
            <h1 className="text-4xl font-mono-ibm font-[200] leading-tight tracking-tight text-white mb-6">
              {t('unavailableHeading')}
            </h1>
            <p className="text-[14px] font-light text-white/50 leading-relaxed mb-8">
              {t('unavailableBody')}
            </p>
            <Link
              href="/shop"
              className="text-[10px] font-light tracking-[0.22em] uppercase text-[#931020] hover:text-white transition-colors"
            >
              {t('returnToShop')} →
            </Link>
          </>
        )}
      </div>
    </main>
  )
}
