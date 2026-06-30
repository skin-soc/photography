'use client'

import { useTranslations } from 'next-intl'
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
  const t = useTranslations('shop')
  const bw = usePosterPreview((s) => s.bw)
  const setBw = usePosterPreview((s) => s.setBw)

  return (
    <div className="shrink-0 mx-auto xl:mx-0 w-full" style={{ maxWidth }}>
      {/* Poster mat — greyscale filter when monochrome mode is active */}
      <div className="relative">
        {salePill}
        <div style={{ filter: bw ? 'grayscale(1) brightness(1.15) contrast(1.35)' : 'none', transition: 'filter 0.35s ease' }}>
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

      {/* Colour mode toggle */}
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={() => setBw(true)}
          className={`rounded-[20px] px-4 py-2 text-[10px] font-mono-ibm uppercase tracking-[0.18em] border transition-colors ${
            bw
              ? 'border-[#931020] bg-[#931020] text-white'
              : 'border-foreground/20 text-foreground/45 hover:border-[#931020]/50 hover:text-foreground/80'
          }`}
        >
          {t('monochrome')}
        </button>
        <button
          onClick={() => setBw(false)}
          className={`rounded-[20px] px-4 py-2 text-[10px] font-mono-ibm uppercase tracking-[0.18em] border transition-colors ${
            !bw
              ? 'border-[#931020] bg-[#931020] text-white'
              : 'border-foreground/20 text-foreground/45 hover:border-[#931020]/50 hover:text-foreground/80'
          }`}
        >
          {t('colour')}
        </button>
      </div>
    </div>
  )
}
