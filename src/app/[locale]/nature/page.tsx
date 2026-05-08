import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import GalleryStack, { GalleryItem } from '../../components/GalleryStack'
import GalleryFooter from '../../components/GalleryFooter'
import { SITE_URL, OG_LOCALE_MAP, buildLanguagesMap, getKeywords } from '@/i18n/seo'
import { routing } from '@/i18n/routing'

const B = '/images/gallery'

const items: GalleryItem[] = [
  { type: 'single', src: `${B}/NT00011.webp`, alt: 'Persian lynx (caracal) — wildlife photography by Gus McEwan',    w: 3200, h: 1800, fx: 35, fy: 50 },
  { type: 'single', src: `${B}/NT00002.webp`, alt: 'Australian gull — wildlife photography by Gus McEwan', w: 3200, h: 1800, fx: 51, fy: 30 },
  { type: 'pair', images: [
    { src: `${B}/NT00001.webp`, alt: 'Baby African elephant — wildlife photography by Gus McEwan', w: 3200, h: 3200, fx: 35, fy: 65 },
    { src: `${B}/NT00008.webp`, alt: 'Polar bear — wildlife photography by Gus McEwan',            w: 1643, h: 1643, fx: 40, fy: 50 },
  ]},
  { type: 'single', src: `${B}/NT00004.webp`, alt: 'King swan — nature photography by Gus McEwan',       w: 3200, h: 1800, fx: 50, fy: 33 },
  { type: 'single', src: `${B}/NT00012.webp`, alt: 'COVID fisherman — documentary photography by Gus McEwan', w: 6000, h: 3375, fx: 50, fy: 99 },
  { type: 'single', src: `${B}/NT00007.webp`, alt: 'Royal red deer stag — wildlife photography by Gus McEwan', w: 3200, h: 1800, fx: 45, fy: 57 },
]

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'pages.nature' })
  const site = await getTranslations({ locale, namespace: 'site' })
  const path = '/nature'
  const canonical =
    locale === routing.defaultLocale ? `${SITE_URL}${path}` : `${SITE_URL}/${locale}${path}`
  const description = t('description')
  const heroImage = `${SITE_URL}/images/gallery/NT00011.webp`
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

export default async function Nature({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'pages.nature' })
  return (
    <main>
      <h1 className="sr-only">{t('h1')}</h1>
      <GalleryStack items={items} />
      <GalleryFooter />
    </main>
  )
}
