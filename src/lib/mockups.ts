/**
 * Fine-art room mockups via Prodigi's free, keyless Product Image Generator
 * ("PIG", Kite under the hood). We pass it our own no-logo artwork URL and it
 * composites it into a framed/canvas room scene, watermark-free.
 *
 * PER-SIZE: the mockup uses the SELECTED size's own product_id so the room scene
 * shows the piece at its real scale — letting the customer compare sizes in the
 * same room (scene `room07`). Sizes Prodigi can't render (no room07 scene) just
 * 404 → the hero falls back to the framed preview (no fragile size remapping).
 *
 * COVER COLOURS: framed prints (CFPM) have a per-colour cover (black/white/natural).
 * Float-framed canvas (FRA-CAN) only has a black cover, so canvas always previews
 * in black (and canvas is offered in black only) — the real colour, when there is
 * a choice, still flows to fulfilment via the SKU.
 */
import { mockupSrcUrl } from './downloads'

const PIG_RENDER = 'https://productimagegenerator.services.prodigi.com/render/'

/** Prodigi product_id prefix per family. */
const MOCKUP_PREFIX: Record<string, string> = {
  canvas: 'GLOBAL-FRA-CAN',
  framed: 'GLOBAL-CFPM',
}
/** Frame colours the generator can render a cover for. */
const MOCKUP_COLORS = ['black', 'white', 'natural']

/** Sizes that actually render `room07` in the generator (verified 2026-06-20).
 *  Canvas is sparse — only these three; the larger/A-series canvas sizes have no
 *  room07 scene, so they show the framed preview instead. Framed covers all. */
const MOCKUP_SIZES: Record<string, string[]> = {
  canvas: ['16X24', '24X36', '30X40'],
  framed: ['18X24', '24X36', 'A2', '20X28', 'A1'],
}

/** True when the generator has a room07 scene for this (family, size). */
export function mockupSizeSupported(family: string, size: string): boolean {
  return (MOCKUP_SIZES[family] ?? []).includes(size)
}

/**
 * PIG composites the artwork into a fixed `bleed_area` window of the product
 * template — and for FRAMED prints (CFPM) that window is the MOUNT aperture, which
 * is a DIFFERENT aspect from the paper and varies by size (e.g. 18x24→1.42,
 * 24x36→1.59, 20x28→1.50). If we hand PIG a source at the paper aspect, PIG
 * re-fits it to the window and centre-crops the mismatch off the TOP+BOTTOM —
 * eating a subject placed low in frame. So we crop the source to the window aspect
 * instead (keep-bottom, in the origin), and PIG then fits it with nothing to crop.
 * Returns "W:H" (landscape-oriented pixel ratio) or null if PIG has no config.
 * Cached per product_id — the window is a property of the template, not the photo. */
const _winAspect = new Map<string, string | null>()
export async function mountWindowAspect(family: string, size: string, portrait: boolean): Promise<string | null> {
  const prefix = MOCKUP_PREFIX[family]
  if (!prefix) return null
  const product_id = `${prefix}-${sizeToken(size)}-${portrait ? 'PORTRAIT' : 'LANDSCAPE'}`
  if (_winAspect.has(product_id)) return _winAspect.get(product_id) ?? null
  let aspect: string | null = null
  try {
    const res = await fetch(`https://productimagegenerator.services.prodigi.com/product/${product_id}/`)
    if (res.ok) {
      const cfg = (await res.json()) as { images?: { masks?: { bleed_area?: { points?: { x: number; y: number }[][] } }[] }[] }
      const pts = cfg.images?.[0]?.masks?.[0]?.bleed_area?.points?.[0]
      if (pts && pts.length >= 3) {
        const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
        const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys)
        if (w > 0 && h > 0) aspect = `${w}:${h}`
      }
    }
  } catch { /* network/parse failure → null, caller falls back to the paper aspect */ }
  _winAspect.set(product_id, aspect)
  return aspect
}

/** Bump to force a fresh render + bust every cache (edge + browser). Part of the
 *  source URL (so Kite re-renders), the worker cache key, AND the hero's public
 *  mockup URL (so the 1-year immutable browser cache is bypassed). v4/5 = JPEG;
 *  v6 = per-view assets (room07 hero + cover grid tiles); v7 = covers cropped out
 *  of PIG's magenta matte; v8 = source cropped to PIG's mount-window aspect so a low
 *  subject's footroom survives (no top+bottom centre-crop by PIG). */
