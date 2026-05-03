'use client'

import { useEffect, useRef, useState } from 'react'

export type GalleryItem =
  | { type: 'single'; src: string; alt: string; aspect?: 'hero' | 'wide' | 'tall' | 'mid' }
  | { type: 'pair'; images: { src: string; alt: string }[] }

interface Props {
  items: GalleryItem[]
}

const heightClasses: Record<string, string> = {
  hero: 'min-h-[56vw] max-h-screen',
  wide: 'min-h-[38vw] max-h-screen',
  tall: 'min-h-[60vh] max-h-screen',
  mid:  'min-h-[50vw] max-h-[80vh]',
}

// Scroll-reveal: slides up from 40px below, fades in
function RevealBlock({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } },
      { threshold: 0.04 }
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
        transform: visible ? 'translateY(0)' : 'translateY(40px)',
        transition: 'opacity 0.7s ease, transform 0.7s ease',
      }}
    >
      {children}
    </div>
  )
}

function GalleryImg({
  src,
  alt,
  sizes,
  priority = false,
}: {
  src: string
  alt: string
  sizes: string
  priority?: boolean
}) {
  return (
    <div className="w-full h-full select-none" onContextMenu={(e) => e.preventDefault()}>
      <img
        src={src}
        alt={alt}
        sizes={sizes}
        draggable={false}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        className="w-full h-full object-cover block select-none pointer-events-none"
        style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
      />
    </div>
  )
}

export default function GalleryStack({ items }: Props) {
  return (
    // No top padding — first image goes full bleed under transparent nav
    <div className="flex flex-col gap-[3px] px-[3px]">
      {items.map((item, i) => {
        if (item.type === 'single') {
          const cls = heightClasses[item.aspect ?? 'hero']
          // First image: no reveal animation, load immediately, fills screen from top
          if (i === 0) {
            return (
              <div key={i} className={`w-full overflow-hidden bg-[#0a0a0a] ${cls}`}>
                <GalleryImg src={item.src} alt={item.alt} sizes="100vw" priority />
              </div>
            )
          }
          return (
            <RevealBlock key={i} className={`w-full overflow-hidden bg-[#0a0a0a] ${cls}`}>
              <GalleryImg src={item.src} alt={item.alt} sizes="100vw" />
            </RevealBlock>
          )
        }

        return (
          <RevealBlock key={i} className="flex gap-[3px] min-h-[40vw] max-h-[65vh]">
            {item.images.map((img, j) => (
              <div key={j} className="flex-1 overflow-hidden bg-[#0a0a0a]">
                <GalleryImg src={img.src} alt={img.alt} sizes="50vw" />
              </div>
            ))}
          </RevealBlock>
        )
      })}
    </div>
  )
}
