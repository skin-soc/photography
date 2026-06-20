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
import { posterOptions, fineArtOptions } from '@/config/product-range'
import {
  getPricing,
  pricingStamp,
  effectiveMarkupPct,
  saleDiscountPct,
  DEFAULT_PRICING,
  type PricingConfig,
  type DigitalBrackets,
} from '@/lib/pricing'
import { getRates, eurToDkkOre, roundUpToFiveKr, FALLBACK_RATES, type Rates } from '@/lib/currency'

// Product-type primitives live in a client-safe module (no node:crypto), and
// are re-exported here so existing `@/lib/shop` importers keep working.
import type { ProductType } from './product-types'
export type { ProductType }
export { PRODUCT_TYPE_ORDER, isProductType, typeMessageKey } from './product-types'

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
 * Native-WebCrypto equivalent of photoRef — identical GMP-XXXXXXX output, but on
 * Workers `node:crypto` is polyfilled and slow, so building the catalog (~1k
 * untitled photos ⇒ ~1k HMACs in ONE cold request) with node:crypto blew the
 * Worker resource limit (error 1102). WebCrypto HMAC is native and fast. The key
 * is imported once; `photoRefWeb` signs each id. SERVER-SIDE ONLY.
 */
async function importRefKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret || 'dev'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}
async function photoRefWeb(key: CryptoKey, id: string): Promise<string> {
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(id)))
  let hex = ''
  for (let i = 0; i < 4; i++) hex += sig[i].toString(16).padStart(2, '0')
  return 'GMP-' + hex.slice(0, 7).toUpperCase()
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
  if (photo._displayTitle !== undefined) return photo._displayTitle
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
  /** Material/spec descriptor shown in the picker — physical products only. */
  material?: string
  // ── Poster paper variant (posters only) — the customer picks a paper, then a size. ──
  /** Paper code, e.g. 'FAP'. Groups poster options in the picker. */
  paper?: string
  /** Customer-facing paper name, e.g. 'Enhanced Matte'. */
  paperLabel?: string
  /** Short paper descriptor, e.g. 'Smooth matte giclée · 200gsm'. */
  paperBlurb?: string
  // ── Fine-art variant (fine art only) — family + frame colour are baked into the
  //    SKU (like poster paper), so they ride to fulfilment with no extra plumbing. ──
  /** Fine-art family, e.g. 'canvas' | 'framed'. */
  family?: string
  /** Customer-facing family name, e.g. 'Float-framed canvas'. */
  familyLabel?: string
  /** This product's frame colour (also in `attributes.color`). */
  frameColor?: string
  /** All frame colours offered for this family (for the swatch chooser). */
  frameColors?: string[]
  /** File format for digital downloads. Absent on print/fine-art products. */
  format?: 'jpeg' | 'tiff'
  /**
   * HMAC-SHA256 download token — format GMP-XXXXXXX (7 uppercase hex chars).
   * Set on digital products by the LAN origin. Used as the customer-facing
   * filename (GMP-XXXXXXX.jpg / .tiff) and verified stateless at download time.
   */
  downloadToken?: string
  // ── Print fulfilment (physical products only; see docs/fap-print-fulfilment.md) ──
  /** Fulfilment provider, e.g. 'prodigi'. Absent on digital + legacy print. */
  provider?: string
  /** The provider's product SKU this maps to (e.g. 'GLOBAL-FAP-A2'). */
  providerSku?: string
  /** Chosen provider variant attributes (e.g. { color: 'black' }). */
  attributes?: Record<string, string>
  /** Provider ex-tax cost in minor units of `costCurrency` — for margin only. */
  cost?: number
  /** Currency of `cost` (e.g. 'EUR'). */
  costCurrency?: string
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
  /** Lightroom color label (red/yellow/green/blue/purple) or '' / undefined when
   *  none. Drives the per-label pricing markup; red marks a photo as on sale. */
  colorLabel?: string
  /** Real source filename WITH extension (e.g. "GUS11286-Edit-3.tif"), as written
   *  by the plugin — shown in admin so the master's type is obvious. */
  sourceFilename?: string
  /** Set on red-labelled photos: the discount off the normal price, whole percent
   *  (e.g. 40 ⇒ a "−40%" sale pill). Absent when not on sale. */
  salePct?: number
  /**
   * Capture date from EXIF — seconds since Lightroom epoch (Jan 1, 2001 UTC),
   * as written by the publish plugin. Used to sort photos chronologically.
   * Absent on legacy catalog entries; treat 0 / undefined as unknown.
   */
  captureDate?: number
  /** Precomputed display title (set once during getCatalog processing, inside the
   *  module cache) so the hot render paths don't recompute an HMAC per photo. */
  _displayTitle?: string
}

