import Link from 'next/link'
import GalleryStack, { GalleryItem } from '../components/GalleryStack'
import GalleryFooter from '../components/GalleryFooter'

const BASE = 'https://gusmcewan.com/images/gallery'

const items: GalleryItem[] = [
  { type: 'single', aspect: 'hero', src: `${BASE}/PL00003.jpg`, alt: 'Calderon Hondo, Fuerteventura' },
  {
    type: 'pair',
    images: [
      { src: `${BASE}/PL00001.jpg`, alt: 'Københavns Domhus' },
      { src: `${BASE}/PL00004.jpg`, alt: 'Baltic, Amagerstrand' },
    ],
  },
  { type: 'single', aspect: 'hero', src: `${BASE}/PL00008.jpg`, alt: 'Gemini Residence, Copenhagen' },
  { type: 'single', aspect: 'mid',  src: `${BASE}/PL00011.jpg`, alt: 'The Hand, Brisbane' },
  {
    type: 'pair',
    images: [
      { src: `${BASE}/PL00007.jpg`, alt: 'ARC, Copenhagen Ski and Incineration Plant' },
      { src: `${BASE}/PL00013.jpg`, alt: 'Operaen, Det Kongelige Teater' },
    ],
  },
  { type: 'single', aspect: 'hero', src: `${BASE}/PL00006.jpg`, alt: 'The Kelpies, Scotland' },
  { type: 'single', aspect: 'mid',  src: `${BASE}/PL00002.jpg`, alt: 'Marmorkirken, Copenhagen' },
]

export default function Places() {
  return (
    <main className="pt-[52px]">
      <div className="flex items-baseline gap-5 px-7 py-10 border-b border-white/5">
        <Link href="/" className="text-[9px] font-light tracking-[0.2em] uppercase text-white/35 hover:text-white transition-colors">
          ← All work
        </Link>
        <h1 className="font-serif font-light text-[2rem] tracking-wide">Places</h1>
      </div>
      <GalleryStack items={items} />
      <GalleryFooter links={[
        { href: '/people', label: 'People' },
        { href: '/nature', label: 'Nature' },
        { href: 'https://instagram.com/gusmcewan', label: 'Instagram' },
        { href: '/about', label: 'Contact' },
      ]} />
    </main>
  )
}
