/**
 * Fine-art room mockups via Prodigi's free, keyless Product Image Generator
 * ("PIG", Kite under the hood). We pass it our own no-logo artwork URL and it
 * composites it into a framed/canvas room scene, watermark-free.
 *
 * The mockup illustrates the FRAME COLOUR + style in a room — the exact size
 * doesn't change the scene — so we reuse ONE representative product_id per family
 * + orientation across every size (the generator has no A-series products anyway).
 * The render URL embeds a token-gated origin URL for the source artwork, so it is
 * built server-side only (never exposed to the client) — see the worker route.
 *
 * COVER COLOURS: framed prints (CFPM) have a per-colour cover (black/white/natural),
 * but float-framed canvas (FRA-CAN) only has a single `black_cover` view — white /
 * natural canvas covers render a BLANK frame. So canvas always previews in black
 * (representative; a float frame is a thin element), while the customer's actual
 * colour choice still flows to fulfilment via the SKU. Framed uses the real colour.
 */
import { mockupSrcUrl } from './downloads'

const PIG_RENDER = 'https://productimagegenerator.services.prodigi.com/render/'

/** Bump to force a fresh render + bust the edge cache (e.g. after fixing a bad
 *  mockup). Part of the source URL (so Kite re-renders) and the worker cache key. */
export const MOCKUP_VERSION = 2

/** Representative kite product_id per fine-art family + orientation. */
const MOCKUP_PRODUCT: Record<string, { portrait: string; landscape: string }> = {
  canvas: { portrait: 'GLOBAL-FRA-CAN-16x24-PORTRAIT', landscape: 'GLOBAL-FRA-CAN-16x24-LANDSCAPE' },
  framed: { portrait: 'GLOBAL-CFPM-18x24-PORTRAIT', landscape: 'GLOBAL-CFPM-18x24-LANDSCAPE' },
}
/** Frame colours the generator can render a cover for. */
const MOCKUP_COLORS = ['black', 'white', 'natural']

/** True when a room mockup can be shown for this (family, frame colour). Canvas
 *  always previews in black (its only real cover), so any colour is allowed. */
export function canMockup(family: string | undefined, color: string | undefined): boolean {
  return !!family && family in MOCKUP_PRODUCT && !!color && MOCKUP_COLORS.includes(color)
}

/** The frame colour whose mockup actually composites the artwork — canvas only has
 *  a black cover, framed has all three. Used to key the cached asset + the request. */
export function mockupColor(family: string, color: string): string {
  return family === 'canvas' ? 'black' : color
}

/** Distinct cached-mockup colours to render for a family (canvas → just black,
 *  since its other colours reuse the black cover). */
export function mockupColorsForFamily(family: string): string[] {
  return family === 'canvas' ? ['black'] : MOCKUP_COLORS
}

/** Build the Prodigi PIG render URL for a fine-art room mockup, or null when the
 *  (family, colour) isn't renderable. Server-side only (embeds a gated src URL). */
export function mockupRenderUrl(opts: {
  photoId: string
  family: string
  color: string
  portrait: boolean
  size?: number
}): string | null {
  const def = MOCKUP_PRODUCT[opts.family]
  if (!def || !canMockup(opts.family, opts.color)) return null
  const product_id = opts.portrait ? def.portrait : def.landscape
  // Canvas only has a black cover that composites the artwork; framed has all three.
  const coverColor = opts.family === 'canvas' ? 'black' : opts.color
  const px = opts.size ?? 1400
  const u = new URL(PIG_RENDER)
  u.searchParams.set('product_id', product_id)
  u.searchParams.set('format', 'png')
  u.searchParams.set('size', `${px}x${px}`)
  u.searchParams.set('fill_mode', 'contain')
  u.searchParams.set('scene_resize_type', 'cover')
  u.searchParams.set('scene', 'room07')
  u.searchParams.set('variant', `${coverColor}_cover`)
  // `&v=` rides along on the (origin-ignored) source URL so a bump changes Kite's
  // cache key and forces a fresh render.
  u.searchParams.set('image', `${mockupSrcUrl(opts.photoId)}&v=${MOCKUP_VERSION}`)
  return u.toString()
}
