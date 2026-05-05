'use client'

import { useEffect, useRef, useState } from 'react'

const B = '/images'

/* ─── Parallax image (hero or masonry item) ──────────────────────────────── */
function ParallaxImg({
  src,
  alt,
  className,
  strength = 0.15,
  reveal = false,
}: {
  src: string
  alt: string
  className?: string
  strength?: number
  reveal?: boolean
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [visible, setVisible] = useState(!reveal)
  const rafRef = useRef<number | null>(null)

  // Scroll-based parallax
  useEffect(() => {
    const wrap = wrapRef.current
    const img = imgRef.current
    if (!wrap || !img) return

    const onScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        const rect = wrap.getBoundingClientRect()
        const vh = window.innerHeight
        // progress: 0 when bottom of element hits bottom of viewport, 1 when top hits top
        const progress = 1 - (rect.bottom / (vh + rect.height))
        const offset = progress * strength * rect.height
        img.style.transform = `translateY(${offset.toFixed(2)}px)`
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll() // init
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [strength])

  // Reveal on scroll (for masonry items)
  useEffect(() => {
    if (!reveal) return
    const el = wrapRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.top < window.innerHeight) { setVisible(true); return }
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } },
      { threshold: 0.04, rootMargin: '0px 0px -40px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [reveal])

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{
        overflow: 'hidden',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(32px)',
        transition: reveal ? 'opacity 0.7s ease, transform 0.7s ease' : undefined,
      }}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        /* scale up slightly so parallax offset never shows a gap */
        className="w-full h-auto block select-none pointer-events-none"
        style={{
          scale: '1.12',
          WebkitUserSelect: 'none',
          userSelect: 'none',
          willChange: 'transform',
        }}
        draggable={false}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        loading="lazy"
        decoding="async"
      />
    </div>
  )
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function About() {
  return (
    <main className="pt-[72px]">

      {/* ── Bio ─────────────────────────────────────────────────────────── */}
      {/*
        Layout: on mobile stacked, on desktop side-by-side.
        px-6 md:px-10 keeps text close to the left edge on desktop.
        The serif text uses clamp() so it scales smoothly:
          min ~22px (small phones), preferred ~2.4vw, max ~30px (large screens).
        On a 768px iPad that gives ~18px — readable, not overwhelming.
      */}
      <div className="flex flex-col md:flex-row md:items-start px-6 md:px-10 pt-20 pb-28 gap-10 md:gap-0">

        {/* Left: bio text */}
        <div className="md:w-[55%] md:pr-12">
          <p
            className="font-serif leading-[1.45] tracking-wide text-white font-light mb-5"
            style={{ fontSize: 'clamp(1.25rem, 2.2vw, 1.75rem)', textAlign: 'right' }}
          >
            Gus McEwan is a photographer based between Copenhagen and London.
          </p>
          <p
            className="font-serif leading-[1.45] tracking-wide text-white font-light"
            style={{ fontSize: 'clamp(1.25rem, 2.2vw, 1.75rem)', textAlign: 'right' }}
          >
            His work spans people, places, and the natural worlds.<br /> 
            Drawn to light, stillness, and the space between moments.
          </p>
        </div>

        {/* Right: contact */}
        <div className="md:w-[45%] md:pl-12 md:border-l md:border-white/10">
          <p className="text-[9px] font-light tracking-[0.22em] uppercase text-white mb-2">Contact</p>
          <a
            href="mailto:hello&#64;gusmcewan.com"
            className="text-[13px] font-light tracking-[0.04em] text-white/55 hover:text-white transition-colors block mb-8"
          >
            hello [at] gusmcewan.com
          </a>
          <p className="text-[9px] font-light tracking-[0.22em] uppercase text-white mb-2">Commissions</p>
          <a
            href="mailto:work&#64;gusmcewan.com"
            className="text-[13px] font-light tracking-[0.04em] text-white/55 hover:text-white transition-colors block mb-8"
          >
            work [at] gusmcewan.com
          </a>
        </div>

      </div>

      {/* ── Hero image with parallax ─────────────────────────────────────── */}
      <div className="w-full bg-[#0a0a0a]">
        <ParallaxImg
          src={`${B}/gus-travels.jpg`}
          alt="Gus McEwan on location"
          strength={0.18}
        />
      </div>

      {/* ── Gear gallery — 3 CSS columns, masonry, each with parallax ────── */}
      <div className="columns-3 gap-[3px] px-[3px] pb-[3px] mt-[3px]">
        {[18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => {
          const p = String(n).padStart(5, '0')
          return (
            <ParallaxImg
              key={n}
              src={`${B}/gear.${p}.jpg`}
              alt={`Gear ${p}`}
              className="w-full mb-[3px] break-inside-avoid bg-[#0a0a0a]"
              strength={0.1}
              reveal
            />
          )
        })}
      </div>

    </main>
  )
}