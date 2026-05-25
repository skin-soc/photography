import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import ShopGrid, { GridPhoto } from '../../components/ShopGrid'
import { getCatalog, fromPrice, photoTypes, buildCategoryTree } from '@/lib/shop'
import { getRates, formatDKK, approxLine } from '@/lib/currency'
import { SITE_URL, OG_LOCALE_MAP, buildLanguagesMap, getKeywords } from '@/i18n/seo'
import { routing } from '@/i18n/routing'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'pages.shop' })
  const site = await getTranslations({ locale, namespace: 'site' })
  const path = '/shop'
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

export default async function Shop({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ cat?: string }>
}) {
  const { locale } = await params
  const { cat } = await searchParams
  const initialCategoryPath = cat ? decodeURIComponent(cat).split('|') : []
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'pages.shop' })
  const tShop = await getTranslations({ locale, namespace: 'shop' })

  const catalog = await getCatalog()
  const rates = await getRates()
  const categoryTree = buildCategoryTree(catalog)
  const photos: GridPhoto[] = catalog.map((p) => {
    const lo = fromPrice(p)
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      location: p.location,
      types: photoTypes(p),
      previewUrl: p.previewUrl,
      fromText: formatDKK(lo.price),
      fromApprox: approxLine(lo.price, rates),
      category: p.category,
      key: p.key,
    }
  })

  return (
    <main className="min-h-screen bg-black text-white px-[6vw] pt-[calc(6vw+128px)] pb-32">
      <header className="mb-12 max-w-2xl">
        <h1 className="text-4xl md:text-5xl font-light">
          {t('h1')}
        </h1>
        <p className="mt-4 text-white/60 leading-relaxed">{tShop('intro')}</p>
      </header>

      {photos.length > 0 ? (
        <ShopGrid photos={photos} categoryTree={categoryTree} initialCategoryPath={initialCategoryPath} />
      ) : (
        <p className="text-white/40">{tShop('checkoutSoon')}</p>
      )}
    </main>
  )
}
