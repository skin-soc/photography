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
import sharp from 'sharp'
import nodemailer from 'nodemailer'
import { exiftool } from 'exiftool-vendored'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { readFile, writeFile, mkdir, stat, readdir, unlink } from 'node:fs/promises'
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
await mkdir(ORDERS_DIR, { recursive: true })

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

/** Logo size as a fraction of the image height. */
const LOGO_HEIGHT_FRACTION = Number(process.env.LOGO_HEIGHT_FRACTION ?? 0.06)
/** Gap between logo and image edge in pixels. */
const LOGO_MARGIN = Number(process.env.LOGO_MARGIN ?? 14)

/** Cache the raw SVG string so we only hit disk once. */
let _logoSvgRaw = null
async function getLogoSvg() {
  if (!_logoSvgRaw) _logoSvgRaw = await readFile(LOGO_SVG_PATH, 'utf8')
  return _logoSvgRaw
}

/**
 * Build the logo composite for the watermark — 100% opacity, no shadow,
 * sized to LOGO_HEIGHT_FRACTION of the image height, bottom-right corner.
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
    // Preview source: the 800px JPEG the Lightroom plugin writes to the SSD.
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
    throw new Error(`no master for ${id} (${ref}) in ${MASTERS_DIR} — re-publish this photo`)
  }
  return master
}

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
  let pipeline = sharp(srcPath, { limitInputPixels: false })
    .rotate() // bake in any EXIF orientation before stripping metadata
    .resize(target.w, target.h, { fit: 'inside', withoutEnlargement: true })
    .keepIccProfile() // preserve the colour profile — do NOT strip it
  pipeline = product.format === 'tiff'
    ? pipeline.tiff({ compression: 'deflate', predictor: 'horizontal' })
    : pipeline.jpeg({ quality: 92, mozjpeg: true })
  await pipeline.toFile(out)

  // Embed copyright / usage metadata into the finished file. sharp has already
  // dropped camera metadata; we keep the ICC profile and add rights here.
  const tier = licenseTier(product.label)
  await exiftool.write(out, {
    Artist: 'Gus McEwan',
    'XMP-dc:Creator': 'Gus McEwan',
    'IPTC:By-line': 'Gus McEwan',
    Copyright: COPYRIGHT,
    'IPTC:CopyrightNotice': COPYRIGHT,
    'XMP-dc:Rights': COPYRIGHT,
    'XMP-xmpRights:WebStatement': 'https://gusmcewan.com',
    'XMP-xmpRights:Marked': true,
    'XMP-xmpRights:UsageTerms': USAGE_TERMS[tier],
    CreatorWorkURL: 'https://gusmcewan.com',
    // -overwrite_original: write in place, no "<file>_original" backup beside it.
  }, { writeArgs: ['-overwrite_original'] })

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

// ── Email ────────────────────────────────────────────────────────────────────

let _mailer = null
function mailer() {
  if (!_mailer) {
    _mailer = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  }
  return _mailer
}

async function sendDownloadEmail({ email, orderId, passcode, items, locale, expiresAt }) {
  if (!email) throw new Error('no recipient email')
  if (!SMTP_USER || !SMTP_PASS) throw new Error('SMTP not configured')

  const url = `${SITE_URL}/${locale}/shop/downloads/${orderId}`
  const expiry = new Date(expiresAt).toISOString().slice(0, 10)
  const lines = items.map((i) => `  • ${i.label} — ${customerFilename(i)}`).join('\n')

  const text =
    `Thank you for your purchase.\n\n` +
    `Your downloads are ready. Open the link below and enter your passcode to download your files.\n\n` +
    `Download page: ${url}\n` +
    `Passcode: ${passcode}\n\n` +
    `Items:\n${lines}\n\n` +
    `This link is valid until ${expiry}.\n\n` +
    `${COPYRIGHT}\n`

  const html =
    `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;color:#111">` +
    `<p>Thank you for your purchase.</p>` +
    `<p>Your downloads are ready. Open the page below and enter your passcode to download your files.</p>` +
    `<p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#931020;color:#fff;text-decoration:none;border-radius:8px">Open your downloads</a></p>` +
    `<p style="font-size:14px">Passcode: <strong style="font-family:ui-monospace,monospace;letter-spacing:2px">${passcode}</strong></p>` +
    `<ul style="font-size:14px;color:#444">${items.map((i) => `<li>${i.label} — ${customerFilename(i)}</li>`).join('')}</ul>` +
    `<p style="font-size:13px;color:#666">This link is valid until ${expiry}.</p>` +
    `<p style="font-size:12px;color:#999">${COPYRIGHT}</p>` +
    `</div>`

  await mailer().sendMail({
    from: MAIL_FROM,
    to: email,
    subject: 'Your Gus McEwan Photography downloads',
    text,
    html,
  })
}

// ── Fulfilment routes ─────────────────────────────────────────────────────────

/** Issue a download grant + email it. Called by the shop Worker (Stripe webhook
 *  and the post-payment issue route). Idempotent on orderId.
 *
 *  The grant is persisted up front and email is best-effort: a download must not
 *  depend on SMTP deliverability (and the buyer is auto-unlocked right after
 *  payment anyway). If the email didn't send, a later call retries it using the
 *  stored passcode. The passcode is kept in plain text — this file lives on the
 *  NAS behind the shared secret, and the email carries it in clear regardless. */
