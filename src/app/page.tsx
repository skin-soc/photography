'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// All Places images — starts on Calderon Hondo (PL00003), then rotates randomly
const PLACES = [
  { webp: '/images/gallery/PL00003.webp', jpg: '/images/gallery/PL00003.jpg', alt: 'Calderon Hondo, Fuerteventura' },
  { webp: '/images/gallery/PL00001.webp', jpg: '/images/gallery/PL00001.jpg', alt: 'Københavns Domhus, Copenhagen' },
  { webp: '/images/gallery/PL00002.webp', jpg: '/images/gallery/PL00002.jpg', alt: 'Marmorkirken, Copenhagen' },
  { webp: '/images/gallery/PL00004.webp', jpg: '/images/gallery/PL00004.jpg', alt: 'Amagerstrand, Copenhagen' },
  { webp: '/images/gallery/PL00005.webp', jpg: '/images/gallery/PL00005.jpg', alt: 'Places — Gus McEwan' },
  { webp: '/images/gallery/PL00006.webp', jpg: '/images/gallery/PL00006.jpg', alt: 'The Kelpies, Scotland' },
  { webp: '/images/gallery/PL00007.webp', jpg: '/images/gallery/PL00007.jpg', alt: 'ARC, Copenhagen' },
  { webp: '/images/gallery/PL00008.webp', jpg: '/images/gallery/PL00008.jpg', alt: 'Gemini Residence, Copenhagen' },
  { webp: '/images/gallery/PL00009.webp', jpg: '/images/gallery/PL00009.jpg', alt: 'Places — Gus McEwan' },
  { webp: '/images/gallery/PL00010.webp', jpg: '/images/gallery/PL00010.jpg', alt: 'Places — Gus McEwan' },
  { webp: '/images/gallery/PL00011.webp', jpg: '/images/gallery/PL00011.jpg', alt: 'The Hand, Brisbane' },
  { webp: '/images/gallery/PL00012.webp', jpg: '/images/gallery/PL00012.jpg', alt: 'Places — Gus McEwan' },
  { webp: '/images/gallery/PL00013.webp', jpg: '/images/gallery/PL00013.jpg', alt: 'Operaen, Copenhagen' },
  { webp: '/images/gallery/PL00014.webp', jpg: '/images/gallery/PL00014.jpg', alt: 'Places — Gus McEwan' },
]

function nextRandom(current: number, total: number): number {
  let next = current
  while (next === current) next = Math.floor(Math.random() * total)
  return next
}

export default function Home() {
  const [current, setCurrent] = useState(0)   // active image index
  const [fading, setFading]   = useState(false) // triggers opacity transition

  useEffect(() => {
    const interval = setInterval(() => {
      setFading(true)
      setTimeout(() => {
        setCurrent(prev => nextRandom(prev, PLACES.length))
        setFading(false)
      }, 600) // half a second fade out, then swap, then fade back in
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const img = PLACES[current]

  return (
    <main className="fixed inset-0">
      {/* Full-screen image */}
      <div
        className="absolute inset-0 transition-opacity duration-700 ease-in-out select-none"
        style={{ opacity: fading ? 0 : 1 }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <picture className="block w-full h-full">
          <source srcSet={img.webp} type="image/webp" />
          <img
            src={img.jpg}
            alt={img.alt}
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
            onDragStart={(e) => e.preventDefault()}
            className="w-full h-full object-cover select-none pointer-events-none"
            style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
          />
        </picture>
        {/* subtle vignette so nav and wordmark read cleanly */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/30 pointer-events-none" />
      </div>

      {/* Bottom-left wordmark — like Oskar's subtle credit */}
      <div className="absolute bottom-8 left-7 pointer-events-none select-none">
        <span className="font-serif font-light text-white/30 text-[13px] tracking-[0.12em]">
          {img.alt}
        </span>
      </div>

      {/* Bottom-right nav hint */}
      <div className="absolute bottom-8 right-7 flex gap-6">
        {[
          { href: '/people', label: 'People' },
          { href: '/places', label: 'Places' },
          { href: '/nature', label: 'Nature' },
        ].map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="text-[9px] font-light tracking-[0.22em] uppercase text-white/40 hover:text-white transition-colors duration-200"
          >
            {label}
          </Link>
        ))}
      </div>
    </main>
  )
}
