import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { getPhoto, productSpec, type ProductType } from '@/lib/shop'
import { getRates, formatDKK, approxLine } from '@/lib/currency'
import ShopProductPicker, { type PickerProduct } from '../../../components/ShopProductPicker'
import { SITE_URL, BUSINESS_NAME, CONTACT_EMAIL, OG_LOCALE_MAP } from '@/i18n/seo'
import { routing } from '@/i18n/routing'

type Params = Promise<{ locale: string; slug: string }>
type SearchParams = Promise<{ from?: string }>

function ProductBreadcrumb({ path, title }: { path: string[]; title: string }) {
  const parentPath = path.slice(0, -1)
  const parentLabel = parentPath.length === 0 ? 'Browse' : parentPath[parentPath.length - 1]
  const parentHref = parentPath.length === 0
    ? '/shop'
    : `/shop?cat=${encodeURIComponent(parentPath.join('|'))}`

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
        href={parentHref}
        className="text-[#931020] hover:text-[#b01226] transition-colors shrink-0 ml-4"
      >
        ← {parentLabel}
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

  const title = `${photo.title} — ${photo.location}`
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

  const pickerProducts: PickerProduct[] = photo.products.map((p) => ({
    sku: p.sku,
    type: p.type,
    label: p.label,
    spec: productSpec(p),
    price: p.price,
    priceText: formatDKK(p.price),
    approxText: approxLine(p.price, rates),
  }))

  const schemaTypeName: Record<ProductType, string> = {
    print: 'Print',
    'fine-art': 'Fine art print',
    digital: 'Digital download',
  }
  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${photo.title} — ${photo.location}`,
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

  return (
    <main className="min-h-screen bg-black text-white px-[6vw] pt-[calc(6vw+128px)] pb-32">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
      />

      {fromPath.length > 0 ? (
        <ProductBreadcrumb path={fromPath} title={photo.title} />
      ) : (
        <Link
          href="/shop"
          className="text-[11px] font-light tracking-[0.22em] uppercase text-white/55 hover:text-white transition-colors"
        >
          ← {t('backToShop')}
        </Link>
      )}

      <div className="mt-8 grid md:grid-cols-2 gap-10 lg:gap-16 items-start">
        <div className="bg-white/5 select-none w-fit max-w-[800px]">
          <img
            src={`${photo.previewUrl}?max=800`}
            alt={`${photo.title} — ${photo.location}`}
            width={photo.width}
            height={photo.height}
            draggable={false}
            className="block max-w-full h-auto pointer-events-none"
          />
        </div>

        <div>
          <h1 className="text-4xl md:text-5xl font-light leading-tight">
            {photo.title}
          </h1>
          <p className="text-[11px] tracking-[0.2em] uppercase text-white/45 mt-2">
            {photo.location}
          </p>
          <p className="mt-5 text-white/65 leading-relaxed">{photo.caption}</p>

          <ShopProductPicker
            products={pickerProducts}
            rawAvailable={photo.rawAvailable ?? false}
            rawRequestHref={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
              `RAW file request — ${photo.title}`,
            )}`}
          />
        </div>
      </div>
    </main>
  )
}
