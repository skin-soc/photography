import Link from 'next/link'
import GalleryStack, { GalleryItem } from '../components/GalleryStack'
import GalleryFooter from '../components/GalleryFooter'

// Replace with your actual nature image paths
const BASE = 'https://gusmcewan.com/images/gallery'

const items: GalleryItem[] = [
  { type: 'single', aspect: 'hero', src: `${BASE}/NA00001.jpg`, alt: 'Nature — Gus McEwan' },
  {
    type: 'pair',
    images: [
      { src: `${BASE}/NA00002.jpg`, alt: 'Nature — Gus McEwan' },
      { src: `${BASE}/NA00003.jpg`, alt: 'Nature — Gus McEwan' },
    ],
  },
  { type: 'single', aspect: 'tall', src: `${BASE}/NA00004.jpg`, alt: 'Nature — Gus McEwan' },
  { type: 'single', aspect: 'mid',  src: `${BASE}/NA00005.jpg`, alt: 'Nature — Gus McEwan' },
  {
    type: 'pair',
    images: [
      { src: `${BASE}/NA00006.jpg`, alt: 'Nature — Gus McEwan' },
      { src: `${BASE}/NA00007.jpg`, alt: 'Nature — Gus McEwan' },
    ],
  },
  { type: 'single', aspect: 'hero', src: `${BASE}/NA00008.jpg`, alt: 'Nature — Gus McEwan' },
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
      <GalleryFooter links={[
        { href: '/people', label: 'People' },
        { href: '/places', label: 'Places' },
        { href: 'https://instagram.com/gusmcewan', label: 'Instagram' },
        { href: '/about', label: 'Contact' },
      ]} />
    </main>
  )
}
