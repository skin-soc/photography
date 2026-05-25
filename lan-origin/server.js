/**
 * Shop LAN origin service
 * ───────────────────────
 * Runs on the TrueNAS server. Reached exclusively through a Cloudflare Tunnel
 * (never port-forwarded).
 *
 * The catalog and the clean preview JPEGs are produced by the Lightroom
 * Classic publish-service plugin (see ../lightroom-plugin), which writes:
 *   <DATA_DIR>/catalog.json      — which photos are for sale + metadata
 *   <DATA_DIR>/previews/<id>.jpg — Lightroom-rendered preview (sRGB, ~2560px)
 *
 * This service exposes (Phase 1 — catalog / browsing):
 *   GET /healthz        — liveness probe
 *   GET /catalog.json   — catalog + previewUrl + pricing, for the shop Worker
 *   GET /preview/:id    — the preview, downsized + watermarked, then cached
 *
 * Pricing is applied here, not in Lightroom: every photo gets the product set
 * from <DATA_DIR>/products.json, or the built-in default below.
 *
 * Serving full-resolution originals (digital downloads, print fulfilment) is
 * deliberately not implemented yet — it belongs to the fulfilment phase,
 * gated behind a verified Stripe payment.
 *
 * Configuration (environment variables):
 *   PORT             default 8787
 *   DATA_DIR         folder holding catalog.json + previews/ (default /data)
 *   CATALOG_PATH     override path to catalog.json
 *   PREVIEWS_DIR     override path to the Lightroom-rendered previews
 *   CACHE_DIR        where watermarked previews are cached
 *   PRODUCTS_PATH    override path to products.json
 *   PUBLIC_URL       public tunnel hostname, e.g. https://origin.gusmcewan.com
 *   PREVIEW_MAX      longest edge of a served preview in px (default 1600)
 *   SHARED_SECRET    optional — if set, requests must send x-shop-secret
 */

