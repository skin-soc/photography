/**
 * Print product RANGE — the curated provider SKUs we sell and the logic that
 * offers them per photo. Lives WITH the worker (no NAS dependency).
 *
 * POSTERS → Prodigi, A-series sheets (A3–A0) on FOUR papers the customer chooses:
 *   PAP Photographic · FAP Enhanced-Matte · HPR Hahnemühle Photo Rag ·
 *   HGE Hahnemühle German Etching.
 * Every poster is a portrait A-series sheet with the photo + title typeset on it
 * (see the origin compositor / docs/fap-print-fulfilment.md). A size is only
 * OFFERED for a (photo, paper) when the source resolves the photo's slot at the
 * paper's minimum DPI — premium papers demand more pixels (close inspection).
 *
 * FINE ART → WhiteWall (premium lab) — NOT YET WIRED. Kept as a single
 * placeholder so the section persists; real WhiteWall SKUs replace
 * FINE_ART_PENDING once API access lands. The validator only checks Prodigi SKUs.
 *
 * All A-series SKUs below are verified to fulfil in NL (prodigi_eu). Retail
 * `price` (DKK minor) is value-priced; `cost` (EUR minor, ex-tax) is the recorded
 * provider cost for margin + drift detection.
 */

const MM_PER_INCH = 25.4

/** A-series sheet sizes (portrait, mm) — the printed paper. */
const A_SERIES: Record<string, { wMm: number; hMm: number }> = {
  A3: { wMm: 297, hMm: 420 },
  A2: { wMm: 420, hMm: 594 },
  A1: { wMm: 594, hMm: 841 },
  A0: { wMm: 841, hMm: 1189 },
}
/** Smallest → largest. (A4 dropped — too small/"home-print" for the shop.) */
export const SIZE_ORDER = ['A3', 'A2', 'A1', 'A0'] as const
export type PosterSizeCode = (typeof SIZE_ORDER)[number]

/** The photo fills this fraction of the sheet on the poster layout (the rest is
 *  margin + the typeset title band). Mirrors the print compositor + poster.json. */
const SLOT_W_FRAC = 0.84
const SLOT_H_FRAC = 0.66

export type PaperCode = 'PAP' | 'FAP' | 'HPR' | 'HGE'

/** The two pricing ladders. Photographic + Enhanced-Matte share the standard
 *  ladder; the two Hahnemühles share the premium one. */
export type PaperTier = 'photographic' | 'premium'

interface Paper {
  code: PaperCode
  /** Which pricing ladder this paper sits on. */
  tier: PaperTier
  /** Prodigi SKU family prefix, e.g. 'GLOBAL-FAP' → GLOBAL-FAP-A2. */
  prodigiPrefix: string
  /** Customer-facing paper name. */
  label: string
  /** Short descriptor under the paper name. */
  blurb: string
  /** Minimum print resolution (DPI). Gates which sizes this paper offers. */
  minDpi: number
}

/** Provider ex-tax cost (EUR minor) per A-size, per tier. Posters are priced
 *  COST-PLUS: the shop sells each at this cost (converted to DKK) × (1 + markup),
 *  so the cost is the entire pricing basis — there is no hand-set poster ladder. */
const PHOTO_COST: Record<PosterSizeCode, number> = { A3: 700, A2: 1000, A1: 1400, A0: 2600 }
const PREMIUM_COST: Record<PosterSizeCode, number> = { A3: 1200, A2: 1800, A1: 3400, A0: 6100 }

/** Provider ex-tax cost (EUR minor) per tier × size — the cost-plus pricing basis. */
export const POSTER_COST: Record<PaperTier, Record<PosterSizeCode, number>> = {
  photographic: PHOTO_COST,
  premium: PREMIUM_COST,
}

const PAPERS: Paper[] = [
  { code: 'PAP', tier: 'photographic', prodigiPrefix: 'GLOBAL-PAP', label: 'Photographic', blurb: 'Lustre photographic · 240gsm', minDpi: 240 },
  { code: 'FAP', tier: 'photographic', prodigiPrefix: 'GLOBAL-FAP', label: 'Enhanced Matte', blurb: 'Smooth matte giclée · 200gsm', minDpi: 240 },
  { code: 'HPR', tier: 'premium', prodigiPrefix: 'GLOBAL-HPR', label: 'Hahnemühle Photo Rag', blurb: '100% cotton museum matte', minDpi: 300 },
  { code: 'HGE', tier: 'premium', prodigiPrefix: 'GLOBAL-HGE', label: 'Hahnemühle German Etching', blurb: 'Textured mould-made fine-art', minDpi: 300 },
]

