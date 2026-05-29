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

import { createHmac } from 'node:crypto'

export type ProductType = 'digital' | 'print' | 'fine-art'

/**
 * Usage-rights tier bundled with a digital product.
 * Tiers are cumulative — commercial includes editorial which includes personal.
 */
export type LicenseTier = 'personal' | 'editorial' | 'commercial' | 'full-commercial'

/** Derive the license tier from product label. */
export function productLicense(product: ShopProduct): LicenseTier {
  if (product.label === 'Pro')      return 'editorial'
  if (product.label === 'Master')   return 'commercial'
  if (product.label === 'Original') return 'full-commercial'
  return 'personal' // Standard, Medium
}

/** Mirror of server.js productToken — same algorithm, 'dev' key for mock data. */
function mockToken(sku: string): string {
  return 'GMP-' + createHmac('sha256', 'dev').update(sku).digest('hex').slice(0, 7).toUpperCase()
}

/**
 * Customer-facing photo reference — GMP-XXXXXXX derived from the photo ID.
 * Shown in place of a raw camera filename when no Lightroom title is set.
 * SERVER-SIDE ONLY — uses node:crypto.
 */
function photoRef(id: string, secret: string): string {
  return 'GMP-' + createHmac('sha256', secret || 'dev').update(id).digest('hex').slice(0, 7).toUpperCase()
}

/**
 * True when the Lightroom plugin wrote the camera filename as the title
 * (its fallback: title = title or remoteId).
 */
function titleIsFilename(photo: ShopPhoto): boolean {
  return photo.title.toLowerCase() === photo.id.toLowerCase()
}

/**
 * Display title for a photo — the Lightroom title when set, otherwise a
 * professional GMP reference derived from the photo ID.
 * SERVER-SIDE ONLY — call only from server components / route handlers.
 */
export function displayTitle(photo: ShopPhoto): string {
  return titleIsFilename(photo) ? photoRef(photo.id, ORIGIN_SECRET) : photo.title
}

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
  /** File format for digital downloads. Absent on print/fine-art products. */
  format?: 'jpeg' | 'tiff'
  /**
   * HMAC-SHA256 download token — format GMP-XXXXXXX (7 uppercase hex chars).
   * Set on digital products by the LAN origin. Used as the customer-facing
   * filename (GMP-XXXXXXX.jpg / .tiff) and verified stateless at download time.
   */
  downloadToken?: string
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
  /**
   * Capture date from EXIF — seconds since Lightroom epoch (Jan 1, 2001 UTC),
   * as written by the publish plugin. Used to sort photos chronologically.
   * Absent on legacy catalog entries; treat 0 / undefined as unknown.
   */
  captureDate?: number
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

/** A sized tier is only offered when the original is at least this much
 *  larger than the tier — otherwise it is barely distinct from the Master. */
const TIER_MARGIN = 1.15

/** "Master" (JPEG) price — scales with megapixels.
 *  First bracket whose `maxMP` the file falls within sets the price. */
interface MasterBracket {
  maxMP: number
  price: number
}
const MASTER_BRACKETS: MasterBracket[] = [
  { maxMP: 25, price: 150000 },   // 1,500 DKK
  { maxMP: 50, price: 250000 },   // 2,500 DKK
  { maxMP: Infinity, price: 400000 }, // 4,000 DKK
]

/** "Original" (16-bit TIFF) price — approx 2× the JPEG Master bracket. */
const TIFF_MASTER_BRACKETS: MasterBracket[] = [
  { maxMP: 25, price: 300000 },   // 3,000 DKK
  { maxMP: 50, price: 500000 },   // 5,000 DKK
  { maxMP: Infinity, price: 800000 }, // 8,000 DKK
]

function bracketPrice(w: number, h: number, brackets: MasterBracket[]): number {
  const mp = (w * h) / 1_000_000
  for (const b of brackets) {
    if (mp <= b.maxMP) return b.price
  }
  return brackets[brackets.length - 1].price
}

/**
 * Build the digital-download products for a photo of (w × h) px.
 *
 * JPEG tiers: Standard (1600px) → Medium (3200px) → Master (full-res).
 * TIFF tiers (only when rawAvailable): Pro (3200px) after Medium, Original
 * (full-res) after Master.
 *
 * Product order in the picker: Standard · Medium · Pro · Master · Original.
 */
