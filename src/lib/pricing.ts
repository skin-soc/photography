/**
 * Editable retail pricing, backed by Cloudflare KV (binding: SHOP_SETTINGS).
 *
 * The admin Prices tab tweaks these; the catalog build (src/lib/shop.ts) reads
 * them to price every product. Defaults come from the worker-owned range
 * (src/config/product-range.ts) + the digital ladders below, so an unset/empty
 * KV value always falls back to a sane price — never zero.
 *
 * HARD FLOOR: a retail price can never sit below the provider cost. Posters carry
 * a Prodigi EUR cost (converted to DKK with the FX buffer); fine art's cost is 0
 * until WhiteWall is wired; digital downloads have no provider cost. `validate`
 * enforces the floor and the admin API rejects any sub-floor save. See
 * docs/fap-print-fulfilment.md and [[manual-vat-approach]].
 */

import { getCloudflareContext } from '@opennextjs/cloudflare'
import {
  POSTER_COST,
  FINE_ART_DEFAULT_PRICE,
  FINE_ART_PENDING,
  SIZE_ORDER,
  type PaperTier,
  type PosterSizeCode,
} from '@/config/product-range'
import { eurToDkkOre, type Rates } from '@/lib/currency'

interface KVLike {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

const PRICING_KEY = 'pricing:config'

/** Megapixel bracket prices for the full-res digital downloads (DKK øre).
 *  Three brackets: ≤25 MP, ≤50 MP, >50 MP. Mirrors the old hardcoded ladders. */
export type DigitalBrackets = [number, number, number]

/** The five Lightroom color labels. A photo carries at most one. */
export type ColorLabel = 'red' | 'yellow' | 'green' | 'blue' | 'purple'
export const COLOR_LABELS: ColorLabel[] = ['red', 'yellow', 'green', 'blue', 'purple']

/**
 * Across-the-board markup applied to every product's list price.
 *
 *  • `general` — added to every product, whatever its label.
 *  • `labels.{yellow,green,blue,purple}` — ADDED on top of the general markup for
 *    photos carrying that color label (premium positioning).
 *  • `labels.red` — a DEDUCTION: red marks a photo as on sale. The sale can wipe
 *    out at most the general markup (red ≤ general), so the price never drops
 *    below the list price. Net markup is therefore always ≥ 0, which keeps every
 *    price at or above its (already cost-floored) list price.
 *
 * Effective markup % for a photo = effectiveMarkupPct(label, markup).
 */
export interface MarkupConfig {
  /** General markup applied to all goods, in percent (≥ 0). */
  general: number
  /** Per-label markup, percent. Red is a sale deduction (0 ≤ red ≤ general);
   *  the rest are additions on top of `general` (≥ 0). */
  labels: Record<ColorLabel, number>
}

export interface PricingConfig {
  /** Fine-art edition retail price (DKK øre) — single placeholder for now. */
  fineArt: number
  /** Digital-download retail prices (DKK øre). */
  digital: {
    /** JPEG 1600px. */
    standard: number
    /** JPEG 3200px. */
    medium: number
    /** 16-bit TIFF 3200px (raw-available photos only). */
    pro: number
    /** JPEG full-res — megapixel-bracketed. */
    master: DigitalBrackets
    /** 16-bit TIFF full-res — megapixel-bracketed. */
    original: DigitalBrackets
  }
  /** Across-the-board + per-label markup applied on top of the list prices. */
  markup: MarkupConfig
  /** Flat handling fee (DKK øre) ADDED to the Prodigi-quoted shipping cost shown
   *  to the customer (covers packaging/admin). May be 0. */
  shippingHandlingMinor: number
}

/**
 * The effective markup percentage for a photo with `label`, given the config.
 * Red is a deduction capped at the general markup (so the result is never
 * negative); the other labels add to the general markup; no/unknown label is
 * just the general markup.
 */
export function effectiveMarkupPct(label: string | undefined | null, m: MarkupConfig): number {
  switch (label) {
    case 'yellow': return m.general + m.labels.yellow
    case 'green':  return m.general + m.labels.green
    case 'blue':   return m.general + m.labels.blue
    case 'purple': return m.general + m.labels.purple
    case 'red':    return m.general - Math.min(m.labels.red, m.general)
    default:       return m.general
  }
}

/** Apply the effective markup to a list price (DKK øre). */
export function applyMarkup(listPrice: number, label: string | undefined | null, m: MarkupConfig): number {
  const pct = effectiveMarkupPct(label, m)
  return pct === 0 ? listPrice : Math.round(listPrice * (1 + pct / 100))
}

/**
 * The actual discount a red-labelled (on-sale) item shows the customer, as a
 * whole percent off the NORMAL price. The red deduction is a slice of the base,
 * so the real discount is red ÷ (100 + general) — e.g. red 200 on general 400
 * ⇒ 200/500 ⇒ 40% off (NOT 50%). Returns 0 when there's no sale. This is uniform
 * across all red items, since both normal and sale prices scale with the base.
 */
export function saleDiscountPct(m: MarkupConfig): number {
  const red = Math.min(m.labels.red, m.general)
  if (red <= 0 || m.general <= 0) return 0
  return Math.round((red / (100 + m.general)) * 100)
}

/** Factory defaults. Posters are NOT here — they're priced cost-plus (Prodigi
 *  cost × (1 + markup)), so the only editable bases are fine art + digital. */
export const DEFAULT_PRICING: PricingConfig = {
  fineArt: FINE_ART_DEFAULT_PRICE,
  digital: {
    standard: 2500,
    medium: 4500,
    pro: 15900,
    master: [39900, 79900, 129900],
    original: [59900, 99900, 159900],
  },
  // No markup by default — the list prices above ARE the sell prices until the
  // admin dials in a general / per-label markup.
  markup: { general: 0, labels: { red: 0, yellow: 0, green: 0, blue: 0, purple: 0 } },
  // Default handling fee added on top of Prodigi's shipping cost (20.00 DKK).
  shippingHandlingMinor: 2000,
}

async function settingsKV(): Promise<KVLike | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true })
    return (env as unknown as { SHOP_SETTINGS?: KVLike }).SHOP_SETTINGS
  } catch {
    return undefined
  }
}

