/**
 * Shop LAN origin service
 * ───────────────────────
 * Runs on the TrueNAS server. Reached exclusively through a Cloudflare Tunnel
 * (never port-forwarded).
 *
 * The catalog and the clean preview JPEGs are produced by the Lightroom
 * Classic publish-service plugin (see ../lightroom-plugin), which writes:
 *   <DATA_DIR>/catalog.json      — which photos are for sale + metadata
 *   <DATA_DIR>/previews/<id>.jpg — Lightroom-rendered preview (sRGB, ≤800px)
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
import compression from 'compression'
import sharp from 'sharp'
// One libvips thread per sharp operation. We process images in PARALLEL (the
// warmer runs WARM_CONCURRENCY jobs at once), so per-op multithreading would just
// thrash — single-threaded jobs × WARM_CONCURRENCY cleanly map onto the container's
// dedicated cores (see the cpus limit in docker-compose.yml).
sharp.concurrency(1)
import nodemailer from 'nodemailer'
import AdmZip from 'adm-zip'
import { renderDownloadEmail, renderRefundEmail } from './email.js'
import { buildInvoicePdf, buildLicensePdf, buildRefundPdf } from './invoice.js'
import { renderPosterMaster, POSTER_SIZES } from './poster.js'
import { exiftool } from 'exiftool-vendored'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { readFile, writeFile, mkdir, stat, readdir, unlink, copyFile, rename } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { join, resolve, dirname, basename } from 'node:path'

const PORT = Number(process.env.PORT ?? 8787)
const DATA_DIR = resolve(process.env.DATA_DIR ?? '/data')
const CATALOG_PATH = resolve(process.env.CATALOG_PATH ?? join(DATA_DIR, 'catalog.json'))
const PREVIEWS_DIR = resolve(process.env.PREVIEWS_DIR ?? join(DATA_DIR, 'previews'))
const CACHE_DIR = resolve(process.env.CACHE_DIR ?? join(DATA_DIR, 'preview-cache'))
const PRODUCTS_PATH = resolve(process.env.PRODUCTS_PATH ?? join(DATA_DIR, 'products.json'))
const PUBLIC_URL = (process.env.PUBLIC_URL ?? '').replace(/\/$/, '')
// Public, cacheable preview host (loki) — used to PRIME the Cloudflare edge cache
// during warming. Unset → edge priming is skipped (origin disk warming still runs).
const PREVIEW_PUBLIC_BASE = (process.env.PREVIEW_PUBLIC_BASE ?? '').replace(/\/+$/, '')
const PREVIEW_VERSION_PATH = resolve(process.env.PREVIEW_VERSION_PATH ?? join(DATA_DIR, 'preview-version'))
const PREVIEW_MAX = Number(process.env.PREVIEW_MAX ?? 800)
const SHARED_SECRET = process.env.SHARED_SECRET ?? ''

// ── Fulfilment (Phase 2) configuration ──────────────────────────────────────
/** Full-resolution EDITED masters written by the Lightroom plugin — the single
 *  deliverable source: <id>.jpg for every photo, plus <id>.tif (16-bit) for RAW
 *  shots (for the Pro / Original TIFF tiers). The plugin renders these from each
 *  photo inside Lightroom with edits applied, so a download matches the preview.
 *  (RAW originals live scattered across per-collection folders and are never
 *  read directly — the masters supersede them.) */
const MASTERS_DIR = resolve(process.env.MASTERS_DIR ?? join(DATA_DIR, 'masters'))
/** Generated, copyright-embedded deliverables, keyed by SKU (reusable). */
const FULFIL_CACHE_DIR = resolve(process.env.FULFIL_CACHE_DIR ?? join(DATA_DIR, 'fulfil-cache'))
/** Poster ASSETS — the pre-rendered print masters (photo + typeset band on a
 *  white A-series sheet, no watermark, 300 dpi), keyed by photo ref + size, the
 *  Prodigi print asset. Pre-rendered for every qualifying size when posters are
 *  published (see /admin/poster-prerender); the route still generates on demand
 *  as a fallback. Like every deliverable it lives on BULK storage (beside the
 *  masters), NEVER on the fast SSD that holds /data — the default is derived from
 *  MASTERS_DIR's parent, not DATA_DIR, so it can't accidentally fill the SSD. */
const POSTER_ASSETS_DIR = resolve(process.env.POSTER_ASSETS_DIR ?? join(dirname(MASTERS_DIR), 'poster-assets'))
/** Download grant records, one JSON file per order id. */
const ORDERS_DIR = resolve(process.env.ORDERS_DIR ?? join(DATA_DIR, 'orders'))
/** Public site origin, for the download link in the email. */
const SITE_URL = (process.env.SITE_URL ?? 'https://gusmcewan.com').replace(/\/$/, '')
/** Download-link validity in days. */
const LINK_TTL_DAYS = Number(process.env.LINK_TTL_DAYS ?? 30)
const LINK_TTL_MS = LINK_TTL_DAYS * 24 * 60 * 60 * 1000

// iCloud SMTP — app-specific password required. MAIL_FROM must be the iCloud
// address or an iCloud Custom-Domain alias.
const SMTP_HOST = process.env.SMTP_HOST ?? 'smtp.mail.me.com'
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 587)
const SMTP_USER = process.env.SMTP_USER ?? ''
const SMTP_PASS = process.env.SMTP_PASS ?? ''
const MAIL_FROM = process.env.MAIL_FROM ?? SMTP_USER

/**
 * Derive a stable, customer-facing download token for a digital product SKU.
 * Format: GMP-XXXXXXX  (7 uppercase hex chars from HMAC-SHA256).
 *
 * Stateless — the server recomputes this at download-request time and
 * compares; no database entry is needed to verify authenticity.
 * Falls back to a plain SHA-256 in dev when SHARED_SECRET is unset.
 */
function productToken(sku) {
  const key = SHARED_SECRET || 'dev'
  return 'GMP-' + createHmac('sha256', key)
    .update(sku)
    .digest('hex')
    .slice(0, 7)
    .toUpperCase()
}

/**
 * Sign / verify a short-lived DIRECT-download URL. The shop Worker mints these
 * after it has authorised the buyer (valid passcode cookie), so the browser can
 * stream the file straight from this origin — bypassing the Worker, whose CPU
 * budget can't absorb large files. The signature + expiry stand in for the
 * x-shop-secret header on this one route.
 */
