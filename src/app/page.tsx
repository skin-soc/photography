'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

// PL00003 (Calderon Hondo) is always first. The rest are shuffled into a queue.
// When the queue is exhausted it reshuffles, ensuring every image plays before repeating.
const ALL_PLACES = [
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

function buildQueue(excludeIndex: number): number[] {
  const indices = ALL_PLACES.map((_, i) => i).filter(i => i !== excludeIndex)
  // Fisher-Yates shuffle
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }
  return indices
}

export default function Home() {
  // Two slots: bottom (prev) and top (next). We crossfade by fading the top layer in.
  const [bottom, setBottom] = useState(0)   // image underneath, always visible
  const [top, setTop]       = useState<number | null>(null) // image fading in
  const [topVisible, setTopVisible] = useState(false)       // controls opacity of top layer
  const queueRef = useRef<number[]>([])

  function advance() {
    // Replenish queue if empty
    if (queueRef.current.length === 0) {
      const currentBottom = bottom
      queueRef.current = buildQueue(currentBottom)
    }
    const next = queueRef.current.shift()!

    // Preload the next image before crossfading
    const preload = new Image()
    preload.src = ALL_PLACES[next].src
    preload.onload = () => {
      // Mount top layer at 0 opacity
      setTop(next)
      setTopVisible(false)
      // Small rAF delay to let React paint the top layer before transitioning
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTopVisible(true)
          // After fade completes, promote top to bottom and reset
          setTimeout(() => {
            setBottom(next)
            setTop(null)
            setTopVisible(false)
          }, 900) // must match transition duration below
        })
      })
    }
  }

  useEffect(() => {
    // Build initial queue excluding the first image
    queueRef.current = buildQueue(0)
    const interval = setInterval(advance, 5000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const bottomImg = ALL_PLACES[bottom]
  const topImg    = top !== null ? ALL_PLACES[top] : null

  return (
    <main className="fixed inset-0 bg-black overflow-hidden">

      {/* Bottom layer — always fully visible */}
      <div className="absolute inset-0 select-none" onContextMenu={(e) => e.preventDefault()}>
        <img
          key={`bottom-${bottom}`}
          src={bottomImg.src}
          alt={bottomImg.alt}
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
          onDragStart={(e) => e.preventDefault()}
          className="w-full h-full object-cover pointer-events-none"
          style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
        />
      </div>

      {/* Top layer — fades in over the bottom */}
      {topImg && (
        <div
          className="absolute inset-0 select-none"
          style={{
            opacity: topVisible ? 1 : 0,
            transition: 'opacity 900ms ease-in-out',
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <img
            src={topImg.src}
            alt={topImg.alt}
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
            onDragStart={(e) => e.preventDefault()}
            className="w-full h-full object-cover pointer-events-none"
            style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
          />
        </div>
      )}

      {/* Vignette */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/30 pointer-events-none" />

      {/* Caption bottom-left */}
      <div className="absolute bottom-8 left-7 pointer-events-none select-none">
        <span className="font-serif font-light text-white/30 text-[13px] tracking-[0.12em]">
          {topImg ? topImg.alt : bottomImg.alt}
        </span>
      </div>

      {/* Category links bottom-right */}
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
