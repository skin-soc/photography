'use client'

export type GalleryItem =
  | { type: 'single'; src: string; alt: string; aspect?: 'hero' | 'wide' | 'tall' | 'mid' }
  | { type: 'pair'; images: { src: string; alt: string }[] }

interface Props {
  items: GalleryItem[]
}

const aspectClasses: Record<string, string> = {
  hero: 'aspect-[16/9]',
  wide: 'aspect-[21/9]',
  tall: 'aspect-[2/3]',
  mid:  'aspect-[4/3]',
}

function toWebP(src: string) {
  return src.replace(/\.(jpg|jpeg|png)$/i, '.webp')
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
      <picture className="block w-full h-full">
        <source srcSet={toWebP(src)} type="image/webp" />
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
      </picture>
    </div>
  )
}

export default function GalleryStack({ items }: Props) {
  return (
    <div className="flex flex-col gap-[3px] p-[3px]">
      {items.map((item, i) => {
        if (item.type === 'single') {
          const cls = aspectClasses[item.aspect ?? 'hero']
          return (
            <div key={i} className={`w-full overflow-hidden bg-[#0a0a0a] ${cls}`}>
              <GalleryImg src={item.src} alt={item.alt} sizes="100vw" priority={i === 0} />
            </div>
          )
        }

        return (
          <div key={i} className="flex gap-[3px]">
            {item.images.map((img, j) => (
              <div key={j} className="flex-1 overflow-hidden bg-[#0a0a0a] aspect-[4/3]">
                <GalleryImg src={img.src} alt={img.alt} sizes="50vw" />
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
