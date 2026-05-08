import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import GalleryStack, { GalleryItem } from '../../components/GalleryStack'
import GalleryFooter from '../../components/GalleryFooter'
import { SITE_URL, OG_LOCALE_MAP, buildLanguagesMap, getKeywords } from '@/i18n/seo'
import { routing } from '@/i18n/routing'

const B = '/images/gallery'

const items: GalleryItem[] = [
  { type: 'single', src: `${B}/PP00004.webp`, alt: 'Portrait of King Charles III — photographed by Gus McEwan', w: 3200, h: 1800, fx: 80, fy: 45 },
  { type: 'pair', images: [
    { src: `${B}/PP00001.webp`, alt: 'Portrait of Jamie — editorial portrait by Gus McEwan',            w: 3200, h: 1800, fx: 30, fy: 40 },
    { src: `${B}/PP00010.webp`, alt: 'Portrait of Alexander Frisch — by photographer Gus McEwan', w: 3200, h: 1800, fx: 40, fy: 42 },
  ]},
  { type: 'single', src: `${B}/PP00005.webp`, alt: 'Portrait of Bryce Anderville Hixson Jr. — by Gus McEwan', w: 3200, h: 2133, fx: 46, fy: 50 },
  { type: 'pair', images: [
    { src: `${B}/PP00007.webp`, alt: 'Lolly & Matt — couple portrait by Gus McEwan', w: 3200, h: 1800, fx: 50, fy: 35 },
    { src: `${B}/PP00006.webp`, alt: 'Simon Cravatte, drag performer — portrait by Gus McEwan',   w: 3200, h: 1800, fx: 50, fy: 30 },
  ]},
  { type: 'single', src: `${B}/PP00003.webp`, alt: 'Distortion Festival, Copenhagen — street portrait by Gus McEwan', w: 3200, h: 1800, fx: 42, fy: 32 },
  { type: 'pair', images: [
    { src: `${B}/PP00011.webp`, alt: 'Portrait of Aaron Vogelmann — by Gus McEwan', w: 3122, h: 3122, fx: 50, fy: 38 },
    { src: `${B}/PP00009.webp`, alt: 'Portrait of Anders Malmgren — by Gus McEwan', w: 3200, h: 3200, fx: 50, fy: 40 },
  ]},
  { type: 'pair', images: [
    { src: `${B}/PP00002.webp`, alt: 'Young Solomon Islanders — travel portrait by Gus McEwan', w: 3200, h: 2133, fx: 50, fy: 42},
    { src: `${B}/PP00008.webp`, alt: 'Mother and child, Exeter, England — portrait by Gus McEwan', w: 3200, h: 2133, fx: 50, fy: 50 },
  ]},
  { type: 'single', src: `${B}/PP00012.webp`, alt: 'Danish skater, Copenhagen — street portrait by Gus McEwan', w: 3200, h: 2400, fx: 79, fy: 35 },
]

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'pages.people' })
  const site = await getTranslations({ locale, namespace: 'site' })
  const path = '/people'
  const canonical =
    locale === routing.defaultLocale ? `${SITE_URL}${path}` : `${SITE_URL}/${locale}${path}`
  const description = t('description')
  const heroImage = `${SITE_URL}/images/gallery/PP00004.webp`
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
      type: 'website',
      locale: OG_LOCALE_MAP[locale] ?? 'en_GB',
      alternateLocale: alternateLocales,
      images: [{ url: heroImage, width: 3200, height: 1800, alt: t('h1') }],
    },
    twitter: { card: 'summary_large_image', title: t('title'), description, images: [heroImage] },
  }
}

export default async function People({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'pages.people' })
  return (
    <main>
      <h1 className="sr-only">{t('h1')}</h1>
      <GalleryStack items={items} />
      <GalleryFooter />
    </main>
  )
}
