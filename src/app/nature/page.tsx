import Link from 'next/link'
import GalleryStack, { GalleryItem } from '../components/GalleryStack'
import GalleryFooter from '../components/GalleryFooter'

// NT00001–NT00012 (12 images)
// Nature benefits from a slower, more contemplative rhythm than People or Places.
// More singles, fewer pairs — let each image breathe.
// Wide/hero aspect suits landscapes; tall suits vertical nature (trees, waterfalls, cliffs).
// Pairs only where two images clearly share light quality or subject matter.
const B = '/images/gallery'

const items: GalleryItem[] = [
  { type: 'single', aspect: 'hero', src: `${B}/NT00001.jpg`, alt: 'Nature — Gus McEwan Photography' },
  { type: 'single', aspect: 'mid',  src: `${B}/NT00002.jpg`, alt: 'Nature — Gus McEwan Photography' },
  { type: 'pair', images: [
    { src: `${B}/NT00003.jpg`, alt: 'Nature — Gus McEwan Photography' },
    { src: `${B}/NT00004.jpg`, alt: 'Nature — Gus McEwan Photography' },
  ]},
  { type: 'single', aspect: 'hero', src: `${B}/NT00005.jpg`, alt: 'Nature — Gus McEwan Photography' },
  { type: 'single', aspect: 'tall', src: `${B}/NT00006.jpg`, alt: 'Nature — Gus McEwan Photography' },
  { type: 'single', aspect: 'hero', src: `${B}/NT00007.jpg`, alt: 'Nature — Gus McEwan Photography' },
  { type: 'pair', images: [
    { src: `${B}/NT00008.jpg`, alt: 'Nature — Gus McEwan Photography' },
    { src: `${B}/NT00009.jpg`, alt: 'Nature — Gus McEwan Photography' },
  ]},
  { type: 'single', aspect: 'mid',  src: `${B}/NT00010.jpg`, alt: 'Nature — Gus McEwan Photography' },
  { type: 'single', aspect: 'hero', src: `${B}/NT00011.jpg`, alt: 'Nature — Gus McEwan Photography' },
  { type: 'single', aspect: 'mid',  src: `${B}/NT00012.jpg`, alt: 'Nature — Gus McEwan Photography' },
]

export default function Nature() {
  return (
    <main className="pt-[52px]">
      <div className="flex items-baseline gap-5 px-7 py-10 border-b border-white/5">
        <Link href="/" className="text-[9px] font-light tracking-[0.2em] uppercase text-white/35 hover:text-white transition-colors">
          ← All work
        </Link>
        <h1 className="font-serif font-light text-[2rem] tracking-wide">Nature</h1>
      </div>
      <GalleryStack items={items} />
      <GalleryFooter />
    </main>
  )
}
