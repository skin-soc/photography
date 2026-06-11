/**
 * Poster presentation — the product-page hero for the Posters line.
 *
 * Renders the photo on a white gallery mat with typeset text below, mirroring a
 * fine-print poster: CAPTION (small, tracked, above) → TITLE (large) → our site
 * URL (tiny, at the foot). Pure server component. Typography is sized in
 * container-query units (cqw) so it scales with the mat width on any screen.
 *
 * Text comes from the catalogue: title = the photo's Lightroom title, caption =
 * its Lightroom caption. The mat is shown only in the Posters context (not Fine
 * Art); see the product page.
 */

import { Cormorant_Garamond } from 'next/font/google'

const posterSerif = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
})

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
      className="shrink-0 mx-auto xl:mx-0 select-none bg-white shadow-[0_30px_60px_-25px_rgba(0,0,0,0.65)]"
      style={{ maxWidth, width: '100%', containerType: 'inline-size' }}
    >
      {/* Artwork — white margin on three sides, text fills the deep foot. */}
      <div style={{ padding: '6cqw 6cqw 0' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          srcSet={srcSet}
          sizes={sizes}
          alt={alt}
          draggable={false}
          className="block w-full h-auto pointer-events-none"
        />
      </div>

      <figcaption
        className={`${posterSerif.className} text-center text-black`}
        style={{ padding: '7.5cqw 6cqw 0' }}
      >
        {caption && (
          <p
            style={{
              margin: '0 auto',
              maxWidth: '80%',
              fontSize: '1.7cqw',
              fontWeight: 500,
              letterSpacing: '0.28em',
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
            fontSize: '7.5cqw',
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

      {/* Website line — the site's own IBM Plex Mono (its brand face), not the
          poster serif: a clean technical foot line that matches the sample. */}
      <p
        className="font-mono-ibm"
        style={{
          margin: 0,
          padding: '7cqw 0 4.5cqw',
          textAlign: 'center',
          fontSize: '1.15cqw',
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
