import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { SITE_URL, OG_LOCALE_MAP, buildLanguagesMap, getKeywords } from '@/i18n/seo'
import { routing } from '@/i18n/routing'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'pages.about' })
  const site = await getTranslations({ locale, namespace: 'site' })
  const path = '/about'
  const canonical =
    locale === routing.defaultLocale ? `${SITE_URL}${path}` : `${SITE_URL}/${locale}${path}`
  const description = t('description')
  const heroImage = `${SITE_URL}/images/gus-travels.jpg`
  const alternateLocales = Object.entries(OG_LOCALE_MAP)
    .filter(([l]) => l !== locale)
    .map(([, og]) => og)

  return {
    title: t('title'),
    description,
    keywords: getKeywords(locale),
    alternates: { canonical, languages: buildLanguagesMap(path) },
    openGraph: {
      title: `${t('title')} | ${site('title')}`,
      description,
      url: canonical,
      type: 'profile',
      locale: OG_LOCALE_MAP[locale] ?? 'en_GB',
      alternateLocale: alternateLocales,
      images: [{ url: heroImage, alt: t('h1') }],
    },
    twitter: { card: 'summary_large_image', title: t('title'), description, images: [heroImage] },
  }
}

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children
}
