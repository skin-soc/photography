import Link from 'next/link'
import GalleryStack, { GalleryItem } from '../components/GalleryStack'
import GalleryFooter from '../components/GalleryFooter'

// PP00001–PP00012 (12 images)
// Layout rationale:
//   Open with a strong single hero to establish mood.
//   Alternate between pairs (intimacy, comparison) and singles (breathing room).
//   Tall/portrait aspect on singles suits people photography naturally.
//   Pairs work best when the two images share tone or complement each other.
const B = '/images/gallery'

const items: GalleryItem[] = [
  { type: 'single', aspect: 'hero', src: `${B}/PP00001.jpg`, alt: 'People — Gus McEwan Photography' },
  { type: 'pair', images: [
    { src: `${B}/PP00002.jpg`, alt: 'People — Gus McEwan Photography' },
    { src: `${B}/PP00003.jpg`, alt: 'People — Gus McEwan Photography' },
  ]},
  { type: 'single', aspect: 'tall', src: `${B}/PP00004.jpg`, alt: 'People — Gus McEwan Photography' },
  { type: 'single', aspect: 'hero', src: `${B}/PP00005.jpg`, alt: 'People — Gus McEwan Photography' },
  { type: 'pair', images: [
    { src: `${B}/PP00006.jpg`, alt: 'People — Gus McEwan Photography' },
    { src: `${B}/PP00007.jpg`, alt: 'People — Gus McEwan Photography' },
  ]},
  { type: 'single', aspect: 'tall', src: `${B}/PP00008.jpg`, alt: 'People — Gus McEwan Photography' },
  { type: 'pair', images: [
    { src: `${B}/PP00009.jpg`, alt: 'People — Gus McEwan Photography' },
    { src: `${B}/PP00010.jpg`, alt: 'People — Gus McEwan Photography' },
  ]},
  { type: 'single', aspect: 'hero', src: `${B}/PP00011.jpg`, alt: 'People — Gus McEwan Photography' },
  { type: 'single', aspect: 'mid',  src: `${B}/PP00012.jpg`, alt: 'People — Gus McEwan Photography' },
]

export default function People() {
  return (
    <main className="pt-[52px]">
      <div className="flex items-baseline gap-5 px-7 py-10 border-b border-white/5">
        <Link href="/" className="text-[9px] font-light tracking-[0.2em] uppercase text-white/35 hover:text-white transition-colors">
          ← All work
        </Link>
        <h1 className="font-serif font-light text-[2rem] tracking-wide">People</h1>
      </div>
      <GalleryStack items={items} />
      <GalleryFooter />
    </main>
  )
}
