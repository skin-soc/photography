/**
 * Poster MASTER compositor — renders the print-ready A-series poster: the photo
 * centre-cropped to 4:5 on a white A-series sheet, with the typeset caption /
 * title / website band below. NO watermark, 300 dpi, sRGB.
 *
 * This MIRRORS the on-screen PosterMat (src/app/components/PosterMat.tsx) exactly
 * — same proportions (fractions of the sheet WIDTH), same crop, same fonts — so
 * the printed poster matches the preview the customer approved. Text is rasterised
 * with @resvg/resvg-js (not librsvg) because librsvg ignores embedded @font-face;
 * resvg loads the TTF buffers directly. The composite is done with sharp.
 *
 * Output is a high-quality JPEG buffer tagged at the target dpi, sized to the
 * exact A-size in pixels — ready to hand to Prodigi as the print asset.
 */

import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import sharp from 'sharp'
import { Resvg } from '@resvg/resvg-js'

const MM_PER_INCH = 25.4

/** A-series sheet sizes (portrait, mm) — short × long. */
const A_SERIES = {
  A4: { wMm: 210, hMm: 297 },
  A3: { wMm: 297, hMm: 420 },
  A2: { wMm: 420, hMm: 594 },
  A1: { wMm: 594, hMm: 841 },
  A0: { wMm: 841, hMm: 1189 },
}

// ── Layout proportions — fractions of the sheet WIDTH (mirror PosterMat) ────────
const IMAGE_RATIO = 1.25 // photo height ÷ width (4:5 portrait)
const MARGIN = 0.045 // white above + left/right of the photo
const FOOT = 0.045 // website sits this far above the sheet bottom
const CAPTION_TITLE_GAP = 0.02 // gap between caption and title
const TITLE_FONT = 0.06 // title (Cormorant Garamond Medium)
const CAPTION_FONT = 0.0185 // caption (Cormorant Garamond Medium)
const WEBSITE_FONT = 0.0135 // website (IBM Plex Mono Light)
const TITLE_TRACK = 0.07 // letter-spacing (em)
const CAPTION_TRACK = 0.32
const WEBSITE_TRACK = 0.3
const TITLE_COLOR = '#111111'
const CAPTION_COLOR = '#3a3a3a'
const WEBSITE_COLOR = '#6a6a6a'

// Explicit font FILES for resvg (it has no fontBuffers option in 2.6.x), with
// system fonts disabled — so the printed type is deterministic on any host and
// never silently falls back to whatever the box happens to have installed.
const FONT_DIR = fileURLToPath(new URL('./fonts/', import.meta.url))

// Base fonts — always loaded.
const BASE_FONT_FILES = [
  join(FONT_DIR, 'CormorantGaramond-VF.ttf'),
  join(FONT_DIR, 'IBMPlexMono-Light.ttf'),
]

// Noto fonts for non-Latin scripts — discovered at startup, present only when
// the container has them (installed via apt fonts-noto-core / fonts-noto-cjk
// and copied into /app/fonts/ by the Dockerfile).
import { existsSync } from 'node:fs'

const NOTO_CANDIDATES = [
  // Cyrillic (Russian) — from fonts-noto-core
  join(FONT_DIR, 'NotoSerif-Regular.ttf'),
  // CJK Serif — from fonts-noto-cjk (covers SC / TC / JP / KR in one TTC)
  join(FONT_DIR, 'NotoSerifCJK-Regular.ttc'),
  // CJK Sans fallback — in case Serif CJK isn't available
  join(FONT_DIR, 'NotoSansCJK-Regular.ttc'),
  // Arabic
  join(FONT_DIR, 'NotoNaskhArabic-Regular.ttf'),
  join(FONT_DIR, 'NotoSansArabic-Regular.ttf'),
]
const NOTO_AVAILABLE = NOTO_CANDIDATES.filter(existsSync)

const FONT_FILES = [...BASE_FONT_FILES, ...NOTO_AVAILABLE]

/** Font-family stack for the title/caption SVG text per locale.
 *  Cormorant Garamond covers all Latin scripts. Non-Latin scripts need Noto.
 *  Arabic additionally requires direction="rtl" on the text elements. */
function fontFamilyForLocale(locale) {
  // CJK: prefer Noto Serif CJK (matching Cormorant's serif style), fall back to Sans
  const hasCjkSerif = NOTO_AVAILABLE.some((f) => f.includes('NotoSerifCJK'))
  const hasCjkSans  = NOTO_AVAILABLE.some((f) => f.includes('NotoSansCJK'))
  const cjkStack = hasCjkSerif
    ? 'Noto Serif CJK SC, Noto Serif CJK JP, Noto Serif CJK KR, Noto Sans CJK SC, Noto Sans CJK JP, Noto Sans CJK KR'
    : hasCjkSans
      ? 'Noto Sans CJK SC, Noto Sans CJK JP, Noto Sans CJK KR'
      : ''
  const hasNotoSerif  = NOTO_AVAILABLE.some((f) => f.includes('NotoSerif-'))
  const hasArabic = NOTO_AVAILABLE.some((f) => f.toLowerCase().includes('arabic'))

  switch (locale) {
    case 'zh': return cjkStack ? `Cormorant Garamond, ${cjkStack}` : 'Cormorant Garamond'
    case 'ja': return cjkStack ? `Cormorant Garamond, ${cjkStack}` : 'Cormorant Garamond'
    case 'ko': return cjkStack ? `Cormorant Garamond, ${cjkStack}` : 'Cormorant Garamond'
    case 'ru': return hasNotoSerif ? 'Cormorant Garamond, Noto Serif' : 'Cormorant Garamond'
    case 'ar': return hasArabic ? 'Noto Naskh Arabic, Noto Sans Arabic' : 'Cormorant Garamond'
    default:   return 'Cormorant Garamond'
  }
}

