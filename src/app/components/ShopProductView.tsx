import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import {
  productSpec,
  displayTitle,
  productLicense,
  isProductType,
  typeMessageKey,
  type ShopPhoto,
  type ProductType,
} from '@/lib/shop'
import { categoryUrl } from '@/lib/shop-url'
import { getRates, formatDKK, approxLine } from '@/lib/currency'
import ShopProductPicker, { type PickerProduct } from '@/app/components/ShopProductPicker'
import PosterMat from '@/app/components/PosterMat'
import SalePill from '@/app/components/SalePill'
import LicensingLink from '@/app/components/LicensingLink'
import { SITE_URL, BUSINESS_NAME } from '@/i18n/seo'

/**
 * The product detail page for a single photo, rendered by the shop catch-all
 * route when the URL's last segment is a product slug (`gmp-…`).
 *
 * Browse context is NOT carried in the URL (the product slug stays flat and
 * canonical); instead the breadcrumb + "back" target are DERIVED from the
 * photo's own data — its primary product type and its first subject collection.
 * That keeps every product reachable at one stable URL while still giving a
 * correct, deep-link-safe breadcrumb on a hard refresh.
 */

/** Presentation priority for a product reached via a flat (context-free) slug.
 *  Posters lead — they're the dominant line and the poster mat is the strongest
 *  hero, so a shared/refreshed product link shows the poster by default; fine
 *  art then digital fall back when posters aren't offered. (Distinct from
 *  `PRODUCT_TYPE_ORDER`, which orders the landing tiers.) */
const PRESENTATION_ORDER: ProductType[] = ['print', 'fine-art', 'digital']

/** The product type the page leads with: the first of {@link PRESENTATION_ORDER}
 *  the photo is actually offered in. Drives the hero (poster mat vs frame) and
 *  the derived breadcrumb. */
function primaryTypeOf(photo: ShopPhoto): ProductType | undefined {
  const offered = new Set(photo.products.map((p) => p.type))
  return PRESENTATION_ORDER.find((t) => offered.has(t))
}

function ProductBreadcrumb({
  navPath,
  title,
  typeLabel,
  browseLabel,
}: {
  /** Derived nav-path `[productType, ...subjectFolders]`. */
  navPath: string[]
  title: string
  /** Friendly label for the leading product-type token (segment 0). */
  typeLabel: (token: string) => string
  /** Localized "Browse" root label. */
  browseLabel: string
}) {
  const label = (seg: string, i: number) => (i === 0 ? typeLabel(seg) : seg)
  // Back returns to the leaf collection this photo belongs to.
  const backHref = navPath.length === 0 ? '/shop' : categoryUrl(navPath)
  const backLabel =
    navPath.length === 0 ? browseLabel : label(navPath[navPath.length - 1], navPath.length - 1)

  return (
    <nav className="flex items-center justify-between gap-2 text-[11px] tracking-[0.18em] uppercase mb-8">
      <div className="hidden sm:flex items-center gap-2 text-white/40 min-w-0">
        <Link href="/shop" className="hover:text-white transition-colors shrink-0">{browseLabel}</Link>
        {navPath.map((seg, i) => (
          <span key={i} className="flex items-center gap-2 min-w-0">
            <span className="shrink-0">/</span>
            <Link href={categoryUrl(navPath.slice(0, i + 1))} className="hover:text-white transition-colors truncate">
              {label(seg, i)}
            </Link>
          </span>
        ))}
        <span className="flex items-center gap-2 min-w-0">
          <span className="shrink-0">/</span>
          <span className="text-white truncate">{title}</span>
        </span>
      </div>
      <Link
        href={backHref}
        className="text-[#931020] hover:text-[#b01226] transition-colors shrink-0 ml-4"
      >
        ← {backLabel}
      </Link>
    </nav>
  )
}

