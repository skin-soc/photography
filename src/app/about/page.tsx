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
      <div className="flex flex-col md:flex-row md:items-start px-10 md:px-16 pt-24 pb-32 gap-12 md:gap-0">

        {/* Left: bio text */}
        <div className="md:w-[52%] md:pr-16">
          <p className="font-serif text-[1.6rem] md:text-[2rem] leading-[1.4] tracking-wide text-white font-light mb-6">
            Gus McEwan is a photographer based between Copenhagen and London.
          </p>
          <p className="font-serif text-[1.6rem] md:text-[2rem] leading-[1.4] tracking-wide text-white font-light">
            His work spans portraiture, landscape, and the natural world — drawn to light, stillness, and the space between moments.
          </p>
        </div>

        {/* Right: contact */}
        <div className="md:w-[48%] md:pl-16 md:border-l md:border-white/10">
          <p className="text-[9px] font-light tracking-[0.22em] uppercase text-white mb-2">Contact</p>
          <a href="mailto:hello&#64;gusmcewan.com" className="text-[13px] font-light tracking-[0.04em] text-white/55 hover:text-white transition-colors block mb-8">hello&#64;gusmcewan.com</a>
          <p className="text-[9px] font-light tracking-[0.22em] uppercase text-white mb-2">Commissions</p>
          <p className="text-[13px] font-light tracking-[0.04em] text-white/55 leading-[1.9]">
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
        {[18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => {
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