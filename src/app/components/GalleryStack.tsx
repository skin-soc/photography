import Image from 'next/image'

export type GalleryItem =
  | { type: 'single'; src: string; alt: string; aspect?: 'hero' | 'tall' | 'mid' }
  | { type: 'pair'; images: { src: string; alt: string }[] }

interface Props {
  items: GalleryItem[]
}

const aspectClasses = {
  hero: 'aspect-[16/9]',
  tall: 'aspect-[3/4]',
  mid:  'aspect-[4/3]',
}

export default function GalleryStack({ items }: Props) {
  return (
    <div className="flex flex-col gap-[3px] p-[3px]">
      {items.map((item, i) => {
        if (item.type === 'single') {
          const cls = aspectClasses[item.aspect ?? 'hero']
          return (
            <div key={i} className={`w-full relative ${cls} bg-[#0a0a0a]`}>
              <Image
                src={item.src}
                alt={item.alt}
                fill
                sizes="100vw"
                className="object-cover"
                priority={i === 0}
              />
            </div>
          )
        }

        return (
          <div key={i} className="flex gap-[3px]">
            {item.images.map((img, j) => (
              <div key={j} className="flex-1 relative aspect-[4/3] bg-[#0a0a0a]">
                <Image
                  src={img.src}
                  alt={img.alt}
                  fill
                  sizes="50vw"
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
