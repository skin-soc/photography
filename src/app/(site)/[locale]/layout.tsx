import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, Space_Mono } from 'next/font/google'
import { NextIntlClientProvider, hasLocale } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import Nav from '@/app/components/Nav'
import NavigationOverlay from '@/app/components/NavigationOverlay'
import CartDrawerPortal from '@/app/components/CartDrawerPortal'
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
import { getShopOnline, getThemePref } from '@/lib/shop-settings'
import '@/app/globals.css'

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['200', '300', '400'],
  variable: '--font-mono-ibm',
  display: 'swap',
})

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-mono-space',
  display: 'swap',
})

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

const RTL_LOCALES = new Set(['ar'])

/** Browser-chrome colour follows the global theme. Forced light/dark get a fixed
 *  colour; auto matches the visitor's OS. */
export async function generateViewport(): Promise<Viewport> {
  const theme = await getThemePref()
  if (theme === 'light') return { themeColor: '#ffffff' }
  if (theme === 'dark') return { themeColor: '#000000' }
  return {
    themeColor: [
      { media: '(prefers-color-scheme: dark)', color: '#000000' },
      { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    ],
  }
}

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
  const shopOnline = await getShopOnline()
  // Global appearance: stamp the theme class on <html> server-side so there's no
  // flash and no client script. `auto` follows the OS via CSS (.theme-auto).
  const theme = await getThemePref()
  const themeClass = theme === 'auto' ? 'theme-auto' : theme

  return (
    <html lang={locale} dir={RTL_LOCALES.has(locale) ? 'rtl' : 'ltr'} className={`${themeClass} ${ibmPlexMono.variable} ${spaceMono.variable}`}>
      <body className="bg-bg text-foreground antialiased">
        {/* Render each JSON-LD object as a separate script — Next.js 15's
            deduplication logic calls parsed["@context"].toLowerCase() and
            crashes if the body is an array rather than a plain object. */}
        {jsonLd.map((schema, i) => (
          <script
            key={i}
            type="application/ld+json"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
          />
        ))}
        <NextIntlClientProvider>
          <NavigationOverlay>
            <Nav shopOnline={shopOnline} />
            {children}
          </NavigationOverlay>
          <CartDrawerPortal />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
