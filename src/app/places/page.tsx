import GalleryStack, { GalleryItem } from '../components/GalleryStack'
import GalleryFooter from '../components/GalleryFooter'

const B = '/images/gallery'

// Each image carries its real pixel dimensions so the container's aspect-ratio
// matches the photo exactly — no cropping, photo always shown in full at the
// width its slot allows (100 vw for singles, 50 vw for pairs, 33 vw for triples).

const items: GalleryItem[] = [
  { type: 'single', src: `${B}/PL00003.webp`, alt: 'Calderon Hondo, Fuerteventura, Spain', w: 3200, h: 2132 },
  { type: 'pair', images: [
    { src: `${B}/PL00012.webp`, alt: 'Tivoli Gardens, Copenhagen', w: 3200, h: 3200 },
    { src: `${B}/PL00004.webp`, alt: 'Amagerstrand, Copenhagen',   w: 3200, h: 3200 },
  ]},
  { type: 'single', src: `${B}/PL00001.webp`, alt: 'Københavns Domhus, Copenhagen', w: 3200, h: 1800 },
  { type: 'single', src: `${B}/PL00007.webp`, alt: 'ARC, Copenhagen',               w: 3200, h: 2400 },
  { type: 'pair', images: [
    { src: `${B}/PL00002.webp`, alt: 'Marmorkirken, Copenhagen',     w: 3200, h: 2133},
    { src: `${B}/PL00008.webp`, alt: 'Gemini Residence, Copenhagen', w: 3200, h: 2133 },
  ]},
  { type: 'single', src: `${B}/PL00006.webp`, alt: 'The Kelpies, Scotland',         w: 3200, h: 1792 },
  { type: 'single', src: `${B}/PL00011.webp`, alt: 'The Hand, Brisbane, Australia', w: 3200, h: 1800 },
  { type: 'pair', images: [
    { src: `${B}/PL00013.webp`, alt: 'Operæn, Det Kongelige Teater, Copenhagen', w: 3200, h: 3200 },
    { src: `${B}/PL00014.webp`, alt: 'Christiansborg Palace, Copenhagen',         w: 3200, h: 3200 },
  ]},
  { type: 'single', src: `${B}/PL00015.webp`, alt: 'Notre Dame Cathedral, Paris', w: 3200, h: 1800 },
]

export default function Places() {
  return (
    <main>
      <GalleryStack items={items} />
      <GalleryFooter />
    </main>
  )
}
