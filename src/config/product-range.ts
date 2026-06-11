/**
 * Print product RANGE — the curated provider SKUs we sell, and the logic that
 * matches them to a photo's shape. This is the small "products.json" that lives
 * WITH the worker (deploys with the code, no NAS dependency).
 *
 * Two lines, two providers:
 *  • POSTERS  → Prodigi PAP (Photographic Art Print, 240gsm). Offered
 *    aspect-matched: a photo is only shown sizes whose ratio matches its own
 *    shape, in its own orientation (a square never sees a tall poster). Sizes
 *    are also gated by resolution so a small file isn't offered a huge print.
 *  • FINE ART → WhiteWall (premium lab) — NOT YET WIRED. Kept as a single
 *    placeholder so the section persists; real WhiteWall SKUs + trade pricing
 *    replace `FINE_ART_PENDING` once API access lands. The daily validator only
 *    checks Prodigi SKUs (see prodigi-validate.ts).
 *
 * All Prodigi sizes below are verified to fulfil in NL (prodigi_eu); the GB-only
 * 24×36 is deliberately excluded. Retail `price` (DKK minor) is value-priced;
 * `cost` (EUR minor, ex-tax) is the recorded provider cost for margin + drift.
 * See docs/fap-print-fulfilment.md.
 */

/** Closest aspect family must be within this relative ratio tolerance, else no
 *  poster is offered for that photo (e.g. extreme panoramas match nothing). */
const ASPECT_TOLERANCE = 0.12

/** Minimum print resolution. A size is only offered when the photo's long edge
 *  supports it at ≥ this DPI — "size of photo matters, within reason". Posters
 *  are viewed at a distance, so 120 DPI is a sound floor. */
const MIN_DPI = 120
const CM_PER_INCH = 2.54

interface FamilySize {
  providerSku: string
  /** Physical dimensions in cm, short edge then long edge (unoriented). */
  shortCm: number
  longCm: number
  /** Retail price, DKK minor units (øre). */
  price: number
  /** Recorded provider ex-tax cost, EUR minor units. */
  cost: number
}

interface AspectFamily {
  /** Human label for the shape, e.g. '2:3'. */
  name: string
  /** Long ÷ short, ≥ 1. A photo matches the family with the closest ratio. */
  ratio: number
  /** Sizes ascending by long edge. */
  sizes: FamilySize[]
}

/** Prodigi PAP poster families (provider: prodigi). NL-routing only. */
const POSTER_FAMILIES: AspectFamily[] = [
  {
    name: '2:3',
    ratio: 3 / 2,
    sizes: [
      { providerSku: 'GLOBAL-PAP-8X12',  shortCm: 20, longCm: 30, price: 29500,  cost: 500 },
      { providerSku: 'GLOBAL-PAP-12X18', shortCm: 30, longCm: 45, price: 44500,  cost: 800 },
      { providerSku: 'GLOBAL-PAP-16X24', shortCm: 40, longCm: 60, price: 59500,  cost: 1000 },
      { providerSku: 'GLOBAL-PAP-20X30', shortCm: 50, longCm: 75, price: 84500,  cost: 1300 },
    ],
  },
  {
    name: '3:4',
    ratio: 4 / 3,
    sizes: [
      { providerSku: 'GLOBAL-PAP-12X16', shortCm: 30, longCm: 40, price: 44500,  cost: 700 },
      { providerSku: 'GLOBAL-PAP-18X24', shortCm: 45, longCm: 60, price: 64500,  cost: 1100 },
    ],
  },
  {
    name: '4:5',
    ratio: 5 / 4,
    sizes: [
      { providerSku: 'GLOBAL-PAP-8X10',  shortCm: 20, longCm: 25, price: 34500,  cost: 500 },
      { providerSku: 'GLOBAL-PAP-16X20', shortCm: 40, longCm: 50, price: 59500,  cost: 950 },
    ],
  },
  {
    name: 'square',
    ratio: 1,
    sizes: [
      { providerSku: 'GLOBAL-PAP-12X12', shortCm: 30, longCm: 30, price: 39500,  cost: 600 },
      { providerSku: 'GLOBAL-PAP-30X30', shortCm: 75, longCm: 75, price: 109500, cost: 1900 },
    ],
  },
]

/** A poster size resolved to a specific photo: oriented to its shape, priced. */
export interface PosterSize {
  providerSku: string
  /** Physical cm oriented to the photo (portrait ⇒ tall, landscape ⇒ wide). */
  widthCm: number
  heightCm: number
  price: number
  cost: number
}

/**
 * The poster sizes offered for a photo of (wPx × hPx), or [] when none fit.
 * Picks the single aspect family closest to the photo's ratio (within
 * ASPECT_TOLERANCE), orients each size to the photo, and drops sizes the photo
 * lacks the resolution to print at MIN_DPI.
 */
export function matchPosters(wPx: number, hPx: number): PosterSize[] {
  if (!wPx || !hPx) return []
  const longPx = Math.max(wPx, hPx)
  const shortPx = Math.min(wPx, hPx)
  const ratio = longPx / shortPx

  let best: AspectFamily | null = null
  let bestDiff = Infinity
  for (const f of POSTER_FAMILIES) {
    const diff = Math.abs(ratio - f.ratio) / f.ratio
    if (diff < bestDiff) {
      bestDiff = diff
      best = f
    }
  }
  if (!best || bestDiff > ASPECT_TOLERANCE) return []

  const portrait = hPx > wPx
  const maxLongCm = (longPx / MIN_DPI) * CM_PER_INCH

  const out: PosterSize[] = []
  for (const s of best.sizes) {
    if (s.longCm > maxLongCm) continue // photo can't support this size at MIN_DPI
    out.push({
      providerSku: s.providerSku,
      widthCm: portrait ? s.shortCm : s.longCm,
      heightCm: portrait ? s.longCm : s.shortCm,
      price: s.price,
      cost: s.cost,
    })
  }
  return out
}

/** Material descriptor shown as the poster spec line. */
export const POSTER_MATERIAL = 'Photographic · 240gsm'

/**
 * Fine-art placeholder — WhiteWall is not wired yet, so the line is kept alive
 * with a single stand-in edition (oriented to the photo) at the prior A2 price.
 * Replace with real WhiteWall SKUs + trade pricing when API access lands.
 */
export const FINE_ART_PENDING = {
  provider: 'whitewall' as const,
  /** Unoriented short × long cm (A2). */
  shortCm: 42,
  longCm: 59.4,
  price: 149500,
  label: 'Fine art edition',
  material: 'Giclée · WhiteWall (coming soon)',
}

/** Flattened Prodigi SKU list for the daily validator — every poster SKU once,
 *  with its recorded cost. (Validator is Prodigi-only; WhiteWall is excluded.) */
export const PRODIGI_SKUS: { providerSku: string; label: string; cost: number }[] =
  POSTER_FAMILIES.flatMap((f) =>
    f.sizes.map((s) => ({
      providerSku: s.providerSku,
      label: `${f.name} · ${s.shortCm}×${s.longCm}cm`,
      cost: s.cost,
    })),
  )
