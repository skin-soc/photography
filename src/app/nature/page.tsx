import GalleryStack, { GalleryItem } from '../components/GalleryStack'
import GalleryFooter from '../components/GalleryFooter'

const B = '/images/gallery'

const items: GalleryItem[] = [
  { type: 'single', src: `${B}/NT00002.webp`, alt: 'Australian Gull', w: 3600, h: 2025 },
  { type: 'single', src: `${B}/NT00011.webp`, alt: 'Persian Lynx',    w: 3556, h: 2001 },
  { type: 'pair', images: [
    { src: `${B}/NT00001.webp`, alt: 'Baby African Elephant', w: 3200, h: 3200 },
    { src: `${B}/NT00008.webp`, alt: 'Polar Bear',            w: 3600, h: 2027 },
  ]},
  { type: 'single', src: `${B}/NT00004.webp`, alt: 'King Swan',        w: 4000, h: 2250 },
  { type: 'single', src: `${B}/NT00012.webp`, alt: 'COVID Fisherman',  w: 5376, h: 3024 },
  { type: 'single', src: `${B}/NT00007.webp`, alt: 'Royal King Stag',  w: 4455, h: 2506 },
]

export default function Nature() {
  return (
    <main>
      <GalleryStack items={items} />
      <GalleryFooter />
    </main>
  )
}
