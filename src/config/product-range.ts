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

/** Posters are ALWAYS a portrait sheet in this single format (decided with the
 *  Tom Hegen reference). Every poster is offered these sizes regardless of the
 *  source photo's own aspect — the poster mat crops it to fit. 4:5 = 8×10. */
const POSTER_FORMAT = '4:5'

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
 * The poster sizes offered for a photo of (wPx × hPx). Posters are always the
 * portrait POSTER_FORMAT sheet (4:5), so every poster photo gets the same sizes —
 * the only filter is resolution: a size is dropped if the photo's long edge can't
 * print it at MIN_DPI. The poster mat crops the photo to the portrait format, so
 * the source photo's own aspect no longer matters.
 */
export function matchPosters(wPx: number, hPx: number): PosterSize[] {
  if (!wPx || !hPx) return []
  const family = POSTER_FAMILIES.find((f) => f.name === POSTER_FORMAT)
  if (!family) return []
  const longPx = Math.max(wPx, hPx)
  const maxLongCm = (longPx / MIN_DPI) * CM_PER_INCH

  const out: PosterSize[] = []
  for (const s of family.sizes) {
    if (s.longCm > maxLongCm) continue // photo can't support this size at MIN_DPI
    out.push({
      providerSku: s.providerSku,
      widthCm: s.shortCm, // always portrait
      heightCm: s.longCm,
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

/** Prodigi SKU list for the daily validator — only the sizes we actually sell
 *  (the POSTER_FORMAT family). Validator is Prodigi-only; WhiteWall excluded. */
export const PRODIGI_SKUS: { providerSku: string; label: string; cost: number }[] =
  (POSTER_FAMILIES.find((f) => f.name === POSTER_FORMAT)?.sizes ?? []).map((s) => ({
    providerSku: s.providerSku,
    label: `${POSTER_FORMAT} · ${s.shortCm}×${s.longCm}cm`,
    cost: s.cost,
  }))