/** The SHOP_SETTINGS KV binding (or undefined). Shared so other modules (e.g. the
 *  processed-catalog cache) can use the same binding without re-deriving it. Unlike
 *  the Cache API, KV works on workers.dev preview too. */
export async function shopSettingsKV(): Promise<KVLike | undefined> {
  return settingsKV()
}
export type { KVLike }

/** Deep-merge a stored (possibly partial / older-schema) config over the
 *  defaults so every field is always present and numeric. */
function coerce(raw: unknown): PricingConfig {
  const d = DEFAULT_PRICING
  const r = (raw ?? {}) as Partial<PricingConfig>
  const num = (v: unknown, fallback: number): number => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback
  }
  const brackets = (v: unknown, fallback: DigitalBrackets): DigitalBrackets => {
    const a = Array.isArray(v) ? v : []
    return [num(a[0], fallback[0]), num(a[1], fallback[1]), num(a[2], fallback[2])]
  }
  // Percentages may legitimately be 0, so a separate non-negative coercion.
  const pct = (v: unknown, fallback: number): number => {
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? n : fallback
  }
  // Fees (øre) may legitimately be 0; non-negative integer.
  const fee = (v: unknown, fallback: number): number => {
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback
  }
  const rm = (r.markup ?? {}) as Partial<MarkupConfig>
  const rl = (rm.labels ?? {}) as Partial<Record<ColorLabel, number>>
  const general = pct(rm.general, d.markup.general)
  return {
    fineArt: num(r.fineArt, d.fineArt),
    digital: {
      standard: num(r.digital?.standard, d.digital.standard),
      medium: num(r.digital?.medium, d.digital.medium),
      pro: num(r.digital?.pro, d.digital.pro),
      master: brackets(r.digital?.master, d.digital.master),
      original: brackets(r.digital?.original, d.digital.original),
    },
    markup: {
      general,
      labels: {
        // Kept as entered; `validateMarkup` rejects red > general, and
        // `effectiveMarkupPct` clamps at runtime as a final guard.
        red: pct(rl.red, d.markup.labels.red),
        yellow: pct(rl.yellow, d.markup.labels.yellow),
        green: pct(rl.green, d.markup.labels.green),
        blue: pct(rl.blue, d.markup.labels.blue),
        purple: pct(rl.purple, d.markup.labels.purple),
      },
    },
    shippingHandlingMinor: fee(r.shippingHandlingMinor, d.shippingHandlingMinor),
  }
}

/** Current pricing config. Falls back to DEFAULT_PRICING when KV is unset or
 *  unavailable, so the shop is never left with zero prices. */
export async function getPricing(): Promise<PricingConfig> {
  const kv = await settingsKV()
  if (!kv) return DEFAULT_PRICING
  try {
    const raw = await kv.get(PRICING_KEY)
    if (!raw) return DEFAULT_PRICING
    return coerce(JSON.parse(raw))
  } catch {
    return DEFAULT_PRICING
  }
}

/**
 * A short stable signature of the active pricing, folded into the catalog cache
 * key so a price change forces a rebuild even when the origin's `generated`
 * stamp is unchanged. Cheap djb2 hash of the canonical JSON.
 */
