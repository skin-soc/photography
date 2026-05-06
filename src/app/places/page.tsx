import GalleryStack, { GalleryItem } from '../components/GalleryStack'
import GalleryFooter from '../components/GalleryFooter'

const B = '/images/gallery'

const items: GalleryItem[] = [
  // Calderon Hondo: volcanic cones, red peak dead centre
  { type: 'single', src: `${B}/PL00003.webp`, alt: 'Calderon Hondo, Fuerteventura, Spain', w: 3200, h: 2132, fx: 50, fy: 45 },
  { type: 'pair', images: [
    // Tivoli: arch + TIVOLI sign centred, just above mid-frame
    { src: `${B}/PL00012.webp`, alt: 'Tivoli Gardens, Copenhagen', w: 3200, h: 3200, fx: 50, fy: 42 },
    // Amagerstrand: vanishing point / horizon sits at mid-frame
    { src: `${B}/PL00004.webp`, alt: 'Amagerstrand, Copenhagen',   w: 3200, h: 3200, fx: 50, fy: 45 },
  ]},
  // Domhus: symmetrical illuminated facade, interest is mid-frame
  { type: 'single', src: `${B}/PL00001.webp`, alt: 'Københavns Domhus, Copenhagen', w: 3200, h: 1800, fx: 50, fy: 52 },
  // ARC: chimney + smoke plume upper-right
  { type: 'single', src: `${B}/PL00007.webp`, alt: 'ARC, Copenhagen', w: 3200, h: 2400, fx: 41, fy: 30 },
  { type: 'pair', images: [
    // Marmorkirken: dome centred horizontally, fills upper 75%
    { src: `${B}/PL00002.webp`, alt: 'Marmorkirken, Copenhagen',     w: 3200, h: 2133, fx: 50, fy: 40 },
    // Gemini Residence: wave facade + birds right at the top
    { src: `${B}/PL00008.webp`, alt: 'Gemini Residence, Copenhagen', w: 3200, h: 2133, fx: 50, fy: 25 },
  ]},
  // The Kelpies: both heads in upper half, span full width
  { type: 'single', src: `${B}/PL00006.webp`, alt: 'The Kelpies, Scotland', w: 3200, h: 1792, fx: 20, fy: 30 },
  // The Hand: sculpture slightly left-of-centre, mid-lower frame
  { type: 'single', src: `${B}/PL00011.webp`, alt: 'The Hand, Brisbane, Australia', w: 3200, h: 1800, fx: 65, fy: 55 },
  { type: 'pair', images: [
    // Operæn: diagonal composition, light strips lower-left
    { src: `${B}/PL00013.webp`, alt: 'Operæn, Det Kongelige Teater, Copenhagen', w: 3200, h: 3200, fx: 35, fy: 65 },
    // Christiansborg: building corner drama right-of-centre, upper half
    { src: `${B}/PL00014.webp`, alt: 'Christiansborg Palace, Copenhagen',        w: 3200, h: 3200, fx: 55, fy: 42 },
  ]},
  // Notre Dame: spire + cathedral mass right-of-centre; seated figure lower-left adds foreground
  { type: 'single', src: `${B}/PL00015.webp`, alt: 'Notre Dame Cathedral, Paris', w: 3200, h: 1800, fx: 60, fy: 40 },
]

export default function Places() {
  return (
    <main>
      <GalleryStack items={items} />
      <GalleryFooter />
    </main>
  )
}