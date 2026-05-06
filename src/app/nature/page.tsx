import GalleryStack, { GalleryItem } from '../components/GalleryStack'
import GalleryFooter from '../components/GalleryFooter'

const B = '/images/gallery'

const items: GalleryItem[] = [
  // Gull dead-centre horizontally, body in upper third
  { type: 'single', src: `${B}/NT00002.webp`, alt: 'Australian Gull', w: 3200, h: 1800, fx: 52, fy: 30 },
  // Caracal: face upper-left quadrant, eyes at ~38%
  { type: 'single', src: `${B}/NT00011.webp`, alt: 'Persian Lynx', w: 3200, h: 1800, fx: 35, fy: 38 },
  { type: 'pair', images: [
    // Baby elephant: body/head bottom-left, centre of mass ~65% down
    { src: `${B}/NT00001.webp`, alt: 'Baby African Elephant', w: 3200, h: 3200, fx: 35, fy: 65 },
    // Polar bear: head fills most of frame, slightly left of centre
    { src: `${B}/NT00008.webp`, alt: 'Polar Bear',            w: 1643, h: 1643, fx: 40, fy: 50 },
  ]},
  // Swan: bird upper-right, head at ~33% down, body trailing right
  { type: 'single', src: `${B}/NT00004.webp`, alt: 'King Swan', w: 3200, h: 1800, fx: 55, fy: 33 },
  // Fisherman: tiny figure very low, just right of centre
  { type: 'single', src: `${B}/NT00012.webp`, alt: 'COVID Fisherman', w: 6000, h: 3375, fx: 52, fy: 78 },
  // Stag: half-buried in grass, centre-right, mid-lower frame
  { type: 'single', src: `${B}/NT00007.webp`, alt: 'Royal King Stag', w: 3200, h: 1800, fx: 50, fy: 57 },
]

export default function Nature() {
  return (
    <main>
      <GalleryStack items={items} />
      <GalleryFooter />
    </main>
  )
}