const ORIGIN = process.env.SHOP_ORIGIN_URL
const ORIGIN_SECRET = process.env.SHOP_ORIGIN_SECRET ?? ''

/**
 * Public, cacheable host for watermarked previews (e.g. https://img.gusmcewan.com),
 * served straight from a Cloudflare-proxied tunnel hostname with a Cache Rule —
 * NO Worker invocation and NO shared secret (previews are low-res, watermarked,
 * public-by-design, and already publicly fetchable via /api/preview today).
 *
 * When UNSET, previewUrl falls back to the /api/preview Worker proxy, so the site
 * keeps working before/without cutover. Flip it on by setting SHOP_PREVIEW_BASE_URL
 * only AFTER the DNS host + Cache Rule exist. Masters/catalog/orders are never
 * affected — they stay secret-gated on the private origin.
 */
const PREVIEW_BASE = (process.env.SHOP_PREVIEW_BASE_URL ?? '').replace(/\/+$/, '')

/**
 * Build the physical products (posters + fine art) for a photo, applying the
 * worker-owned range. Both are aspect-matched + resolution-gated to the photo
 * and COST-PLUS — the base price is the Prodigi cost in DKK (the catalog markup
 * is applied later in buildCatalog). Used by both the live catalog and the dev
 * mock so they behave identically.
 */
function physicalProducts(
  id: string,
  w: number,
  h: number,
  hasPrint: boolean,
  hasFineArt: boolean,
  rates: Rates = FALLBACK_RATES,
): ShopProduct[] {
  const out: ShopProduct[] = []
  if (hasPrint) {
    // Posters: every paper × A-size whose resolution passes for this photo.
    // COST-PLUS — the base price is the Prodigi cost converted to DKK (with the
    // FX buffer); the markup is then applied catalog-wide in buildCatalog.
    for (const o of posterOptions(w, h)) {
      out.push({
        sku: `${id}-${o.paper}-${o.size}`,
        type: 'print',
        label: o.size,
        price: eurToDkkOre(o.cost, rates),
        currency: 'DKK',
        printSize: { w: o.widthCm, h: o.heightCm },
        material: `${o.widthCm} × ${o.heightCm} cm`,
        paper: o.paper,
        paperLabel: o.paperLabel,
        paperBlurb: o.paperBlurb,
        provider: 'prodigi',
        providerSku: o.providerSku,
        cost: o.cost,
        costCurrency: 'EUR',
      })
    }
  }
  if (hasFineArt) {
    // Fine art: every family × size whose aspect + resolution suit this photo.
    // COST-PLUS like posters — base price is the Prodigi cost in DKK (with FX
    // buffer); the catalog markup is applied in buildCatalog. Frame colour is a
    // customer choice (defaults to the first), so one product per family × size.
    for (const o of fineArtOptions(w, h)) {
      // One SKU per frame colour (colour is part of the variant, like poster paper),
      // so the chosen colour reaches Prodigi via the SKU's baked `attributes.color`.
      for (const color of o.frameColors) {
        out.push({
          sku: `${id}-${o.family}-${o.size}-${color.replace(/\s+/g, '')}`,
          type: 'fine-art',
          label: `${o.widthCm} × ${o.heightCm} cm`,
          price: eurToDkkOre(o.cost, rates),
          currency: 'DKK',
          printSize: { w: o.widthCm, h: o.heightCm },
          material: `${o.widthCm} × ${o.heightCm} cm · ${o.blurb}`,
          family: o.family,
          familyLabel: o.familyLabel,
          frameColor: color,
          frameColors: o.frameColors,
          provider: 'prodigi',
          providerSku: o.providerSku,
          attributes: { ...o.fixedAttributes, color },
          cost: o.cost,
          costCurrency: 'EUR',
        })
      }
    }
  }
  return out
}