export const MOCKUP_VERSION = 8

/** Generator size token: inch sizes are lower-cased (16X24 → 16x24), A-series kept. */
function sizeToken(size: string): string {
  return /^\d+X\d+$/.test(size) ? size.toLowerCase() : size
}

/** The frame colour whose mockup composites the artwork — canvas only has a black
 *  cover, framed has all three. Keys the cached asset + the request. */
export function mockupColor(family: string, color: string): string {
  return family === 'canvas' ? 'black' : color
}

/** Distinct cached-mockup colours to render for a family (canvas → just black). */
export function mockupColorsForFamily(family: string): string[] {
  return family === 'canvas' ? ['black'] : MOCKUP_COLORS
}

/** True when a room mockup could exist for this (family, frame colour). */
export function canMockup(family: string | undefined, color: string | undefined): boolean {
  return !!family && family in MOCKUP_PREFIX && !!color && MOCKUP_COLORS.includes(color)
}

/** The two mockup views we render per (family, size, colour):
 *  • room07 — the artwork composited into in-room scene 7 (product-page hero).
 *  • cover  — the framed/canvas piece head-on on a plain ground (grid tiles). */
export type MockupView = 'room07' | 'cover'
export const MOCKUP_VIEWS: MockupView[] = ['room07', 'cover']

/** Build the Prodigi PIG render URL for a fine-art mockup at a specific SIZE in a
 *  given VIEW (room07 scene, or head-on cover), or null when the (family, colour)
 *  isn't renderable. Server-side only (embeds a gated src URL). Unsupported sizes
 *  still build a URL but Prodigi returns an error/blank → the origin won't cache
 *  it → the hero falls back to the preview. */
export function mockupRenderUrl(opts: {
  photoId: string
  family: string
  size: string
  color: string
  portrait: boolean
  view?: MockupView
  px?: number
  /** Cover only — output dimensions (so the head-on tile keeps the piece's aspect
   *  for the masonry grid). Defaults to a square `px` box. */
  outW?: number
  outH?: number
  /** Oriented print aspect "W:H" — the origin pre-crops the source to it (keep
   *  bottom, centre sides) so the mockup crop matches the print. */
  aspect?: string
  /** The artwork (preview) version, appended to the `image=` source URL so a re-edited
   *  master gives Prodigi a NEW URL → it refetches instead of reusing its immutable
   *  cache of the old source. Defaults to the static MOCKUP_VERSION (format bumps). */
  srcVersion?: number
}): string | null {
  const prefix = MOCKUP_PREFIX[opts.family]
  if (!prefix || !canMockup(opts.family, opts.color) || !mockupSizeSupported(opts.family, opts.size)) return null
  const orient = opts.portrait ? 'PORTRAIT' : 'LANDSCAPE'
  const product_id = `${prefix}-${sizeToken(opts.size)}-${orient}`
  const coverColor = mockupColor(opts.family, opts.color)
  const px = opts.px ?? 2400
  const sizeParam = opts.outW && opts.outH ? `${opts.outW}x${opts.outH}` : `${px}x${px}`
  const u = new URL(PIG_RENDER)
  u.searchParams.set('product_id', product_id)
  u.searchParams.set('format', 'png')
  u.searchParams.set('size', sizeParam)
  u.searchParams.set('fill_mode', 'contain')
  // room07 composites into a scene; cover (no scene) is the head-on product shot.
  if ((opts.view ?? 'room07') === 'room07') {
    u.searchParams.set('scene_resize_type', 'cover')
    u.searchParams.set('scene', 'room07')
  }
  u.searchParams.set('variant', `${coverColor}_cover`)
  // `v` busts BOTH Prodigi's immutable fetch-cache AND the origin's mtime cache: a
  // re-edited master bumps srcVersion (= preview version) → new URL → fresh artwork.
  u.searchParams.set('image', `${mockupSrcUrl(opts.photoId, opts.aspect)}&v=${opts.srcVersion ?? MOCKUP_VERSION}`)
  return u.toString()
}