function fileSig(orderId, sku, exp) {
  const key = SHARED_SECRET || 'dev'
  return createHmac('sha256', key).update(`${orderId}:${sku}:${exp}`).digest('hex')
}
function verifyFileSig(orderId, sku, exp, sig) {
  if (!exp || !sig) return false
  const expNum = Number(exp)
  if (!Number.isFinite(expNum) || Date.now() > expNum) return false
  const expected = fileSig(orderId, sku, String(exp))
  const a = Buffer.from(String(sig), 'hex')
  const b = Buffer.from(expected, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Verify the per-order print-asset token — Prodigi fetches the poster master
 *  headerless (it can't send the shared secret), so the URL is secured by a
 *  token bound to (photo id, A-size, order code). Same secret as the gate. */
function verifyAssetToken(id, size, orderCode, token) {
  if (!id || !size || !orderCode || !token) return false
  const expected = createHmac('sha256', SHARED_SECRET || 'dev')
    .update(`${id}:${size}:${orderCode}`)
    .digest('hex')
    .slice(0, 32)
  const a = Buffer.from(String(token))
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Customer-facing PHOTO reference — GMP-XXXXXXX from the photo id. The Lightroom
 *  plugin names master files by this, so the deliverable store carries the shop
 *  reference rather than raw camera filenames. */
function photoRef(id) {
  const key = SHARED_SECRET || 'dev'
  return 'GMP-' + createHmac('sha256', key)
    .update(id)
    .digest('hex')
    .slice(0, 7)
    .toUpperCase()
}

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
    const sku = `${id}-d-${tier.key}`
    out.push({
      sku,
      type: 'digital',
      label: tier.label,
      price: tier.price,
      currency: 'DKK',
      format: 'jpeg',
      dimensions: dims,
      downloadToken: productToken(sku),
    })
    // Pro TIFF immediately after Medium (3200px tier)
    if (rawAvailable && tier.key === 'med') {
      const proSku = `${id}-d-pro`
      out.push({
        sku: proSku,
        type: 'digital',
        label: 'Pro',
        price: TIFF_PRO_PRICE,
        currency: 'DKK',
        format: 'tiff',
        dimensions: dims,
        downloadToken: productToken(proSku),
      })
    }
  }
  // Master JPEG — always offered
  const masterSku = `${id}-d-master`
  out.push({
    sku: masterSku,
    type: 'digital',
    label: 'Master',
    price: bracketPrice(w, h, masterBrackets),
    currency: 'DKK',
    format: 'jpeg',
    dimensions: { w, h },
    downloadToken: productToken(masterSku),
  })
  // Original TIFF — only when rawAvailable
  if (rawAvailable) {
    const origSku = `${id}-d-original`
    out.push({
      sku: origSku,
      type: 'digital',
      label: 'Original',
      price: bracketPrice(w, h, tiffMasterBrackets),
      currency: 'DKK',
      format: 'tiff',
      dimensions: { w, h },
      downloadToken: productToken(origSku),
    })
  }
  return out
}

await mkdir(CACHE_DIR, { recursive: true })
await mkdir(FULFIL_CACHE_DIR, { recursive: true })
await mkdir(POSTER_ASSETS_DIR, { recursive: true })
await mkdir(ORDERS_DIR, { recursive: true })

// Monotonic preview-cache version. The Worker appends it to every preview URL as
// `?v=`, and loki's Cache Rule includes the query string in the cache key — so
// bumping it busts the immutable/1yr edge cache for ALL previews at once. Bumped
// whenever previews are re-rendered/re-watermarked. Persisted across restarts.
let _previewVersion = 1
try {
  const n = parseInt((await readFile(PREVIEW_VERSION_PATH, 'utf8')).trim(), 10)
  if (Number.isFinite(n) && n > 0) _previewVersion = n
} catch { /* default 1; the file is created on first bump */ }
const previewVersion = () => _previewVersion
async function bumpPreviewVersion() {
  _previewVersion += 1
  await writeFile(PREVIEW_VERSION_PATH, String(_previewVersion))
    .catch((err) => console.error('[preview-version] persist failed:', err.message))
  return _previewVersion
}

const app = express()
app.disable('x-powered-by')
// Gzip responses — catalog.json is ~2MB JSON and the tunnel upstream is slow
// (~80KB/s); compression cuts it ~6-8x so the worker's cold fetch drops from
// ~28s to a few seconds. Applies to all JSON/text responses.
app.use(compression())

/** Shared-secret gate — every route except /healthz requires the header. */
app.use((req, res, next) => {
  if (req.path === '/healthz') return next()
  // Watermarked previews are public-by-design (low-res, repeating mesh + logo
  // badge) and the same content is already publicly fetchable via the Worker's
  // /api/preview route. We serve them from a Cloudflare-proxied, cache-ruled
  // hostname with NO Worker in the path, so they cannot carry the shared secret.
  // Only this exact shape is exempt; catalog/masters/orders/admin stay gated.
  if (/^\/preview\/[A-Za-z0-9_-]+$/.test(req.path)) return next()
  // Signed, time-limited direct-download URLs bypass the header gate so the
  // browser streams the file straight from here (never through the Worker,
  // which would exhaust its CPU budget on large files).
  const m = req.path.match(/^\/orders\/([^/]+)\/file\/([^/]+)$/)
  if (
    m &&
    verifyFileSig(decodeURIComponent(m[1]), decodeURIComponent(m[2]), req.query.exp, req.query.sig)
  ) {
    return next()
  }
  // Token-gated print-asset URL — Prodigi pulls the poster master headerless, so
  // it's secured by the per-order token (bound to photo+size+order) instead.
  const a = req.path.match(/^\/fulfil\/poster\/([^/]+)\/([^/]+)$/)
  if (a && verifyAssetToken(decodeURIComponent(a[1]), decodeURIComponent(a[2]), req.query.o, req.query.t)) {
    return next()
  }
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
        // Print-fulfilment wiring (optional; undefined fields drop from JSON).
        // provider/providerSku map our SKU to the lab's product; attributes pin
        // the chosen variant (e.g. frame colour); cost (ex-tax minor, in
        // costCurrency) is for margin + the no-float transfer. See
        // docs/fap-print-fulfilment.md.
        provider: prod.provider,
        providerSku: prod.providerSku,
        attributes: prod.attributes,
        cost: prod.cost,
        costCurrency: prod.costCurrency,
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
    // previewVersion drives the `?v=` cache-buster the Worker appends to preview
    // URLs — bumped on re-render so loki's edge cache refreshes.
    res.json({ ...catalog, previewVersion: previewVersion() })
  } catch (err) {
    console.error('[catalog]', err)
    res.status(500).json({ error: 'catalog unavailable' })
  }
})

const GMP_PATH      = new URL('./gmp.png',  import.meta.url).pathname
const LOGO_SVG_PATH = new URL('./logo.svg', import.meta.url).pathname

/** Logo size as a fraction of the image height. */
const LOGO_HEIGHT_FRACTION = Number(process.env.LOGO_HEIGHT_FRACTION ?? 0.06)
/** Gap between logo and image edge in pixels. */
const LOGO_MARGIN = Number(process.env.LOGO_MARGIN ?? 14)

/** Cache the (normalised) SVG string so we only hit disk once. */
let _logoSvgRaw = null
async function getLogoSvg() {
  if (!_logoSvgRaw) {
    const raw = await readFile(LOGO_SVG_PATH, 'utf8')
    // Some exporters write dimensions in scientific notation (e.g. width="2e4").
    // Browsers reject that in width/height/viewBox (the SVG renders blank) and it
    // also defeats the literal width="20000" substitution used when rasterising —
    // normalise it to a plain integer so every consumer behaves.
    _logoSvgRaw = raw.replaceAll('2e4', '20000')
  }
  return _logoSvgRaw
}

/**
 * Build the logo composite for the watermark — sized to LOGO_HEIGHT_FRACTION of
 * the image height, 100% opacity, bottom-right corner.
 */
async function buildWatermarkComposites(imgW, imgH) {
  const logoSvgRaw = await getLogoSvg()

  // Size the logo to 12% of the image height.
  const logoSize = Math.max(8, Math.round(imgH * LOGO_HEIGHT_FRACTION))

  // Rasterise at 2× then resize — sharper anti-aliasing.
  const render = logoSize * 2
  const svg = logoSvgRaw
    .replace('width="20000"',  `width="${render}"`)
    .replace('height="20000"', `height="${render}"`)

  const logoBuf = await sharp(Buffer.from(svg))
    .resize(logoSize, logoSize, { fit: 'inside', kernel: 'lanczos3' })
    .png()
    .toBuffer()
  const { width: lw, height: lh } = await sharp(logoBuf).metadata()

  // Bottom-right corner with margin.
  const logoLeft = imgW - lw - LOGO_MARGIN
  const logoTop  = imgH - lh - LOGO_MARGIN

  return [
    { input: logoBuf, left: logoLeft, top: logoTop, blend: 'over' },
  ]
}

const previewCacheKey = (id, max, logo = true, poster = false) => {
  const base = max === PREVIEW_MAX ? id : `${id}-${max}`
  // The poster variant is centre-cropped to 4:5 portrait; it caches separately.
  const variant = poster ? `${base}-4x5` : base
  // The no-logo variant (posters / fine art) caches separately so we never serve
  // the wrong watermark. The repeating mesh is on both; only the badge differs.
  return logo ? `${variant}.jpg` : `${variant}-nologo.jpg`
}

/**
 * Resolve the disk path of a watermarked preview at size `max`, generating and
 * caching it on first use. Returns null if the clean source preview is absent.
 *
 * Generation (resize → tiled mesh → logo → mozjpeg) is the expensive bit, so it
 * runs once per (id, size) and is then a plain file-stream forever. Writes go to
 * a temp file and are renamed into place so a concurrent reader (or the warmer)
 * never sees a half-written file.
 */
async function buildPreview(id, max, logo = true, poster = false) {
  const cached = join(CACHE_DIR, previewCacheKey(id, max, logo, poster))
  try {
    await stat(cached)
    return cached // already generated
  } catch { /* generate below */ }

  const src = join(PREVIEWS_DIR, `${id}.jpg`)
  try {
    await stat(src)
  } catch {
    return null // no clean preview from Lightroom yet
  }

  let { data: resizedBuf, info: resizeInfo } = await sharp(src)
    .resize(max, max, { fit: 'inside', withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true })

  // Poster variant: centre-crop the resized preview to the 4:5 PORTRAIT poster
  // format — the same crop the print master uses, so preview = print. No upscale:
  // we extract the largest centred 4:5 region that fits the resized image.
  if (poster) {
    const RATIO = 4 / 5 // portrait width / height
    const { width: w, height: h } = resizeInfo
    let cw, ch
    if (w / h > RATIO) { ch = h; cw = Math.round(h * RATIO) } // too wide → trim sides
    else { cw = w; ch = Math.round(w / RATIO) }               // too tall → trim top/bottom
    const out = await sharp(resizedBuf)
      .extract({ left: Math.round((w - cw) / 2), top: Math.round((h - ch) / 2), width: cw, height: ch })
      .toBuffer({ resolveWithObject: true })
    resizedBuf = out.data
    resizeInfo = out.info
  }

  // The repeating mesh is always applied; the logo badge only for digital downloads.
  const composites = [{ input: GMP_PATH, tile: true, blend: 'over' }] // mesh layer
  if (logo) {
    composites.push(...await buildWatermarkComposites(resizeInfo.width, resizeInfo.height))
  }

  const tmp = `${cached}.tmp-${randomBytes(6).toString('hex')}`
  try {
    await sharp(resizedBuf)
      .composite(composites)
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(tmp)
    await rename(tmp, cached)
  } catch (err) {
    await unlink(tmp).catch(() => {})
    throw err
  }
  return cached
}

app.get('/preview/:id', async (req, res) => {
  const { id } = req.params
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return res.status(400).end()

  const requestedMax = parseInt(req.query.max, 10)
  const max = (!isNaN(requestedMax) && requestedMax > 0 && requestedMax < PREVIEW_MAX)
    ? requestedMax
    : PREVIEW_MAX

  // logo=0 → posters / fine-art variant (mesh watermark only, no logo badge).
  const logo = req.query.logo !== '0'
  // poster=1 → 4:5 portrait poster crop.
  const poster = req.query.poster === '1'

  try {
    const cached = await buildPreview(id, max, logo, poster)
    if (!cached) return res.status(404).json({ error: 'not found' })
    res.set('Cache-Control', 'public, max-age=31536000, immutable')
    res.type('jpeg')
    createReadStream(cached).pipe(res)
  } catch (err) {
    console.error('[preview]', id, err)
    res.status(500).json({ error: 'preview failed' })
  }
})

// ── Preview cache warming ─────────────────────────────────────────────────────
// Pre-generate watermarked previews so opening a large collection is always a
// cache hit, never dozens of on-the-fly sharp jobs competing for the NAS CPU.
// Sizes mirror what the grid/product pages request (the full 800 + the 400 used
// by srcSet). Throttled so warming never starves live requests.
const WARM_SIZES = [...new Set([PREVIEW_MAX, 400].filter((n) => n > 0 && n <= PREVIEW_MAX))]
// Default to 5 parallel jobs — matches the 5 dedicated cores (docker-compose
// cpus: "5") with sharp.concurrency(1), so a warm sweep keeps all 5 cores busy.
const WARM_CONCURRENCY = Math.max(1, Number(process.env.WARM_CONCURRENCY ?? 5))
let _warming = false

/**
 * The (logo, poster) preview variants a photo is actually shown in, by product
 * type — MUST mirror what ShopGrid / ShopProductView request so warming covers
 * every on-screen image (not just the digital one). digital → logo badge; poster
 * (print) → no logo + 4:5 crop; fine-art → no logo, full frame.
 */
function previewVariants(types) {
  const out = []
  if (types.includes('digital'))   out.push({ logo: true,  poster: false })
  if (types.includes('print'))     out.push({ logo: false, poster: true  })
  if (types.includes('fine-art'))  out.push({ logo: false, poster: false })
  if (out.length === 0)            out.push({ logo: true,  poster: false }) // safe default
  return out
}

/** The loki URL for a built variant, carrying the current cache-buster. */
function edgePreviewUrl(id, max, logo, poster, ver) {
  const qs = `max=${max}${logo ? '' : '&logo=0'}${poster ? '&poster=1' : ''}&v=${ver}`
  return `${PREVIEW_PUBLIC_BASE}/preview/${id}?${qs}`
}

/**
 * Warm the preview caches. Catalog-driven, so it builds exactly the variants each
 * photo is sold in. Two layers:
 *  - origin DISK cache (always): `buildPreview` for any missing variant.
 *  - loki EDGE cache (when primeEdge && PREVIEW_PUBLIC_BASE set): fetch each
 *    variant through loki so even the first global visitor gets a HIT. Best-effort
 *    and gated to manual warms / re-renders so the frequent fs.watch auto-sweep
 *    only fills the cheap disk cache.
 */
async function warmPreviewCache(primeEdge = false) {
  if (_warming) return
  _warming = true
  try {
    let photos
    try {
      ;({ photos } = await loadCatalog())
    } catch (err) {
      console.warn('[warm] cannot load catalog:', err.message)
      return
    }
    const jobs = []
    for (const p of photos) {
      const types = [...new Set((p.products ?? []).map((pr) => pr.type))]
      for (const max of WARM_SIZES)
        for (const v of previewVariants(types))
          jobs.push({ id: p.id, max, logo: v.logo, poster: v.poster })
    }
    if (jobs.length === 0) return

    const ver = previewVersion()
    const doPrime = primeEdge && Boolean(PREVIEW_PUBLIC_BASE)
    let cursor = 0, built = 0, failed = 0, primed = 0
    const started = Date.now()
    const run = async () => {
      for (;;) {
        const idx = cursor++
        if (idx >= jobs.length) return
        const { id, max, logo, poster } = jobs[idx]
        let ok = true
        try {
          await stat(join(CACHE_DIR, previewCacheKey(id, max, logo, poster)))
        } catch {
          try { await buildPreview(id, max, logo, poster); built++ }
          catch (err) { ok = false; failed++; console.error('[warm]', id, max, err.message) }
        }
        // Prime loki's edge for this exact variant. The origin's own GET reaches
        // the CF edge: a miss pulls from here (populating the edge + tiered upper
        // tier), a hit is cheap. Draining the body ensures the entry is stored.
        if (ok && doPrime) {
          try {
            const r = await fetch(edgePreviewUrl(id, max, logo, poster, ver))
            if (r.ok) { primed++; await r.arrayBuffer().catch(() => {}) }
          } catch { /* best-effort — the disk cache already backs this variant */ }
        }
      }
    }
    await Promise.all(Array.from({ length: WARM_CONCURRENCY }, run))
    if (built || failed || primed) {
      const secs = ((Date.now() - started) / 1000).toFixed(1)
      console.log(`[warm] built ${built}, primed ${primed}${failed ? `, ${failed} failed` : ''} in ${secs}s (v${ver})`)
    }
  } finally {
    _warming = false
  }
}

// Re-warm shortly after the plugin publishes new previews. fs.watch is coalesced
// with a debounce so a burst of writes triggers a single sweep; if the platform
// doesn't support watching this mount we simply rely on startup + manual warming.
let _warmTimer = null
function scheduleWarm(delay = 5000) {
  if (_warmTimer) clearTimeout(_warmTimer)
  _warmTimer = setTimeout(() => { _warmTimer = null; warmPreviewCache() }, delay)
}
try {
  const { watch } = await import('node:fs')
  watch(PREVIEWS_DIR, { persistent: false }, () => scheduleWarm())
} catch (err) {
  console.warn('[warm] preview dir watch unavailable:', err.message)
}

/** Manually kick a warm sweep (secret-gated like everything else). Manual warms
 *  also prime the loki edge cache, not just the origin disk. */
app.post('/admin/warm', (_req, res) => {
  warmPreviewCache(true).catch((err) => console.error('[warm] manual sweep failed:', err.message))
  res.json({ ok: true })
})

/** Send a preview of the real, branded download email so the design can be
 *  checked in a live client (incl. light/dark). Secret-gated. Defaults to
 *  MAIL_FROM (yourself); pass {"to":"...","locale":"de"} to override. */
app.post('/admin/email-test', express.json({ limit: '4kb' }), async (req, res) => {
  if (!emailConfigured()) {
    return res.status(503).json({ error: 'SMTP not configured (set SMTP_USER/SMTP_PASS)' })
  }
  const to = String(req.body?.to || MAIL_FROM || SMTP_USER || '').trim()
  if (!to) return res.status(400).json({ error: 'no recipient — set MAIL_FROM or pass {to}' })
  const locale = String(req.body?.locale || 'en')
  try {
    await sendDownloadEmail({
      email: to,
      orderId: 'pi_preview_0000000000',
      passcode: 'TEST7Q2X',
      locale,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      items: [
        { label: 'Standard', format: 'jpeg', token: productToken('preview-std') },
        { label: 'Master',   format: 'jpeg', token: productToken('preview-master') },
      ],
    })
    res.json({ ok: true, to, locale, note: 'branded download-email preview sent' })
  } catch (err) {
    console.error('[email] test send failed:', err.message)
    res.status(502).json({ error: 'send failed', detail: err.message })
  }
})

//==================================================================--
// Fulfilment (Phase 2) — gated behind a verified Stripe payment.
//==================================================================--

const COPYRIGHT = 'Copyright © Gus McEwan Photography, All Rights Reserved. https://gusmcewan.com'

/** Usage-rights tier from the product label (mirrors shop.ts productLicense). */
function licenseTier(label) {
  if (label === 'Pro') return 'editorial'
  if (label === 'Master') return 'commercial'
  if (label === 'Original') return 'full-commercial'
  return 'personal' // Standard, Medium
}

/** UsageTerms wording embedded in the delivered file, per licence tier. */
const USAGE_TERMS = {
  'personal':
    'Licensed for personal, non-commercial use only. No resale, redistribution, or commercial exploitation. © Gus McEwan Photography.',
  'editorial':
    'Licensed for editorial use (news, commentary, non-advertising contexts) with credit "© Gus McEwan Photography". No resale or redistribution. © Gus McEwan Photography.',
  'commercial':
    'Licensed for commercial use by the purchaser. No resale or redistribution of the file itself. © Gus McEwan Photography.',
  'full-commercial':
    'Full commercial licence to the purchaser, including the full-resolution master. No resale or redistribution of the file itself. © Gus McEwan Photography.',
}

async function fileIfExists(p) {
  try { await stat(p); return p } catch { return null }
}

/** Find a digital product (and its photo) by SKU across the live catalog. */
async function findProductBySku(sku) {
  const { photos } = await loadCatalog()
  for (const photo of photos) {
    const product = (photo.products ?? []).find((p) => p.sku === sku)
    if (product) return { photo, product }
  }
  return null
}

/**
 * Locate the edited master for a photo id — the deliverable source. Prefers the
 * wanted bit depth (TIFF for TIFF tiers, JPEG otherwise) but accepts the other
 * if only it exists. Throws if no master is present: every sold photo gets one
 * on publish, so a miss means that photo needs re-publishing.
 */
async function resolveSource(id, format) {
  // Masters are named by the GMP reference (the plugin's naming); fall back to
  // the legacy camera-filename id for masters written before that change.
  const ref = photoRef(id)
  const jpg = (await fileIfExists(join(MASTERS_DIR, `${ref}.jpg`)))
    ?? (await fileIfExists(join(MASTERS_DIR, `${id}.jpg`)))
    ?? (await fileIfExists(join(MASTERS_DIR, `${id}.jpeg`)))
  const tif = (await fileIfExists(join(MASTERS_DIR, `${ref}.tif`)))
    ?? (await fileIfExists(join(MASTERS_DIR, `${id}.tif`)))
    ?? (await fileIfExists(join(MASTERS_DIR, `${id}.tiff`)))
  const master = format === 'tiff' ? (tif ?? jpg) : (jpg ?? tif)
  if (!master) {
    const e = new Error(`no master for ${id} (expected ${ref}.jpg/.tif) in ${MASTERS_DIR} — export the master for this photo`)
    e.code = 'NO_MASTER'
    throw e
  }
  return master
}

/** Locate a master of an EXACT bit depth (no cross-format fallback) — for the
 *  admin "show whichever masters exist" links. Returns the path or null. */
async function findMaster(id, format) {
  const ref = photoRef(id)
  if (format === 'tiff') {
    return (await fileIfExists(join(MASTERS_DIR, `${ref}.tif`)))
      ?? (await fileIfExists(join(MASTERS_DIR, `${id}.tif`)))
      ?? (await fileIfExists(join(MASTERS_DIR, `${id}.tiff`)))
  }
  return (await fileIfExists(join(MASTERS_DIR, `${ref}.jpg`)))
    ?? (await fileIfExists(join(MASTERS_DIR, `${id}.jpg`)))
    ?? (await fileIfExists(join(MASTERS_DIR, `${id}.jpeg`)))
}

/** The poster sheet's foot line, e.g. "WWW.GUSMCEWAN.COM". */
const POSTER_SITE_LABEL = `WWW.${new URL(SITE_URL).host.replace(/^www\./, '').toUpperCase()}`

/**
 * Generate-or-reuse the poster MASTER for a (photo, A-size) — the Prodigi print
 * asset: the photo centre-cropped to 4:5 on a white A-series sheet with the
 * typeset caption/title/website band, NO watermark, 300 dpi. Identical for every
 * buyer of that photo+size (paper doesn't change the artwork), so cached by
 * ref+size. Mirrors the on-screen PosterMat exactly (see poster.js).
 */
async function buildPosterMaster(id, size, force = false) {
  const out = join(POSTER_ASSETS_DIR, `${photoRef(id)}-${size}.jpg`)
  if (!force && (await fileIfExists(out))) return out

  const { photos } = await loadCatalog()
  const photo = photos.find((p) => p.id === id)
  if (!photo) {
    const e = new Error(`no photo ${id} in catalog`)
    e.code = 'NO_PHOTO'
    throw e
  }

  const masterPath = await resolveSource(id, 'jpeg') // full-res edited master
  // Untitled photos show the GMP reference as the title (mirrors the shop).
  const titled = photo.title && photo.title.toLowerCase() !== id.toLowerCase()
  const buf = await renderPosterMaster({
    photo: masterPath,
    size,
    title: titled ? photo.title : photoRef(id),
    caption: photo.caption || '',
    siteLabel: POSTER_SITE_LABEL,
  })

  const tmp = `${out}.tmp-${randomBytes(6).toString('hex')}.jpg`
  try {
    await writeFile(tmp, buf)
    await rename(tmp, out)
  } catch (err) {
    await unlink(tmp).catch(() => {})
    throw err
  }
  return out
}

/**
 * Serve the poster master for a (photo, A-size). Secret-gated by the global
 * middleware (the Worker proxies with the shared secret; later, Prodigi fetches
 * a signed variant at order time). Generated on first request, then a plain
 * file stream forever.
 */
app.get('/poster-master/:id/:size', async (req, res) => {
  const { id, size } = req.params
  if (!/^[A-Za-z0-9_-]+$/.test(id) || !POSTER_SIZES.includes(size)) {
    return res.status(400).json({ error: 'bad request' })
  }
  try {
    const path = await buildPosterMaster(id, size)
    res.set('Cache-Control', 'public, max-age=31536000, immutable')
    res.type('jpeg')
    createReadStream(path).pipe(res)
  } catch (err) {
    const notFound = err.code === 'NO_PHOTO' || err.code === 'NO_MASTER'
    if (!notFound) console.error('[poster-master]', id, size, err)
    res.status(notFound ? 404 : 500).json({ error: err.message })
  }
})

/**
 * Public, token-gated poster master for Prodigi. Same render as /poster-master,
 * but Prodigi fetches it headerless (it can't send the shared secret), so the
 * URL carries a per-order token verified in the gate. This is the print asset we
 * hand Prodigi at order time.
 */
app.get('/fulfil/poster/:id/:size', async (req, res) => {
  const { id, size } = req.params
  if (!/^[A-Za-z0-9_-]+$/.test(id) || !POSTER_SIZES.includes(size)) {
    return res.status(400).json({ error: 'bad request' })
  }
  try {
    const path = await buildPosterMaster(id, size)
    res.set('Cache-Control', 'public, max-age=31536000, immutable')
    res.type('jpeg')
    createReadStream(path).pipe(res)
  } catch (err) {
    const notFound = err.code === 'NO_PHOTO' || err.code === 'NO_MASTER'
    if (!notFound) console.error('[fulfil-poster]', id, size, err)
    res.status(notFound ? 404 : 500).json({ error: err.message })
  }
})

/**
 * PRE-RENDER a batch of poster assets (force-regenerate, so a republished poster
 * with a new title/crop is refreshed). The Worker enumerates the qualifying
 * (photo, size) pairs — it owns the resolution-gating range — and POSTs the flat
 * list here; we render them in the BACKGROUND (WARM_CONCURRENCY jobs at once, to
 * fill the container's dedicated cores) and return immediately. Idempotent:
 * re-running just re-renders.
 */
app.post('/admin/poster-prerender', express.json({ limit: '256kb' }), async (req, res) => {
  const items = Array.isArray(req.body?.items)
    ? req.body.items.filter(
        (x) => x && typeof x.id === 'string' && /^[A-Za-z0-9_-]+$/.test(x.id) && POSTER_SIZES.includes(x.size),
      )
    : []
  res.json({ ok: true, queued: items.length })
  // Background — never blocks the response; the Worker just kicks this off.
  // WARM_CONCURRENCY jobs in parallel (single-threaded each) to use the dedicated
  // cores; each poster master is a large 300-dpi render.
  ;(async () => {
    let done = 0
    let failed = 0
    let cursor = 0
    const worker = async () => {
      for (;;) {
        const idx = cursor++
        if (idx >= items.length) return
        const { id, size } = items[idx]
        try {
          await buildPosterMaster(id, size, true)
          done += 1
        } catch (err) {
          failed += 1
          console.error('[poster-prerender]', id, size, err.message)
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(WARM_CONCURRENCY, items.length || 1) }, worker))
    console.log(`[poster-prerender] done ${done}/${items.length}` + (failed ? ` (${failed} failed)` : ''))
  })().catch((err) => console.error('[poster-prerender] batch error:', err.message))
})

/**
 * Admin asset info for a photo — which poster A-sizes are ALREADY pre-rendered
 * (present in POSTER_ASSETS_DIR) and which masters exist (in MASTERS_DIR). Lets
 * the admin Product lookup link only to assets that actually exist, never
 * triggering a render. Secret-gated by the global middleware.
 */
app.get('/admin/asset-info/:id', async (req, res) => {
  const { id } = req.params
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return res.status(400).json({ error: 'bad id' })
  const ref = photoRef(id)
  const posterSizes = []
  for (const size of POSTER_SIZES) {
    if (await fileIfExists(join(POSTER_ASSETS_DIR, `${ref}-${size}.jpg`))) posterSizes.push(size)
  }
  res.json({
    posterSizes,
    masters: {
      jpeg: Boolean(await findMaster(id, 'jpeg')),
      tiff: Boolean(await findMaster(id, 'tiff')),
    },
  })
})

/**
 * Admin master download — stream a photo's edited master (JPEG) or original
 * (TIFF) straight from MASTERS_DIR, exact bit depth (404 if that format isn't
 * present). Secret-gated; the Worker proxies it behind the admin session.
 */
app.get('/admin/master/:id/:format', async (req, res) => {
  const { id, format } = req.params
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return res.status(400).json({ error: 'bad id' })
  if (format !== 'jpeg' && format !== 'tiff') return res.status(400).json({ error: 'bad format' })
  const path = await findMaster(id, format)
  if (!path) return res.status(404).json({ error: `no ${format} master for ${id}` })
  const isTiff = /\.tiff?$/i.test(path)
  res.set('Content-Type', isTiff ? 'image/tiff' : 'image/jpeg')
  res.set('Content-Disposition', `inline; filename="${basename(path)}"`)
  res.set('Cache-Control', 'private, no-store')
  createReadStream(path).pipe(res)
})

/**
 * Reconcile the masters + poster-asset folders against the live catalog:
 *  - missingMasters: catalog photos with NO usable master at all (neither JPEG nor
 *    TIFF), plus rawAvailable photos missing the real TIFF the Original/Pro tiers
 *    promise — i.e. a master missed during export. A poster/JPEG photo that holds
 *    only a TIFF (or vice-versa) is fully fulfillable and is not flagged.
 *  - orphanMasters: master files with no catalog photo (deleted-but-left-behind).
 *  - orphanPosterAssets: pre-rendered poster files whose photo is gone or no
 *    longer offered as a poster.
 */
async function auditAssets() {
  const { photos } = await loadCatalog()
  const refToPhoto = new Map()  // GMP ref -> photo (master/asset naming)
  const idSet = new Set()       // legacy camera-filename ids
  const posterRefs = new Set()  // refs of photos still offered as posters
  for (const p of photos) {
    const ref = photoRef(p.id)
    refToPhoto.set(ref, p)
    idSet.add(p.id)
    if ((p.products ?? []).some((pr) => pr.type === 'print')) posterRefs.add(ref)
  }

  // 1) Missing masters. Fulfilment resolves a source as (jpg ?? tif) — both poster
  //    rendering and digital derivatives accept EITHER bit depth — so a photo only
  //    truly lacks a master when NEITHER exists. rawAvailable is the one case that
  //    promises a real TIFF (the Original/Pro tiers), so it gets its own check; a
  //    poster/JPEG-only photo holding just a TIFF master is fully fulfillable and
  //    must NOT be flagged.
  const missingMasters = []
  for (const p of photos) {
    const needs = []
    const hasJpeg = Boolean(await findMaster(p.id, 'jpeg'))
    const hasTiff = Boolean(await findMaster(p.id, 'tiff'))
    if (!hasJpeg && !hasTiff) needs.push('master')
    if (p.rawAvailable && !hasTiff) needs.push('tiff')
    if (needs.length) missingMasters.push({ id: p.id, ref: photoRef(p.id), slug: p.slug, title: p.title || '', needs })
  }

  // 2) Orphan masters — master files for no catalog photo.
  const orphanMasters = []
  for (const name of await readdir(MASTERS_DIR).catch(() => [])) {
    if (!/\.(jpe?g|tiff?)$/i.test(name)) continue
    const base = name.replace(/\.(jpe?g|tiff?)$/i, '')
    if (!refToPhoto.has(base) && !idSet.has(base)) orphanMasters.push(name)
  }

  // 3) Orphan poster assets — <ref>-<size>.jpg whose ref isn't a current poster.
  const orphanPosterAssets = []
  for (const name of await readdir(POSTER_ASSETS_DIR).catch(() => [])) {
    if (!name.toLowerCase().endsWith('.jpg')) continue
    const m = name.match(/^(.+)-([A-Za-z0-9]+)\.jpg$/i)
    if (!m || !POSTER_SIZES.includes(m[2]) || !posterRefs.has(m[1])) orphanPosterAssets.push(name)
  }

  return { catalogCount: photos.length, missingMasters, orphanMasters, orphanPosterAssets }
}

/** Asset audit — read-only reconciliation report. Secret-gated. */
app.get('/admin/asset-audit', async (_req, res) => {
  try {
    res.json(await auditAssets())
  } catch (err) {
    console.error('[asset-audit]', err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * Prune the orphans of one scope (recomputed here, never trusting a client list).
 * `poster-assets` is always safe (derived, regenerable). `masters` deletes the
 * deliverable source for photos no longer in the catalog — gated behind an
 * explicit admin confirm in the UI.
 */
app.post('/admin/asset-prune', express.json({ limit: '4kb' }), async (req, res) => {
  const scope = req.body?.scope
  if (scope !== 'poster-assets' && scope !== 'masters') {
    return res.status(400).json({ error: 'bad scope' })
  }
  try {
    const audit = await auditAssets()
    const names = scope === 'masters' ? audit.orphanMasters : audit.orphanPosterAssets
    const dir = scope === 'masters' ? MASTERS_DIR : POSTER_ASSETS_DIR
    let deleted = 0
    for (const name of names) {
      if (name.includes('/') || name.includes('\\') || name.includes('..')) continue
      await unlink(join(dir, name)).then(() => { deleted += 1 }).catch(() => {})
    }
    res.json({ ok: true, scope, deleted, total: names.length })
  } catch (err) {
    console.error('[asset-prune]', err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * Generate-or-reuse the copyright-embedded deliverable for a product. Cached by
 * SKU (the output is identical for every buyer of that SKU). Returns the cached
 * path plus the customer-facing filename and content type.
 */
async function generateDerivative(photo, product) {
  const ext = product.format === 'tiff' ? 'tiff' : 'jpg'
  const out = join(FULFIL_CACHE_DIR, `${product.sku}.${ext}`)
  const filename = `${product.downloadToken}.${ext}`
  const contentType = ext === 'tiff' ? 'image/tiff' : 'image/jpeg'

  if (await fileIfExists(out)) return { path: out, filename, contentType }

  const srcPath = await resolveSource(photo.id, product.format)
  const target = product.dimensions ?? { w: photo.width, h: photo.height }
  // Only ever re-encode when the sold size is genuinely smaller than the master.
  // Full-size tiers (Master, Original) ship the EXACT bytes exported from
  // Lightroom — copied, never recompressed.
  const needsResize = target.w < photo.width || target.h < photo.height

  // Build in a temp file and move it into place only once fully done. A failure
  // (resize, or the metadata write) must never leave a half-made file in the
  // cache that later requests would serve as a finished product.
  const tmp = `${out}.tmp-${randomBytes(6).toString('hex')}.${ext}`
  try {
    if (!needsResize) {
      await copyFile(srcPath, tmp)
    } else {
      let pipeline = sharp(srcPath, { limitInputPixels: false })
        .rotate() // apply EXIF orientation before re-encoding
        .resize(target.w, target.h, { fit: 'inside', withoutEnlargement: true })
        .keepIccProfile() // preserve the colour profile — do NOT strip it
      pipeline = product.format === 'tiff'
        ? pipeline.tiff({ compression: 'deflate', predictor: 'horizontal' }) // lossless
        : pipeline.jpeg({ quality: 100, chromaSubsampling: '4:4:4', mozjpeg: true }) // visually lossless
      await pipeline.toFile(tmp)
    }

    // Embed copyright / usage metadata. For copied masters this only adds rights
    // tags; the image data is untouched. The ICC profile is preserved either way.
    const tier = licenseTier(product.label)
    await exiftool.write(tmp, {
      Artist: 'Gus McEwan',
      'XMP-dc:Creator': 'Gus McEwan',
      'IPTC:By-line': 'Gus McEwan',
      Copyright: COPYRIGHT,
      'IPTC:CopyrightNotice': COPYRIGHT,
      'XMP-dc:Rights': COPYRIGHT,
      'XMP-xmpRights:WebStatement': 'https://gusmcewan.com',
      'XMP-xmpRights:Marked': 'True', // exiftool can't encode a JS boolean; use the literal flag
      'XMP-xmpRights:UsageTerms': USAGE_TERMS[tier],
      CreatorWorkURL: 'https://gusmcewan.com',
      // -overwrite_original: write in place, no "<file>_original" backup beside it.
    }, { writeArgs: ['-overwrite_original'] })

    await rename(tmp, out)
  } catch (err) {
    await unlink(tmp).catch(() => {})
    throw err
  }

  return { path: out, filename, contentType }
}

// ── Download grants ──────────────────────────────────────────────────────────

/** Human passcode — 8 chars, Crockford base32 (no I/L/O/U). */
function generatePasscode() {
  const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  const bytes = randomBytes(8)
  let out = ''
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % 32]
  return out
}

/** Constant-time string comparison. */
function safeEqualStr(a, b) {
  const ba = Buffer.from(String(a), 'utf8')
  const bb = Buffer.from(String(b), 'utf8')
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

function orderPath(orderId) {
  if (!/^[A-Za-z0-9_-]+$/.test(orderId)) return null
  return join(ORDERS_DIR, `${orderId}.json`)
}

async function readGrant(orderId) {
  const p = orderPath(orderId)
  if (!p) return null
  try { return JSON.parse(await readFile(p, 'utf8')) } catch { return null }
}

function customerFilename(item) {
  return `${item.token}.${item.format === 'tiff' ? 'tiff' : 'jpg'}`
}

// ── Invoice numbering ─────────────────────────────────────────────────────────
// A single continuous, gap-free sequence (a legal requirement). Only LIVE orders
// consume a number — test orders get a clearly-marked non-invoice. The counter
// is a tiny JSON file; this is a single-process server so read-bump-write is safe.
const INVOICE_COUNTER_PATH = join(ORDERS_DIR, '_invoice-counter.json')

async function nextInvoiceNumber(year) {
  let n = 0
  try { n = JSON.parse(await readFile(INVOICE_COUNTER_PATH, 'utf8')).seq || 0 } catch { /* first run */ }
  n += 1
  await writeFile(INVOICE_COUNTER_PATH, JSON.stringify({ seq: n }), 'utf8')
  return `${year}-${String(n).padStart(4, '0')}`
}

const CREDIT_COUNTER_PATH = join(ORDERS_DIR, '_credit-counter.json')

/** Gap-free sequential credit-note number, e.g. "C-2026-0001". */
async function nextCreditNumber(year) {
  let n = 0
  try { n = JSON.parse(await readFile(CREDIT_COUNTER_PATH, 'utf8')).seq || 0 } catch { /* first run */ }
  n += 1
  await writeFile(CREDIT_COUNTER_PATH, JSON.stringify({ seq: n }), 'utf8')
  return `C-${year}-${String(n).padStart(4, '0')}`
}

/** YYYYMMDD prefix from a grant's invoice/created date, for sortable filenames. */
function dateStamp(grant) {
  const d = new Date(grant.invoiceDate || grant.paidAt || grant.createdAt || Date.now())
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
}

/** Build the receipt PDF + filename for a grant (regenerated on demand from the
 *  stored grant — deterministic). `lang` forces the language (accounting export). */
async function invoiceForGrant(grant, lang) {
  const priceBySku = await catalogPriceMap()
  const buffer = await buildInvoicePdf(grant, priceBySku, lang)
  const safe = String(grant.invoiceNumber || grant.orderId).replace(/[^A-Za-z0-9_-]/g, '_')
  return { buffer, filename: `${dateStamp(grant)}-Invoice-${safe}.pdf` }
}

/** Build the standalone localized licence PDF + filename, or null when the grant
 *  has no terms snapshot (legacy orders). */
async function licenseForGrant(grant, lang) {
  const buffer = await buildLicensePdf(grant, lang)
  if (!buffer) return null
  const safe = String(grant.invoiceNumber || grant.orderId).replace(/[^A-Za-z0-9_-]/g, '_')
  return { buffer, filename: `${dateStamp(grant)}-Licence-${safe}.pdf` }
}

/** Build the refund credit-note PDF + filename (date = refund date), or null when
 *  the order has no recorded refund. */
async function refundForGrant(grant, lang) {
  const priceBySku = await catalogPriceMap()
  const buffer = await buildRefundPdf(grant, priceBySku, lang)
  if (!buffer) return null
  const safe = String(grant.creditNumber || grant.invoiceNumber || grant.orderId).replace(/[^A-Za-z0-9_-]/g, '_')
  const d = new Date(grant.creditDate || grant.refundedAt || Date.now())
  const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
  return { buffer, filename: `${stamp}-Refund-${safe}.pdf` }
}

// ── Email ────────────────────────────────────────────────────────────────────

// Order ids whose download email is being sent right now — guards against the
// issue route and the Stripe webhook both emailing the same order.
const _emailingNow = new Set()

let _mailer = null
function mailer() {
  if (!_mailer) {
    _mailer = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,     // 465 = implicit TLS; 587 = STARTTLS
      requireTLS: SMTP_PORT !== 465, // force STARTTLS on 587 (iCloud)
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      tls: { minVersion: 'TLSv1.2' },
    })
  }
  return _mailer
}

const emailConfigured = () => Boolean(SMTP_USER && SMTP_PASS)

/** Probe the SMTP connection/credentials at startup so a misconfiguration shows
 *  up in the logs immediately, not on the first sale. */
async function verifyMailer() {
  if (!emailConfigured()) {
    console.warn('[email] SMTP not configured (SMTP_USER/SMTP_PASS empty) — emails are disabled')
    return false
  }
  try {
    await mailer().verify()
    console.log(`[email] SMTP ready — ${SMTP_USER} via ${SMTP_HOST}:${SMTP_PORT}`)
    return true
  } catch (err) {
    console.error(`[email] SMTP verify FAILED (${SMTP_USER} via ${SMTP_HOST}:${SMTP_PORT}):`, err.message)
    return false
  }
}

const BRAND_NAME = 'Gus McEwan Photography'
const LOGO_CID = 'brandlogo'
const LOGO_DISPLAY_H = 44 // px shown in the email masthead

/** The email logo: the brand-red signature only. The source artwork layers a
 *  grey drop-shadow (.st0/.st2 paths) behind the red mark (.st1) — that shadow
 *  reads as an odd halo on a flat email, so we drop it and render the clean red
 *  signature, trimmed of padding. Returns the PNG plus its display dimensions.
 *  Cached for the process. */
let _emailLogo = null
async function getEmailLogo() {
  if (_emailLogo) return _emailLogo
  const svg = (await getLogoSvg())
    .replace('width="20000"', 'width="1200"')
    .replace('height="20000"', 'height="1200"')
  // Render large, trim transparent padding, then scale to 2× the display height.
  const trimmed = await sharp(Buffer.from(svg)).resize(1200, 1200, { fit: 'inside' }).trim().png().toBuffer()
  const content = await sharp(trimmed).resize({ height: LOGO_DISPLAY_H * 2 }).png().toBuffer()
  const meta = await sharp(content).metadata()
  _emailLogo = {
    content,
    width: Math.round(meta.width / 2),
    height: Math.round(meta.height / 2),
  }
  return _emailLogo
}

/** Human, locale-aware expiry date (e.g. "5 July 2026" / "2026年7月5日"). */
function formatExpiry(expiresAt, locale) {
  try {
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, {
      year: 'numeric', month: 'long', day: 'numeric',
    }).format(new Date(expiresAt))
  } catch {
    return new Date(expiresAt).toISOString().slice(0, 10)
  }
}

async function sendDownloadEmail({ email, orderId, passcode, items, locale, expiresAt, invoice, license }) {
  if (!email) throw new Error('no recipient email')
  if (!emailConfigured()) throw new Error('SMTP not configured')

  const loc = locale || 'en'
  const logo = await getEmailLogo()
  const { subject, text, html } = renderDownloadEmail({
    locale: loc,
    brandName: BRAND_NAME,
    url: `${SITE_URL}/${loc}/shop/downloads/${orderId}`,
    passcode,
    items: items.map((i) => ({ label: i.label, filename: customerFilename(i), format: i.format })),
    expiryText: formatExpiry(expiresAt, loc),
    copyright: COPYRIGHT,
    logoCid: LOGO_CID,
    logoW: logo.width,
    logoH: logo.height,
  })

  await mailer().sendMail({
    from: MAIL_FROM,
    to: email,
    replyTo: MAIL_FROM,
    subject,
    text,
    html,
    attachments: [
      { filename: 'logo.png', content: logo.content, cid: LOGO_CID, contentDisposition: 'inline' },
      ...(invoice ? [{ filename: invoice.filename, content: invoice.buffer, contentType: 'application/pdf' }] : []),
      ...(license ? [{ filename: license.filename, content: license.buffer, contentType: 'application/pdf' }] : []),
    ],
  })
}

/** Email the buyer a refund confirmation with the credit-note PDF attached. */
async function sendRefundEmail({ email, locale, amountText, refund }) {
  if (!email) throw new Error('no recipient email')
  if (!emailConfigured()) throw new Error('SMTP not configured')
  const loc = locale || 'en'
  const logo = await getEmailLogo()
  const { subject, text, html } = renderRefundEmail({
    locale: loc,
    brandName: BRAND_NAME,
    amountText,
    copyright: COPYRIGHT,
    logoCid: LOGO_CID,
    logoW: logo.width,
    logoH: logo.height,
  })
  await mailer().sendMail({
    from: MAIL_FROM,
    to: email,
    replyTo: MAIL_FROM,
    subject,
    text,
    html,
    attachments: [
      { filename: 'logo.png', content: logo.content, cid: LOGO_CID, contentDisposition: 'inline' },
      ...(refund ? [{ filename: refund.filename, content: refund.buffer, contentType: 'application/pdf' }] : []),
    ],
  })
}

// ── Fulfilment routes ─────────────────────────────────────────────────────────

/** Generate (and cache) every deliverable in a grant, one at a time. Fire-and-
 *  forget from /orders so downloads are instant and the meta endpoint can report
 *  each file's size. Best-effort; a single failure doesn't stop the rest. */
async function pregenerateGrant(grant) {
  for (const i of grant.items) {
    try {
      const found = await findProductBySku(i.sku)
      if (found && found.product.type === 'digital') {
        await generateDerivative(found.photo, found.product)
      }
    } catch (err) {
      console.error('[pregenerate]', i.sku, err.message)
    }
  }
}

/** Issue a download grant + email it. Called by the shop Worker (Stripe webhook
 *  and the post-payment issue route). Idempotent on orderId.
 *
 *  The grant is persisted up front and email is best-effort: a download must not
 *  depend on SMTP deliverability (and the buyer is auto-unlocked right after
 *  payment anyway). If the email didn't send, a later call retries it using the
 *  stored passcode. The passcode is kept in plain text — this file lives on the
 *  NAS behind the shared secret, and the email carries it in clear regardless. */
app.post('/orders', express.json({ limit: '64kb' }), async (req, res) => {
  const { orderId, paymentId, email, locale, items,
          livemode, amount, currency, taxAmount, taxCountry, cardCountry,
          buyerIp, buyerCountry, paidAt, paymentMethod, terms,
          vatId, businessName, businessAddress, reverseCharge, vatConsultation,
          lineItems, shipping } = req.body ?? {}
  // `items` (downloads) may be empty for a physical-only order — those still
  // record (invoice + Prodigi). Require a valid order id + an items array.
  if (!orderId || !orderPath(orderId) || !Array.isArray(items)) {
    return res.status(400).json({ error: 'invalid order' })
  }

  let grant = await readGrant(orderId)
  if (!grant) {
    const now = Date.now()
    const fresh = {
      orderId,
      paymentId: paymentId ? String(paymentId) : null, // Stripe pi_ id, for reconciliation
      email: email ? String(email) : null,
      passcode: generatePasscode(),
      items: items.map((i) => ({
        sku: i.sku, token: i.token, format: i.format, label: i.label, slug: i.slug,
      })),
      // Payment facts for the admin orders table (test vs live, total, tax).
      livemode: typeof livemode === 'boolean' ? livemode : null,
      amount: Number.isFinite(amount) ? amount : null,
      currency: currency ? String(currency) : null,
      taxAmount: Number.isFinite(taxAmount) ? taxAmount : null,
      taxCountry: taxCountry ? String(taxCountry) : null,
      cardCountry: cardCountry ? String(cardCountry) : null,
      // VAT place-of-supply evidence (Cloudflare geolocation) + receipt facts.
      buyerIp: buyerIp ? String(buyerIp) : null,
      buyerCountry: buyerCountry ? String(buyerCountry) : null,
      paidAt: Number.isFinite(paidAt) ? paidAt : null,
      paymentMethod: paymentMethod ? String(paymentMethod) : null,
      locale: locale ? String(locale) : 'en',
      // Snapshot of the licensing terms in the buyer's language (invoice page 2).
      terms: terms && typeof terms === 'object' ? terms : null,
      // B2B: validated VAT id, business name, reverse-charge (0%) flag.
      vatId: vatId ? String(vatId) : null,
      businessName: businessName ? String(businessName) : null,
      businessAddress: businessAddress ? String(businessAddress) : null,
      reverseCharge: reverseCharge === true,
      vatConsultation: vatConsultation ? String(vatConsultation) : null,
      // Full itemised order (digital + physical) for the mixed-order invoice —
      // each line's net reconciles to the order net by construction. Shipping
      // name/address (physical) drives the invoice "Bill To" + Prodigi recipient.
      lineItems: Array.isArray(lineItems)
        ? lineItems.map((l) => ({
            sku: String(l.sku || ''),
            label: String(l.label || ''),
            qty: Number(l.qty) || 1,
            net: Number(l.net) || 0,
            detail: l.detail ? String(l.detail) : null,
            filename: l.filename ? String(l.filename) : null,
          }))
        : null,
      shipping: shipping && typeof shipping === 'object'
        ? {
            name: shipping.name ? String(shipping.name) : null,
            address: shipping.address && typeof shipping.address === 'object'
              ? {
                  line1: shipping.address.line1 ? String(shipping.address.line1) : null,
                  line2: shipping.address.line2 ? String(shipping.address.line2) : null,
                  city: shipping.address.city ? String(shipping.address.city) : null,
                  state: shipping.address.state ? String(shipping.address.state) : null,
                  postalCode: shipping.address.postalCode ? String(shipping.address.postalCode) : null,
                  country: shipping.address.country ? String(shipping.address.country) : null,
                }
              : null,
          }
        : null,
      // Prodigi fulfilment result — filled in by POST /orders/:id/fulfilment.
      fulfilment: null,
      createdAt: now,
      expiresAt: now + LINK_TTL_MS,
      emailed: false,
      counts: {},
    }
    // Live orders get a sequential, gap-free invoice number; test orders don't
    // consume one (they're rendered as clearly-marked non-invoices).
    if (fresh.livemode === true) {
      fresh.invoiceNumber = await nextInvoiceNumber(new Date(now).getUTCFullYear())
      fresh.invoiceDate = now
    }
    try {
      // Atomic create (flag 'wx' fails if it already exists) so two near-
      // simultaneous callers — the post-payment issue route and the Stripe
      // webhook — can't both create, which could reset the `emailed` flag.
      await writeFile(orderPath(orderId), JSON.stringify(fresh, null, 2), { flag: 'wx' })
      grant = fresh
    } catch (err) {
      if (err.code === 'EEXIST') grant = await readGrant(orderId) // lost the race — use the winner
      else throw err
    }
  }

  // Send the download email EXACTLY once. Both callers can pass the email, so a
  // synchronous in-memory claim (atomic in single-threaded Node) stops them both
  // sending; the persisted `emailed` flag stops any later retry re-sending.
  if (grant && !grant.emailed && (email || grant.email) && !_emailingNow.has(orderId)) {
    _emailingNow.add(orderId)
    try {
      await sendDownloadEmail({
        email: email || grant.email,
        orderId,
        passcode: grant.passcode,
        items: grant.items,
        locale: locale || 'en',
        expiresAt: grant.expiresAt,
        invoice: await invoiceForGrant(grant).catch((e) => { console.error('[invoice] build failed:', e.message); return null }),
        license: await licenseForGrant(grant).catch((e) => { console.error('[license] build failed:', e.message); return null }),
      })
      grant.emailed = true
      if (email && !grant.email) grant.email = String(email) // keep admin display accurate
      await writeFile(orderPath(orderId), JSON.stringify(grant, null, 2)).catch(() => {})
    } catch (err) {
      console.error('[orders] email failed (grant kept, will retry):', err.message)
    } finally {
      _emailingNow.delete(orderId)
    }
  }

  // Warm the deliverables in the background: makes downloads instant and lets
  // the download page show each file's size. Best-effort, never blocks.
  pregenerateGrant(grant)

  // Return the passcode so the shop can show it on the success screen — vital
  // when the buyer gave no email (their only way back to the downloads later).
  res.json({ ok: true, emailed: grant.emailed, passcode: grant.passcode })
})

// ── Per-order mutex ───────────────────────────────────────────────────────────
// The origin is a single Node process, so an in-memory promise chain per order is
// enough to serialize read-modify-write sequences that have more than one caller.
// Without it, the admin Refund action and the charge.refunded webhook both hit
// /admin/orders/:id/refund near-simultaneously, both read the grant before either
// writes, and so BOTH send the credit-note email (and could double-burn a live
// credit-note number). The Prodigi create + status callback race the fulfilment
// record the same way. Wrapping those handlers makes each a critical section.
const orderLocks = new Map()
async function withOrderLock(orderId, fn) {
  while (orderLocks.has(orderId)) {
    try { await orderLocks.get(orderId) } catch { /* prior holder's error isn't ours */ }
  }
  let release
  const held = new Promise((r) => { release = r })
  orderLocks.set(orderId, held)
  try {
    return await fn()
  } finally {
    orderLocks.delete(orderId)
    release()
  }
}

/** Record the Prodigi fulfilment result on an order (admin card + tracking).
 *  Secret-gated by the global middleware (the Worker calls it after ordering). */
app.post('/orders/:orderId/fulfilment', express.json({ limit: '8kb' }), async (req, res) => {
 await withOrderLock(req.params.orderId, async () => {
  const grant = await readGrant(req.params.orderId)
  if (!grant) return res.status(404).json({ error: 'not found' })
  const { provider, prodigiId, stage, outcome, mode, error, tracking } = req.body ?? {}
  // Merge over any prior fulfilment so a later status callback (which may omit
  // fields) updates stage/tracking without wiping the id/mode set at creation.
  const prev = grant.fulfilment && typeof grant.fulfilment === 'object' ? grant.fulfilment : {}
  const cleanTracking = Array.isArray(tracking)
    ? tracking.slice(0, 12).map((t) => ({
        carrier: t && t.carrier ? String(t.carrier).slice(0, 120) : null,
        number: t && t.number ? String(t.number).slice(0, 120) : null,
        url: t && t.url ? String(t.url).slice(0, 400) : null,
      }))
    : null
  grant.fulfilment = {
    provider: provider ? String(provider) : (prev.provider || 'prodigi'),
    prodigiId: prodigiId ? String(prodigiId) : (prev.prodigiId ?? null),
    stage: stage ? String(stage) : (prev.stage ?? null),
    outcome: outcome ? String(outcome) : (prev.outcome ?? null),
    mode: mode ? String(mode) : (prev.mode ?? null),
    error: error ? String(error).slice(0, 500) : (prev.error ?? null),
    tracking: cleanTracking ?? prev.tracking ?? null,
    updatedAt: Date.now(),
  }
  await writeFile(orderPath(req.params.orderId), JSON.stringify(grant, null, 2)).catch(() => {})
  res.json({ ok: true })
 })
})

/** Non-secret order metadata for the download page (no passcode, no files). */
app.get('/orders/:orderId/meta', async (req, res) => {
  const grant = await readGrant(req.params.orderId)
  if (!grant) return res.status(404).json({ error: 'not found' })
  if (grant.revoked || Date.now() > grant.expiresAt) return res.status(410).json({ error: 'expired' })

  // Pixel dimensions (from the catalog) + file size (from the cached deliverable,
  // once generated) so the buyer can see how big each download is before clicking.
  let bySku = new Map()
  try {
    const { photos } = await loadCatalog()
    for (const p of photos) for (const pr of (p.products || [])) bySku.set(pr.sku, pr)
  } catch { /* catalog unavailable — dimensions just omitted */ }

  // Hide items that were refunded (undownloaded-only refund revokes them).
  const visibleItems = grant.items.filter((i) => !(grant.revokedSkus || []).includes(i.sku))
  const items = await Promise.all(visibleItems.map(async (i) => {
    const product = bySku.get(i.sku)
    const ext = i.format === 'tiff' ? 'tiff' : 'jpg'
    let bytes = null
    try { bytes = (await stat(join(FULFIL_CACHE_DIR, `${i.sku}.${ext}`))).size } catch { /* not generated yet */ }
    return {
      sku: i.sku, label: i.label, format: i.format, slug: i.slug,
      filename: customerFilename(i),
      dimensions: product?.dimensions ?? null,
      bytes,
    }
  }))
  res.json({ orderId: grant.orderId, expiresAt: grant.expiresAt, items })
})

/** Serve the order's VAT invoice PDF (regenerated from the grant). Available
 *  regardless of download-link expiry — an invoice is a permanent record. */
app.get('/orders/:orderId/invoice', async (req, res) => {
  const grant = await readGrant(req.params.orderId)
  if (!grant) return res.status(404).json({ error: 'not found' })
  try {
    const { buffer, filename } = await invoiceForGrant(grant)
    res.setHeader('content-type', 'application/pdf')
    res.setHeader('content-disposition', `inline; filename="${filename}"`)
    res.send(buffer)
  } catch (err) {
    console.error('[invoice]', err.message)
    res.status(500).json({ error: 'invoice generation failed' })
  }
})

/** Serve the order's standalone licensing Terms PDF (regenerated from the grant
 *  snapshot). Permanent record, available regardless of download-link expiry. */
app.get('/orders/:orderId/license', async (req, res) => {
  const grant = await readGrant(req.params.orderId)
  if (!grant) return res.status(404).json({ error: 'not found' })
  try {
    const license = await licenseForGrant(grant)
    if (!license) return res.status(404).json({ error: 'no licence for this order' })
    res.setHeader('content-type', 'application/pdf')
    res.setHeader('content-disposition', `inline; filename="${license.filename}"`)
    res.send(license.buffer)
  } catch (err) {
    console.error('[license]', err.message)
    res.status(500).json({ error: 'licence generation failed' })
  }
})

/** Verify the buyer's passcode. */
app.post('/orders/:orderId/verify', express.json({ limit: '4kb' }), async (req, res) => {
  const grant = await readGrant(req.params.orderId)
  if (!grant) return res.status(404).json({ error: 'not found' })
  if (grant.revoked || Date.now() > grant.expiresAt) return res.status(410).json({ error: 'expired' })
  const passcode = String(req.body?.passcode ?? '').trim().toUpperCase()
  if (!passcode || !safeEqualStr(passcode, grant.passcode)) {
    return res.status(401).json({ error: 'invalid passcode' })
  }
  res.json({ ok: true })
})

/** Generate (or reuse) and stream a purchased deliverable. */
app.get('/orders/:orderId/file/:sku', async (req, res) => {
  const { orderId, sku } = req.params
  const grant = await readGrant(orderId)
  if (!grant) return res.status(404).json({ error: 'not found' })
  if (grant.revoked || Date.now() > grant.expiresAt) return res.status(410).json({ error: 'expired' })
  if ((grant.revokedSkus || []).includes(sku)) return res.status(410).json({ error: 'refunded' })
  if (!grant.items.some((i) => i.sku === sku)) return res.status(404).json({ error: 'not in order' })

  const found = await findProductBySku(sku)
  if (!found || found.product.type !== 'digital') {
    return res.status(404).json({ error: 'product unavailable' })
  }

  let result
  try {
    result = await generateDerivative(found.photo, found.product)
  } catch (err) {
    console.error('[fulfil]', sku, err)
    // A missing master isn't a server fault — the photo just hasn't had its
    // master exported from Lightroom yet. Surface it distinctly so it's clear
    // the fix is "export that master", not "debug the server".
    if (err && err.code === 'NO_MASTER') {
      return res.status(409).json({ error: 'master not available', detail: String(err.message) })
    }
    return res.status(500).json({ error: 'generation failed', detail: String(err && err.message) })
  }

  grant.counts[sku] = (grant.counts[sku] ?? 0) + 1
  await writeFile(orderPath(orderId), JSON.stringify(grant, null, 2)).catch(() => {})

  // Send an exact Content-Length so the client knows precisely when the
  // transfer is complete and can close the connection — without it the
  // response is chunked and the browser's connection/spinner hangs after the
  // last byte and eventually errors ("couldn't connect").
  let size = 0
  try {
    size = (await stat(result.path)).size
  } catch {
    /* fall back to chunked if the stat fails */
  }
  res.set('Content-Type', result.contentType)
  res.set('Content-Disposition', `attachment; filename="${result.filename}"`)
  res.set('Cache-Control', 'private, no-store')
  if (size > 0) res.set('Content-Length', String(size))
  createReadStream(result.path).pipe(res)
})

// ── Admin order management (secret-gated; behind the shop Worker's admin auth) ──

/** Map of sku → ex-VAT catalog price, for per-item value in the admin view. */
async function catalogPriceMap() {
  const m = new Map()
  try {
    const { photos } = await loadCatalog()
    for (const p of photos) for (const pr of (p.products || [])) m.set(pr.sku, pr.price)
  } catch { /* catalog unavailable — prices just omitted */ }
  return m
}

/** Admin view of a grant — includes the passcode (so the admin can read it back
 *  to a customer) and download counts. `priceBySku` (optional) adds each item's
 *  ex-VAT catalog price so the admin can see per-item value. */
function adminOrderView(grant, priceBySku) {
  return {
    orderId: grant.orderId,
    paymentId: grant.paymentId ?? null,
    email: grant.email ?? null,
    passcode: grant.passcode,
    emailed: grant.emailed ?? false,
    livemode: grant.livemode ?? null,
    amount: grant.amount ?? null,
    currency: grant.currency ?? null,
    taxAmount: grant.taxAmount ?? null,
    taxCountry: grant.taxCountry ?? null,
    cardCountry: grant.cardCountry ?? null,
    buyerIp: grant.buyerIp ?? null,
    buyerCountry: grant.buyerCountry ?? null,
    paidAt: grant.paidAt ?? null,
    paymentMethod: grant.paymentMethod ?? null,
    vatId: grant.vatId ?? null,
    businessName: grant.businessName ?? null,
    businessAddress: grant.businessAddress ?? null,
    reverseCharge: grant.reverseCharge ?? false,
    vatConsultation: grant.vatConsultation ?? null,
    // Shipping recipient + Prodigi fulfilment status (physical orders).
    shipping: grant.shipping ?? null,
    fulfilment: grant.fulfilment ?? null,
    lineItems: grant.lineItems ?? null,
    invoiceNumber: grant.invoiceNumber ?? null,
    invoiceDate: grant.invoiceDate ?? null,
    creditNumber: grant.creditNumber ?? null,
    creditDate: grant.creditDate ?? null,
    refunded: grant.refunded ?? false,
    refundedAmount: grant.refundedAmount ?? null,
    refundedAt: grant.refundedAt ?? null,
    refundUnmatched: grant.refundUnmatched ?? false,
    revoked: grant.revoked ?? false,
    revokedSkus: grant.revokedSkus ?? [],
    createdAt: grant.createdAt,
    expiresAt: grant.expiresAt,
    expired: Date.now() > grant.expiresAt,
    downloadUrl: `${SITE_URL}/en/shop/downloads/${grant.orderId}`,
    items: (grant.items ?? []).map((i) => ({
      sku: i.sku,
      label: i.label,
      format: i.format,
      filename: customerFilename(i),
      downloads: (grant.counts && grant.counts[i.sku]) || 0,
      refunded: (grant.revokedSkus || []).includes(i.sku),
      price: priceBySku ? (priceBySku.get(i.sku) ?? null) : null,
    })),
  }
}

/** Look up orders by order id (pi_…) or by buyer email. */
app.get('/admin/orders', async (req, res) => {
  const q = String(req.query.q ?? '').trim()
  if (!q) return res.status(400).json({ error: 'missing query' })
  const priceBySku = await catalogPriceMap()

  // Exact order id first.
  if (orderPath(q)) {
    const grant = await readGrant(q)
    if (grant) return res.json({ orders: [adminOrderView(grant, priceBySku)] })
  }

  // Otherwise treat as an email — scan the grants (small shop volume).
  const needle = q.toLowerCase()
  const orders = []
  try {
    for (const name of await readdir(ORDERS_DIR)) {
      if (!name.endsWith('.json')) continue
      const grant = await readGrant(name.slice(0, -5))
      if (grant && (grant.email ?? '').toLowerCase() === needle) {
        orders.push(adminOrderView(grant, priceBySku))
      }
    }
  } catch { /* dir missing */ }
  orders.sort((a, b) => b.createdAt - a.createdAt)
  res.json({ orders })
})

/** All orders created within the last N days (default 90), newest first. Backs
 *  the admin Orders table. Small shop volume, so a full scan is fine. */
app.get('/admin/orders/recent', async (req, res) => {
  const days = Math.min(3650, Math.max(1, parseInt(req.query.days, 10) || 90))
  const since = Date.now() - days * 24 * 60 * 60 * 1000
  const priceBySku = await catalogPriceMap()
  const orders = []
  try {
    for (const name of await readdir(ORDERS_DIR)) {
      if (!name.endsWith('.json')) continue
      const grant = await readGrant(name.slice(0, -5))
      if (grant && (grant.createdAt ?? 0) >= since) orders.push(adminOrderView(grant, priceBySku))
    }
  } catch { /* dir missing */ }
  orders.sort((a, b) => b.createdAt - a.createdAt)
  res.json({ orders })
})

/**
 * Accounting export: a ZIP of every order's invoice between two dates, rendered
 * in a single chosen language (Danish default, or English) regardless of the
 * language each was issued in. Files are named YYYYMMDD-Invoice-<no>.pdf so they
 * sort by date. Date filter is on the invoice/created date.
 */
app.get('/admin/invoices/zip', async (req, res) => {
  const lang = req.query.lang === 'en' ? 'en' : 'da'
  const fromTs = Date.parse(`${req.query.from}T00:00:00Z`)
  const toTs = Date.parse(`${req.query.to}T23:59:59.999Z`)
  if (!Number.isFinite(fromTs) || !Number.isFinite(toTs) || fromTs > toTs) {
    return res.status(400).json({ error: 'invalid from/to (use YYYY-MM-DD)' })
  }
  try {
    const priceBySku = await catalogPriceMap()
    const zip = new AdmZip()
    let count = 0
    for (const name of await readdir(ORDERS_DIR)) {
      if (!name.endsWith('.json') || name.startsWith('_')) continue
      const grant = await readGrant(name.slice(0, -5))
      if (!grant || !Array.isArray(grant.items) || grant.items.length === 0) continue
      // Invoice — filtered by its date.
      const when = grant.invoiceDate || grant.paidAt || grant.createdAt || 0
      if (when >= fromTs && when <= toTs) {
        const buffer = await buildInvoicePdf(grant, priceBySku, lang)
        const safe = String(grant.invoiceNumber || grant.orderId).replace(/[^A-Za-z0-9_-]/g, '_')
        zip.addFile(`${dateStamp(grant)}-Invoice-${safe}.pdf`, buffer)
        count += 1
      }
      // Refund credit note — filtered by the refund date (may differ from invoice).
      const refundWhen = grant.creditDate || grant.refundedAt || 0
      if ((grant.refundedAmount ?? 0) > 0 && refundWhen >= fromTs && refundWhen <= toTs) {
        const rbuf = await buildRefundPdf(grant, priceBySku, lang)
        if (rbuf) {
          const safe = String(grant.creditNumber || grant.invoiceNumber || grant.orderId).replace(/[^A-Za-z0-9_-]/g, '_')
          const rd = new Date(refundWhen)
          const rstamp = `${rd.getUTCFullYear()}${String(rd.getUTCMonth() + 1).padStart(2, '0')}${String(rd.getUTCDate()).padStart(2, '0')}`
          zip.addFile(`${rstamp}-Refund-${safe}.pdf`, rbuf)
          count += 1
        }
      }
    }
    if (count === 0) return res.status(404).json({ error: 'no invoices in that date range' })
    const out = zip.toBuffer()
    const fname = `Invoices-${req.query.from}_${req.query.to}-${lang}.zip`
    res.setHeader('content-type', 'application/zip')
    res.setHeader('content-disposition', `attachment; filename="${fname}"`)
    res.setHeader('x-invoice-count', String(count))
    res.send(out)
  } catch (err) {
    console.error('[invoices/zip]', err.message)
    res.status(500).json({ error: 'zip generation failed' })
  }
})

/** Re-send the download email for an order (using its stored passcode). */
app.post('/admin/orders/:orderId/resend', express.json({ limit: '4kb' }), async (req, res) => {
  const grant = await readGrant(req.params.orderId)
  if (!grant) return res.status(404).json({ error: 'not found' })
  const to = (req.body && req.body.email) || grant.email
  if (!to) return res.status(400).json({ error: 'no email on file — pass one' })
  // Only the items the buyer still has — refunded (revoked) items are excluded
  // so the re-sent email matches what they can actually download.
  const liveItems = grant.items.filter((i) => !(grant.revokedSkus || []).includes(i.sku))
  if (grant.revoked || liveItems.length === 0) {
    return res.status(409).json({ error: 'order fully refunded — nothing to send' })
  }
  try {
    await sendDownloadEmail({
      email: to, orderId: grant.orderId, passcode: grant.passcode,
      items: liveItems, locale: grant.locale || 'en', expiresAt: grant.expiresAt,
      invoice: await invoiceForGrant(grant).catch(() => null),
      license: await licenseForGrant(grant).catch(() => null),
    })
    grant.emailed = true
    if (req.body && req.body.email) grant.email = to
    await writeFile(orderPath(grant.orderId), JSON.stringify(grant, null, 2)).catch(() => {})
    res.json({ ok: true })
  } catch (err) {
    console.error('[admin/resend]', err.message)
    res.status(502).json({ error: 'email failed: ' + err.message })
  }
})

/** Extend an order's link by another LINK_TTL_DAYS from now. */
app.post('/admin/orders/:orderId/extend', async (req, res) => {
  const grant = await readGrant(req.params.orderId)
  if (!grant) return res.status(404).json({ error: 'not found' })
  // Extending re-grants access even if it was revoked by a (now reversed) refund.
  grant.expiresAt = Date.now() + LINK_TTL_MS
  grant.revoked = false
  await writeFile(orderPath(grant.orderId), JSON.stringify(grant, null, 2))
  res.json({ ok: true, expiresAt: grant.expiresAt })
})

/** Mark an order refunded (called by the Stripe webhook and the admin Refund
 *  button). A FULL refund revokes download access; a partial one just records
 *  the refunded amount for the admin's books. */
app.post('/admin/orders/:orderId/refund', express.json({ limit: '4kb' }), async (req, res) => {
 await withOrderLock(req.params.orderId, async () => {
  const grant = await readGrant(req.params.orderId)
  if (!grant) return res.status(404).json({ error: 'not found' })
  const { amountRefunded, fullyRefunded, revokedSkus } = req.body ?? {}
  grant.refundedAmount = Number.isFinite(amountRefunded) ? amountRefunded : (grant.amount ?? null)
  grant.refundedAt = Date.now()
  grant.refunded = !!fullyRefunded
  if (fullyRefunded) grant.revoked = true // pull all download access on a full refund
  // Per-item revoke (undownloaded-only refunds). Union, never clear — the
  // charge.refunded webhook also calls this without skus and must not undo them.
  if (Array.isArray(revokedSkus) && revokedSkus.length) {
    grant.revokedSkus = Array.from(new Set([...(grant.revokedSkus || []), ...revokedSkus.map(String)]))
  }
  // Guard: our admin only ever issues full refunds or whole-line-item
  // ("undownloaded only") refunds, the latter always carrying revokedSkus. A
  // PARTIAL refund that arrives with no line items attached therefore didn't go
  // through our flow — it's an arbitrary-amount refund typed into the Stripe
  // Dashboard. We can't reject it (Stripe already executed it and the webhook
  // must 200), so we flag it: the VAT split is then only proportional, not a
  // clean line-item reversal, and no download access was revoked. The admin UI
  // surfaces this for manual review. Recomputed from final state so a later
  // call that brings the skus clears the flag.
  grant.refundUnmatched =
    !grant.refunded && (grant.refundedAmount ?? 0) > 0 && (grant.revokedSkus || []).length === 0

  // Assign a gap-free credit-note number on the FIRST refund of a live order.
  if ((grant.refundedAmount ?? 0) > 0 && grant.livemode === true && !grant.creditNumber) {
    grant.creditNumber = await nextCreditNumber(new Date(grant.refundedAt).getUTCFullYear())
    grant.creditDate = grant.refundedAt
  }
  await writeFile(orderPath(grant.orderId), JSON.stringify(grant, null, 2))

  // Email the buyer a credit note — once per distinct refunded total (Stripe
  // retries webhooks, and multiple partial refunds bump the total). Best-effort.
  if ((grant.refundedAmount ?? 0) > 0 && grant.email && grant.refundEmailedAmount !== grant.refundedAmount) {
    try {
      const refund = await refundForGrant(grant).catch((e) => { console.error('[refund] pdf failed:', e.message); return null })
      const amountText = `${(grant.refundedAmount / 100).toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${String(grant.currency || 'DKK').toUpperCase()}`
      await sendRefundEmail({ email: grant.email, locale: grant.locale || 'en', amountText, refund })
      grant.refundEmailedAmount = grant.refundedAmount
      await writeFile(orderPath(grant.orderId), JSON.stringify(grant, null, 2)).catch(() => {})
    } catch (err) {
      console.error('[refund] email failed (refund still recorded):', err.message)
    }
  }

  res.json({
    ok: true,
    refunded: grant.refunded,
    refundedAmount: grant.refundedAmount,
    revoked: grant.revoked,
    revokedSkus: grant.revokedSkus || [],
    refundUnmatched: grant.refundUnmatched,
    creditNumber: grant.creditNumber ?? null,
  })
 })
})

/** Serve the order's refund credit-note PDF, or 404 if not refunded. */
app.get('/orders/:orderId/refund', async (req, res) => {
  const grant = await readGrant(req.params.orderId)
  if (!grant) return res.status(404).json({ error: 'not found' })
  try {
    const refund = await refundForGrant(grant)
    if (!refund) return res.status(404).json({ error: 'no refund for this order' })
    res.setHeader('content-type', 'application/pdf')
    res.setHeader('content-disposition', `inline; filename="${refund.filename}"`)
    res.send(refund.buffer)
  } catch (err) {
    console.error('[refund]', err.message)
    res.status(500).json({ error: 'refund note generation failed' })
  }
})

/** Delete all TEST-mode orders (grants with livemode === false). Live orders and
 *  any without a recorded mode are left untouched. Returns the number removed. */
app.post('/admin/orders/delete-test', async (_req, res) => {
  let deleted = 0
  try {
    for (const name of await readdir(ORDERS_DIR)) {
      if (!name.endsWith('.json')) continue
      const grant = await readGrant(name.slice(0, -5))
      if (grant && grant.livemode === false) {
        await unlink(join(ORDERS_DIR, name)).catch(() => {})
        deleted += 1
      }
    }
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
  res.json({ ok: true, deleted })
})

/** Delete expired grants now (manual trigger of the expiry sweep). */
app.post('/admin/orders/purge-expired', async (_req, res) => {
  const now = Date.now()
  let deleted = 0
  try {
    for (const name of await readdir(ORDERS_DIR)) {
      if (!name.endsWith('.json')) continue
      const grant = await readGrant(name.slice(0, -5))
      if (grant && now > grant.expiresAt) {
        await unlink(join(ORDERS_DIR, name)).catch(() => {})
        deleted += 1
      }
    }
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
  res.json({ ok: true, deleted })
})

/** Warm the watermarked-preview cache (re-render any missing previews). */
app.post('/admin/cache/warm-previews', async (_req, res) => {
  warmPreviewCache(true).catch((err) => console.error('[warm] manual sweep failed:', err.message))
  res.json({ ok: true, started: true, previewVersion: previewVersion() })
})

/**
 * Force a re-render of watermarked previews. Unlike warm-previews (which only
 * builds what's missing), this DELETES the cached previews first so they're
 * regenerated from the clean Lightroom source — used after re-watermarking or a
 * logo change. An optional `path` (a category prefix, e.g. ["Landscapes","Iceland"])
 * limits it to that collection and everything below it; omit it to re-render all.
 */
app.post('/admin/cache/rerender-previews', express.json({ limit: '4kb' }), async (req, res) => {
  try {
    const path = Array.isArray(req.body?.path)
      ? req.body.path.filter((s) => typeof s === 'string')
      : []
    // The picker tree is pegged to the top-tier folders (product types), which
    // are stripped from `category`; the worker sends that type separately so we
    // can scope the re-render to photos actually offered under it.
    const type = typeof req.body?.type === 'string' ? req.body.type : null

    const { photos } = await loadCatalog()
    const matched = photos.filter((p) => {
      if (type && !(p.products ?? []).some((prod) => prod.type === type)) return false
      if (path.length === 0) return true
      return Array.isArray(p.category) &&
        p.category.some((c) => path.every((seg, i) => c[i] === seg))
    })
    const idSet = new Set(matched.map((p) => p.id))

    // Delete every cached size for the matched ids. Cache files are `${id}.jpg`
    // (the full PREVIEW_MAX) and `${id}-${size}.jpg` (smaller variants), so map
    // each filename back to its photo id robustly before matching.
    let deleted = 0
    let files = []
    try { files = await readdir(CACHE_DIR) } catch { /* empty */ }
    for (const name of files) {
      if (!name.toLowerCase().endsWith('.jpg')) continue
      const base = name.slice(0, -4)
      let id = base
      if (!idSet.has(id)) {
        const m = /^(.+)-\d+$/.exec(base) // strip a `-<size>` suffix and retry
        if (m && idSet.has(m[1])) id = m[1]
      }
      if (!idSet.has(id)) continue
      await unlink(join(CACHE_DIR, name)).catch(() => {})
      deleted += 1
    }

    // Bump the cache-buster so loki's immutable edge entries for the OLD render
    // are abandoned (their `?v=` no longer matches) — without this, re-rendered
    // previews would be masked by the year-long edge cache. Then rebuild the disk
    // cache AND re-prime the edge at the new version.
    const newVersion = await bumpPreviewVersion()
    warmPreviewCache(true).catch((err) => console.error('[warm] rerender sweep failed:', err.message))
    res.json({ ok: true, matched: idSet.size, deleted, started: true, previewVersion: newVersion })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/** Clear generated deliverables (fulfil cache). They regenerate on next download. */
app.post('/admin/cache/clear-fulfil', async (_req, res) => {
  let deleted = 0
  try {
    // Clear both generated deliverable caches: digital derivatives AND poster
    // masters (so a layout/font change regenerates fresh on next request).
    for (const dir of [FULFIL_CACHE_DIR, POSTER_ASSETS_DIR]) {
      for (const name of await readdir(dir).catch(() => [])) {
        await unlink(join(dir, name)).catch(() => {})
        deleted += 1
      }
    }
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
  res.json({ ok: true, deleted })
})

/** Email the owner a short notification of a new sale. */
app.post('/admin/notify-sale', express.json({ limit: '4kb' }), async (req, res) => {
  if (!emailConfigured()) return res.status(503).json({ error: 'SMTP not configured' })
  const { to, orderId, amountText, buyerEmail, itemCount } = req.body ?? {}
  if (!to) return res.status(400).json({ error: 'no recipient' })
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  try {
    await mailer().sendMail({
      from: MAIL_FROM,
      to: String(to),
      subject: `New sale · ${orderId} · ${amountText}`,
      text: `New order: ${orderId}\nTotal: ${amountText}\nBuyer: ${buyerEmail || '—'}\nItems: ${itemCount}\n\n${SITE_URL}/admin`,
      html: `<div style="font-family:ui-monospace,Menlo,monospace;color:#111;font-size:14px">
        <h2 style="color:#931020;font-weight:600;margin:0 0 12px">New sale</h2>
        <p style="margin:2px 0"><strong>${esc(orderId)}</strong></p>
        <p style="margin:2px 0">Total: <strong>${esc(amountText)}</strong></p>
        <p style="margin:2px 0">Buyer: ${esc(buyerEmail) || '—'}</p>
        <p style="margin:2px 0">Items: ${esc(itemCount)}</p>
        <p style="margin:14px 0 0"><a href="${SITE_URL}/admin" style="color:#931020">Open admin →</a></p>
      </div>`,
    })
    res.json({ ok: true })
  } catch (err) {
    console.error('[notify-sale]', err.message)
    res.status(502).json({ error: err.message })
  }
})

/** Email the owner a summary of product price/availability/routing changes found
 *  by the daily Prodigi validator on the worker. Body: { to, changes: string[] }. */
app.post('/admin/notify-change', express.json({ limit: '16kb' }), async (req, res) => {
  if (!emailConfigured()) return res.status(503).json({ error: 'SMTP not configured' })
  const { to, changes } = req.body ?? {}
  if (!to) return res.status(400).json({ error: 'no recipient' })
  if (!Array.isArray(changes) || changes.length === 0) return res.json({ ok: true, skipped: 'no changes' })
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  try {
    await mailer().sendMail({
      from: MAIL_FROM,
      to: String(to),
      subject: `Prodigi product changes · ${changes.length} item${changes.length === 1 ? '' : 's'}`,
      text: `The daily Prodigi check found changes:\n\n${changes.map((c) => `• ${c}`).join('\n')}\n\n${SITE_URL}/admin`,
      html: `<div style="font-family:ui-monospace,Menlo,monospace;color:#111;font-size:14px">
        <h2 style="color:#931020;font-weight:600;margin:0 0 12px">Prodigi product changes</h2>
        <ul style="margin:0 0 12px;padding-left:18px">${changes.map((c) => `<li style="margin:3px 0">${esc(c)}</li>`).join('')}</ul>
        <p style="margin:14px 0 0"><a href="${SITE_URL}/admin" style="color:#931020">Open admin →</a></p>
      </div>`,
    })
    res.json({ ok: true })
  } catch (err) {
    console.error('[notify-change]', err.message)
    res.status(502).json({ error: err.message })
  }
})

// ── Expiry cleanup ─────────────────────────────────────────────────────────────

/** Delete expired grants and stale cached derivatives. */
async function sweepExpired() {
  const now = Date.now()
  try {
    for (const name of await readdir(ORDERS_DIR)) {
      if (!name.endsWith('.json')) continue
      const grant = await readGrant(name.slice(0, -5))
      if (grant && now > grant.expiresAt) await unlink(join(ORDERS_DIR, name)).catch(() => {})
    }
  } catch { /* dir missing — nothing to do */ }
  try {
    for (const name of await readdir(FULFIL_CACHE_DIR)) {
      const p = join(FULFIL_CACHE_DIR, name)
      const s = await stat(p).catch(() => null)
      if (s && now - s.mtimeMs > LINK_TTL_MS) await unlink(p).catch(() => {})
    }
  } catch { /* dir missing — nothing to do */ }
}
setInterval(sweepExpired, 24 * 60 * 60 * 1000).unref?.()
sweepExpired().catch(() => {})

app.listen(PORT, () => {
  console.log(`shop LAN origin listening on :${PORT}`)
  console.log(`  catalog  : ${CATALOG_PATH}`)
  console.log(`  previews : ${PREVIEWS_DIR}`)
  console.log(`  masters  : ${MASTERS_DIR}`)
  console.log(`  orders   : ${ORDERS_DIR}`)
  console.log(`  public   : ${PUBLIC_URL || '(PUBLIC_URL not set)'}`)
  // Confirm SMTP credentials work now, so problems surface in the logs rather
  // than silently on the first sale.
  verifyMailer()
  // Warm the preview cache in the background so the first view of any collection
  // is a pure cache hit, not a burst of on-demand watermark generation.
  warmPreviewCache().catch((err) => console.error('[warm] startup sweep failed:', err))
})
