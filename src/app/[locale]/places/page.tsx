import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import GalleryStack, { GalleryItem } from '../../components/GalleryStack'
import GalleryFooter from '../../components/GalleryFooter'
import { SITE_URL, OG_LOCALE_MAP, buildLanguagesMap, getKeywords } from '@/i18n/seo'
import { routing } from '@/i18n/routing'

const B = '/images/gallery'

const items: GalleryItem[] = [
  { type: 'single', src: `${B}/PL00003.webp`, alt: 'Calderon Hondo, Fuerteventura, Spain — landscape photography by Gus McEwan', w: 3200, h: 2132, fx: 50, fy: 5 },
  { type: 'pair', images: [
    { src: `${B}/PL00012.webp`, alt: 'Tivoli Gardens, Copenhagen — photographed by Gus McEwan', w: 3200, h: 3200, fx: 50, fy: 42 },
    { src: `${B}/PL00004.webp`, alt: 'Amagerstrand, Copenhagen — Danish coastal photography by Gus McEwan',   w: 3200, h: 3200, fx: 50, fy: 45 },
  ]},
  { type: 'single', src: `${B}/PL00001.webp`, alt: 'Københavns Domhus (Copenhagen Court House) — architecture photography by Gus McEwan', w: 3200, h: 1800, fx: 49, fy: 10 },
  { type: 'single', src: `${B}/PL00007.webp`, alt: 'ARC waste-to-energy plant, Copenhagen — modern architecture by Gus McEwan',               w: 3200, h: 2400, fx: 40, fy: 50 },
  { type: 'pair', images: [
    { src: `${B}/PL00002.webp`, alt: 'Marmorkirken (The Marble Church), Copenhagen — photographed by Gus McEwan',     w: 3200, h: 2133, fx: 50, fy: 40 },
    { src: `${B}/PL00008.webp`, alt: 'Gemini Residence, Copenhagen — architecture photography by Gus McEwan', w: 3200, h: 2133, fx: 50, fy: 10 },
  ]},
  { type: 'single', src: `${B}/PL00006.webp`, alt: 'The Kelpies, Falkirk, Scotland — landscape photography by Gus McEwan',         w: 3200, h: 1792, fx: 20, fy: 90 },
  { type: 'single', src: `${B}/PL00011.webp`, alt: 'The Hand sculpture, Brisbane, Australia — travel photography by Gus McEwan', w: 3200, h: 1800, fx: 60, fy: 55 },
  { type: 'pair', images: [
    { src: `${B}/PL00014.webp`, alt: 'Christiansborg Palace, Copenhagen — Danish architecture by Gus McEwan',        w: 3200, h: 3200, fx: 55, fy: 22 },
    { src: `${B}/PL00013.webp`, alt: 'Operæn (Royal Danish Opera House), Copenhagen — photographed by Gus McEwan', w: 3200, h: 3200, fx: 35, fy: 65 },
  ]},
  { type: 'single', src: `${B}/PL00015.webp`, alt: 'Notre-Dame Cathedral, Paris — travel photography by Gus McEwan', w: 3200, h: 1800, fx: 65, fy: 20 },
]

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'pages.places' })
  const site = await getTranslations({ locale, namespace: 'site' })
  const path = '/places'
  const canonical =
    locale === routing.defaultLocale ? `${SITE_URL}${path}` : `${SITE_URL}/${locale}${path}`
  const description = t('description')
  const heroImage = `${SITE_URL}/images/gallery/PL00003.webp`
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
      images: [{ url: heroImage, width: 3200, height: 2132, alt: t('h1') }],
    },
    twitter: { card: 'summary_large_image', title: t('title'), description, images: [heroImage] },
  }
}

export default async function Places({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'pages.places' })
  return (
    <main>
      <h1 className="sr-only">{t('h1')}</h1>
      <GalleryStack items={items} />
      <GalleryFooter />
    </main>
  )
}
