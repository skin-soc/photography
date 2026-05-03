import GalleryStack, { GalleryItem } from '../components/GalleryStack'
import GalleryFooter from '../components/GalleryFooter'

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
    <main className="pb-10">
      <GalleryStack items={items} />
      <GalleryFooter />
    </main>
  )
}
