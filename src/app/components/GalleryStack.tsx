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

function RevealBlock({ children, className, delay = 0 }: {
  children: React.ReactNode
  className?: string
  delay?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Already in viewport on mount — show immediately, skip animation
    const rect = el.getBoundingClientRect()
    if (rect.top < window.innerHeight) {
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } },
      { threshold: 0.06, rootMargin: '0px 0px -40px 0px' }
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
        transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms`,
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
  let revealIndex = 0

  return (
    <div className="flex flex-col gap-[3px] px-[3px]">
      {items.map((item, i) => {
        if (item.type === 'single') {
          const cls = heightClasses[item.aspect ?? 'hero']
          if (i === 0) {
            return (
              <div key={i} className={`w-full overflow-hidden bg-[#0a0a0a] ${cls}`}>
                <GalleryImg src={item.src} alt={item.alt} sizes="100vw" priority />
              </div>
            )
          }
          const delay = (revealIndex++ % 3) * 80
          return (
            <RevealBlock key={i} delay={delay} className={`w-full overflow-hidden bg-[#0a0a0a] ${cls}`}>
              <GalleryImg src={item.src} alt={item.alt} sizes="100vw" />
            </RevealBlock>
          )
        }

        const delay = (revealIndex++ % 3) * 80
        return (
          <RevealBlock key={i} delay={delay} className="flex gap-[3px] min-h-[40vw] max-h-[65vh]">
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