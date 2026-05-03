'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const PLACES = [
  { src: '/images/gallery/PL00003.jpg', alt: 'Calderon Hondo, Fuerteventura' },
  { src: '/images/gallery/PL00001.jpg', alt: 'Københavns Domhus, Copenhagen' },
  { src: '/images/gallery/PL00002.jpg', alt: 'Marmorkirken, Copenhagen' },
  { src: '/images/gallery/PL00004.jpg', alt: 'Amagerstrand, Copenhagen' },
  { src: '/images/gallery/PL00005.jpg', alt: 'Places — Gus McEwan' },
  { src: '/images/gallery/PL00006.jpg', alt: 'The Kelpies, Scotland' },
  { src: '/images/gallery/PL00007.jpg', alt: 'ARC, Copenhagen' },
  { src: '/images/gallery/PL00008.jpg', alt: 'Gemini Residence, Copenhagen' },
  { src: '/images/gallery/PL00009.jpg', alt: 'Places — Gus McEwan' },
  { src: '/images/gallery/PL00010.jpg', alt: 'Places — Gus McEwan' },
  { src: '/images/gallery/PL00011.jpg', alt: 'The Hand, Brisbane' },
  { src: '/images/gallery/PL00012.jpg', alt: 'Places — Gus McEwan' },
  { src: '/images/gallery/PL00013.jpg', alt: 'Operaen, Copenhagen' },
  { src: '/images/gallery/PL00014.jpg', alt: 'Places — Gus McEwan' },
]

function nextRandom(current: number, total: number): number {
  let next = current
  while (next === current) next = Math.floor(Math.random() * total)
  return next
}

export default function Home() {
  const [current, setCurrent] = useState(0)
  const [fading, setFading]   = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      setFading(true)
      setTimeout(() => {
        setCurrent(prev => nextRandom(prev, PLACES.length))
        setFading(false)
      }, 600)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const img = PLACES[current]

  return (
    <main className="fixed inset-0">
      <div
        className="absolute inset-0 transition-opacity duration-700 ease-in-out select-none"
        style={{ opacity: fading ? 0 : 1 }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <img
          src={img.src}
          alt={img.alt}
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
          onDragStart={(e) => e.preventDefault()}
          className="w-full h-full object-cover select-none pointer-events-none"
          style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/25 pointer-events-none" />
      </div>
      <div className="absolute bottom-8 left-7 pointer-events-none select-none">
        <span className="font-serif font-light text-white/30 text-[13px] tracking-[0.12em]">
          {img.alt}
        </span>
      </div>
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
