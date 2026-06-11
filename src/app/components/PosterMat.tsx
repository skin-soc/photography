/**
 * Poster presentation — the product-page hero for the Posters line.
 *
 * A white PORTRAIT gallery sheet modelled on the Tom Hegen reference: the photo
 * fills the width in a fixed-ratio image area (posters are cropped to IMAGE_RATIO,
 * 1.25 / 4:5 portrait), with the typeset band below — CAPTION (small, tracked) →
 * TITLE (large serif) → site URL (mono, at the foot).
 *
 * EVERY measurement is in `cqw` (1% of the poster's OWN width, via the figure's
 * container context) so the whole sheet is one fixed-proportion unit: margins,
 * type and spacing scale together and never drift as the browser resizes. (We do
 * NOT use % padding — percentage padding resolves against the PARENT's width, not
 * the poster's, which made the margins float while the cqw type stayed put.)
 *
 * These constants are the single source of truth for the layout — the print
 * compositor (origin, future stage) mirrors them so the printed poster matches
 * this preview exactly. Text comes from the catalogue: title = Lightroom title,
 * caption = Lightroom caption. Posters context only (not Fine Art).
 */

import { Cormorant_Garamond } from 'next/font/google'

const posterSerif = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
})

// ── Layout proportions (tune here; the print compositor mirrors these) ──────────
/** Image area aspect — posters are cropped to this portrait ratio (height ÷ width).
 *  1.25 = 4:5 (8×10), the standard poster crop. */
const IMAGE_RATIO = 1.25
const MARGIN_TOP = '4.5cqw' // white above the photo (cqw = % of the poster's width)
const MARGIN_X = '4.5cqw' // white left/right
const BAND_GAP = '5.5cqw' // gap from photo to caption
const CAPTION_TITLE_GAP = '2.4cqw' // gap from caption to title
const TITLE_URL_GAP = '9cqw' // gap from title to URL (URL sits low)
const FOOT = '5cqw' // white below the URL

export default function PosterMat({
  src,
  srcSet,
  sizes,
  alt,
  title,
  caption,
  siteLabel,
  maxWidth,
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
}) {
  return (
    <figure
      className="shrink-0 mx-auto xl:mx-0 select-none bg-white shadow-[0_28px_64px_-26px_rgba(0,0,0,0.6)]"
      style={{ width: '100%', maxWidth, containerType: 'inline-size' }}
    >
      {/* Artwork — fills the width in a fixed 1.25 portrait area. Margins live on
          this wrapper in cqw (the figure is the cqw container), so they stay
          locked to the poster's width, not the browser's. */}
      <div style={{ paddingTop: MARGIN_TOP, paddingLeft: MARGIN_X, paddingRight: MARGIN_X }}>
        <div style={{ width: '100%', aspectRatio: `1 / ${IMAGE_RATIO}`, overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            srcSet={srcSet}
            sizes={sizes}
            alt={alt}
            draggable={false}
            className="pointer-events-none"
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
          />
        </div>
      </div>

      {/* Typeset band — caption → title. */}
      <figcaption
        className={`${posterSerif.className} text-center text-black`}
        style={{ paddingTop: BAND_GAP, paddingLeft: MARGIN_X, paddingRight: MARGIN_X }}
      >
        {caption && (
          <p
            style={{
              margin: '0 auto',
              maxWidth: '90%',
              fontSize: '1.85cqw',
              fontWeight: 500,
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
            fontSize: '7.2cqw',
            fontWeight: 500,
            lineHeight: 1,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: '#111',
          }}
        >
          {title}
        </h1>
      </figcaption>

      {/* Website line — the site's own IBM Plex Mono, low on the sheet. */}
      <p
        className="font-mono-ibm"
        style={{
          margin: `${TITLE_URL_GAP} 0 0`,
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