/** The pricing tier a paper sits on. */
export function paperTier(code: PaperCode): PaperTier {
  return PAPERS.find((p) => p.code === code)?.tier ?? 'photographic'
}

/** A poster option offered for a photo: one paper at one size. */
export interface PosterOption {
  paper: PaperCode
  paperLabel: string
  paperBlurb: string
  size: PosterSizeCode
  providerSku: string
  /** Sheet size in cm (portrait) — the printed paper. */
  widthCm: number
  heightCm: number
  /** Provider ex-tax cost, EUR minor — the cost-plus pricing basis. */
  cost: number
}

/** Does a (wPx × hPx) source resolve the photo slot of `size` at `minDpi`? The
 *  photo is cover-cropped into the slot, so BOTH oriented dimensions must meet
 *  the slot's pixel requirement without upscaling. */
function resolves(wPx: number, hPx: number, size: PosterSizeCode, minDpi: number): boolean {
  const a = A_SERIES[size]
  // Slot physical size (mm) — portrait, short × long.
  const slotShortIn = (a.wMm * SLOT_W_FRAC) / MM_PER_INCH
  const slotLongIn = (a.hMm * SLOT_H_FRAC) / MM_PER_INCH
  const needShort = slotShortIn * minDpi
  const needLong = slotLongIn * minDpi
  const srcShort = Math.min(wPx, hPx)
  const srcLong = Math.max(wPx, hPx)
  return srcShort >= needShort && srcLong >= needLong
}

/**
 * The poster options offered for a photo of (wPx × hPx): every paper × size whose
 * source resolution meets the paper's DPI floor. Ordered paper-major, size
 * ascending. Empty when the photo is too small for even A4.
 */
export function posterOptions(wPx: number, hPx: number): PosterOption[] {
  if (!wPx || !hPx) return []
  const out: PosterOption[] = []
  for (const p of PAPERS) {
    for (const size of SIZE_ORDER) {
      if (!resolves(wPx, hPx, size, p.minDpi)) continue
      const a = A_SERIES[size]
      out.push({
        paper: p.code,
        paperLabel: p.label,
        paperBlurb: p.blurb,
        size,
        providerSku: `${p.prodigiPrefix}-${size}`,
        widthCm: Math.round((a.wMm / 10) * 10) / 10,
        heightCm: Math.round((a.hMm / 10) * 10) / 10,
        cost: POSTER_COST[p.tier][size],
      })
    }
  }
  return out
}

// ── FINE ART → Prodigi (EU/NL-only), value-priced (cost-plus at the catalog markup) ──
//
// Two families, both produced in the Netherlands (verified per-variant on the
// Prodigi sandbox 2026-06-20; see docs/fine-art-prodigi-options.xlsx):
//   • Float-framed canvas  GLOBAL-FRA-CAN-*  (frame colour choice, ImageWrap edge)
//   • Classic framed+mount GLOBAL-CFPM-*     (frame colour choice, snow-white mount)
// Curated to LARGE statement sizes only. Like posters these are COST-PLUS — the base
// price is the Prodigi cost → DKK (with FX buffer); the catalog markup is applied in
// buildCatalog. Offered aspect-matched to the photo (√2 / A-series is the primary
// shape; 2:3 and 3:4 are offered within an 8% crop tolerance; 1:1 only for ~square
// photos), and resolution-gated at a fine-art DPI floor.

/** Aspect family of a fine-art size, as long ÷ short. */
type FineArtAspect = '1:1' | '3:4' | '2:3' | 'A'
const ASPECT_RATIO: Record<FineArtAspect, number> = { '1:1': 1, '3:4': 4 / 3, '2:3': 3 / 2, A: Math.SQRT2 }

export type FineArtFamily = 'canvas' | 'framed'

interface FineArtSize {
  /** Prodigi size token, e.g. '16X24' or 'A2'. */
  size: string
  aspect: FineArtAspect
  /** Print/canvas size in cm, PORTRAIT (short × long). */
  shortCm: number
  longCm: number
  /** Prodigi ex-tax cost, EUR minor — the cost-plus pricing basis. */
  cost: number
}

