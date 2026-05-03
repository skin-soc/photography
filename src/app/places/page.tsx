import GalleryStack, { GalleryItem } from '../components/GalleryStack'
import GalleryFooter from '../components/GalleryFooter'

const B = '/images/gallery'

const items: GalleryItem[] = [
  { type: 'single', aspect: 'hero', src: `${B}/PL00003.webp`, alt: 'Calderon Hondo, Fuerteventura, Spain' },
  { type: 'pair', images: [
    { src: `${B}/PL00001.webp`, alt: 'Københavns Domhus, Copenhagen' },
    { src: `${B}/PL00002.webp`, alt: 'Marmorkirken, Copenhagen' },
  ]},
  { type: 'single', aspect: 'hero', src: `${B}/PL00008.webp`, alt: 'Gemini Residence, Copenhagen' },
  { type: 'single', aspect: 'mid',  src: `${B}/PL00004.webp`, alt: 'Amagerstrand, Copenhagen' },
  { type: 'pair', images: [
    { src: `${B}/PL00007.webp`, alt: 'ARC, Copenhagen' },
    { src: `${B}/PL00006.webp`, alt: 'The Kelpies, Scotland' },
  ]},
  { type: 'single', aspect: 'hero', src: `${B}/PL00011.webp`, alt: 'The Hand, Brisbane, Australia' },
  { type: 'pair', images: [
    { src: `${B}/PL00005.webp`, alt: 'Places — Gus McEwan Photography' },
    { src: `${B}/PL00009.webp`, alt: 'Places — Gus McEwan Photography' },
  ]},
  { type: 'single', aspect: 'mid',  src: `${B}/PL00010.webp`, alt: 'Places — Gus McEwan Photography' },
  { type: 'pair', images: [
    { src: `${B}/PL00012.webp`, alt: 'Places — Gus McEwan Photography' },
    { src: `${B}/PL00014.webp`, alt: 'Places — Gus McEwan Photography' },
  ]},
  { type: 'single', aspect: 'hero', src: `${B}/PL00013.webp`, alt: 'Operaen, Det Kongelige Teater, Copenhagen' },
]

export default function Places() {
  return (
    <main>
      <GalleryStack items={items} />
      <GalleryFooter />
    </main>
  )
}
