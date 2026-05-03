import Link from 'next/link'
import GalleryStack, { GalleryItem } from '../components/GalleryStack'
import GalleryFooter from '../components/GalleryFooter'

// PL00001–PL00014 (14 images)
// Alt text from live site where known:
//   PL00001 Københavns Domhus, PL00002 Marmorkirken, PL00003 Calderon Hondo Fuerteventura
//   PL00004 Amagerstrand, PL00005-PL00006 Kelpies Scotland, PL00007 ARC Copenhagen
//   PL00008 Gemini Residence, PL00009-PL00010 unknown, PL00011 The Hand Brisbane
//   PL00012-PL00014 unknown + PL00013 Operaen
// Open with Calderon Hondo — volcanic, dramatic, strong hero.
// Copenhagen architecture works well paired (formal buildings complement each other).
// End with Operaen as a closing statement — iconic Danish landmark.
const B = '/images/gallery'

const items: GalleryItem[] = [
  { type: 'single', aspect: 'hero', src: `${B}/PL00003.jpg`, alt: 'Calderon Hondo, Fuerteventura, Spain' },
  { type: 'pair', images: [
    { src: `${B}/PL00001.jpg`, alt: 'Københavns Domhus, Copenhagen' },
    { src: `${B}/PL00002.jpg`, alt: 'Marmorkirken, Copenhagen' },
  ]},
  { type: 'single', aspect: 'hero', src: `${B}/PL00008.jpg`, alt: 'Gemini Residence, Copenhagen' },
  { type: 'single', aspect: 'mid',  src: `${B}/PL00004.jpg`, alt: 'Amagerstrand, Copenhagen' },
  { type: 'pair', images: [
    { src: `${B}/PL00007.jpg`, alt: 'ARC, Copenhagen' },
    { src: `${B}/PL00006.jpg`, alt: 'The Kelpies, Scotland' },
  ]},
  { type: 'single', aspect: 'hero', src: `${B}/PL00011.jpg`, alt: 'The Hand, Brisbane, Australia' },
  { type: 'pair', images: [
    { src: `${B}/PL00005.jpg`, alt: 'Places — Gus McEwan Photography' },
    { src: `${B}/PL00009.jpg`, alt: 'Places — Gus McEwan Photography' },
  ]},
  { type: 'single', aspect: 'mid',  src: `${B}/PL00010.jpg`, alt: 'Places — Gus McEwan Photography' },
  { type: 'pair', images: [
    { src: `${B}/PL00012.jpg`, alt: 'Places — Gus McEwan Photography' },
    { src: `${B}/PL00014.jpg`, alt: 'Places — Gus McEwan Photography' },
  ]},
  { type: 'single', aspect: 'hero', src: `${B}/PL00013.jpg`, alt: 'Operaen, Det Kongelige Teater, Copenhagen' },
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
