import GalleryStack, { GalleryItem } from '../components/GalleryStack'
import GalleryFooter from '../components/GalleryFooter'

const B = '/images/gallery'

const items: GalleryItem[] = [
  { type: 'single', src: `${B}/NT00002.webp`, alt: 'Australian Gull', w: 3200, h: 1800 },
  { type: 'single', src: `${B}/NT00011.webp`, alt: 'Persian Lynx',    w: 3200, h: 1800 },
  { type: 'pair', images: [
    { src: `${B}/NT00001.webp`, alt: 'Baby African Elephant', w: 3200, h: 3200 },
    { src: `${B}/NT00008.webp`, alt: 'Polar Bear',            w: 1643, h: 1643 },
  ]},
  { type: 'single', src: `${B}/NT00004.webp`, alt: 'King Swan',        w: 3200, h: 1800 },
  { type: 'single', src: `${B}/NT00012.webp`, alt: 'COVID Fisherman',  w: 3200, h: 1800 },
  { type: 'single', src: `${B}/NT00007.webp`, alt: 'Royal King Stag',  w: 3200, h: 1800 },
]

export default function Nature() {
  return (
    <main>
      <GalleryStack items={items} />
      <GalleryFooter />
    </main>
  )
}
