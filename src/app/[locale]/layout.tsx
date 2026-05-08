import type { Metadata } from 'next'
import { Cormorant_Garamond } from 'next/font/google'
import { NextIntlClientProvider, hasLocale } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import Nav from '../components/Nav'
import { routing } from '@/i18n/routing'
import {
  SITE_URL,
  PHOTOGRAPHER_NAME,
  BUSINESS_NAME,
  OG_LOCALE_MAP,
  buildLanguagesMap,
  buildStructuredData,
  getKeywords,
} from '@/i18n/seo'
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
  const canonical =
    locale === routing.defaultLocale ? SITE_URL : `${SITE_URL}/${locale}`
  const heroImage = `${SITE_URL}/images/gallery/PL00003.webp`

  const alternateLocales = Object.entries(OG_LOCALE_MAP)
    .filter(([l]) => l !== locale)
    .map(([, og]) => og)

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: title,
      template: `%s | ${BUSINESS_NAME}`,
    },
    description,
    keywords: getKeywords(locale),
    authors: [{ name: PHOTOGRAPHER_NAME, url: SITE_URL }],
    creator: PHOTOGRAPHER_NAME,
    publisher: BUSINESS_NAME,
    applicationName: BUSINESS_NAME,
    category: 'photography',
    alternates: {
      canonical,
      languages: buildLanguagesMap('/'),
    },
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
      url: canonical,
      siteName: BUSINESS_NAME,
      locale: OG_LOCALE_MAP[locale] ?? 'en_GB',
      alternateLocale: alternateLocales,
      type: 'website',
      images: [
        {
          url: heroImage,
          width: 3200,
          height: 1800,
          alt: `${PHOTOGRAPHER_NAME} — Photographer in Copenhagen & London`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [heroImage],
      creator: '@gusmcewan',
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    },
    formatDetection: { telephone: false, address: false, email: false },
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

  const jsonLd = buildStructuredData(locale)

  return (
    <html lang={locale} dir={RTL_LOCALES.has(locale) ? 'rtl' : 'ltr'} className={cormorant.variable}>
      <body className="bg-black text-white antialiased">
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <NextIntlClientProvider>
          <Nav />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