app.post('/orders', express.json({ limit: '64kb' }), async (req, res) => {
  const { orderId, email, locale, items } = req.body ?? {}
  if (!orderId || !orderPath(orderId) || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'invalid order' })
  }

  let grant = await readGrant(orderId)
  if (!grant) {
    const now = Date.now()
    grant = {
      orderId,
      email: email ? String(email) : null,
      passcode: generatePasscode(),
      items: items.map((i) => ({
        sku: i.sku, token: i.token, format: i.format, label: i.label, slug: i.slug,
      })),
      createdAt: now,
      expiresAt: now + LINK_TTL_MS,
      emailed: false,
      counts: {},
    }
    await writeFile(orderPath(orderId), JSON.stringify(grant, null, 2))
  }

  // Best-effort email (send once; retry on a later call if it didn't go out).
  if (!grant.emailed && (email || grant.email)) {
    try {
      await sendDownloadEmail({
        email: email || grant.email,
        orderId,
        passcode: grant.passcode,
        items: grant.items,
        locale: locale || 'en',
        expiresAt: grant.expiresAt,
      })
      grant.emailed = true
      await writeFile(orderPath(orderId), JSON.stringify(grant, null, 2)).catch(() => {})
    } catch (err) {
      console.error('[orders] email failed (grant kept, will retry):', err.message)
    }
  }

  // Return the passcode so the shop can show it on the success screen — vital
  // when the buyer gave no email (their only way back to the downloads later).
  res.json({ ok: true, emailed: grant.emailed, passcode: grant.passcode })
})

/** Non-secret order metadata for the download page (no passcode, no files). */
app.get('/orders/:orderId/meta', async (req, res) => {
  const grant = await readGrant(req.params.orderId)
  if (!grant) return res.status(404).json({ error: 'not found' })
  if (Date.now() > grant.expiresAt) return res.status(410).json({ error: 'expired' })
  res.json({
    orderId: grant.orderId,
    expiresAt: grant.expiresAt,
    items: grant.items.map((i) => ({
      sku: i.sku, label: i.label, format: i.format, slug: i.slug,
      filename: customerFilename(i),
    })),
  })
})

/** Verify the buyer's passcode. */
app.post('/orders/:orderId/verify', express.json({ limit: '4kb' }), async (req, res) => {
  const grant = await readGrant(req.params.orderId)
  if (!grant) return res.status(404).json({ error: 'not found' })
  if (Date.now() > grant.expiresAt) return res.status(410).json({ error: 'expired' })
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
  if (Date.now() > grant.expiresAt) return res.status(410).json({ error: 'expired' })
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
    return res.status(500).json({ error: 'generation failed' })
  }

  grant.counts[sku] = (grant.counts[sku] ?? 0) + 1
  await writeFile(orderPath(orderId), JSON.stringify(grant, null, 2)).catch(() => {})

  res.set('Content-Type', result.contentType)
  res.set('Content-Disposition', `attachment; filename="${result.filename}"`)
  res.set('Cache-Control', 'private, no-store')
  createReadStream(result.path).pipe(res)
})

// ── Admin order management (secret-gated; behind the shop Worker's admin auth) ──

/** Admin view of a grant — includes the passcode (so the admin can read it back
 *  to a customer) and download counts. */
function adminOrderView(grant) {
  return {
    orderId: grant.orderId,
    email: grant.email ?? null,
    passcode: grant.passcode,
    emailed: grant.emailed ?? false,
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
    })),
  }
}

/** Look up orders by order id (pi_…) or by buyer email. */
app.get('/admin/orders', async (req, res) => {
  const q = String(req.query.q ?? '').trim()
  if (!q) return res.status(400).json({ error: 'missing query' })

  // Exact order id first.
  if (orderPath(q)) {
    const grant = await readGrant(q)
    if (grant) return res.json({ orders: [adminOrderView(grant)] })
  }

  // Otherwise treat as an email — scan the grants (small shop volume).
  const needle = q.toLowerCase()
  const orders = []
  try {
    for (const name of await readdir(ORDERS_DIR)) {
      if (!name.endsWith('.json')) continue
      const grant = await readGrant(name.slice(0, -5))
      if (grant && (grant.email ?? '').toLowerCase() === needle) {
        orders.push(adminOrderView(grant))
      }
    }
  } catch { /* dir missing */ }
  orders.sort((a, b) => b.createdAt - a.createdAt)
  res.json({ orders })
})

/** Re-send the download email for an order (using its stored passcode). */
app.post('/admin/orders/:orderId/resend', express.json({ limit: '4kb' }), async (req, res) => {
  const grant = await readGrant(req.params.orderId)
  if (!grant) return res.status(404).json({ error: 'not found' })
  const to = (req.body && req.body.email) || grant.email
  if (!to) return res.status(400).json({ error: 'no email on file — pass one' })
  try {
    await sendDownloadEmail({
      email: to, orderId: grant.orderId, passcode: grant.passcode,
      items: grant.items, locale: 'en', expiresAt: grant.expiresAt,
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
  grant.expiresAt = Date.now() + LINK_TTL_MS
  await writeFile(orderPath(grant.orderId), JSON.stringify(grant, null, 2))
  res.json({ ok: true, expiresAt: grant.expiresAt })
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
})
