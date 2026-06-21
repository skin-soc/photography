'use client'

import { useState, useEffect } from 'react'
import { useFineArtPreview } from '@/store/fineart-preview'

/** Frame colours that have a real mockup cover (canvas always previews in black). */
function mockupColor(family: string, color: string): string {
  return family === 'canvas' ? 'black' : color
}

/**
 * Fine-art hero: shows the Prodigi room mockup for the currently-selected family
 * + frame colour (published by the picker), with the same drop shadow as the
 * poster/print hero. Falls back to the framed artwork preview while the mockup
 * loads or if it's unavailable.
 */
export default function FineArtHero({
  photoSlug,
  previewSrc,
  previewSrcSet,
  sizes,
  alt,
  previewW,
  previewH,
  defaultFamily,
  defaultSize,
  defaultColor,
}: {
  photoSlug: string
  previewSrc: string
  previewSrcSet: string
  sizes: string
  alt: string
  previewW: number
  previewH: number
  defaultFamily: string
  defaultSize: string
  defaultColor: string
}) {
  const sel = useFineArtPreview()
  const family = sel.family ?? defaultFamily
  const size = sel.size ?? defaultSize
  const color = sel.color ?? defaultColor
  const [failed, setFailed] = useState(false)

  const shadow = 'shadow-[0_28px_64px_-26px_rgba(0,0,0,0.6)]'
  const mockupSrc =
    family && size && color
      ? `/api/fineart-mockup?photo=${encodeURIComponent(photoSlug)}&family=${encodeURIComponent(family)}&size=${encodeURIComponent(size)}&color=${encodeURIComponent(mockupColor(family, color))}`
      : null
  // Re-arm the fallback whenever the target mockup changes (size/family/colour).
  useEffect(() => { setFailed(false) }, [mockupSrc])

  // The room mockup (square) replaces the preview. Keyed by src so a colour/family
  // change re-arms the error fallback. While it can't be shown, fall back to the
  // framed artwork preview so the hero is never blank.
  if (mockupSrc && !failed) {
    return (
      <div className={`relative shrink-0 mx-auto xl:mx-0 w-full overflow-hidden rounded-[2px] ${shadow}`} style={{ maxWidth: previewW }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={mockupSrc}
          src={mockupSrc}
          alt={alt}
          className="block aspect-square w-full object-cover"
          onError={() => setFailed(true)}
        />
      </div>
    )
  }

  return (
    <div className={`relative select-none shrink-0 mx-auto xl:mx-0 border-white border-[21px] ${shadow}`} style={{ maxWidth: previewW, width: '100%' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={previewSrc}
        srcSet={previewSrcSet}
        sizes={sizes}
        alt={alt}
        width={previewW}
        height={previewH}
        draggable={false}
        className="block w-full h-auto pointer-events-none ring-1 ring-gray-400/40"
      />
    </div>
  )
}
