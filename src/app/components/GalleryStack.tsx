'use client'

import { useEffect, useRef, useState } from 'react'

interface Img { src: string; alt: string; w: number; h: number }

export type GalleryItem =
  | ({ type: 'single' } & Img)
  | { type: 'pair';   images: Img[] }
  | { type: 'triple'; images: Img[] }

interface Props { items: GalleryItem[] }

/* For a row of N cells (each = 1/N of viewport width), the row's aspect-ratio
   is N × geometric-mean of the cell aspect ratios. This makes both/all photos
   in the row crop by roughly the same minimal amount under object-cover. */
function rowAspect(images: Img[]): number {
  const ratios = images.map(i => i.w / i.h)
  const geo = Math.pow(ratios.reduce((a, b) => a * b, 1), 1 / ratios.length)
  return ratios.length * geo
}

/* ─── Parallax image ─────────────────────────────────────────────────────── */
function ParallaxImg({
  src, alt, sizes,
  priority = false,
  strength = 0.06,
}: {
  src: string
  alt: string
  sizes: string
  priority?: boolean
  strength?: number
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const imgRef  = useRef<HTMLImageElement>(null)
  const rafRef  = useRef<number | null>(null)
  const [visible, setVisible] = useState(priority)

  /* reveal on scroll */
  useEffect(() => {
    if (priority) return
    const el = wrapRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.top < window.innerHeight) { setVisible(true); return }
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold: 0.04, rootMargin: '0px 0px -30px 0px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [priority])

  /* parallax — translateY centred at 0 when element is centred in viewport.
     Image is overscaled enough (1.10 = 5 % each side) to cover the maximum
     shift (0.5 × strength × height). With strength 0.07 that's 3.5 % each
     direction — well inside the 5 % buffer, so no edge ever shows the bg. */
  useEffect(() => {
    const wrap = wrapRef.current
    const img  = imgRef.current
    if (!wrap || !img) return

    const tick = () => {
      const rect = wrap.getBoundingClientRect()
      const vh   = window.innerHeight
      const progress = 1 - rect.bottom / (vh + rect.height)
      const offset = (progress - 0.5) * strength * rect.height
      img.style.transform = `translateY(${offset.toFixed(1)}px)`
    }

    const onScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    tick()
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [strength])

  return (
    <div
      ref={wrapRef}
      className="w-full h-full overflow-hidden bg-[#0a0a0a] select-none"
      onContextMenu={e => e.preventDefault()}
      style={{
        opacity:    visible ? 1 : 0,
        transform:  visible ? 'none' : 'translateY(28px)',
        transition: priority ? 'none' : 'opacity 0.75s ease, transform 0.75s ease',
      }}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        sizes={sizes}
        draggable={false}
        onContextMenu={e => e.preventDefault()}
        onDragStart={e => e.preventDefault()}
        className="w-full h-full object-cover object-center block select-none pointer-events-none"
        style={{
          scale:           '1.10',
          WebkitUserSelect: 'none',
          userSelect:       'none',
          willChange:       'transform',
        }}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
      />
    </div>
  )
}

/* ─── Gallery stack ──────────────────────────────────────────────────────── */
export default function GalleryStack({ items }: Props) {
  return (
    <div className="flex flex-col gap-[3px] px-[3px]">
      {items.map((item, i) => {

        if (item.type === 'single') {
          return (
            <div key={i} style={{ height: '100vh' }}>
              <ParallaxImg
                src={item.src} alt={item.alt}
                sizes="100vw"
                priority={i === 0}
                strength={0.08}
              />
            </div>
          )
        }

        if (item.type === 'pair' || item.type === 'triple') {
          const sizesAttr = `${Math.round(100 / item.images.length)}vw`
          return (
            <div
              key={i}
              className="flex gap-[3px]"
              style={{ aspectRatio: `${rowAspect(item.images).toFixed(4)} / 1` }}
            >
              {item.images.map((img, j) => (
                <div key={j} className="flex-1 min-w-0">
                  <ParallaxImg
                    src={img.src} alt={img.alt}
                    sizes={sizesAttr}
                    strength={0.06}
                  />
                </div>
              ))}
            </div>
          )
        }

        return null
      })}
    </div>
  )
}
