import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import ShopGrid, { GridPhoto } from '@/app/components/ShopGrid'
import ShopProductView from '@/app/components/ShopProductView'
import {
  getCatalog,
  getPhoto,
  fromPrice,
  photoTypes,
  availableTypes,
  buildCategoryTree,
  displayTitle,
  typeMessageKey,
} from '@/lib/shop'
import { typeFromUrlSlug } from '@/lib/product-types'
import { isProductSlug, resolveShopPath } from '@/lib/shop-url'
import { getRates, formatDKK, approxLine } from '@/lib/currency'
import { SITE_URL, OG_LOCALE_MAP, getKeywords } from '@/i18n/seo'
import { routing } from '@/i18n/routing'

/**
 * Single catch-all route for the whole shop. The browse state is the URL path,
 * so every view is deep-linkable and survives a refresh:
 *
 *   /shop                          → landing (product-type cards)
 *   /shop/posters                  → a product type
 *   /shop/posters/copenhagen/…     → a subject collection
 *   /shop/gmp-a1b2c3d              → a product (last segment is a `gmp-…` slug)
 *
 * The static sibling routes (`licensing`, `order-complete`, `downloads`) take
 * precedence over this catch-all, so they're unaffected.
 */

type Params = Promise<{ locale: string; path?: string[] }>

/** Reconstruct the canonical shop URL for a (possibly empty) slug path. */
function shopCanonical(locale: string, path: string[]): string {
  const prefix = locale === routing.defaultLocale ? '' : `/${locale}`
  const tail = path.length > 0 ? `/${path.join('/')}` : ''
  return `${SITE_URL}${prefix}/shop${tail}`
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, path = [] } = await params
  const productSlug = path.length > 0 && isProductSlug(path[path.length - 1]) ? path[path.length - 1] : null

  // ── Product page ─────────────────────────────────────────────────────────
  if (productSlug) {
    const photo = await getPhoto(productSlug)
    if (!photo) return {}
    const site = await getTranslations({ locale, namespace: 'site' })
    const title = `${displayTitle(photo)} — ${photo.location}`
    const description = `${photo.caption} Available as posters, fine art editions and digital downloads by ${site('title')}.`
    const canonical = shopCanonical(locale, [productSlug])
    const languages: Record<string, string> = {}
    for (const l of routing.locales) languages[l] = shopCanonical(l, [productSlug])
    languages['x-default'] = `${SITE_URL}/shop/${productSlug}`
    return {
      title,
      description,
      alternates: { canonical, languages },
      openGraph: {
        title: `${title} | ${site('title')}`,
        description,
        url: canonical,
        type: 'website',
        locale: OG_LOCALE_MAP[locale] ?? 'en_GB',
        images: [{ url: photo.previewUrl, width: photo.width, height: photo.height, alt: title }],
      },
      twitter: { card: 'summary_large_image', title, description, images: [photo.previewUrl] },
    }
  }

  // ── Landing / category page ───────────────────────────────────────────────
  const t = await getTranslations({ locale, namespace: 'pages.shop' })
  const site = await getTranslations({ locale, namespace: 'site' })
  const shop = await getTranslations({ locale, namespace: 'shop' })
  const canonical = shopCanonical(locale, path)
  // Hreflang map — built by hand (category paths are dynamic, so the typed
  // `buildLanguagesMap` over the static pathname union can't express them).
  const languages: Record<string, string> = {}
  for (const l of routing.locales) languages[l] = shopCanonical(l, path)
  languages['x-default'] = `${SITE_URL}/shop${path.length > 0 ? `/${path.join('/')}` : ''}`
  // A friendlier title once a product type is chosen.
  const typeSlug = path[0]
  const type = typeSlug ? typeFromUrlSlug(typeSlug) : null
  const title = type ? shop('sectionTitle', { name: shop(typeMessageKey(type)) }) : t('title')
  const description = t('description')
  const heroImage = `${SITE_URL}/images/gallery/PL00003.webp`
  const alternateLocales = Object.entries(OG_LOCALE_MAP)
    .filter(([l]) => l !== locale)
    .map(([, og]) => og)

  return {
    title,
    description,
    keywords: getKeywords(locale),
    alternates: { canonical, languages },
    openGraph: {
      title: `${title} | ${site('title')}`,
      description,
      url: canonical,
      type: 'website',
      locale: OG_LOCALE_MAP[locale] ?? 'en_GB',
      alternateLocale: alternateLocales,
      images: [{ url: heroImage, width: 3200, height: 2132, alt: t('h1') }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [heroImage] },
  }
}

export default async function Shop({ params }: { params: Params }) {
  const { locale, path = [] } = await params
  setRequestLocale(locale)

  // ── Product page — the last segment is a product slug (gmp-…) ──────────────
  const productSlug = path.length > 0 && isProductSlug(path[path.length - 1]) ? path[path.length - 1] : null
  if (productSlug) {
    const photo = await getPhoto(productSlug)
    if (!photo) notFound()
    return <ShopProductView locale={locale} photo={photo} />
  }

  // ── Landing / category grid ───────────────────────────────────────────────
  const t = await getTranslations({ locale, namespace: 'pages.shop' })
  const tShop = await getTranslations({ locale, namespace: 'shop' })

  const catalog = await getCatalog()
  const rates = await getRates()
  const categoryTree = buildCategoryTree(catalog)
  const types = availableTypes(catalog)

  // Resolve the URL slug path to a real nav-path (real folder names). An unknown
  // type slug or folder slug is a dead URL → 404.
  const initialCategoryPath = resolveShopPath(categoryTree, path)
  if (initialCategoryPath === null) notFound()

  const photos: GridPhoto[] = catalog.map((p) => {
    const lo = fromPrice(p)
    return {
      id: p.id,
      slug: p.slug,
      title: displayTitle(p),
      location: p.location,
      caption: p.caption,
      types: photoTypes(p),
      previewUrl: p.previewUrl,
      fromText: formatDKK(lo.price),
      fromApprox: approxLine(lo.price, rates),
      category: p.category,
      key: p.key,
      salePct: p.salePct,
      captureDate: p.captureDate,
    }
  })
  // Poster cards (grid) carry the same foot line as the product-page poster.
  const siteLabel = `WWW.${new URL(SITE_URL).host.replace(/^www\./, '').toUpperCase()}`

  return (
    <main className="min-h-screen bg-bg text-foreground px-[6vw] pt-[calc(6vw+128px)] pb-32">
      {photos.length > 0 ? (
        <ShopGrid
          photos={photos}
          categoryTree={categoryTree}
          availableTypes={types}
          initialCategoryPath={initialCategoryPath}
          heading={t('h1')}
          intro={tShop('intro')}
          siteLabel={siteLabel}
        />
      ) : (
        <header className="max-w-2xl">
          <h1 className="text-4xl md:text-5xl font-light">{t('h1')}</h1>
          <p className="mt-4 text-foreground/60 leading-relaxed">{tShop('checkoutSoon')}</p>
        </header>
      )}
    </main>
  )
}
