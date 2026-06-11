/**
 * Poster presentation — the product-page hero for the Posters line.
 *
 * A white PORTRAIT gallery sheet modelled on the Tom Hegen reference: the photo
 * fills the width in a fixed-ratio image area (posters are cropped to IMAGE_RATIO,
 * 1.24 portrait), with the typeset band below — CAPTION (small, tracked) → TITLE
 * (large serif) → site URL (mono, at the foot). Pure server component; the type
 * scales with the sheet width via container-query units (cqw).
 *
 * These proportion constants are the single source of truth for the layout — the
 * print compositor (origin, future stage) mirrors them so the printed poster
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
/** Image area aspect — posters are cropped to this portrait ratio (height ÷ width).
 *  1.25 = 4:5 (8×10), the standard poster crop. */
const IMAGE_RATIO = 1.25
const MARGIN_TOP = '1%' // white above the photo (% of sheet width)
const MARGIN_X = '1%' // white left/right (% of sheet width)

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
      style={{
        width: '100%',
        maxWidth,
        containerType: 'inline-size',
        paddingTop: MARGIN_TOP,
        paddingLeft: MARGIN_X,
        paddingRight: MARGIN_X,
        paddingBottom: 0,
      }}
    >
      {/* Artwork — fills the width in a fixed 1.25 portrait area. */}
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

      {/* Typeset band — caption → title, then URL pinned low. */}
      <figcaption
        className={`${posterSerif.className} text-center text-black`}
        style={{ paddingTop: '5.5cqw' }}
      >
        {caption && (
          <p
            style={{
              margin: '0 auto',
              maxWidth: '86%',
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
            margin: caption ? '2.4cqw 0 0' : 0,
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
          margin: '9cqw 0 0',
          paddingBottom: '5cqw',
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
