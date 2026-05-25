/**
 * Shop catalog data layer.
 *
 * Source of truth is the LAN origin app (TrueNAS), reached through a
 * Cloudflare Tunnel. Set SHOP_ORIGIN_URL to that tunnel hostname in prod.
 * When it is unset (local dev), a mock catalog is used so the shop is
 * fully browsable without the NAS running.
 *
 * The shop is organised by PRODUCT TYPE, not by subject. A photo appears
 * under every type it is offered in — derived from its `products`.
 *
 * Digital downloads are tiered Small / Medium / Large / Original. Tiers are
 * generated per photo from the real original dimensions — a tier is only
 * offered when the original is genuinely larger than it (never upscaled).
 */

export type ProductType = 'digital' | 'print' | 'fine-art'

export interface ShopProduct {
  sku: string
  type: ProductType
  label: string
  /** Minor units (øre — DKK). 19500 = 195 kr. */
  price: number
  currency: string
  /** Delivered pixel size — digital downloads only. */
  dimensions?: { w: number; h: number }
  /** Physical paper size in centimetres — print / fine-art only. */
  printSize?: { w: number; h: number }
}

export interface ShopPhoto {
  id: string
  slug: string
  title: string
  caption: string
  location: string
  /** Original (full-resolution) pixel dimensions. */
  width: number
  height: number
  /** Watermarked preview — served by the LAN origin in prod. */
  previewUrl: string
  products: ShopProduct[]
  /**
   * Collection paths below the product-type root, as written by the Lightroom
   * plugin. Each entry is an array of path segments, e.g.
   * ["Events", "Denmark", "Copenhagen", "Pride 2013"].
   * A photo may appear under multiple paths if published in several sub-collections.
   */
  category: string[][]
  /** True when a RAW file exists alongside the JPEG — offered on request. */
  rawAvailable?: boolean
  /** Green-labelled in Lightroom — used as rotating hero on folder cards. */
  key?: boolean
}

const ORIGIN = process.env.SHOP_ORIGIN_URL
const ORIGIN_SECRET = process.env.SHOP_ORIGIN_SECRET ?? ''

/** Physical print products — fixed (paper sizes don't depend on the photo).
 *  Labels are the variant only; the shop groups them under a type heading. */
const PRINT_TEMPLATE: Omit<ShopProduct, 'sku'>[] = [
  { type: 'print', label: 'A4', printSize: { w: 21, h: 29.7 }, price: 39500, currency: 'DKK' },
  { type: 'print', label: 'A3', printSize: { w: 29.7, h: 42 }, price: 59500, currency: 'DKK' },
  { type: 'fine-art', label: 'A2 — archival', printSize: { w: 42, h: 59.4 }, price: 149500, currency: 'DKK' },
]

/** Fixed-size digital tiers — capped on the long edge. A given pixel size is
 *  the same product whatever camera shot it, so these are flat-priced. A tier
 *  is offered only when the original is genuinely larger (never upscaled). */
interface SizedTier {
  key: string
  label: string
  longEdge: number
  price: number
}
const DIGITAL_SIZED_TIERS: SizedTier[] = [
  { key: 'std', label: 'Standard', longEdge: 2048, price: 14500 },
  { key: 'med', label: 'Medium', longEdge: 4096, price: 24500 },
  { key: 'lrg', label: 'Large', longEdge: 6144, price: 39500 },
]
/** A sized tier is only offered when the original is at least this much
 *  larger than the tier — otherwise it is barely distinct from the Master. */
const TIER_MARGIN = 1.15

/** "Master" is the true full-resolution original. Its price scales with the
 *  file's megapixels, so a medium-format master commands a real premium.
 *  First bracket whose `maxMP` the file is within sets the price. */
interface MasterBracket {
  maxMP: number
  price: number
}
const MASTER_BRACKETS: MasterBracket[] = [
  { maxMP: 40, price: 120000 },
  { maxMP: 80, price: 240000 },
  { maxMP: Infinity, price: 450000 },
]

function masterPrice(w: number, h: number): number {
  const mp = (w * h) / 1_000_000
  for (const b of MASTER_BRACKETS) {
    if (mp <= b.maxMP) return b.price
  }
  return MASTER_BRACKETS[MASTER_BRACKETS.length - 1].price
}