interface FineArtFamilyDef {
  family: FineArtFamily
  /** Customer-facing family name. */
  label: string
  /** Short spec descriptor shown under the size. */
  blurb: string
  /** Prodigi SKU family prefix, e.g. 'GLOBAL-FRA-CAN'. */
  prodigiPrefix: string
  /** Frame colours offered to the customer (Prodigi `color` attribute values). */
  frameColors: string[]
  /** Minimum print resolution (DPI) — gates which sizes a photo can fill. Canvas is
   *  viewed at distance so tolerates less; framed prints are inspected closer. */
  minDpi: number
  /** Fixed Prodigi attributes baked onto every order line for this family. */
  fixedAttributes: Record<string, string>
  sizes: FineArtSize[]
}

const FINE_ART_FAMILIES: FineArtFamilyDef[] = [
  {
    family: 'canvas',
    label: 'Float-framed canvas',
    blurb: 'Gallery canvas in a floating frame · 400gsm',
    prodigiPrefix: 'GLOBAL-FRA-CAN',
    frameColors: ['black', 'white', 'natural'],
    minDpi: 150,
    fixedAttributes: { wrap: 'ImageWrap' },
    sizes: [
      { size: '16X24', aspect: '2:3', shortCm: 40.6, longCm: 61.0, cost: 6400 },
      { size: '24X36', aspect: '2:3', shortCm: 61.0, longCm: 91.4, cost: 10000 },
      { size: '30X45', aspect: '2:3', shortCm: 76.2, longCm: 114.3, cost: 12200 },
      { size: '40X60', aspect: '2:3', shortCm: 101.6, longCm: 152.4, cost: 18500 },
      { size: '30X40', aspect: '3:4', shortCm: 76.2, longCm: 101.6, cost: 11600 },
      { size: '36X48', aspect: '3:4', shortCm: 91.4, longCm: 121.9, cost: 12800 },
      { size: '40X40', aspect: '1:1', shortCm: 101.6, longCm: 101.6, cost: 12500 },
      { size: 'A2', aspect: 'A', shortCm: 42.0, longCm: 59.4, cost: 6400 },
      { size: 'A1', aspect: 'A', shortCm: 59.4, longCm: 84.1, cost: 9200 },
      { size: 'A0', aspect: 'A', shortCm: 84.1, longCm: 118.9, cost: 12500 },
    ],
  },
  {
    family: 'framed',
    label: 'Framed & mounted print',
    blurb: 'EMA 200gsm giclée · snow-white mount · acrylic',
    prodigiPrefix: 'GLOBAL-CFPM',
    // black/white/natural only — Prodigi's mockup generator has no 'dark grey'
    // cover, so keeping these three lets every frame colour show a real mockup
    // (and matches the canvas colour set).
    frameColors: ['black', 'white', 'natural'],
    minDpi: 200,
    fixedAttributes: { mount: '2.4mm', mountColor: 'Snow white', glaze: 'Acrylic / Perspex' },
    sizes: [
      { size: '18X24', aspect: '3:4', shortCm: 45.7, longCm: 61.0, cost: 5400 },
      { size: '24X36', aspect: '2:3', shortCm: 61.0, longCm: 91.4, cost: 8000 },
      { size: 'A2', aspect: 'A', shortCm: 42.0, longCm: 59.4, cost: 5200 },
      { size: '20X28', aspect: 'A', shortCm: 50.8, longCm: 71.1, cost: 6000 },
      { size: 'A1', aspect: 'A', shortCm: 59.4, longCm: 84.1, cost: 7500 },
    ],
  },
]

/** Max linear crop (fraction) we'll silently apply to fit a photo to a size's aspect.
 *  8% admits the √2-primary plan: a √2 master fills A-series exactly and 2:3/3:4 with
 *  ~5.7% crop, while excluding 1:1 (≈29%). A 4:3 master gets 3:4 + A (not 2:3 at 11%). */
const FINE_ART_CROP_TOLERANCE = 0.08

/** A fine-art option offered for a photo: one family at one size (frame colour is a
 *  customer choice carried in `frameColors`, defaulting to the first). */
export interface FineArtOption {
  family: FineArtFamily
  familyLabel: string
  blurb: string
  size: string
  aspect: FineArtAspect
  providerSku: string
  /** Print/canvas size in cm, oriented to the photo. */
  widthCm: number
  heightCm: number
  /** Provider ex-tax cost, EUR minor — the cost-plus pricing basis. */
  cost: number
  /** Frame colours the customer can pick (first is the default). */
  frameColors: string[]
  /** Fixed Prodigi attributes for the order line (wrap / mount / glaze …). */
  fixedAttributes: Record<string, string>
}

