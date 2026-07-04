'use client'

import { useState, useEffect } from 'react'
import { useFineArtPreview } from '@/store/fineart-preview'
import { fineArtMockupUrl } from '@/lib/mockup-url'

export interface FineArtVariant { family: string; size: string; color: string }

/**
 * Fine-art hero: shows the Prodigi room mockup for the currently-selected family
 * + frame colour (published by the picker), with the same drop shadow as the
 * poster/print hero. Falls back to the framed artwork preview while the mockup
 * loads or if it's unavailable.
 *
 * Two behaviours matter for switching variants:
 *  - LOAD-THEN-SWAP: the previous mockup stays on screen until the new one has
 *    fully loaded (a small spinner shows meanwhile) — the hero never blanks and
 *    the customer never watches an image paint in.
 *  - SEQUENTIAL WARM-UP: every other variant's mockup is fetched one at a time
 *    in the background (current family first — those are the likely next
 *    clicks), instead of ~14 parallel hidden <img>s (~6 MB) all competing with
 *    the visible hero. Each is ~450 KB, so the nearby variants are usually
 *    cached before the customer reaches them.
 */
export default function FineArtHero({
  photoId,
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
  mockupVersion,
  variants = [],
}: {
  photoId: string
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
  /** MOCKUP_VERSION — appended to mockup URLs to bust the browser cache. */
  mockupVersion: number
  /** Every fine-art (family, size, colour) this photo offers — used to pre-warm
   *  the browser cache so switching variant shows its mockup instantly. */
  variants?: FineArtVariant[]
}) {
  const sel = useFineArtPreview()
  const family = sel.family ?? defaultFamily
  const size = sel.size ?? defaultSize
  const color = sel.color ?? defaultColor

  const shadow = { boxShadow: '0 28px 64px -18px rgba(0,0,0,0.6)' }
  // Loki-hosted mockup (asset host derived from the preview URL) — off-Worker.
  const target = { id: photoId, slug: photoSlug, previewUrl: previewSrc }
  const mockupSrc =
    family && size && color ? fineArtMockupUrl(target, family, size, color, 'room07', mockupVersion) : null

  // The mockup currently ON SCREEN. Starts as the selection so SSR/first paint
  // shows the default straight away; after that it only advances once the next
  // mockup has finished loading (or clears to the artwork fallback on error).
  const [shown, setShown] = useState<string | null>(mockupSrc)

  useEffect(() => {
    if (!mockupSrc) {
      setShown(null)
      return
    }
    let live = true
    const img = new Image()
    img.onload = () => { if (live) setShown(mockupSrc) }
    // Not pre-rendered / unavailable → show the framed artwork preview instead.
    img.onerror = () => { if (live) setShown(null) }
    img.src = mockupSrc
    return () => { live = false }
  }, [mockupSrc])

  // Background warm-up, once per page: one image at a time, current family
  // first. Runs off the initial selection deliberately — restarting it on every
  // click would re-shuffle the queue for no benefit (loaded URLs resolve
  // instantly from cache anyway).
  useEffect(() => {
    const ordered = [...variants].sort(
      (a, b) => (a.family === family ? 0 : 1) - (b.family === family ? 0 : 1),
    )
    const urls = Array.from(
      new Set(ordered.map((v) => fineArtMockupUrl(target, v.family, v.size, v.color, 'room07', mockupVersion))),
    ).filter((u) => u !== mockupSrc)
    let stop = false
    ;(async () => {
      for (const u of urls) {
        if (stop) return
        await new Promise<void>((done) => {
          const img = new Image()
          img.onload = () => done()
          img.onerror = () => done()
          img.src = u
        })
      }
    })()
    return () => { stop = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const switching = mockupSrc != null && shown != null && shown !== mockupSrc

  // The room mockup (square) replaces the preview. While the selected mockup
  // can't be shown at all, fall back to the framed artwork preview so the hero
  // is never blank.
  if (shown) {
    return (
      <div className="relative shrink-0 mx-auto xl:mx-0 w-full overflow-hidden rounded-[2px]" style={{ maxWidth: previewW, ...shadow }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={shown}
          alt={alt}
          className="block aspect-square w-full object-cover transition-opacity duration-200"
          style={{ opacity: switching ? 0.75 : 1 }}
        />
        {switching && (
          <span className="absolute top-3 right-3">
            <span className="shop-spinner" />
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="relative select-none shrink-0 mx-auto xl:mx-0 border-white border-[21px]" style={{ maxWidth: previewW, width: '100%', ...shadow }}>
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
