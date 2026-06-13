'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'

const ALL_PLACES = [
  { src: '/images/gallery/PL00003.webp', alt: 'Calderon Hondo, Fuerteventura — landscape photography by Gus McEwan',          fx: 50, fy: 5  },
  { src: '/images/gallery/NT00012.webp', alt: 'COVID fisherman — documentary photography by Gus McEwan',                       fx: 50, fy: 99 },
  { src: '/images/gallery/PL00006.webp', alt: 'The Kelpies, Scotland — travel photography by Gus McEwan',                      fx: 80, fy: 90 },
  { src: '/images/gallery/PL00001.webp', alt: 'Københavns Domhus (Copenhagen Court House) — architecture by Gus McEwan',       fx: 49, fy: 10 },
  { src: '/images/gallery/PL00007.webp', alt: 'ARC, Copenhagen — modern architecture by Gus McEwan',                           fx: 40, fy: 50 },
  { src: '/images/gallery/PL00008.webp', alt: 'Gemini Residence, Copenhagen — architecture by Gus McEwan',                     fx: 50, fy: 0 },
  { src: '/images/gallery/PL00011.webp', alt: 'The Hand, Brisbane — travel photography by Gus McEwan',                         fx: 60, fy: 55 },
  { src: '/images/gallery/PP00001.webp', alt: 'Portrait of Jamie — by photographer Gus McEwan',                                fx: 25, fy: 10 },
  { src: '/images/gallery/PP00005.webp', alt: 'Portrait of Bryce Anderville Hixson Jr. — by Gus McEwan',                       fx: 43, fy: 50 },
  { src: '/images/gallery/PP00007.webp', alt: 'Lolly & Matt — couple portrait by Gus McEwan',                                  fx: 54, fy: 35 },
  { src: '/images/gallery/PP00006.webp', alt: 'Simon Cravatte, drag performer — portrait by Gus McEwan',                       fx: 48, fy: 30 },
  { src: '/images/gallery/NT00002.webp', alt: 'Australian gull — wildlife photography by Gus McEwan',                          fx: 51, fy: 30 },
  { src: '/images/gallery/NT00011.webp', alt: 'Persian lynx (caracal) — wildlife photography by Gus McEwan',                   fx: 35, fy: 50 },
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
  const t = useTranslations('footer')
  const tSite = useTranslations('site')
  const tNav = useTranslations('nav')
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
    const interval = setInterval(advance, 5000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const bottomImg = ALL_PLACES[bottom]
  const topImg    = top !== null ? ALL_PLACES[top] : null

  return (
    <main className="fixed inset-0 bg-bg overflow-hidden">

      {/* SEO content — invisible to sighted users but indexable by search engines.
          Gives Google a real H1, intro paragraph and crawlable internal links on / */}
      <h1 className="sr-only">{tSite('title')}</h1>
      <p className="sr-only">{tSite('description')}</p>
      <nav className="sr-only" aria-label="Sections">
        <ul>
          <li><Link href="/people">{tNav('people')}</Link></li>
          <li><Link href="/places">{tNav('places')}</Link></li>
          <li><Link href="/nature">{tNav('nature')}</Link></li>
          <li><Link href="/about">{tNav('about')}</Link></li>
        </ul>
      </nav>

      {/* Bottom layer */}
      <div className="absolute inset-0 select-none" onContextMenu={(e) => e.preventDefault()}>
        <img
          key={`bottom-${bottom}`}
          src={bottomImg.src}
          alt={bottomImg.alt}
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
          onDragStart={(e) => e.preventDefault()}
          className="w-full h-full object-cover pointer-events-none"
          style={{
            objectPosition: `${bottomImg.fx}% ${bottomImg.fy}%`,
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
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
            className="w-full h-full object-cover pointer-events-none"
            style={{
              objectPosition: `${topImg.fx}% ${topImg.fy}%`,
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
          />
        </div>
      )}

      {/* Vignette */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/30 pointer-events-none" />

      {/* Centered copyright footer */}
      <div className="absolute bottom-0 left-0 right-0 py-4 text-center pointer-events-none select-none">
        {/* Sits over the full-bleed photo (with vignette) in both themes, so it
            stays white rather than following the theme foreground. */}
        <span className="text-[9px] font-light tracking-[0.2em] uppercase text-white/25">
          {t('copyright', { year: new Date().getFullYear() })}
        </span>
      </div>

    </main>
  )
}