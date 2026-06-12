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

import { readFileSync } from 'node:fs'
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

const FONT_DIR = new URL('./fonts/', import.meta.url)
let _fontBuffers = null
function fontBuffers() {
  if (!_fontBuffers) {
    _fontBuffers = [
      readFileSync(new URL('CormorantGaramond[wght].ttf', FONT_DIR)),
      readFileSync(new URL('IBMPlexMono-Light.ttf', FONT_DIR)),
    ]
  }
  return _fontBuffers
}

/** Escape text for embedding in SVG. */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]))
}

/** The list of A-sizes this module can render. */
export const POSTER_SIZES = Object.keys(A_SERIES)

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
 * @param {number} [o.dpi=300]
 */
export async function renderPosterMaster({ photo, size, title, caption, siteLabel, dpi = 300 }) {
  const a = A_SERIES[size]
  if (!a) throw new Error(`unknown poster size: ${size}`)

  const px = (mm) => Math.round((mm / MM_PER_INCH) * dpi)
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

  // Photo — centre-cropped to the 4:5 image area at full print resolution.
  const photoBuf = await sharp(photo, { limitInputPixels: false })
    .rotate() // honour EXIF orientation
    .resize(photoW, photoH, { fit: 'cover', position: 'centre' })
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

  const line = (text, y, font, family, weight, color, trackEm) =>
    `<text x="${cx}" y="${Math.round(y)}" text-anchor="middle" ` +
    `font-family="${family}" font-weight="${weight}" font-size="${Math.round(font)}" ` +
    `letter-spacing="${(trackEm * font).toFixed(2)}" fill="${color}" ` +
    `xml:space="preserve">${esc(text)}</text>`

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${bandH}" viewBox="0 0 ${W} ${bandH}">` +
    (caption
      ? line(String(caption).toUpperCase(), captionBaseline, captionF, 'Cormorant Garamond', 500, CAPTION_COLOR, CAPTION_TRACK)
      : '') +
    line(String(title).toUpperCase(), titleBaseline, titleF, 'Cormorant Garamond', 500, TITLE_COLOR, TITLE_TRACK) +
    line(siteLabel, websiteBaseline, websiteF, 'IBM Plex Mono', 300, WEBSITE_COLOR, WEBSITE_TRACK) +
    `</svg>`

  const bandPng = new Resvg(svg, {
    fitTo: { mode: 'width', value: W },
    background: 'rgba(255,255,255,0)', // transparent — sits on the white sheet
    font: { fontBuffers: fontBuffers(), loadSystemFonts: false, defaultFontFamily: 'Cormorant Garamond' },
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
