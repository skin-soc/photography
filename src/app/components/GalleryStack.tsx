'use client'

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
    <div
      className="w-full h-full select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
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
    <div className="flex flex-col gap-[3px] p-[3px]">
      {items.map((item, i) => {
        if (item.type === 'single') {
          const cls = heightClasses[item.aspect ?? 'hero']
          return (
            <div key={i} className={`w-full overflow-hidden bg-[#0a0a0a] ${cls}`}>
              <GalleryImg src={item.src} alt={item.alt} sizes="100vw" priority={i === 0} />
            </div>
          )
        }
        return (
          <div key={i} className="flex gap-[3px] min-h-[40vw] max-h-[65vh]">
            {item.images.map((img, j) => (
              <div key={j} className="flex-1 overflow-hidden bg-[#0a0a0a]">
                <GalleryImg src={img.src} alt={img.alt} sizes="50vw" />
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