/** Escape text for embedding in SVG. */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]))
}

/** A-sizes OFFERED for sale (drives the pre-render enumeration). A4 is dropped
 *  from the shop (too small / "home-print"), so it is not pre-rendered — but
 *  A_SERIES still carries it so any legacy A4 order can be rendered on demand. */
export const POSTER_SIZES = ['A3', 'A2', 'A1', 'A0']

/**
 * Render the poster master for a photo. Returns a JPEG Buffer at the exact
 * A-size in pixels (300 dpi by default).
 *
 * @param {object}  o
 * @param {string|Buffer} o.photo  master image path or buffer (full-res)
 * @param {string}  o.size         one of POSTER_SIZES (A4…A0)
 * @param {string}  o.title        heading (Lightroom title) — UPPERCASED here
 * @param {string} [o.caption]     sub-heading (Lightroom caption)
 * @param {string}  o.siteLabel    foot line, e.g. "WWW.GUSMCEWAN.COM"
 * @param {string} [o.locale='en'] BCP-47 locale code — selects the font stack
 * @param {number} [o.dpi=300]
 */
export async function renderPosterMaster({ photo, size, title, caption, siteLabel, locale = 'en', dpi = 300 }) {
  const a = A_SERIES[size]
  if (!a) throw new Error(`unknown poster size: ${size}`)

  // FLOOR (not round) so the sheet matches Prodigi's `printAreaSizes` exactly —
  // they truncate mm→px (A0 = 9933×14043, A2 = 4960×7015 at 300 dpi). Pixel-exact
  // to the lab spec; no scale-to-fit on their side.
  const px = (mm) => Math.floor((mm / MM_PER_INCH) * dpi)
  const W = px(a.wMm)
  const H = px(a.hMm)

  // Geometry (all derived from W, like the preview's cqw units).
  const margin = Math.round(MARGIN * W)
  const photoW = W - 2 * margin
  const photoH = Math.round(photoW * IMAGE_RATIO)
  const photoX = margin
  const photoY = margin
  const bandTop = photoY + photoH
  const bandH = H - bandTop

  // Photo — cropped to the 4:5 image area at full print resolution. Crop priority:
  // keep the BOTTOM (trim from the top) and centre the sides → position 'bottom'.
  const photoBuf = await sharp(photo, { limitInputPixels: false })
    .rotate() // honour EXIF orientation
    .resize(photoW, photoH, { fit: 'cover', position: 'bottom' })
    .toBuffer()

  // Type band — caption + title centred in the space above the website, which is
  // pinned `FOOT` above the sheet bottom. Sizes/tracking are fractions of W.
  const titleF = TITLE_FONT * W
  const captionF = CAPTION_FONT * W
  const websiteF = WEBSITE_FONT * W
  const foot = FOOT * W
  const capGap = CAPTION_TITLE_GAP * W

  const websiteBaseline = bandH - foot
  const websiteTop = websiteBaseline - websiteF
  const blockH = (caption ? captionF * 1.4 + capGap : 0) + titleF
  const blockTop = Math.max(0, (websiteTop - blockH) / 2)
  const captionBaseline = blockTop + captionF
  const titleBaseline = blockTop + (caption ? captionF * 1.4 + capGap : 0) + titleF * 0.82
  const cx = W / 2

  const serifFamily = fontFamilyForLocale(locale)
  // Arabic is RTL — add direction + bidi attributes on the text element
  const isRtl = locale === 'ar'
  const rtlAttrs = isRtl ? ' direction="rtl" unicode-bidi="embed"' : ''

  const line = (text, y, font, family, weight, color, trackEm) =>
    `<text x="${cx}" y="${Math.round(y)}" text-anchor="middle" ` +
    `font-family="${family}" font-weight="${weight}" font-size="${Math.round(font)}" ` +
    `letter-spacing="${(trackEm * font).toFixed(2)}" fill="${color}" ` +
    `xml:space="preserve"${rtlAttrs}>${esc(text)}</text>`

  // Cormorant at 300 (Light): resvg-js 2.6.x ignores font-weight on a variable
  // font and renders its DEFAULT instance — which for CormorantGaramond-VF is
  // wght 300. So the print is Light; we state 300 explicitly so it stays Light
  // even if a future resvg starts honouring the axis, and the preview matches.
  // For non-Latin locales, the font stack falls back through Noto fonts loaded
  // alongside Cormorant — resvg picks the first family that covers the glyphs.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${bandH}" viewBox="0 0 ${W} ${bandH}">` +
    (caption
      ? line(String(caption).toUpperCase(), captionBaseline, captionF, serifFamily, 300, CAPTION_COLOR, CAPTION_TRACK)
      : '') +
    line(String(title).toUpperCase(), titleBaseline, titleF, serifFamily, 300, TITLE_COLOR, TITLE_TRACK) +
    line(siteLabel, websiteBaseline, websiteF, 'IBM Plex Mono', 300, WEBSITE_COLOR, WEBSITE_TRACK) +
    `</svg>`

  const bandPng = new Resvg(svg, {
    fitTo: { mode: 'width', value: W },
    background: 'rgba(255,255,255,0)', // transparent — sits on the white sheet
    font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: 'Cormorant Garamond' },
  }).render().asPng()

  // Compose onto the white A-series sheet.
  return sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } })
    .composite([
      { input: photoBuf, left: photoX, top: photoY },
      { input: bandPng, left: 0, top: bandTop },
    ])
    .withMetadata({ density: dpi }) // tag the file as 300 dpi for the lab
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toBuffer()
}