export function pricingStamp(p: PricingConfig): string {
  const s = JSON.stringify([
    p.fineArt,
    p.digital.standard,
    p.digital.medium,
    p.digital.pro,
    p.digital.master,
    p.digital.original,
    p.markup.general,
    p.markup.labels,
    p.shippingHandlingMinor,
  ])
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

// ── Floors ────────────────────────────────────────────────────────────────────
// The hard minimum each retail line may be set to (DKK øre). Posters convert the
// Prodigi EUR cost with the FX buffer; everything else has no provider cost.

export interface PricingFloors {
  posters: Record<PaperTier, Record<PosterSizeCode, number>>
  fineArt: number
  digital: { standard: number; medium: number; pro: number; master: number; original: number }
}

/** Compute the floor for every line, given live FX rates. */
export function pricingFloors(rates: Rates): PricingFloors {
  const tier = (t: PaperTier): Record<PosterSizeCode, number> => {
    const out = {} as Record<PosterSizeCode, number>
    for (const s of SIZE_ORDER) out[s] = eurToDkkOre(POSTER_COST[t][s], rates)
    return out
  }
  return {
    posters: { photographic: tier('photographic'), premium: tier('premium') },
    fineArt: eurToDkkOre(FINE_ART_PENDING.cost, rates), // 0 until WhiteWall is wired
    digital: { standard: 0, medium: 0, pro: 0, master: 0, original: 0 },
  }
}

export interface PricingValidationError {
  /** Dotted path of the offending line, e.g. "posters.premium.A0". */
  path: string
  /** Human label, e.g. "Premium · A0". */
  label: string
  /** The submitted price (DKK øre). */
  price: number
  /** The floor it violated (DKK øre). */
  floor: number
}

const DIGITAL_LABEL: Record<keyof PricingFloors['digital'], string> = {
  standard: 'Standard', medium: 'Medium', pro: 'Pro', master: 'Master', original: 'Original',
}

/**
 * Validate a config against the floors. Returns every line that sits below its
 * cost — empty array means the config is sellable. Pure: callers supply floors
 * (from `pricingFloors`) so this works on client and server alike. Posters are
 * not checked here — they're cost-plus, so always ≥ cost by construction.
 */
export function validatePricing(cfg: PricingConfig, floors: PricingFloors): PricingValidationError[] {
  const errs: PricingValidationError[] = []
  const check = (price: number, floor: number, path: string, label: string) => {
    if (!Number.isFinite(price) || price < floor) {
      errs.push({ path, label, price: Math.round(price) || 0, floor })
    }
  }
  check(cfg.fineArt, floors.fineArt, 'fineArt', 'Fine art edition')
  check(cfg.digital.standard, floors.digital.standard, 'digital.standard', DIGITAL_LABEL.standard)
  check(cfg.digital.medium, floors.digital.medium, 'digital.medium', DIGITAL_LABEL.medium)
  check(cfg.digital.pro, floors.digital.pro, 'digital.pro', DIGITAL_LABEL.pro)
  cfg.digital.master.forEach((p, i) =>
    check(p, floors.digital.master, `digital.master.${i}`, `${DIGITAL_LABEL.master} (bracket ${i + 1})`))
  cfg.digital.original.forEach((p, i) =>
    check(p, floors.digital.original, `digital.original.${i}`, `${DIGITAL_LABEL.original} (bracket ${i + 1})`))
  return errs
}

const COLOR_LABEL_NAME: Record<ColorLabel, string> = {
  red: 'Red', yellow: 'Yellow', green: 'Green', blue: 'Blue', purple: 'Purple',
}

/**
 * Validate the markup block. Rules: every percentage ≥ 0, and the Red sale can't
 * exceed the general markup (so the discounted price never drops below the list
 * price). Returns human messages — empty ⇒ valid.
 */
export function validateMarkup(m: MarkupConfig): string[] {
  const errs: string[] = []
  if (!Number.isFinite(m.general) || m.general < 0) errs.push('General markup can’t be negative.')
  for (const c of COLOR_LABELS) {
    const v = m.labels[c]
    if (!Number.isFinite(v) || v < 0) errs.push(`${COLOR_LABEL_NAME[c]} markup can’t be negative.`)
  }
  if (Number.isFinite(m.labels.red) && Number.isFinite(m.general) && m.labels.red > m.general) {
    errs.push(`Red sale (${m.labels.red}%) can’t exceed the general markup (${m.general}%).`)
  }
  return errs
}

/**
 * Persist a validated config. Re-validates server-side against the supplied
 * floors (price ≥ cost) and the markup rules as a guard — refuses to write
 * anything below cost or with an invalid markup. Returns both error channels
 * (any non-empty ⇒ nothing written) so the API can 400 with detail.
 */
export async function setPricing(
  cfg: PricingConfig,
  floors: PricingFloors,
): Promise<{ ok: boolean; errors: PricingValidationError[]; markupErrors: string[] }> {
  const clean = coerce(cfg)
  const errors = validatePricing(clean, floors)
  const markupErrors = validateMarkup(clean.markup)
  if (errors.length > 0 || markupErrors.length > 0) return { ok: false, errors, markupErrors }
  const kv = await settingsKV()
  if (!kv) return { ok: false, errors: [], markupErrors: [] }
  await kv.put(PRICING_KEY, JSON.stringify(clean))
  return { ok: true, errors: [], markupErrors: [] }
}
