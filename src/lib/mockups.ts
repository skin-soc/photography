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
 */
import { mockupSrcUrl } from './downloads'

const PIG_RENDER = 'https://productimagegenerator.services.prodigi.com/render/'

/** Representative kite product_id per fine-art family + orientation. */
const MOCKUP_PRODUCT: Record<string, { portrait: string; landscape: string }> = {
  canvas: { portrait: 'GLOBAL-FRA-CAN-16x24-PORTRAIT', landscape: 'GLOBAL-FRA-CAN-16x24-LANDSCAPE' },
  framed: { portrait: 'GLOBAL-CFPM-18x24-PORTRAIT', landscape: 'GLOBAL-CFPM-18x24-LANDSCAPE' },
}
/** Frame colours the generator can render (a `{colour}_cover` view exists). */
const MOCKUP_COLORS = ['black', 'white', 'natural']
const SCENE = 'room07'

/** True when a room mockup can be rendered for this (family, frame colour). */
export function canMockup(family: string | undefined, color: string | undefined): boolean {
  return !!family && family in MOCKUP_PRODUCT && !!color && MOCKUP_COLORS.includes(color)
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
  const px = opts.size ?? 1400
  const u = new URL(PIG_RENDER)
  u.searchParams.set('product_id', product_id)
  u.searchParams.set('format', 'png')
  u.searchParams.set('size', `${px}x${px}`)
  u.searchParams.set('fill_mode', 'contain')
  u.searchParams.set('scene_resize_type', 'cover')
  u.searchParams.set('scene', SCENE)
  u.searchParams.set('variant', `${opts.color}_cover`)
  u.searchParams.set('image', mockupSrcUrl(opts.photoId))
  return u.toString()
}