/** Linear crop fraction to fit a photo of ratio `rPhoto` (long÷short) into `rTarget`. */
function cropFraction(rPhoto: number, rTarget: number): number {
  return 1 - Math.min(rPhoto, rTarget) / Math.max(rPhoto, rTarget)
}

/** Does (wPx × hPx), once centre-cropped to aspect `rTarget` (long÷short), still meet
 *  `minDpi` over the cm size (short × long, unoriented)? No upscaling. */
function fineArtResolves(wPx: number, hPx: number, shortCm: number, longCm: number, rTarget: number, minDpi: number): boolean {
  const reqShort = (shortCm / MM_PER_INCH) * 10 * minDpi // cm→in (×10/25.4) × dpi
  const reqLong = (longCm / MM_PER_INCH) * 10 * minDpi
  const sShort = Math.min(wPx, hPx)
  const sLong = Math.max(wPx, hPx)
  const rPhoto = sLong / sShort
  // Largest centred crop of the photo at the target aspect.
  const [cropShort, cropLong] = rPhoto >= rTarget ? [sShort, sShort * rTarget] : [sLong / rTarget, sLong]
  return cropShort >= reqShort && cropLong >= reqLong
}

/**
 * The fine-art options offered for a photo of (wPx × hPx): every family × size whose
 * aspect is within the crop tolerance of the photo AND whose print area resolves at
 * the family's DPI floor. cm sizes are oriented to the photo. Ordered family-major,
 * size ascending (as listed). Empty when the photo is too small / wrong shape.
 */
export function fineArtOptions(wPx: number, hPx: number): FineArtOption[] {
  if (!wPx || !hPx) return []
  const portrait = hPx >= wPx
  const rPhoto = Math.max(wPx, hPx) / Math.min(wPx, hPx)
  const out: FineArtOption[] = []
  for (const fam of FINE_ART_FAMILIES) {
    for (const s of fam.sizes) {
      const rTarget = ASPECT_RATIO[s.aspect]
      if (cropFraction(rPhoto, rTarget) > FINE_ART_CROP_TOLERANCE) continue
      if (!fineArtResolves(wPx, hPx, s.shortCm, s.longCm, rTarget, fam.minDpi)) continue
      out.push({
        family: fam.family,
        familyLabel: fam.label,
        blurb: fam.blurb,
        size: s.size,
        aspect: s.aspect,
        providerSku: `${fam.prodigiPrefix}-${s.size}`,
        widthCm: portrait ? s.shortCm : s.longCm,
        heightCm: portrait ? s.longCm : s.shortCm,
        cost: s.cost,
        frameColors: fam.frameColors,
        fixedAttributes: fam.fixedAttributes,
      })
    }
  }
  return out
}

/**
 * Deprecated fine-art placeholder — superseded by {@link fineArtOptions} (real
 * Prodigi range, 2026-06-20). Kept only so the admin Prices-tab "Fine art" base
 * field + its cost floor keep compiling until that field is retired; the live
 * catalog no longer prices fine art from it.
 */
export const FINE_ART_PENDING = {
  provider: 'prodigi' as const,
  shortCm: 42,
  longCm: 59.4,
  price: 149500,
  label: 'Fine art edition',
  material: 'Giclée',
  cost: 0,
}
/** Default fine-art retail price (DKK øre) — seeds the Prices tab. */
export const FINE_ART_DEFAULT_PRICE = FINE_ART_PENDING.price

/** Flattened Prodigi SKU list for the daily validator — posters (paper × size) plus
 *  every fine-art family × size, each with its recorded cost. */
export const PRODIGI_SKUS: { providerSku: string; label: string; cost: number }[] = [
  ...PAPERS.flatMap((p) =>
    SIZE_ORDER.map((size) => ({
      providerSku: `${p.prodigiPrefix}-${size}`,
      label: `${p.label} · ${size}`,
      cost: POSTER_COST[p.tier][size],
    })),
  ),
  ...FINE_ART_FAMILIES.flatMap((f) =>
    f.sizes.map((s) => ({
      providerSku: `${f.prodigiPrefix}-${s.size}`,
      label: `${f.label} · ${s.size}`,
      cost: s.cost,
    })),
  ),
]