/** A sized tier is only offered when the original is at least this much
 *  larger than the tier — otherwise it is barely distinct from the Master. */
const TIER_MARGIN = 1.15

/** Full-res (Master / Original) price for a (w × h) photo from a megapixel
 *  bracket ladder [≤25 MP, ≤50 MP, >50 MP] (DKK øre). */
function bracketPrice(w: number, h: number, brackets: DigitalBrackets): number {
  const mp = (w * h) / 1_000_000
  if (mp <= 25) return brackets[0]
  if (mp <= 50) return brackets[1]
  return brackets[2]
}

/**
 * The admin-set retail price for a digital tier, given the photo size. Used to
 * re-price the origin's digital products at catalog-build time so the Prices
 * tab governs downloads too. Unknown labels keep the origin's price.
 */
export function digitalPrice(label: string, w: number, h: number, pricing: PricingConfig): number | null {
  switch (label) {
    case 'Standard': return pricing.digital.standard
    case 'Medium':   return pricing.digital.medium
    case 'Pro':      return pricing.digital.pro
    case 'Master':   return bracketPrice(w, h, pricing.digital.master)
    case 'Original': return bracketPrice(w, h, pricing.digital.original)
    default:         return null
  }
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
export function digitalProducts(
  id: string,
  w: number,
  h: number,
  rawAvailable = false,
  pricing: PricingConfig = DEFAULT_PRICING,
): ShopProduct[] {
  const long = Math.max(w, h)
  const out: ShopProduct[] = []
  const d = pricing.digital

  // Standard — JPEG 1600px
  if (long >= 1600 * TIER_MARGIN) {
    const sku = `${id}-d-std`
    const scale = 1600 / long
    out.push({
      sku, type: 'digital', label: 'Standard',
      price: d.standard, currency: 'DKK', format: 'jpeg',
      dimensions: { w: Math.round(w * scale), h: Math.round(h * scale) },
      downloadToken: mockToken(sku),
    })
  }

  // Medium — JPEG 3200px; Pro — 16-bit TIFF same dimensions
  if (long >= 3200 * TIER_MARGIN) {
    const scale = 3200 / long
    const dims = { w: Math.round(w * scale), h: Math.round(h * scale) }
    const medSku = `${id}-d-med`
    out.push({ sku: medSku, type: 'digital', label: 'Medium', price: d.medium, currency: 'DKK', format: 'jpeg', dimensions: dims, downloadToken: mockToken(medSku) })
    if (rawAvailable) {
      const proSku = `${id}-d-pro`
      out.push({ sku: proSku, type: 'digital', label: 'Pro', price: d.pro, currency: 'DKK', format: 'tiff', dimensions: dims, downloadToken: mockToken(proSku) })
    }
  }

  // Master — JPEG full-res (always offered)
  const masterSku = `${id}-d-master`
  out.push({
    sku: masterSku, type: 'digital', label: 'Master',
    price: bracketPrice(w, h, d.master), currency: 'DKK', format: 'jpeg',
    dimensions: { w, h },
    downloadToken: mockToken(masterSku),
  })

  // Original — 16-bit TIFF full-res (only when rawAvailable)
  if (rawAvailable) {
    const origSku = `${id}-d-original`
    out.push({
      sku: origSku, type: 'digital', label: 'Original',
      price: bracketPrice(w, h, d.original), currency: 'DKK', format: 'tiff',
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
  const products: ShopProduct[] = physicalProducts(
    id,
    w,
    h,
    offers.includes('print'),
    offers.includes('fine-art'),
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
  generated?: string
  /** Monotonic preview-cache version from the origin. Appended to preview URLs as
   *  `?v=` so a re-render busts loki's immutable edge cache. */
  previewVersion?: number
  photos: ShopPhoto[]
}

/**
 * Module-scoped cache of the PROCESSED catalog, keyed by the origin's `generated`
 * stamp (with a content fallback). The heavy post-fetch work — an HMAC per
 * untitled photo for slug/title, plus a whole-catalog dedup pass — is O(n) and
 * `createHmac` is slow on Workers, so at a few thousand photos it must NOT run on
 * every request. The raw fetch stays Next-data-cached (revalidate 300); this
 * caches the processing on top, so a warm isolate reprocesses only when the
 * catalog actually changes. Without this, a product page (which calls getCatalog
 * in BOTH generateMetadata and the body) processed the catalog twice per view.
 */
let _processed: { key: string; photos: ShopPhoto[] } | null = null
let _inflight: Promise<ShopPhoto[]> | null = null

/** Stable cache key for the raw catalog at the Cloudflare edge. */
const CATALOG_CACHE_KEY = 'https://shop-origin.internal/catalog.json'

/**
 * Fetch the raw catalog, served from the Cloudflare edge cache (per-colo,
 * cross-isolate) so the ~2MB tunnel fetch happens at most once per 60s per colo —
 * NOT on every request. The Next fetch cache wasn't persisting across isolates
 * here, so we cache explicitly. TTL is short (60s) so a republish shows up almost
 * immediately; the cold rebuild it triggers is cheap now (native WebCrypto HMAC).
 */
async function fetchRawCatalog(): Promise<RawCatalog> {
  const edge: Cache | undefined = (globalThis as { caches?: { default?: Cache } }).caches?.default
  if (edge) {
    const hit = await edge.match(CATALOG_CACHE_KEY).catch(() => undefined)
    if (hit) return hit.json() as Promise<RawCatalog>
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)
  const res = await fetch(`${ORIGIN}/catalog.json`, {
    headers: { 'x-shop-secret': ORIGIN_SECRET },
    signal: controller.signal,
  }).finally(() => clearTimeout(timer))
  if (!res.ok) throw new Error(`origin responded ${res.status}`)
  const buf = await res.arrayBuffer()
  if (edge) {
    // Cache the catalog body (not the secret-bearing request) for 60s.
    edge
      .put(
        CATALOG_CACHE_KEY,
        new Response(buf, {
          headers: { 'content-type': 'application/json', 'cache-control': 'max-age=60' },
        }),
      )
      .catch(() => {})
  }
  return JSON.parse(new TextDecoder().decode(buf)) as RawCatalog
}

/** Opaque version of the currently-processed catalog (its cache key — changes
 *  when photos, pricing, rates or the preview version change). Call after
 *  `getCatalog()` has run; used to cache-bust the client-fetched grid catalog
 *  (`/api/shop/catalog?v=…`). Empty string before the first build. */
export function catalogVersion(): string {
  return _processed?.key ?? ''
}

/** Fetch the full catalog of sellable photos. Deduped (one in-flight build) and
 *  cached both at the edge (raw fetch) and in-isolate (processed result). */
export async function getCatalog(): Promise<ShopPhoto[]> {
  if (!ORIGIN) return MOCK_CATALOG
  if (_inflight) return _inflight
  const run = buildCatalog()
  _inflight = run
  try {
    return await run
  } finally {
    if (_inflight === run) _inflight = null
  }
}

/**
 * Force the next catalog read to refetch from the origin — clears the edge cache
 * (this colo) and the in-isolate processed memo. Backs the admin "Refresh
 * catalog" button so a just-published Lightroom export shows immediately instead
 * of waiting out the 60s cache window.
 */
export async function purgeCatalogCache(): Promise<void> {
  _processed = null
  _inflight = null
  const edge: Cache | undefined = (globalThis as { caches?: { default?: Cache } }).caches?.default
  if (edge) await edge.delete(CATALOG_CACHE_KEY).catch(() => {})
}

async function buildCatalog(): Promise<ShopPhoto[]> {
  try {
    const data = await fetchRawCatalog()
    // Admin-editable retail pricing (KV) + FX rates (posters are cost-plus, priced
    // in EUR→DKK). Both read once per build and folded into the cache key so a
    // price tweak or a rate move re-prices the catalog even when `generated` hasn't.
    const [pricing, rates] = await Promise.all([getPricing(), getRates()])
    // Cache-buster appended to every preview URL; a re-render bumps it on the
    // origin, so folding it into the key re-processes the catalog (new ?v=) the
    // moment the origin reports a new version.
    const previewVer = data.previewVersion ?? 1
    const key =
      (data.generated ||
        `${data.photos.length}:${data.photos[0]?.id ?? ''}:${data.photos[data.photos.length - 1]?.id ?? ''}`) +
      `|p:${pricingStamp(pricing)}|r:${rates.EUR.toFixed(5)}|v:${previewVer}`
    if (_processed && _processed.key === key) return _processed.photos
    const photos = data.photos.map((p) => ({
      ...p,
      category: p.category ?? [],
      key: p.key ?? false,
      // Public previews: the cacheable host when configured (served from the edge,
      // no Worker), else the /api/preview Worker proxy. Carries the `?v=` cache-
      // buster; components append further params with `&max=…`. A re-render bumps
      // the version, changing the URL so loki's immutable edge cache is bypassed.
      previewUrl: (PREVIEW_BASE ? `${PREVIEW_BASE}/preview/${p.id}` : `/api/preview/${p.id}`) + `?v=${previewVer}`,
    }))
    // Apply the worker-owned RANGE (products.json now lives with the worker —
    // src/config/product-range.ts). Keep the origin's DIGITAL products
    // (dimension-based, with download tokens) and replace the physical products:
    //  • Posters (type 'print') → Prodigi A-series on 4 papers, each size offered
    //    only when the photo resolves it at the paper's DPI floor (posterOptions).
    //  • Fine art (type 'fine-art') → a single WhiteWall placeholder (pending),
    //    oriented to the photo, so the line persists until WhiteWall is wired.
    // Which physical types a photo is offered in comes from the origin's
    // products (set by Lightroom collections). Digital products are kept from the
    // origin (they carry the download tokens) but RE-PRICED from the admin table,
    // since the Prices tab governs downloads too.
    for (const p of photos) {
      const offered = new Set(
        p.products.filter((x) => x.type === 'print' || x.type === 'fine-art').map((x) => x.type),
      )
      const digital = p.products
        .filter((x) => x.type === 'digital')
        .map((d) => {
          const next = digitalPrice(d.label, p.width, p.height, pricing)
          return next == null ? d : { ...d, price: next }
        })
      const listProducts =
        offered.size === 0
          ? digital
          : [
              ...physicalProducts(p.id, p.width, p.height, offered.has('print'), offered.has('fine-art'), rates),
              ...digital,
            ]
      // Apply the across-the-board + color-label markup to every list price, then
      // round the FINAL customer price up to the next whole 5 kr. The photo's
      // Lightroom color label sets the rate (red = sale deduction); net markup is
      // ≥ 0 and rounding only raises, so prices never fall below cost.
      const pct = effectiveMarkupPct(p.colorLabel, pricing.markup)
      p.products = listProducts.map((pr) => ({
        ...pr,
        price: roundUpToFiveKr(pct === 0 ? pr.price : Math.round(pr.price * (1 + pct / 100))),
      }))
      // Red label ⇒ on sale: expose the discount off the normal price for the
      // customer-facing "−X%" pill (uniform across the photo's products).
      if (p.colorLabel === 'red') {
        const disc = saleDiscountPct(pricing.markup)
        if (disc > 0) p.salePct = disc
      }
    }
    // The public slug is the photo's GMP code — code-only, e.g. /shop/gmp-a1b2c3d.
    // It's stable (never changes when the Lightroom title is edited, unlike a
    // title-derived slug), uniform, unique, and matches the customer-facing GMP
    // reference + admin lookup. SEO lives in the page metadata (title/description/
    // canonical/hreflang/JSON-LD), not the URL words. The display title still uses
    // the Lightroom title (GMP ref only when untitled). Both derive from one HMAC
    // per photo; done here (inside the module cache) so render paths never HMAC.
    const refKey = await importRefKey(ORIGIN_SECRET)
    for (const p of photos) {
      const ref = await photoRefWeb(refKey, p.id) // "GMP-XXXXXXX" — native HMAC
      p.slug = ref.toLowerCase()
      const untitledTitle = p.title.toLowerCase() === p.id.toLowerCase()
      p._displayTitle = untitledTitle ? ref : p.title
    }
    // Safety net: append the photo id only on the (astronomically rare) event two
    // photos hash to the same GMP code, so every URL stays unique.
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
    _processed = { key, photos }
    return photos
  } catch (err) {
    console.error('[shop] failed to load catalog from origin:', err)
    // Serve the last good processed catalog if we have one, rather than a blank
    // shop, when a refetch transiently fails.
    if (_processed) return _processed.photos
    return []
  }
}

export async function getPhoto(slug: string): Promise<ShopPhoto | null> {
  const catalog = await getCatalog()
  return catalog.find((p) => p.slug === slug) ?? null
}

/** Resolve a product SKU to its product (+ owning photo) across the catalog.
 *  Used server-side to map a cart SKU to its Prodigi providerSku for quoting. */
export async function findProductBySku(
  sku: string,
): Promise<{ photo: ShopPhoto; product: ShopProduct } | null> {
  const catalog = await getCatalog()
  for (const photo of catalog) {
    const product = photo.products.find((p) => p.sku === sku)
    if (product) return { photo, product }
  }
  return null
}

/** The distinct product types a photo is offered in, in canonical order. */
export function photoTypes(photo: ShopPhoto): ProductType[] {
  return ALL.filter((t) => photo.products.some((p) => p.type === t))
}

export interface ReferenceLookup {
  /** Original camera filename without extension — the photo `id`. */
  filename: string
  /** Real source filename WITH extension (e.g. "GUS11286-Edit-3.tif") when the
   *  plugin recorded it; falls back to `filename` for catalogs from before. */
  sourceFilename?: string
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
  /** Product types this photo is offered in — drives which admin asset links
   *  show (posters → poster prints; digital → master files). */
  types: ProductType[]
  /** Lightroom colour label (red/yellow/green/blue/purple) or '' / undefined. */
  colorLabel?: string
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
        sourceFilename: photo.sourceFilename,
        displayTitle: displayTitle(photo),
        slug: photo.slug,
        category: photo.category,
        previewUrl: photo.previewUrl,
        width: photo.width,
        height: photo.height,
        types: photoTypes(photo),
        colorLabel: photo.colorLabel,
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
        sourceFilename: photo.sourceFilename,
        displayTitle: displayTitle(photo),
        slug: photo.slug,
        category: photo.category,
        previewUrl: photo.previewUrl,
        width: photo.width,
        height: photo.height,
        types: photoTypes(photo),
        colorLabel: photo.colorLabel,
        matchedBy: 'photo',
      }
    }
  }

  return null
}

export interface AssetInfo {
  /** Poster A-sizes ALREADY pre-rendered on the NAS (no rendering triggered). */
  posterSizes: string[]
  /** Which master files exist for the photo. */
  masters: { jpeg: boolean; tiff: boolean }
}

/**
 * Ask the origin which poster assets / masters exist for a photo id — backs the
 * admin Product lookup's "link to pre-rendered posters / masters" UI. Returns
 * null if the origin is unreachable. SERVER-SIDE ONLY (origin secret).
 */
export async function fetchAssetInfo(id: string): Promise<AssetInfo | null> {
  if (!ORIGIN) return null
  try {
    const res = await fetch(`${ORIGIN}/admin/asset-info/${encodeURIComponent(id)}`, {
      headers: { 'x-shop-secret': ORIGIN_SECRET },
      cache: 'no-store',
    })
    if (!res.ok) return null
    return (await res.json()) as AssetInfo
  } catch {
    return null
  }
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
    // Posters/fine-art carry the size in the label, so the spec shows material.
    return product.material ?? `${product.printSize.w} × ${product.printSize.h} cm`
  }
  return null
}
