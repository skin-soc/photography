/**
 * Poster presentation — the product-page hero for the Posters line.
 *
 * A white PORTRAIT gallery sheet at the TRUE A-series ratio (1:√2 ≈ 1.414), so
 * the on-screen poster matches the printed A4–A0 sheet edge-to-edge — preview =
 * print. The photo fills the width (minus margins) in a fixed 4:5 area at the
 * top; the typeset band fills what's left — CAPTION (small, tracked) → TITLE
 * (serif) centred in the remaining space, with the site URL (mono) pinned low.
 *
 * EVERY measurement is in `cqw` (1% of the poster's OWN width, via the figure's
 * container context) so the whole sheet is one fixed-proportion unit: margins,
 * type and spacing scale together and never drift as the browser resizes.
 *
 * These constants are the single source of truth for the layout — the origin
 * print compositor (lan-origin) mirrors them so the printed poster matches this
 * preview exactly. Text comes from the catalogue: title = Lightroom title,
 * caption = Lightroom caption. Posters context only (not Fine Art).
 */

import { Cormorant_Garamond } from 'next/font/google'

// Weight 300 (Light) to match the printed master: resvg-js renders the variable
// font's DEFAULT instance (wght 300) and ignores font-weight, so the print uses
// Light — the preview must too, or the on-screen heading looks heavier than print.
const posterSerif = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300'],
  display: 'swap',
})

// ── Layout proportions (tune here; the print compositor mirrors these) ──────────
/** Sheet aspect — A-series is 1:√2 (height ÷ width). Every A-size shares it. */
const SHEET_RATIO = 1.41421
/** Image area aspect — posters are cropped to this portrait ratio (height ÷ width).
 *  1.25 = 4:5 (8×10), the standard poster crop. */
const IMAGE_RATIO = 1.25
const MARGIN_TOP = '4.5cqw' // white above the photo (cqw = % of the poster's width)
const MARGIN_X = '4.5cqw' // white left/right — photo stays full-width (the "big photo")
const CAPTION_TITLE_GAP = '2cqw' // gap from caption to title
const FOOT = '4.5cqw' // white below the URL (URL pinned low)

export default function PosterMat({
  src,
  srcSet,
  sizes,
  alt,
  title,
  caption,
  siteLabel,
  maxWidth,
  eager = true,
  grayscaleHover = false,
}: {
  src: string
  srcSet?: string
  sizes?: string
  alt: string
  /** Heading — the photo's Lightroom title. */
  title: string
  /** Sub-heading above the title — the photo's Lightroom caption. */
  caption?: string
  /** Foot line, e.g. "WWW.GUSMCEWAN.COM". */
  siteLabel: string
  maxWidth: number
  /** Eager-load the image (hero); pass false for below-the-fold grid cards. */
  eager?: boolean
  /** Grid use: render the photo B&W, returning to colour on hover. The parent
   *  must be a `group`. `hoverOnlyWhenSupported` keeps it B&W on touch (no hover). */
  grayscaleHover?: boolean
}) {
  return (
    <figure
      className="shrink-0 mx-auto xl:mx-0 select-none overflow-hidden bg-white shadow-[0_20px_32px_-18px_rgba(0,0,0,0.85)] flex flex-col"
      style={{ width: '100%', maxWidth, aspectRatio: `1 / ${SHEET_RATIO}`, containerType: 'inline-size' }}
    >
      {/* Artwork — full-width 4:5 area at the top. Margins in cqw stay locked to
          the poster's width, not the browser's. */}
      <div style={{ paddingTop: MARGIN_TOP, paddingLeft: MARGIN_X, paddingRight: MARGIN_X }}>
        <div style={{ width: '100%', aspectRatio: `1 / ${IMAGE_RATIO}`, overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            srcSet={srcSet}
            sizes={sizes}
            alt={alt}
            draggable={false}
            loading={eager ? 'eager' : 'lazy'}
            className={`pointer-events-none transition-[filter] duration-700 ease-out ${
              grayscaleHover ? '[filter:grayscale(1)_brightness(1.15)_contrast(1.35)] group-hover:[filter:none]' : ''
            }`}
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
          />
        </div>
      </div>

      {/* Typeset band — caption → title, vertically centred in the space left
          between the photo and the foot line. */}
      <figcaption
        className={`${posterSerif.className} flex flex-1 flex-col items-center justify-center text-center text-black`}
        style={{ paddingLeft: MARGIN_X, paddingRight: MARGIN_X }}
      >
        {caption && (
          <p
            style={{
              margin: 0,
              maxWidth: '90%',
              fontSize: '1.85cqw',
              fontWeight: 300,
              letterSpacing: '0.32em',
              textTransform: 'uppercase',
              color: '#3a3a3a',
              lineHeight: 1.5,
            }}
          >
            {caption}
          </p>
        )}
        <h1
          style={{
            margin: caption ? `${CAPTION_TITLE_GAP} 0 0` : 0,
            fontSize: '6cqw',
            fontWeight: 300,
            lineHeight: 1,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: '#111',
          }}
        >
          {title}
        </h1>
      </figcaption>

      {/* Website line — the site's own IBM Plex Mono, pinned low on the sheet. */}
      <p
        className="font-mono-ibm"
        style={{
          margin: 0,
          paddingBottom: FOOT,
          textAlign: 'center',
          fontSize: '1.35cqw',
          fontWeight: 300,
          letterSpacing: '0.3em',
          textTransform: 'uppercase',
          color: '#6a6a6a',
        }}
      >
        {siteLabel}
      </p>
    </figure>
  )
}