export default async function ShopProductView({
  locale,
  photo,
}: {
  locale: string
  photo: ShopPhoto
}) {
  const slug = photo.slug
  const primaryType = primaryTypeOf(photo)
  // Breadcrumb trail derived from the photo: its leading type + first subject
  // collection. (A photo can sit in several collections; the first is canonical
  // for orientation — the deep navigation is via the breadcrumb links.)
  const navPath: string[] = primaryType
    ? [primaryType, ...(photo.category[0] ?? [])]
    : []

  const t = await getTranslations({ locale, namespace: 'shop' })
  const rates = await getRates()

  // Derive the public-event name from the category path, e.g.
  // ["Events","Denmark","Copenhagen","Pride 2013"] → "Copenhagen Pride 2013"
  // Only shown when the photo is categorised under Events.
  const eventPath = photo.category.find((path) => path[0] === 'Events')
  const eventName = eventPath && eventPath.length >= 2
    ? eventPath.length >= 4
      ? `${eventPath[eventPath.length - 2]} ${eventPath[eventPath.length - 1]}`
      : eventPath[eventPath.length - 1]
    : null

  const pickerProducts: PickerProduct[] = photo.products.map((p) => ({
    sku: p.sku,
    type: p.type,
    label: p.label,
    spec: productSpec(p),
    price: p.price,
    currency: p.currency,
    priceText: formatDKK(p.price),
    approxText: approxLine(p.price, rates),
    format: p.format,
    downloadToken: p.downloadToken,
    // Usage-rights licences apply to digital downloads only. A physical print or
    // fine-art piece is an object, not a licence — no usage tier is shown.
    license: p.type === 'digital' ? productLicense(p) : undefined,
    paper: p.paper,
    paperLabel: p.paperLabel,
    paperBlurb: p.paperBlurb,
  }))

  const schemaTypeName: Record<ProductType, string> = {
    print: 'Poster',
    'fine-art': 'Fine art print',
    digital: 'Digital download',
  }
  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${displayTitle(photo)} — ${photo.location}`,
    description: photo.caption,
    image: photo.previewUrl.startsWith('http')
      ? photo.previewUrl
      : `${SITE_URL}${photo.previewUrl}`,
    brand: { '@type': 'Brand', name: BUSINESS_NAME },
    offers: photo.products.map((p) => ({
      '@type': 'Offer',
      sku: p.sku,
      name: `${schemaTypeName[p.type]} — ${p.label}`,
      price: (p.price / 100).toFixed(2),
      priceCurrency: p.currency,
      availability: 'https://schema.org/InStock',
    })),
  }

  // Calculate actual preview dimensions (longest edge capped at 800px).
  // These are used as the CSS display size — the browser reserves the right
  // layout space before the image loads, and the image renders at native size.
  const PMAX = 800
  const scale  = Math.min(PMAX / photo.width, PMAX / photo.height, 1)
  const previewW = Math.round(photo.width  * scale)
  const previewH = Math.round(photo.height * scale)

  // Poster presentation: in the Posters context the photo is shown on a white
  // gallery mat with the title + caption typeset below (PosterMat). Everything
  // else (fine art, digital) uses the simple 21px gallery frame.
  const posterView = primaryType === 'print'
  const posterCardMaxWidth = Math.min(previewW + 40, 600)

  // Physical (poster / fine-art) contexts preview the artwork WITHOUT the logo
  // badge — the customer is judging the print, not buying a file. The repeating
  // mesh watermark stays on every variant. Digital keeps the logo.
  const heroNoLogo = primaryType === 'print' || primaryType === 'fine-art'
  // Posters request the 4:5 portrait crop (matches the print master); fine art and
  // digital keep the full frame.
  const heroQuery = (max: number) =>
    `?max=${max}${heroNoLogo ? '&logo=0' : ''}${posterView ? '&poster=1' : ''}`

  // Foot line on the poster mat — our site, formatted like the gallery sample.
  const siteLabel = `WWW.${new URL(SITE_URL).host.replace(/^www\./, '').toUpperCase()}`

  return (
    <main className="min-h-screen bg-black text-white px-[6vw] pt-[calc(6vw+128px)] pb-32">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
      />

      {navPath.length > 0 ? (
        <ProductBreadcrumb
          navPath={navPath}
          title={displayTitle(photo)}
          typeLabel={(token) => (isProductType(token) ? t(typeMessageKey(token)) : token)}
          browseLabel={t('browse')}
        />
      ) : (
        <Link
          href="/shop"
          className="text-[10px] font-light tracking-[0.22em] uppercase text-white/35 hover:text-white/70 transition-colors"
        >
          ← {t('backToShop')}
        </Link>
      )}

      <div className="mt-10 flex flex-col xl:flex-row gap-10 xl:gap-16 items-start">

        {/* Photo — gallery poster mat (typeset title/caption) in the Posters
            context, otherwise the simple 21px white frame. */}
        {posterView ? (
          <div className="relative shrink-0 mx-auto xl:mx-0 w-full" style={{ maxWidth: posterCardMaxWidth }}>
            {photo.salePct ? <SalePill pct={photo.salePct} className="absolute top-3 left-3 z-10" /> : null}
            <PosterMat
              src={`${photo.previewUrl}${heroQuery(800)}`}
              srcSet={`${photo.previewUrl}${heroQuery(400)} 400w, ${photo.previewUrl}${heroQuery(800)} 800w`}
              sizes={`${posterCardMaxWidth}px`}
              alt={`${displayTitle(photo)} — ${photo.location}`}
              title={displayTitle(photo)}
              caption={photo.caption}
              siteLabel={siteLabel}
              maxWidth={posterCardMaxWidth}
            />
          </div>
        ) : (
          <div className="relative select-none shrink-0 mx-auto xl:mx-0 border-white border-[21px]" style={{ maxWidth: previewW, width: '100%' }}>
            {photo.salePct ? <SalePill pct={photo.salePct} className="absolute top-3 left-3 z-10" /> : null}
            <img
              src={`${photo.previewUrl}${heroQuery(800)}`}
              srcSet={`${photo.previewUrl}${heroQuery(400)} 400w, ${photo.previewUrl}${heroQuery(800)} 800w`}
              sizes={`${previewW}px`}
              alt={`${displayTitle(photo)} — ${photo.location}`}
              width={previewW}
              height={previewH}
              draggable={false}
              className="block w-full h-auto pointer-events-none ring-1 ring-gray-400/40"
            />
          </div>
        )}

        {/* Info column — title/caption/license now live inside the first picker card */}
        <div className="min-w-0 flex-1">
          <ShopProductPicker
            products={pickerProducts}
            photoSlug={slug}
            primaryType={primaryType}
            rawAvailable={photo.rawAvailable ?? false}
            photoTitle={displayTitle(photo)}
            location={photo.location}
            caption={photo.caption}
            previewUrl={photo.previewUrl}
            licenseNote={eventName ? (
              <p className="mt-4 text-[11px] font-light leading-relaxed text-white/30">
                {t.rich('licensingNotePublicEvent', {
                  event: eventName,
                  link: (chunks) => <LicensingLink>{chunks}</LicensingLink>,
                })}
              </p>
            ) : undefined}
          />
        </div>
      </div>
    </main>
  )
}
