'use client'

import { usePosterPreview } from '@/store/poster-preview'
import PosterMat from '@/app/components/PosterMat'

interface Props {
  src: string
  srcSet: string
  sizes: string
  alt: string
  title: string
  caption?: string
  siteLabel: string
  maxWidth: number
  salePill?: React.ReactNode
}

export default function PosterBwHero({ src, srcSet, sizes, alt, title, caption, siteLabel, maxWidth, salePill }: Props) {
  const bw = usePosterPreview((s) => s.bw)

  return (
    <div className="shrink-0 mx-auto xl:mx-0 w-full" style={{ maxWidth }}>
      {/* Poster mat — greyscale filter when monochrome mode is active */}
      <div className="relative">
        {salePill}
        <div style={{ filter: bw ? 'grayscale(1) brightness(1.05) contrast(1.05)' : 'none', transition: 'filter 0.35s ease' }}>
          <PosterMat
            src={src}
            srcSet={srcSet}
            sizes={sizes}
            alt={alt}
            title={title}
            caption={caption}
            siteLabel={siteLabel}
            maxWidth={maxWidth}
          />
        </div>
      </div>

    </div>
  )
}
