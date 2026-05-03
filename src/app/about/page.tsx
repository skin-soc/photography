'use client'

import { useEffect, useRef, useState } from 'react'

const B = '/images'

function RevealImg({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.top < window.innerHeight) {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } },
      { threshold: 0.04, rootMargin: '0px 0px -40px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(32px)',
        transition: 'opacity 0.7s ease, transform 0.7s ease',
      }}
    >
      <img
        src={src}
        alt={alt}
        className="w-full h-auto block select-none pointer-events-none"
        draggable={false}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        loading="lazy"
        decoding="async"
        style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
      />
    </div>
  )
}

export default function About() {
  return (
    <main className="pt-[72px]">

      {/* Bio */}
      <div className="px-12 py-20 md:px-20 md:py-28 flex flex-col md:flex-row md:items-start gap-16 md:gap-24">
        <div className="flex-1">
          <p className="font-serif font-light text-[2rem] md:text-[2.6rem] leading-[1.3] tracking-wide text-white">
            Gus McEwan is a photographer based between Copenhagen and London.
          </p>
          <p className="font-serif font-light text-[2rem] md:text-[2.6rem] leading-[1.3] tracking-wide text-white mt-6">
            His work spans portraiture, landscape, and the natural world — drawn to light, stillness, and the space between moments.
          </p>
        </div>
        <div className="md:w-[280px] md:flex-shrink-0 pt-1">
          <p className="text-[10px] font-light tracking-[0.2em] uppercase text-white mb-3">Contact</p>
          <a href="mailto:hello&#64;gusmcewan.com" className="text-[13px] font-light text-white/70 hover:text-white transition-colors block mb-8">hello&#64;gusmcewan.com</a>
          <p className="text-[10px] font-light tracking-[0.2em] uppercase text-white mb-3">Commissions</p>
          <p className="text-[13px] font-light text-white/70 leading-[1.8]">
            Available for editorial,<br />
            portrait and landscape work.
          </p>
        </div>
      </div>

      {/* Hero image */}
      <div className="w-full overflow-hidden bg-[#0a0a0a]">
        <img
          src={`${B}/gus-travels.jpg`}
          alt="Gus McEwan on location"
          className="w-full h-auto block select-none pointer-events-none"
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
          loading="eager"
          decoding="sync"
          style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
        />
      </div>

      {/* Gear gallery — 3 CSS columns, masonry */}
      <div className="columns-3 gap-[3px] px-[3px] pb-[3px] mt-[3px]">
        {[18,17,16,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1].map((n) => {
          const p = String(n).padStart(5, '0')
          return (
            <RevealImg
              key={n}
              src={`${B}/gear.${p}.jpg`}
              alt={`Gear ${p}`}
              className="w-full mb-[3px] break-inside-avoid overflow-hidden bg-[#0a0a0a]"
            />
          )
        })}
      </div>

    </main>
  )
}