import Link from 'next/link'
import GalleryStack, { GalleryItem } from '../components/GalleryStack'
import GalleryFooter from '../components/GalleryFooter'

// Replace these with your actual people/portrait image paths
// Pattern: { type: 'single', aspect: 'hero'|'tall'|'mid', src: '...', alt: '...' }
//      or: { type: 'pair', images: [{ src, alt }, { src, alt }] }
const BASE = 'https://gusmcewan.com/images/gallery'

const items: GalleryItem[] = [
  { type: 'single', aspect: 'hero', src: `${BASE}/PE00001.jpg`, alt: 'People — Gus McEwan' },
  {
    type: 'pair',
    images: [
      { src: `${BASE}/PE00002.jpg`, alt: 'People — Gus McEwan' },
      { src: `${BASE}/PE00003.jpg`, alt: 'People — Gus McEwan' },
    ],
  },
  { type: 'single', aspect: 'tall', src: `${BASE}/PE00004.jpg`, alt: 'People — Gus McEwan' },
  { type: 'single', aspect: 'mid',  src: `${BASE}/PE00005.jpg`, alt: 'People — Gus McEwan' },
  {
    type: 'pair',
    images: [
      { src: `${BASE}/PE00006.jpg`, alt: 'People — Gus McEwan' },
      { src: `${BASE}/PE00007.jpg`, alt: 'People — Gus McEwan' },
    ],
  },
  { type: 'single', aspect: 'hero', src: `${BASE}/PE00008.jpg`, alt: 'People — Gus McEwan' },
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
      <GalleryFooter links={[
        { href: '/places', label: 'Places' },
        { href: '/nature', label: 'Nature' },
        { href: 'https://instagram.com/gusmcewan', label: 'Instagram' },
        { href: '/about', label: 'Contact' },
      ]} />
    </main>
  )
}