/** Build the digital-download products for a photo of (w × h) px: the sized
 *  tiers it is big enough for, plus the full-resolution Master. */
export function digitalProducts(id: string, w: number, h: number): ShopProduct[] {
  const long = Math.max(w, h)
  const out: ShopProduct[] = []
  for (const tier of DIGITAL_SIZED_TIERS) {
    if (long < tier.longEdge * TIER_MARGIN) continue // can't upscale / too close
    const scale = tier.longEdge / long
    out.push({
      sku: `${id}-d-${tier.key}`,
      type: 'digital',
      label: tier.label,
      price: tier.price,
      currency: 'DKK',
      dimensions: { w: Math.round(w * scale), h: Math.round(h * scale) },
    })
  }
  // Master — always offered: the true original at the megapixel-bracket price.
  out.push({
    sku: `${id}-d-master`,
    type: 'digital',
    label: 'Master',
    price: masterPrice(w, h),
    currency: 'DKK',
    dimensions: { w, h },
  })
  return out
}

function mock(
  id: string,
  slug: string,
  title: string,
  location: string,
  caption: string,
  w: number,
  h: number,
  offers: ProductType[],
  category: string[][] = [],
  rawAvailable = false,
): ShopPhoto {
  const products: ShopProduct[] = PRINT_TEMPLATE.filter((p) => offers.includes(p.type)).map(
    (p, i) => ({ sku: `${id}-p-${i + 1}`, ...p }),
  )
  if (offers.includes('digital')) products.push(...digitalProducts(id, w, h))
  return {
    id,
    slug,
    title,
    caption,
    location,
    width: w,
    height: h,
    previewUrl: `/images/gallery/GM-${id}.webp`,
    products,
    category,
    rawAvailable,
  }
}

const ALL: ProductType[] = ['digital', 'print', 'fine-art']

// Mock dimensions span medium-format originals (~11648px long edge, ~90–110 MP)
// and smaller "earlier work" (~6000px) — so the sized tiers and the
// megapixel-bracketed Master price are both demonstrable in dev.
const MOCK_CATALOG: ShopPhoto[] = [
  mock('PL00003', 'calderon-hondo-fuerteventura', 'Calderón Hondo', 'Fuerteventura, Spain', 'A volcanic crater under a wide Atlantic sky.', 11648, 7765, ALL, [['Places', 'Spain']], true),
  mock('PL00001', 'copenhagen-court-house', 'Københavns Domhus', 'Copenhagen, Denmark', 'The neoclassical facade of the Copenhagen Court House.', 6000, 3375, ['digital', 'print'], [['Places', 'Denmark', 'Copenhagen']]),
  mock('PL00007', 'arc-copenhagen', 'ARC, Copenhagen', 'Copenhagen, Denmark', 'The waste-to-energy plant and its ski slope roof.', 11648, 8736, ['digital'], [['Places', 'Denmark', 'Copenhagen']]),
  mock('PL00006', 'the-kelpies-scotland', 'The Kelpies', 'Falkirk, Scotland', 'Thirty metres of steel horse against an evening sky.', 11648, 6524, ALL, [['Places', 'United Kingdom']], true),
  mock('PL00015', 'notre-dame-paris', 'Notre-Dame', 'Paris, France', 'The cathedral seen from across the Seine.', 6000, 3375, ['digital', 'print'], [['Places', 'France']]),
  mock('PP00001', 'portrait-of-jamie', 'Jamie', 'London, United Kingdom', 'An editorial portrait in available light.', 9318, 11648, ['digital'], [['People']]),
  mock('PP00005', 'portrait-bryce', 'Bryce Anderville Hixson Jr.', 'Copenhagen, Denmark', 'A studio portrait, quiet and direct.', 9318, 11648, ['digital', 'print'], [['People']]),
  mock('PP00007', 'lolly-and-matt', 'Lolly & Matt', 'Copenhagen, Denmark', 'A couple portrait on location.', 6000, 4000, ['digital'], [['People']]),
  mock('NT00002', 'australian-gull', 'Australian Gull', 'Brisbane, Australia', 'A gull caught mid-light on the coast.', 6000, 4000, ['digital', 'print'], [['Nature']]),
  mock('NT00011', 'persian-lynx', 'Persian Lynx', 'On location', 'A caracal, ears tipped, watching.', 11648, 7765, ALL, [['Nature']], true),
  mock('NT00012', 'covid-fisherman', 'The Fisherman', 'Denmark', 'A documentary moment from the pandemic years.', 11648, 7765, ['digital'], [['Events', 'Denmark']]),
  mock('NT00001', 'still-water', 'Still Water', 'On location', 'A quiet landscape with a documentary eye.', 11648, 7765, ALL, [['Nature']], true),
]

