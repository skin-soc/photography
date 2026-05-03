'use client'

import { useEffect, useRef, useState } from 'react'

const ALL_PLACES = [
  { src: '/images/gallery/PL00003.webp', alt: 'Calderon Hondo, Fuerteventura' },
  { src: '/images/gallery/PL00001.webp', alt: 'Københavns Domhus, Copenhagen' },
  { src: '/images/gallery/PL00002.webp', alt: 'Marmorkirken, Copenhagen' },
  { src: '/images/gallery/PL00004.webp', alt: 'Amagerstrand, Copenhagen' },
  { src: '/images/gallery/PL00006.webp', alt: 'The Kelpies, Scotland' },
  { src: '/images/gallery/PL00007.webp', alt: 'ARC, Copenhagen' },
  { src: '/images/gallery/PL00008.webp', alt: 'Gemini Residence, Copenhagen' },
  { src: '/images/gallery/PL00011.webp', alt: 'The Hand, Brisbane' },
  { src: '/images/gallery/PL00013.webp', alt: 'Operaen, Copenhagen' },
]

function buildQueue(excludeIndex: number): number[] {
  const indices = ALL_PLACES.map((_, i) => i).filter(i => i !== excludeIndex)
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }
  return indices
}

export default function Home() {
  const [bottom, setBottom] = useState(0)
  const [top, setTop]       = useState<number | null>(null)
  const [topVisible, setTopVisible] = useState(false)
  const queueRef = useRef<number[]>([])

  function advance() {
    if (queueRef.current.length === 0) {
      queueRef.current = buildQueue(bottom)
    }
    const next = queueRef.current.shift()!
    const preload = new window.Image()
    preload.src = ALL_PLACES[next].src
    preload.onload = () => {
      setTop(next)
      setTopVisible(false)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTopVisible(true)
          setTimeout(() => {
            setBottom(next)
            setTop(null)
            setTopVisible(false)
          }, 900)
        })
      })
    }
  }

  useEffect(() => {
    queueRef.current = buildQueue(0)
    const interval = setInterval(advance, 6500)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const bottomImg = ALL_PLACES[bottom]
  const topImg    = top !== null ? ALL_PLACES[top] : null

  return (
    <main className="fixed inset-0 bg-black overflow-hidden">

      {/* Bottom layer */}
      <div className="absolute inset-0 select-none" onContextMenu={(e) => e.preventDefault()}>
        <img
          key={`bottom-${bottom}`}
          src={bottomImg.src}
          alt={bottomImg.alt}
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
          onDragStart={(e) => e.preventDefault()}
          className="w-full h-full object-cover object-center pointer-events-none"
          style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
        />
      </div>

      {/* Top layer — crossfades in */}
      {topImg && (
        <div
          className="absolute inset-0 select-none"
          style={{ opacity: topVisible ? 1 : 0, transition: 'opacity 900ms ease-in-out' }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <img
            src={topImg.src}
            alt={topImg.alt}
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
            onDragStart={(e) => e.preventDefault()}
            className="w-full h-full object-cover object-center pointer-events-none"
            style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
          />
        </div>
      )}

      {/* Vignette */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/30 pointer-events-none" />

      {/* Centered copyright footer */}
      <div className="absolute bottom-0 left-0 right-0 py-4 text-center pointer-events-none select-none">
        <span className="text-[9px] font-light tracking-[0.2em] uppercase text-white/25">
          Copyright © {new Date().getFullYear()} Gus McEwan Photography
        </span>
      </div>

    </main>
  )
}
