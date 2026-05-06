import GalleryStack, { GalleryItem } from '../components/GalleryStack'
import GalleryFooter from '../components/GalleryFooter'

const B = '/images/gallery'

const items: GalleryItem[] = [
  { type: 'single', src: `${B}/PL00003.webp`, alt: 'Calderon Hondo, Fuerteventura, Spain', w: 3200, h: 2132, fx: 50, fy: 5 },
  { type: 'pair', images: [
    { src: `${B}/PL00012.webp`, alt: 'Tivoli Gardens, Copenhagen', w: 3200, h: 3200, fx: 50, fy: 42 },
    { src: `${B}/PL00004.webp`, alt: 'Amagerstrand, Copenhagen',   w: 3200, h: 3200, fx: 50, fy: 45 },
  ]},
  { type: 'single', src: `${B}/PL00001.webp`, alt: 'Københavns Domhus, Copenhagen', w: 3200, h: 1800, fx: 49, fy: 10 },
  { type: 'single', src: `${B}/PL00007.webp`, alt: 'ARC, Copenhagen',               w: 3200, h: 2400, fx: 40, fy: 50 },
  { type: 'pair', images: [
    { src: `${B}/PL00002.webp`, alt: 'Marmorkirken, Copenhagen',     w: 3200, h: 2133, fx: 50, fy: 40 },
    { src: `${B}/PL00008.webp`, alt: 'Gemini Residence, Copenhagen', w: 3200, h: 2133, fx: 50, fy: 10 },
  ]},
  { type: 'single', src: `${B}/PL00006.webp`, alt: 'The Kelpies, Scotland',         w: 3200, h: 1792, fx: 80, fy: 90 },
  { type: 'single', src: `${B}/PL00011.webp`, alt: 'The Hand, Brisbane, Australia', w: 3200, h: 1800, fx: 60, fy: 55 },
  { type: 'pair', images: [
    // Christiansborg left (lighter), Operæn right (darker) — better tonal balance
    { src: `${B}/PL00014.webp`, alt: 'Christiansborg Palace, Copenhagen',        w: 3200, h: 3200, fx: 55, fy: 22 },
    { src: `${B}/PL00013.webp`, alt: 'Operæn, Det Kongelige Teater, Copenhagen', w: 3200, h: 3200, fx: 35, fy: 65 },
  ]},
  { type: 'single', src: `${B}/PL00015.webp`, alt: 'Notre Dame Cathedral, Paris', w: 3200, h: 1800, fx: 65, fy: 20 },
]

export default function Places() {
  return (
    <main>
      <GalleryStack items={items} />
      <GalleryFooter />
    </main>
  )
}