interface RawCatalog {
  photos: ShopPhoto[]
}

/** Fetch the full catalog of sellable photos. */
export async function getCatalog(): Promise<ShopPhoto[]> {
  if (!ORIGIN) return MOCK_CATALOG

  try {
    const res = await fetch(`${ORIGIN}/catalog.json`, {
      next: { revalidate: 300 },
      headers: { 'x-shop-secret': ORIGIN_SECRET },
    })
    if (!res.ok) throw new Error(`origin responded ${res.status}`)
    const data = (await res.json()) as RawCatalog
    const photos = data.photos.map((p) => ({ ...p, category: p.category ?? [], key: p.key ?? false }))
    // Deduplicate slugs — appends the photo id when two photos share a slug.
    const seen = new Map<string, number>()
    for (const p of photos) seen.set(p.slug, (seen.get(p.slug) ?? 0) + 1)
    const counts = new Map<string, number>()
    for (const p of photos) {
      if (seen.get(p.slug)! > 1) {
        const n = (counts.get(p.slug) ?? 0) + 1
        counts.set(p.slug, n)
        p.slug = n === 1 ? p.slug : `${p.slug}-${p.id.toLowerCase()}`
      }
    }
    return photos
  } catch (err) {
    console.error('[shop] failed to load catalog from origin:', err)
    return []
  }
}

export async function getPhoto(slug: string): Promise<ShopPhoto | null> {
  const catalog = await getCatalog()
  return catalog.find((p) => p.slug === slug) ?? null
}

/** The distinct product types a photo is offered in, in canonical order. */
export function photoTypes(photo: ShopPhoto): ProductType[] {
  return ALL.filter((t) => photo.products.some((p) => p.type === t))
}

export interface CategoryNode {
  name: string
  children: CategoryNode[]
}

/** Build a category tree from the full catalog. */
export function buildCategoryTree(photos: ShopPhoto[]): CategoryNode[] {
  const roots = new Map<string, CategoryNode>()
  for (const photo of photos) {
    for (const path of photo.category) {
      if (path.length === 0) continue
      const rootName = path[0]
      if (!roots.has(rootName)) roots.set(rootName, { name: rootName, children: [] })
      let node = roots.get(rootName)!
      for (let i = 1; i < path.length; i++) {
        const seg = path[i]
        let child = node.children.find((c) => c.name === seg)
        if (!child) {
          child = { name: seg, children: [] }
          node.children.push(child)
        }
        node = child
      }
    }
  }
  return Array.from(roots.values())
}

/** All photos matching a category path prefix. */
export function photosInCategory(photos: ShopPhoto[], path: string[]): ShopPhoto[] {
  if (path.length === 0) return photos
  return photos.filter((p) =>
    p.category.some((c) => path.every((seg, i) => c[i] === seg)),
  )
}

/** Lowest-priced product on a photo, for the "from X" display. */
export function fromPrice(photo: ShopPhoto): ShopProduct {
  return photo.products.reduce((lo, p) => (p.price < lo.price ? p : lo))
}

/** Spec line for a product — digital pixel size or physical paper size.
 *  e.g. "3600 × 2400 px · JPEG" or "29.7 × 42 cm". Null if none applies. */
export function productSpec(product: ShopProduct): string | null {
  if (product.dimensions) {
    return `${product.dimensions.w} × ${product.dimensions.h} px · JPEG`
  }
  if (product.printSize) {
    return `${product.printSize.w} × ${product.printSize.h} cm`
  }
  return null
}
