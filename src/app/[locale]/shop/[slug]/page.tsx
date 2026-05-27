import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { getPhoto, productSpec, displayTitle, productLicense } from '@/lib/shop'
import type { ProductType } from '@/lib/shop'
import { getRates, formatDKK, approxLine } from '@/lib/currency'
import ShopProductPicker, { type PickerProduct } from '../../../components/ShopProductPicker'
import LicensingLink from '../../../components/LicensingLink'
import { SITE_URL, BUSINESS_NAME, OG_LOCALE_MAP } from '@/i18n/seo'
import { routing } from '@/i18n/routing'

type Params = Promise<{ locale: string; slug: string }>
type SearchParams = Promise<{ from?: string }>

function ProductBreadcrumb({ path, title }: { path: string[]; title: string }) {
  // The back button returns to exactly where the user came from — the leaf
  // collection they were browsing. The breadcrumb links cover parent navigation.
  const backHref = path.length === 0
    ? '/shop'
    : `/shop?cat=${encodeURIComponent(path.join('|'))}`
  const backLabel = path.length === 0 ? 'Browse' : path[path.length - 1]

  return (
    <nav className="flex items-center justify-between gap-2 text-[11px] tracking-[0.18em] uppercase mb-8">
      <div className="flex items-center gap-2 text-white/40 min-w-0">
        <Link href="/shop" className="hover:text-white transition-colors shrink-0">Browse</Link>
        {path.map((seg, i) => {
          const segHref = `/shop?cat=${encodeURIComponent(path.slice(0, i + 1).join('|'))}`
          return (
            <span key={i} className="flex items-center gap-2 min-w-0">
              <span className="shrink-0">/</span>
              <Link href={segHref} className="hover:text-white transition-colors truncate">{seg}</Link>
            </span>
          )
        })}
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

function localizedShopUrl(locale: string, slug: string): string {
  const prefix = locale === routing.defaultLocale ? '' : `/${locale}`
  return `${SITE_URL}${prefix}/shop/${slug}`
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params
  const photo = await getPhoto(slug)
  if (!photo) return {}

  const title = `${displayTitle(photo)} — ${photo.location}`
  const description = `${photo.caption} Available as prints, fine art editions and digital downloads by ${BUSINESS_NAME}.`
  const canonical = localizedShopUrl(locale, slug)
  const languages: Record<string, string> = {}
  for (const l of routing.locales) languages[l] = localizedShopUrl(l, slug)
  languages['x-default'] = `${SITE_URL}/shop/${slug}`

  return {
    title,
    description,
    alternates: { canonical, languages },
    openGraph: {
      title: `${title} | ${BUSINESS_NAME}`,
      description,
      url: canonical,
      type: 'website',
      locale: OG_LOCALE_MAP[locale] ?? 'en_GB',
      images: [{ url: photo.previewUrl, width: photo.width, height: photo.height, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [photo.previewUrl] },
  }
}

export default async function ShopItem({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  const { locale, slug } = await params
  const { from } = await searchParams
  const fromPath: string[] = from ? decodeURIComponent(from).split('|') : []
  setRequestLocale(locale)
  const photo = await getPhoto(slug)
  if (!photo) notFound()

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
    priceText: formatDKK(p.price),
    approxText: approxLine(p.price, rates),
    format: p.format,
    downloadToken: p.downloadToken,
    license: productLicense(p),
  }))

  const schemaTypeName: Record<ProductType, string> = {
    print: 'Print',
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

  return (
    <main className="min-h-screen bg-black text-white px-[6vw] pt-[calc(6vw+128px)] pb-32">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
      />

      {fromPath.length > 0 ? (
        <ProductBreadcrumb path={fromPath} title={displayTitle(photo)} />
      ) : (
        <Link
          href="/shop"
          className="text-[10px] font-light tracking-[0.22em] uppercase text-white/35 hover:text-white/70 transition-colors"
        >
          ← {t('backToShop')}
        </Link>
      )}

      <div className="mt-10 flex flex-col lg:flex-row gap-10 lg:gap-16 items-start">

        {/* Photo — 21px white frame */}
        <div className="select-none shrink-0 border-[21px] border-white" style={{ maxWidth: previewW, width: '100%' }}>
          <img
            src={`${photo.previewUrl}?max=800`}
            srcSet={`${photo.previewUrl}?max=400 400w, ${photo.previewUrl}?max=800 800w`}
            sizes={`${previewW}px`}
            alt={`${displayTitle(photo)} — ${photo.location}`}
            width={previewW}
            height={previewH}
            draggable={false}
            className="block w-full h-auto pointer-events-none"
          />
        </div>

        {/* Info column */}
        <div className="min-w-0 flex-1">

          {/* Title — IBM Plex Mono, ultra-light, accent colour.
               mt-[9px] compensates for the font's ascender overflow above the line box
               so the visual cap line lands flush with the top of the photo frame. */}
          <h1 className="mt-[9px] text-5xl md:text-6xl font-mono-ibm font-[200] leading-[1.05] tracking-tight text-accent">
            {displayTitle(photo)}
          </h1>

          {/* Location label — accent colour, editorial subtitle under the title */}
          <p className="mt-2 text-[10px] tracking-[0.3em] uppercase text-accent/80">
            {photo.location}
          </p>

          {/* Caption — editorial, italic */}
          <p className="mt-6 text-[15px] font-light italic text-white/50 leading-relaxed">
            {photo.caption}
          </p>

          {/* Public-event licensing context note */}
          {eventName && (
            <p className="mt-5 text-[11px] font-light leading-relaxed text-white/30">
              {t.rich('licensingNotePublicEvent', {
                event: eventName,
                // TODO: replace href with /shop/licensing once that page exists
                link: (chunks) => (
                  <LicensingLink>
                    {chunks}
                  </LicensingLink>
                ),
              })}
            </p>
          )}

          <ShopProductPicker
            products={pickerProducts}
            rawAvailable={photo.rawAvailable ?? false}
            photoTitle={displayTitle(photo)}
          />
        </div>
      </div>
    </main>
  )
}
