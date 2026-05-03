'use client'

import { useEffect, useRef, useState } from 'react'

const B = '/images'
const GEAR_COUNT = 14

const gearImages = Array.from({ length: GEAR_COUNT }, (_, i) => {
  const n = GEAR_COUNT - i
  const padded = String(n).padStart(5, '0')
  return { src: `${B}/gear.${padded}.jpg`, alt: `Gear ${padded}` }
})

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
        className="w-full h-full object-cover block select-none pointer-events-none"
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

      {/* Hero image */}
      <div className="w-full aspect-[16/7] overflow-hidden bg-[#0a0a0a]">
        <img
          src={`${B}/gus-travels.jpg`}
          alt="Gus McEwan on location"
          className="w-full h-full object-cover block select-none pointer-events-none"
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
          loading="eager"
          decoding="sync"
          style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
        />
      </div>

      {/* Bio section */}
      <div className="px-[3px] py-[3px]">
        <div className="flex flex-col md:flex-row gap-[3px]">

          {/* Portrait */}
          <div className="w-full md:w-[340px] md:flex-shrink-0 aspect-square overflow-hidden bg-[#0a0a0a]">
            <img
              src={`${B}/gus-mcewan.webp`}
              alt="Gus McEwan"
              className="w-full h-full object-cover block select-none pointer-events-none"
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
              loading="eager"
              decoding="sync"
              style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
            />
          </div>

          {/* Text */}
          <div className="flex-1 flex flex-col justify-end bg-[#0a0a0a] px-8 py-10 md:px-12 md:py-12">
            <h1 className="font-serif font-light text-[2.25rem] tracking-wide mb-8">
              Gus McEwan
            </h1>
            <p className="text-[13px] font-light leading-[1.9] text-white/55 tracking-wide mb-5">
              Photographer based between Copenhagen and London. Working across portraiture,
              landscape, and the natural world — drawn to light, stillness, and the space
              between moments.
            </p>
            <p className="text-[13px] font-light leading-[1.9] text-white/55 tracking-wide mb-10">
              Available for commissioned work. Selected clients and editorial enquiries welcome.
            </p>
            
            <a
              href="mailto:hello@gusmcewan.com
              className="text-[9px] font-light tracking-[0.22em] uppercase text-white border-b border-[#931020] pb-px hover:text-white/70 transition-colors w-fit"
            >
              hello@gusmcewan.com
            </a>
          </div>

        </div>
      </div>

      {/* Gear gallery */}
      <div className="flex flex-col gap-[3px] px-[3px] pb-[3px]">
        {gearImages.map((img, i) => (
          <RevealImg
            key={i}
            src={img.src}
            alt={img.alt}
            className="w-full overflow-hidden bg-[#0a0a0a] min-h-[40vw] max-h-screen"
          />
        ))}
      </div>

    </main>
  )
}