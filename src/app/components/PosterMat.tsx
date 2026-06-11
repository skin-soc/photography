/**
 * Poster presentation — the product-page hero for the Posters line.
 *
 * Renders the photo on a white PORTRAIT gallery sheet (always portrait, per the
 * Tom Hegen reference), with typeset text in the lower band: CAPTION (small,
 * tracked) → TITLE (large) → our site URL (tiny, at the foot). The photo is
 * contained within the upper image area, so any orientation sits cleanly on the
 * portrait sheet. Pure server component; typography scales with the sheet width
 * via container-query units (cqw).
 *
 * The proportion constants below are the single source of truth for the layout —
 * the print compositor (origin, future stage) mirrors them so the printed poster
 * matches this preview exactly. Text comes from the catalogue: title = Lightroom
 * title, caption = Lightroom caption. Posters context only (not Fine Art).
 */

import { Cormorant_Garamond } from 'next/font/google'

const posterSerif = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
})

// ── Layout proportions (tune here; the print compositor mirrors these) ──────────
// Sheet aspect, width : height. Portrait.
const SHEET_W = 100
const SHEET_H = 130
// Margins / bands, as % of the sheet box (top/bottom relative to height, sides to width).
const MARGIN_X = 6 // side margin (% width)
const MARGIN_TOP = 4 // top margin (% height)
const IMAGE_BOTTOM = 31 // image area stops this % up from the sheet bottom
const BAND_TOP = 70.5 // text band begins this % down from the top
const FOOT_BOTTOM = 3.5 // URL baseline sits this % up from the sheet bottom

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
      className="shrink-0 mx-auto xl:mx-0 select-none bg-white shadow-[0_30px_70px_-25px_rgba(0,0,0,0.7)]"
      style={{
        position: 'relative',
        width: '100%',
        maxWidth,
        aspectRatio: `${SHEET_W} / ${SHEET_H}`,
        containerType: 'inline-size',
      }}
    >
      {/* Artwork — contained in the upper image area (any orientation fits). */}
      <div
        style={{
          position: 'absolute',
          top: `${MARGIN_TOP}%`,
          left: `${MARGIN_X}%`,
          right: `${MARGIN_X}%`,
          bottom: `${IMAGE_BOTTOM}%`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          srcSet={srcSet}
          sizes={sizes}
          alt={alt}
          draggable={false}
          className="pointer-events-none"
          style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center' }}
        />
      </div>

      {/* Text band — caption then title, flowing down from BAND_TOP. */}
      <figcaption
        className={`${posterSerif.className} text-black`}
        style={{
          position: 'absolute',
          left: `${MARGIN_X}%`,
          right: `${MARGIN_X}%`,
          top: `${BAND_TOP}%`,
          bottom: `${FOOT_BOTTOM + 6}%`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        {caption && (
          <p
            style={{
              margin: 0,
              maxWidth: '88%',
              fontSize: '2cqw',
              fontWeight: 500,
              letterSpacing: '0.26em',
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
            margin: caption ? '2.6cqw 0 0' : 0,
            fontSize: '8cqw',
            fontWeight: 500,
            lineHeight: 1,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: '#111',
          }}
        >
          {title}
        </h1>
      </figcaption>

      {/* Website line — the site's own IBM Plex Mono, pinned to the foot. */}
      <p
        className="font-mono-ibm"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: `${FOOT_BOTTOM}%`,
          margin: 0,
          textAlign: 'center',
          fontSize: '1.45cqw',
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
