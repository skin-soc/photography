import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'
import ShopGrid from '@/app/components/ShopGrid'
import ShopProductView from '@/app/components/ShopProductView'
import {
  getCatalog,
  getPhoto,
  catalogVersion,
  mockupAssetVersion,
  photoTypes,
  availableTypes,
  buildCategoryTree,
  displayTitle,
  typeMessageKey,
  type CategoryNode,
  type ShopPhoto,
  type ProductType,
} from '@/lib/shop'
import { typeFromUrlSlug } from '@/lib/product-types'
import { isProductSlug, resolveShopPath, categoryUrl } from '@/lib/shop-url'
import { landingTypeCards, shopFolderCards } from '@/lib/shop-cards'
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

/**
 * Collapse single-child folder chains: from the given subject `folders` under a
 * product `type`, descend while each level offers exactly one folder, stopping at
 * the first real choice (≥2 folders) or a leaf. Returns the (possibly deeper)
 * folder path so the customer isn't clicking through one-option folders like
 * Digital → Events → Denmark → Copenhagen.
 */
function collapseSingleChild(
  tree: CategoryNode[],
  catalog: ShopPhoto[],
  type: ProductType,
  folders: string[],
): string[] {
  const childrenAt = (p: string[]): CategoryNode[] => {
    let level = tree
    for (const name of p) {
      const node = level.find((n) => n.name === name)
      if (!node) return []
      level = node.children
    }
    return level
  }
  // A folder is "live" for this type if some photo of the type sits anywhere under it.
  const liveUnder = (p: string[]): boolean =>
    catalog.some(
      (ph) =>
        photoTypes(ph).includes(type) &&
        ph.category.some((c) => p.every((seg, i) => c[i] === seg)),
    )
  const path = [...folders]
  for (;;) {
    const subs = childrenAt(path).filter((child) => liveUnder([...path, child.name]))
    if (subs.length === 1) path.push(subs[0].name)
    else break
  }
  return path
}

/**
 * Nearest strictly-shorter STABLE ancestor of a category nav-path — i.e. the
 * previous real page in a smart-skipped trail. A prefix is stable when it doesn't
 * itself collapse forward (so "back" never lands on a single-child folder that
 * just redirects you down again). Returns [] for the shop landing.
 */
function backTarget(tree: CategoryNode[], catalog: ShopPhoto[], navPath: string[]): string[] {
  if (navPath.length === 0) return []
  const type = navPath[0] as ProductType
  const folders = navPath.slice(1)
  for (let len = folders.length - 1; len >= 0; len--) {
    const cand = folders.slice(0, len)
    if (collapseSingleChild(tree, catalog, type, cand).length === cand.length) {
      return [type, ...cand]
    }
  }
  return []
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
  // Lead the social/search preview with a green-labelled hero (Lightroom's "use
  // this one") for the chosen type, falling back to a portfolio image.
  let heroImage = `${SITE_URL}/images/gallery/PL00003.webp`
  let heroW = 3200
  let heroH = 2132
  try {
    const catalog = await getCatalog()
    const pool = type ? catalog.filter((p) => photoTypes(p).includes(type)) : catalog
    const hero = pool.find((p) => p.key) ?? pool[0]
    if (hero) {
      heroImage = hero.previewUrl.startsWith('http') ? hero.previewUrl : `${SITE_URL}${hero.previewUrl}`
      const s = Math.min(800 / hero.width, 800 / hero.height, 1)
      heroW = Math.round(hero.width * s)
      heroH = Math.round(hero.height * s)
    }
  } catch { /* keep the portfolio fallback */ }
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
      images: [{ url: heroImage, width: heroW, height: heroH, alt: t('h1') }],
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
  const categoryTree = buildCategoryTree(catalog)
  const types = availableTypes(catalog)
  // The grid's photo tiles are fetched client-side from the edge-cached
  // /api/shop/catalog?v=… (see ShopGrid). We only need the version here to
  // cache-bust that fetch — the heavy per-photo serialization stays out of this
  // server response, which is what was blowing the Worker CPU limit (error 1102).
  const version = catalogVersion()

  // Resolve the URL slug path to a real nav-path (real folder names). An unknown
  // type slug or folder slug is a dead URL → 404.
  const initialCategoryPath = resolveShopPath(categoryTree, path)
  if (initialCategoryPath === null) notFound()

  // Smart-skip one-option folders: within a chosen product type, descend through
  // any single-child chain to the first real choice / leaf, then redirect there.
  if (initialCategoryPath.length > 0) {
    const type = initialCategoryPath[0] as ProductType
    const folders = initialCategoryPath.slice(1)
    const collapsed = collapseSingleChild(categoryTree, catalog, type, folders)
    if (collapsed.length > folders.length) {
      const prefix = locale === routing.defaultLocale ? '' : `/${locale}`
      redirect(`${prefix}${categoryUrl([type, ...collapsed])}`)
    }
  }

  // Poster cards (grid) carry the same foot line as the product-page poster.
  const siteLabel = `WWW.${new URL(SITE_URL).host.replace(/^www\./, '').toUpperCase()}`

  // Skip-aware "back" target: the previous stable page, not the immediate parent
  // (which may be a one-option folder that just redirects forward again).
  const backPath = backTarget(categoryTree, catalog, initialCategoryPath)

  // Navigation cards (landing product-type cards + category folder cards) are
  // rendered server-side — they're small (counts + a few hero URLs) so they cost
  // nothing like the full tile list. Only an actual photo collection (a leaf,
  // `isLeaf`) fetches the catalog client-side. This keeps browsing instant while
  // the heavy per-photo work stays off the Worker (no error 1102).
  const landingCards = initialCategoryPath.length === 0 ? landingTypeCards(catalog, types) : null
  const folder = shopFolderCards(catalog, categoryTree, initialCategoryPath)

  return (
    <main className="min-h-screen bg-bg text-foreground px-[6vw] pt-[calc(6vw+128px)] pb-32">
      {catalog.length > 0 ? (
        <ShopGrid
          catalogVersion={version}
          landingCards={landingCards}
          folderCards={folder.cards}
          isLeaf={folder.isLeaf}
          availableTypes={types}
          initialCategoryPath={initialCategoryPath}
          backPath={backPath}
          heading={t('h1')}
          intro={tShop('intro')}
          siteLabel={siteLabel}
          mockupVersion={mockupAssetVersion()}
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
