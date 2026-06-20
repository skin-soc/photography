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
  /** Provider ex-tax cost (EUR minor). 0 until WhiteWall trade pricing is wired,
   *  so the floor is effectively "any positive price". */
  cost: 0,
}
/** Default fine-art retail price (DKK øre) — seeds the Prices tab. */
export const FINE_ART_DEFAULT_PRICE = FINE_ART_PENDING.price

/** Flattened Prodigi SKU list for the daily validator — every paper × size once,
 *  with its recorded cost. (Validator is Prodigi-only; WhiteWall excluded.) */
export const PRODIGI_SKUS: { providerSku: string; label: string; cost: number }[] =
  PAPERS.flatMap((p) =>
    SIZE_ORDER.map((size) => ({
      providerSku: `${p.prodigiPrefix}-${size}`,
      label: `${p.label} · ${size}`,
      cost: POSTER_COST[p.tier][size],
    })),
  )