export function digitalProducts(id: string, w: number, h: number, rawAvailable = false): ShopProduct[] {
  const long = Math.max(w, h)
  const out: ShopProduct[] = []

  // Standard — JPEG 1600px
  if (long >= 1600 * TIER_MARGIN) {
    const sku = `${id}-d-std`
    const scale = 1600 / long
    out.push({
      sku, type: 'digital', label: 'Standard',
      price: 9900, currency: 'DKK', format: 'jpeg',
      dimensions: { w: Math.round(w * scale), h: Math.round(h * scale) },
      downloadToken: mockToken(sku),
    })
  }

  // Medium — JPEG 3200px; Pro — 16-bit TIFF same dimensions
  if (long >= 3200 * TIER_MARGIN) {
    const scale = 3200 / long
    const dims = { w: Math.round(w * scale), h: Math.round(h * scale) }
    const medSku = `${id}-d-med`
    out.push({ sku: medSku, type: 'digital', label: 'Medium', price: 29500, currency: 'DKK', format: 'jpeg', dimensions: dims, downloadToken: mockToken(medSku) })
    if (rawAvailable) {
      const proSku = `${id}-d-pro`
      out.push({ sku: proSku, type: 'digital', label: 'Pro', price: 59500, currency: 'DKK', format: 'tiff', dimensions: dims, downloadToken: mockToken(proSku) })
    }
  }

  // Master — JPEG full-res (always offered)
  const masterSku = `${id}-d-master`
  out.push({
    sku: masterSku, type: 'digital', label: 'Master',
    price: bracketPrice(w, h, MASTER_BRACKETS), currency: 'DKK', format: 'jpeg',
    dimensions: { w, h },
    downloadToken: mockToken(masterSku),
  })

  // Original — 16-bit TIFF full-res (only when rawAvailable)
  if (rawAvailable) {
    const origSku = `${id}-d-original`
    out.push({
      sku: origSku, type: 'digital', label: 'Original',
      price: bracketPrice(w, h, TIFF_MASTER_BRACKETS), currency: 'DKK', format: 'tiff',
      dimensions: { w, h },
      downloadToken: mockToken(origSku),
    })
  }

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
  if (offers.includes('digital')) products.push(...digitalProducts(id, w, h, rawAvailable))
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
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(`${ORIGIN}/catalog.json`, {
      next: { revalidate: 300 },
      headers: { 'x-shop-secret': ORIGIN_SECRET },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer))
    if (!res.ok) throw new Error(`origin responded ${res.status}`)
    const data = (await res.json()) as RawCatalog
    const photos = data.photos.map((p) => ({
      ...p,
      category: p.category ?? [],
      key: p.key ?? false,
      // Rewrite to a local proxy route — the browser never sees the origin URL,
      // and all preview fetches go through the Worker which adds the secret.
      previewUrl: `/api/preview/${p.id}`,
    }))
    // Replace camera-filename slugs with GMP-based slugs so URLs are clean.
    // The Lightroom plugin writes slug = slugify(title) or remoteId:lower(),
    // so when no title is set the slug equals the camera filename / photo ID.
    for (const p of photos) {
      if (p.slug.toLowerCase() === p.id.toLowerCase()) {
        p.slug = photoRef(p.id, ORIGIN_SECRET).toLowerCase()  // "gmp-xxxxxxx"
      }
    }
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

export interface ReferenceLookup {
  /** Original camera filename without extension — the photo `id`. */
  filename: string
  /** Friendly title (Lightroom title, or the GMP ref when none is set). */
  displayTitle: string
  /** Public shop slug, so the admin can jump to the live product page. */
  slug: string
  /** Lightroom collection paths the photo is published under. */
  category: string[][]
  /** Watermarked-preview proxy path for this photo. */
  previewUrl: string
  width: number
  height: number
  /** How the typed code resolved. */
  matchedBy: 'photo' | 'product'
  /** Set when the code was a per-product download token. */
  product?: {
    sku: string
    label: string
    type: ProductType
    format?: 'jpeg' | 'tiff'
    downloadToken: string
    /** Customer-facing download filename, e.g. GMP-F192DAA.jpg. */
    customerFilename: string
  }
}

/**
 * Reverse-resolve a typed GMP code to its photo. Accepts either a photo-level
 * reference (GMP-XXXXXXX, equals the slug for untitled photos) or a per-product
 * download token (GMP-XXXXXXX.jpg / .tiff). Case- and extension-insensitive.
 *
 * SERVER-SIDE ONLY — recomputes HMACs with the origin secret.
 */
export async function lookupByReference(input: string): Promise<ReferenceLookup | null> {
  const code = input
    .trim()
    .replace(/\.(jpe?g|tiff?)$/i, '')
    .toUpperCase()
  if (!code) return null

  const catalog = await getCatalog()

  // Per-product download token first — it's the more specific match.
  for (const photo of catalog) {
    const product = photo.products.find((p) => p.downloadToken?.toUpperCase() === code)
    if (product) {
      const ext = product.format === 'tiff' ? 'tiff' : 'jpg'
      return {
        filename: photo.id,
        displayTitle: displayTitle(photo),
        slug: photo.slug,
        category: photo.category,
        previewUrl: photo.previewUrl,
        width: photo.width,
        height: photo.height,
        matchedBy: 'product',
        product: {
          sku: product.sku,
          label: product.label,
          type: product.type,
          format: product.format,
          downloadToken: product.downloadToken!,
          customerFilename: `${product.downloadToken}.${ext}`,
        },
      }
    }
  }

  // Photo-level reference (the GMP ref derived from the photo id).
  for (const photo of catalog) {
    if (photoRef(photo.id, ORIGIN_SECRET) === code) {
      return {
        filename: photo.id,
        displayTitle: displayTitle(photo),
        slug: photo.slug,
        category: photo.category,
        previewUrl: photo.previewUrl,
        width: photo.width,
        height: photo.height,
        matchedBy: 'photo',
      }
    }
  }

  return null
}

/** The distinct product types offered anywhere in the catalog, in canonical
 *  order. Used to render only the type filters that actually have stock — a
 *  category with no products (e.g. nothing published as Fine Art) is omitted. */
export function availableTypes(photos: ShopPhoto[]): ProductType[] {
  return ALL.filter((t) => photos.some((photo) => photo.products.some((p) => p.type === t)))
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
 *  e.g. "3600 × 2400 px · JPEG", "3600 × 2400 px · 16-bit TIFF", or "29.7 × 42 cm". */
export function productSpec(product: ShopProduct): string | null {
  if (product.dimensions) {
    const fmt = product.format === 'tiff' ? '16-bit TIFF' : 'JPEG'
    return `${product.dimensions.w} × ${product.dimensions.h} px · ${fmt}`
  }
  if (product.printSize) {
    return `${product.printSize.w} × ${product.printSize.h} cm`
  }
  return null
}
