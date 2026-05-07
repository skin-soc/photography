import type { Metadata } from 'next'
import { Cormorant_Garamond } from 'next/font/google'
import { NextIntlClientProvider, hasLocale } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import Nav from '../components/Nav'
import { routing } from '@/i18n/routing'
import '../globals.css'

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
})

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

const ogLocaleMap: Record<string, string> = {
  en: 'en_GB',
  da: 'da_DK',
  sv: 'sv_SE',
  nb: 'nb_NO',
  fi: 'fi_FI',
  de: 'de_DE',
  nl: 'nl_NL',
  fr: 'fr_FR',
  es: 'es_ES',
  pt: 'pt_PT',
  it: 'it_IT',
  pl: 'pl_PL',
  ru: 'ru_RU',
  zh: 'zh_CN',
  ja: 'ja_JP',
  ko: 'ko_KR',
  ar: 'ar_AE',
}

const RTL_LOCALES = new Set(['ar'])

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'site' })
  const title = t('title')
  const description = t('description')

  return {
    title,
    description,
    icons: {
      icon: [
        { url: '/images/favicon.svg', type: 'image/svg+xml', sizes: 'any' },
        { url: '/images/favicon.ico', sizes: '32x32' },
      ],
      apple: '/images/apple-touch-icon.png',
    },
    openGraph: {
      title,
      description,
      url: 'https://gusmcewan.com',
      siteName: 'Gus McEwan Photography',
      locale: ogLocaleMap[locale] ?? 'en_GB',
      type: 'website',
      images: [
        {
          url: 'https://gusmcewan.com/images/gallery/PL00003.webp',
          width: 3200,
          height: 1800,
          alt: 'Gus McEwan Photography',
        },
      ],
    },
  }
}

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }
  setRequestLocale(locale)

  return (
    <html lang={locale} dir={RTL_LOCALES.has(locale) ? 'rtl' : 'ltr'} className={cormorant.variable}>
      <body className="bg-black text-white antialiased">
        <NextIntlClientProvider>
          <Nav />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