import express from 'express'
import sharp from 'sharp'
import { readFile, mkdir, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { join, resolve } from 'node:path'

const PORT = Number(process.env.PORT ?? 8787)
const DATA_DIR = resolve(process.env.DATA_DIR ?? '/data')
const CATALOG_PATH = resolve(process.env.CATALOG_PATH ?? join(DATA_DIR, 'catalog.json'))
const PREVIEWS_DIR = resolve(process.env.PREVIEWS_DIR ?? join(DATA_DIR, 'previews'))
const CACHE_DIR = resolve(process.env.CACHE_DIR ?? join(DATA_DIR, 'preview-cache'))
const PRODUCTS_PATH = resolve(process.env.PRODUCTS_PATH ?? join(DATA_DIR, 'products.json'))
const PUBLIC_URL = (process.env.PUBLIC_URL ?? '').replace(/\/$/, '')
const PREVIEW_MAX = Number(process.env.PREVIEW_MAX ?? 800)
const SHARED_SECRET = process.env.SHARED_SECRET ?? ''

// Pricing — prices in øre (DKK minor units): 19500 øre = 195 kr.
// <DATA_DIR>/products.json may override printProducts / digitalTiers / masterBrackets.

/** Physical print products — fixed (paper sizes don't depend on the photo).
 *  printSize is the paper size in centimetres. */
const DEFAULT_PRINT_PRODUCTS = [
  { type: 'print', label: 'A4', printSize: { w: 21, h: 29.7 }, price: 39500, currency: 'DKK' },
  { type: 'print', label: 'A3', printSize: { w: 29.7, h: 42 }, price: 59500, currency: 'DKK' },
  { type: 'fine-art', label: 'A2 — archival', printSize: { w: 42, h: 59.4 }, price: 149500, currency: 'DKK' },
]

/** Fixed-size digital tiers — capped on the long edge. Same product whatever
 *  camera shot it, so flat-priced. A tier is only offered when the original
 *  is genuinely larger (never upscaled). */
const DEFAULT_DIGITAL_TIERS = [
  { key: 'std', label: 'Standard', longEdge: 1600, price: 9900  },
  { key: 'med', label: 'Medium',   longEdge: 3200, price: 29500 },
]

/** Master (JPEG) price brackets — scales with megapixels. */
const DEFAULT_MASTER_BRACKETS = [
  { maxMP: 25, price: 150000 },       // 1,500 DKK
  { maxMP: 50, price: 250000 },       // 2,500 DKK
  { maxMP: Infinity, price: 400000 }, // 4,000 DKK
]

/** Original (16-bit TIFF) price brackets — approx 2× the JPEG Master. */
const DEFAULT_TIFF_MASTER_BRACKETS = [
  { maxMP: 25, price: 300000 },       // 3,000 DKK
  { maxMP: 50, price: 500000 },       // 5,000 DKK
  { maxMP: Infinity, price: 800000 }, // 8,000 DKK
]

/** Pro TIFF (3200px) flat price. */
const TIFF_PRO_PRICE = 59500 // 595 DKK

/** A sized tier is offered only when the original is this much larger. */
const TIER_MARGIN = 1.15

function bracketPrice(w, h, brackets) {
  const mp = (w * h) / 1_000_000
  for (const b of brackets) {
    if (mp <= b.maxMP) return b.price
  }
  return brackets[brackets.length - 1].price
}

/**
 * Build digital products for a photo of (w × h) px.
 * JPEG: Standard (1600) → Medium (3200) → Master (full-res).
 * TIFF (rawAvailable only): Pro (3200, after Medium) → Original (full-res, after Master).
 */
function digitalProducts(id, w, h, tiers, masterBrackets, tiffMasterBrackets, rawAvailable) {
  const long = Math.max(w, h)
  const out = []
  for (const tier of tiers) {
    if (long < tier.longEdge * TIER_MARGIN) continue
    const scale = tier.longEdge / long
    const dims = { w: Math.round(w * scale), h: Math.round(h * scale) }
    out.push({
      sku: `${id}-d-${tier.key}`,
      type: 'digital',
      label: tier.label,
      price: tier.price,
      currency: 'DKK',
      format: 'jpeg',
      dimensions: dims,
    })
    // Pro TIFF immediately after Medium (3200px tier)
    if (rawAvailable && tier.key === 'med') {
      out.push({
        sku: `${id}-d-pro`,
        type: 'digital',
        label: 'Pro',
        price: TIFF_PRO_PRICE,
        currency: 'DKK',
        format: 'tiff',
        dimensions: dims,
      })
    }
  }
  // Master JPEG — always offered
  out.push({
    sku: `${id}-d-master`,
    type: 'digital',
    label: 'Master',
    price: bracketPrice(w, h, masterBrackets),
    currency: 'DKK',
    format: 'jpeg',
    dimensions: { w, h },
  })
  // Original TIFF — only when rawAvailable
  if (rawAvailable) {
    out.push({
      sku: `${id}-d-original`,
      type: 'digital',
      label: 'Original',
      price: bracketPrice(w, h, tiffMasterBrackets),
      currency: 'DKK',
      format: 'tiff',
      dimensions: { w, h },
    })
  }
  return out
}

await mkdir(CACHE_DIR, { recursive: true })

const app = express()
app.disable('x-powered-by')

/** Shared-secret gate — every route except /healthz requires the header. */
app.use((req, res, next) => {
  if (req.path === '/healthz') return next()
  if (SHARED_SECRET && req.get('x-shop-secret') !== SHARED_SECRET) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  next()
})

app.get('/healthz', (_req, res) => res.json({ ok: true }))

/** Load pricing config (falls back to the built-in defaults, per key). */
async function loadPricing() {
  const fallback = {
    printProducts: DEFAULT_PRINT_PRODUCTS,
    digitalTiers: DEFAULT_DIGITAL_TIERS,
    masterBrackets: DEFAULT_MASTER_BRACKETS,
    tiffMasterBrackets: DEFAULT_TIFF_MASTER_BRACKETS,
  }
  try {
    const raw = JSON.parse(await readFile(PRODUCTS_PATH, 'utf8'))
    return {
      printProducts:
        Array.isArray(raw.printProducts) && raw.printProducts.length > 0
          ? raw.printProducts
          : DEFAULT_PRINT_PRODUCTS,
      digitalTiers:
        Array.isArray(raw.digitalTiers) && raw.digitalTiers.length > 0
          ? raw.digitalTiers
          : DEFAULT_DIGITAL_TIERS,
      masterBrackets:
        Array.isArray(raw.masterBrackets) && raw.masterBrackets.length > 0
          ? raw.masterBrackets
          : DEFAULT_MASTER_BRACKETS,
      tiffMasterBrackets:
        Array.isArray(raw.tiffMasterBrackets) && raw.tiffMasterBrackets.length > 0
          ? raw.tiffMasterBrackets
          : DEFAULT_TIFF_MASTER_BRACKETS,
    }
  } catch {
    return fallback
  }
}

/**
 * Build the public catalog: the plugin-written catalog.json plus a previewUrl
 * pointing back at this origin and a priced product list per photo.
 *
 * Each photo carries `offers` — the product types it is sold in, set by which
 * Lightroom collections it lives in. Print/fine-art products come from the
 * fixed template; digital products are generated per photo from its real
 * dimensions (Standard / Medium / Large + the megapixel-priced Master).
 */
async function loadCatalog() {
  const raw = JSON.parse(await readFile(CATALOG_PATH, 'utf8'))
  const { printProducts, digitalTiers, masterBrackets, tiffMasterBrackets } = await loadPricing()

  const photos = (raw.photos ?? []).map((p) => {
    const { offers, ...rest } = p
    const allowed = Array.isArray(offers) && offers.length > 0 ? offers : ['print', 'fine-art', 'digital']

    const products = printProducts
      .filter((prod) => allowed.includes(prod.type))
      .map((prod, i) => ({
        sku: `${p.id}-p-${i + 1}`,
        type: prod.type,
        label: prod.label,
        price: prod.price,
        currency: prod.currency,
        printSize: prod.printSize,
      }))

    if (allowed.includes('digital')) {
      products.push(...digitalProducts(p.id, p.width ?? 0, p.height ?? 0, digitalTiers, masterBrackets, tiffMasterBrackets, p.rawAvailable ?? false))
    }

    return { ...rest, previewUrl: `${PUBLIC_URL}/preview/${p.id}`, products }
  })

  return { generated: raw.generated, photos }
}

app.get('/catalog.json', async (_req, res) => {
  try {
    const catalog = await loadCatalog()
    res.set('Cache-Control', 'public, max-age=300')
    res.json(catalog)
  } catch (err) {
    console.error('[catalog]', err)
    res.status(500).json({ error: 'catalog unavailable' })
  }
})

const GMP_PATH      = new URL('./gmp.png',  import.meta.url).pathname
const LOGO_SVG_PATH = new URL('./logo.svg', import.meta.url).pathname

/** Logo longest edge in pixels. Tune via env if needed. */
const LOGO_SIZE   = Number(process.env.LOGO_SIZE   ?? 25)
/** Gap between logo and image edge in pixels. */
const LOGO_MARGIN = Number(process.env.LOGO_MARGIN ?? 14)

/** Cache the raw SVG string so we only hit disk once. */
let _logoSvgRaw = null
async function getLogoSvg() {
  if (!_logoSvgRaw) _logoSvgRaw = await readFile(LOGO_SVG_PATH, 'utf8')
  return _logoSvgRaw
}

/**
 * Build composite entries for the logo watermark: a soft drop-shadow first,
 * then the 95%-opaque logo on top, both anchored to the bottom-right corner.
 *
 * Shadow technique: rasterise the logo → zero out all RGB channels via recomb
 * (makes every pixel black while preserving alpha) → Gaussian blur → composite
 * slightly offset below and to the right of the logo position.
 */
async function buildWatermarkComposites(imgW, imgH) {
  const logoSvgRaw = await getLogoSvg()

  // Rasterise the SVG at LOGO_SIZE × LOGO_SIZE, 95% opacity.
  // Rasterise at 2× then resize to target — gives much sharper anti-aliasing
  // than rendering directly at the small target size (librsvg at 72 DPI).
  const render = LOGO_SIZE * 2
  const svg = logoSvgRaw
    .replace('width="20000"',  `width="${render}"`)
    .replace('height="20000"', `height="${render}"`)
    .replace('<svg',           '<svg opacity="0.95"')

  const logoBuf = await sharp(Buffer.from(svg))
    .resize(LOGO_SIZE, LOGO_SIZE, { fit: 'inside', kernel: 'lanczos3' })
    .png()
    .toBuffer()
  const { width: lw, height: lh } = await sharp(logoBuf).metadata()

  // Drop-shadow: black silhouette (recomb zeros R/G/B, alpha unchanged) → blur.
  const shadowBuf = await sharp(logoBuf)
    .recomb([[0, 0, 0], [0, 0, 0], [0, 0, 0]])
    .blur(4)
    .png()
    .toBuffer()

  // Bottom-right corner with margin.
  const logoLeft   = imgW - lw - LOGO_MARGIN
  const logoTop    = imgH - lh - LOGO_MARGIN
  // Shadow sits 3 px right and 4 px down from the logo.
  const shadowLeft = logoLeft + 3
  const shadowTop  = logoTop  + 4

  return [
    { input: shadowBuf, left: shadowLeft, top: shadowTop, blend: 'over' },
    { input: logoBuf,   left: logoLeft,   top: logoTop,   blend: 'over' },
  ]
}

app.get('/preview/:id', async (req, res) => {
  const { id } = req.params
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return res.status(400).end()

  const requestedMax = parseInt(req.query.max, 10)
  const max = (!isNaN(requestedMax) && requestedMax > 0 && requestedMax < PREVIEW_MAX)
    ? requestedMax
    : PREVIEW_MAX
  const cacheKey = max === PREVIEW_MAX ? `${id}.jpg` : `${id}-${max}.jpg`
  const cached = join(CACHE_DIR, cacheKey)

  try {
    await stat(cached)
    res.set('Cache-Control', 'public, max-age=31536000, immutable')
    res.type('jpeg')
    return createReadStream(cached).pipe(res)
  } catch {
    /* not cached yet — generate below */
  }

  try {
    const src = join(PREVIEWS_DIR, `${id}.jpg`)
    try {
      await stat(src)
    } catch {
      return res.status(404).json({ error: 'not found' })
    }

    const { data: resizedBuf, info: resizeInfo } = await sharp(src)
      .resize(max, max, { fit: 'inside', withoutEnlargement: true })
      .toBuffer({ resolveWithObject: true })

    const logoComposites = await buildWatermarkComposites(resizeInfo.width, resizeInfo.height)

    await sharp(resizedBuf)
      .composite([
        { input: GMP_PATH, tile: true, blend: 'over' },  // mesh layer
        ...logoComposites,                                 // shadow + logo on top
      ])
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(cached)

    res.set('Cache-Control', 'public, max-age=31536000, immutable')
    res.type('jpeg')
    createReadStream(cached).pipe(res)
  } catch (err) {
    console.error('[preview]', id, err)
    res.status(500).json({ error: 'preview failed' })
  }
})

app.listen(PORT, () => {
  console.log(`shop LAN origin listening on :${PORT}`)
  console.log(`  catalog  : ${CATALOG_PATH}`)
  console.log(`  previews : ${PREVIEWS_DIR}`)
  console.log(`  public   : ${PUBLIC_URL || '(PUBLIC_URL not set)'}`)
})
