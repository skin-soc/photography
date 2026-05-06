'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Img { src: string; alt: string; w: number; h: number; fx?: number; fy?: number; noParallax?: boolean }

export type GalleryItem =
  | ({ type: 'single' } & Img)
  | { type: 'pair';   images: Img[] }
  | { type: 'triple'; images: Img[] }

interface Props {
  items: GalleryItem[]
  enableLightbox?: boolean   // ← new; defaults to true
}

/** Insert "GM-" before the filename portion of any gallery path.
 *  /images/gallery/PL00001.webp → /images/gallery/GM-PL00001.webp */
function fullSrc(src: string): string {
  return src.replace(/\/([^/]+)$/, '/GM-$1')
}

/** Flatten all Img entries from the items array, preserving visual order. */
function flattenImages(items: GalleryItem[]): Img[] {
  return items.flatMap(item =>
    item.type === 'single' ? [item] : item.images
  )
}

/* ─── Row aspect-ratio helper ────────────────────────────────────────────── */
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
  fx = 50,
  fy = 50,
  noParallax = false,
  onClick,
}: {
  src: string
  alt: string
  sizes: string
  priority?: boolean
  strength?: number
  fx?: number
  fy?: number
  noParallax?: boolean
  onClick?: () => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const imgRef  = useRef<HTMLImageElement>(null)
  const rafRef  = useRef<number | null>(null)
  const [visible, setVisible] = useState(priority)

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

  useEffect(() => {
    const wrap = wrapRef.current
    const img  = imgRef.current
    if (!wrap || !img || noParallax) return

    const tick = () => {
      const rect = wrap.getBoundingClientRect()
      const vh   = window.innerHeight
      const progress = 1 - rect.bottom / (vh + rect.height)
      const offset = ( 0.5 - progress ) * strength * rect.height
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
  }, [strength, noParallax])

  return (
    <div
      ref={wrapRef}
      className="w-full h-full overflow-hidden bg-[#0a0a0a] select-none"
      onContextMenu={e => e.preventDefault()}
      style={{
        position:   'relative',
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
        className="w-full h-full object-cover block select-none pointer-events-none"
        style={{
          objectPosition:   `${fx}% ${fy}%`,
          scale:            '1.10',
          WebkitUserSelect: 'none',
          userSelect:       'none',
          willChange:       'transform',
        }}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
      />
      {/* Button sits over the image — using a native interactive element
          prevents iOS Safari from withholding the first touch gesture      */}
      {onClick && (
        <button
          onClick={onClick}
          onContextMenu={e => e.preventDefault()}
          aria-label={`View ${alt}`}
          style={{
            position:   'absolute',
            inset:      0,
            background: 'none',
            border:     'none',
            cursor:     'zoom-in',
            padding:    0,
            display:    'block',
            width:      '100%',
            height:     '100%',
            WebkitTapHighlightColor: 'transparent',
          }}
        />
      )}
    </div>
  )
}

/* ─── Lightbox ───────────────────────────────────────────────────────────── */

const FRAME = 56   // white matte width in px — gallery / museum print weight
const MATTE = Math.round(FRAME * 1.75)  // uniform margin on all four sides

function Lightbox({
  images,
  startIndex,
  onClose,
}: {
  images: Img[]
  startIndex: number
  onClose: () => void
}) {
  const [index,    setIndex]    = useState(startIndex)
  const [loaded,   setLoaded]   = useState(false)
  const [visible,  setVisible]  = useState(false)
  const [leaving,  setLeaving]  = useState(false)
  const [isMobile,      setIsMobile]      = useState(false)
  const [isConstrained, setIsConstrained] = useState(false)
  const [vw, setVw] = useState(0)
  const [vh, setVh] = useState(0)
  const imgRef = useRef<HTMLImageElement>(null)

  const current = images[index]
  const src     = fullSrc(current.src)

  /* ── responsive: use window.innerWidth/Height — bypasses iOS Safari 100vh bug ── */
  useEffect(() => {
    const check = () => {
      const w      = window.innerWidth
      const h      = window.innerHeight
      const narrow = w < 640
      const short  = h < 500
      setVw(w)
      setVh(h)
      setIsMobile(narrow)
      setIsConstrained(narrow || short)
    }
    check()
    window.addEventListener('resize',            check)
    window.addEventListener('orientationchange', check)
    return () => {
      window.removeEventListener('resize',            check)
      window.removeEventListener('orientationchange', check)
    }
  }, [])

  /* ── responsive matte & clearance (all in px, no vh/vw units) ── */
  const m         = isConstrained ? 14  : MATTE
  const outerGap  = isConstrained ? 0   : 160   // horizontal space for arrows
  const outerVGap = isConstrained ? 64  : 80    // vertical space for close/counter

  /* derived pixel budgets — safe even before first measure (vw/vh = 0 → 0px images,
     which just means a single invisible frame until the effect fires) */
  const maxW = vw > 0 ? vw - outerGap - m * 2 : undefined
  const maxH = vh > 0 ? vh - outerVGap - m * 2 : undefined

  /* ── mount / unmount animations ── */
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const close = useCallback(() => {
    setLeaving(true)
    setTimeout(onClose, 280)
  }, [onClose])

  /* ── navigate ── */
  const prev = useCallback(() => {
    setLoaded(false)
    setIndex(i => i - 1)
  }, [])

  const next = useCallback(() => {
    setLoaded(false)
    setIndex(i => i + 1)
  }, [])

  /* ── preload next 2 images ── */
  useEffect(() => {
    if (images.length < 2) return
    ;[1, 2].forEach(offset => {
      const i = index + offset
      if (i >= images.length) return
      const img = new window.Image()
      img.src = fullSrc(images[i].src)
    })
  }, [index, images])

  /* ── keyboard ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape')                                     close()
      if (e.key === 'ArrowLeft'  && index > 0)                    prev()
      if (e.key === 'ArrowRight' && index < images.length - 1)    next()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [close, prev, next, index, images.length])

  /* ── prevent body scroll ── */
  useEffect(() => {
    const saved = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = saved }
  }, [])

  /* ── touch swipe ── */
  const touchStartX = useRef<number | null>(null)
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 40) {
      if (dx < 0 && index < images.length - 1) next()
      if (dx > 0 && index > 0)                 prev()
    }
    touchStartX.current = null
  }

  const overlayOpacity = leaving ? 0 : visible ? 1 : 0

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      onContextMenu={e => e.preventDefault()}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        position:         'fixed',
        inset:            0,
        zIndex:           9999,
        background:       `rgba(0,0,0,${leaving ? 0 : visible ? 0.96 : 0})`,
        transition:       'background 280ms ease',
        display:          'flex',
        alignItems:       'center',
        justifyContent:   'center',
        userSelect:       'none',
        WebkitUserSelect: 'none',
      }}
      onClick={e => { if (e.target === e.currentTarget) close() }}
    >

      {/* ── Close ── */}
      <button
        onClick={close}
        aria-label="Close"
        style={{
          position:   'absolute',
          top:        isMobile ? '0.6rem' : '1.25rem',
          right:      isMobile ? '0.6rem' : '1.5rem',
          background: 'none',
          border:     'none',
          color:      'rgba(255,255,255,0.55)',
          cursor:     'pointer',
          /* 44px minimum touch target */
          minWidth:   '44px',
          minHeight:  '44px',
          display:    'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding:    '0.5rem',
          lineHeight: 1,
          transition: 'color 180ms ease',
          fontFamily: 'var(--font-serif)',
          fontSize:   isMobile ? '1.8rem' : '1.6rem',
          fontWeight: 300,
        }}
        onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.55)')}
      >
        ×
      </button>

      {/* ── Counter ── */}
      <div
        style={{
          position:     'absolute',
          top:          isMobile ? '0.85rem' : '1.35rem',
          left:         isMobile ? '0.9rem'  : '1.75rem',
          fontFamily:   'var(--font-serif)',
          fontSize:     isMobile ? '0.65rem' : '0.78rem',
          fontWeight:   300,
          letterSpacing:'0.18em',
          color:        'rgba(255,255,255,0.38)',
          userSelect:   'none',
        }}
      >
        {index + 1} / {images.length}
      </div>

      {/* ── Prev arrow — desktop only; mobile uses swipe ── */}
      {!isConstrained && index > 0 && (
        <button
          onClick={prev}
          aria-label="Previous image"
          style={{
            position:   'absolute',
            left:       '1.25rem',
            top:        '50%',
            transform:  'translateY(-50%)',
            background: 'none',
            border:     'none',
            color:      'rgba(255,255,255,0.35)',
            cursor:     'pointer',
            padding:    '0.75rem',
            transition: 'color 180ms ease',
            lineHeight: 1,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
        >
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path d="M18 4L8 14L18 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}

      {/* ── Next arrow — desktop only ── */}
      {!isConstrained && index < images.length - 1 && (
        <button
          onClick={next}
          aria-label="Next image"
          style={{
            position:   'absolute',
            right:      '1.25rem',
            top:        '50%',
            transform:  'translateY(-50%)',
            background: 'none',
            border:     'none',
            color:      'rgba(255,255,255,0.35)',
            cursor:     'pointer',
            padding:    '0.75rem',
            transition: 'color 180ms ease',
            lineHeight: 1,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
        >
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path d="M10 4L20 14L10 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}

      {/* ── White-matte frame + image ── */}
      <div
        style={{
          opacity:    overlayOpacity,
          transform:  visible && !leaving ? 'scale(1)' : 'scale(0.97)',
          transition: 'opacity 280ms ease, transform 280ms ease',
          maxWidth:   maxW !== undefined ? `${maxW + m * 2}px` : undefined,
          maxHeight:  maxH !== undefined ? `${maxH + m * 2}px` : undefined,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div
          style={{
            position:   'relative',
            background: '#fff',
            padding:    `${m}px`,
            boxShadow:  '0 32px 90px rgba(0,0,0,0.7)',
            lineHeight: 0,
          }}
        >
          {/* Loading shimmer */}
          {!loaded && (
            <div
              style={{
                position:   'absolute',
                top: m, right: m, bottom: m, left: m,
                background: 'rgba(180,180,180,0.25)',
                animation:  'lb-pulse 1.2s ease-in-out infinite',
              }}
            />
          )}

          <img
            ref={imgRef}
            key={src}
            src={src}
            alt={current.alt}
            draggable={false}
            onLoad={() => setLoaded(true)}
            onContextMenu={e => e.preventDefault()}
            onDragStart={e => e.preventDefault()}
            style={{
              display:          'block',
              maxWidth:         maxW !== undefined ? `${maxW}px` : undefined,
              maxHeight:        maxH !== undefined ? `${maxH}px` : undefined,
              width:            'auto',
              height:           'auto',
              objectFit:        'contain',
              opacity:          loaded ? 1 : 0,
              transition:       'opacity 220ms ease',
              userSelect:       'none',
              WebkitUserSelect: 'none',
              pointerEvents:    'none',
            }}
          />

          {/* Caption — sits in the lower matte strip */}
          <p
            style={{
              position:       'absolute',
              bottom:         0,
              left:           m,
              right:          m,
              height:         m,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              margin:         0,
              fontFamily:     'var(--font-serif)',
              fontSize:       isMobile ? '0.6rem' : '0.8rem',
              fontWeight:     300,
              letterSpacing:  isMobile ? '0.18em' : '0.32em',
              textTransform:  'uppercase',
              color:          'rgba(0,0,0,0.45)',
              lineHeight:     1,
              userSelect:     'none',
              whiteSpace:     'nowrap',
              overflow:       'hidden',
              textOverflow:   'ellipsis',
            }}
          >
            {current.alt.split(',')[0]}
          </p>
        </div>
      </div>

      {/* Keyframe for loading shimmer */}
      <style>{`
        @keyframes lb-pulse {
          0%, 100% { opacity: 0.4; }
          50%       { opacity: 0.8; }
        }
      `}</style>
    </div>,
    document.body
  )
}

/* ─── Gallery stack ──────────────────────────────────────────────────────── */
export default function GalleryStack({ items, enableLightbox = true }: Props) {
  const allImages = flattenImages(items)

  const indexOf = useCallback((img: Img) => {
    return allImages.findIndex(i => i.src === img.src)
  }, [allImages])

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  /* ── iOS: prevent rubber-band snap-back at scroll boundaries ────────────
     Injecting a <style> tag is more reliable than element.style.setProperty
     because it is parsed by the CSS engine before any gesture can land.    */
  useEffect(() => {
    const id = 'gs-overscroll'
    if (!document.getElementById(id)) {
      const s = document.createElement('style')
      s.id = id
      s.textContent = 'html,body{overscroll-behavior:none}'
      document.head.appendChild(s)
    }
    return () => { document.getElementById(id)?.remove() }
  }, [])

  const openAt = useCallback((img: Img) => {
    setLightboxIndex(indexOf(img))
  }, [indexOf])

  const closeLight = useCallback(() => {
    setLightboxIndex(null)
  }, [])

  return (
    <>
      <div className="flex flex-col gap-[3px] px-[3px] w-full" style={{ contain: 'paint' }}>
        {items.map((item, i) => {

          if (item.type === 'single') {
            return (
              <div key={i} style={{ height: '100vh' }}>
                <ParallaxImg
                  src={item.src} alt={item.alt}
                  sizes="100vw"
                  priority={i === 0}
                  strength={0.08}
                  fx={item.fx}
                  fy={item.fy}
                  noParallax={item.noParallax}
                  onClick={enableLightbox ? () => openAt(item) : undefined}
                />
              </div>
            )
          }

          if (item.type === 'pair' || item.type === 'triple') {
            const sizesAttr = `${Math.round(100 / item.images.length)}vw`
            const pt = (100 / rowAspect(item.images)).toFixed(4)
            return (
              <div key={i} style={{ position: 'relative', width: '100%', paddingTop: `${pt}%` }}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: '3px', overflow: 'hidden' }}>
                  {item.images.map((img, j) => (
                    <div key={j} style={{ flex: 1, minWidth: 0 }}>
                      <ParallaxImg
                        src={img.src} alt={img.alt}
                        sizes={sizesAttr}
                        strength={0.06}
                        fx={img.fx}
                        fy={img.fy}
                        noParallax={img.noParallax}
                        onClick={enableLightbox ? () => openAt(img) : undefined}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )
          }

          return null
        })}
      </div>

      {enableLightbox && lightboxIndex !== null && (
        <Lightbox
          images={allImages}
          startIndex={lightboxIndex}
          onClose={closeLight}
        />
      )}
    </>
  )
}