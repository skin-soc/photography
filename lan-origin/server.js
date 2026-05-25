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
const PREVIEW_MAX = Number(process.env.PREVIEW_MAX ?? 1600)
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
  { key: 'std', label: 'Standard', longEdge: 2048, price: 14500 },
  { key: 'med', label: 'Medium', longEdge: 4096, price: 24500 },
  { key: 'lrg', label: 'Large', longEdge: 6144, price: 39500 },
]

/** Master — the true full-resolution original. Its price scales with the
 *  file's megapixels, so a medium-format master commands a real premium.
 *  First bracket whose maxMP the file is within sets the price. */
const DEFAULT_MASTER_BRACKETS = [
  { maxMP: 40, price: 120000 },
  { maxMP: 80, price: 240000 },
  { maxMP: Infinity, price: 450000 },
]

/** A sized tier is offered only when the original is this much larger. */
const TIER_MARGIN = 1.15

function masterPrice(w, h, brackets) {
  const mp = (w * h) / 1_000_000
  for (const b of brackets) {
    if (mp <= b.maxMP) return b.price
  }
  return brackets[brackets.length - 1].price
}

/** Build the digital products a photo of (w × h) px can support: the sized
 *  tiers it is big enough for, plus the full-resolution Master. */
function digitalProducts(id, w, h, tiers, brackets) {
  const long = Math.max(w, h)
  const out = []
  for (const tier of tiers) {
    if (long < tier.longEdge * TIER_MARGIN) continue
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
  out.push({
    sku: `${id}-d-master`,
    type: 'digital',
    label: 'Master',
    price: masterPrice(w, h, brackets),
    currency: 'DKK',
    dimensions: { w, h },
  })
  return out
}

await mkdir(CACHE_DIR, { recursive: true })

const app = express()
app.disable('x-powered-by')

/** Optional shared-secret gate — the Worker is the only intended caller. */
app.use((req, res, next) => {
  if (req.path === '/healthz') return next()
  if (req.path.startsWith('/preview/')) return next()
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
  const { printProducts, digitalTiers, masterBrackets } = await loadPricing()

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
      products.push(...digitalProducts(p.id, p.width ?? 0, p.height ?? 0, digitalTiers, masterBrackets))
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

const WATERMARK_PATH = new URL('./gmp.png', import.meta.url).pathname

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

    const { data: resizedBuf } = await sharp(src)
      .resize(max, max, { fit: 'inside', withoutEnlargement: true })
      .toBuffer({ resolveWithObject: true })

    await sharp(resizedBuf)
      .composite([{ input: WATERMARK_PATH, tile: true, blend: 'over' }])
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
