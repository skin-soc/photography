import GalleryStack, { GalleryItem } from '../components/GalleryStack'
import GalleryFooter from '../components/GalleryFooter'

const B = '/images/gallery'

const items: GalleryItem[] = [
  { type: 'single', aspect: 'hero', src: `${B}/NT00002.webp`, alt: 'Australian Gull' },
  { type: 'single', aspect: 'mid',  src: `${B}/NT00011.webp`, alt: 'Persian Lynx' },
  { type: 'pair', images: [
    { src: `${B}/NT00001.webp`, alt: 'Baby African Elephant' },
    { src: `${B}/NT00008.webp`, alt: 'Polar Bear' },
  ]},
  { type: 'single', aspect: 'hero', src: `${B}/NT00004.webp`, alt: 'King Swan' },
  { type: 'single', aspect: 'tall', src: `${B}/NT00012.webp`, alt: 'COVID Fisherman' },
  { type: 'single', aspect: 'hero', src: `${B}/NT00007.webp`, alt: 'Royal King Stag' },
]

export default function Nature() {
  return (
    <main>
      <GalleryStack items={items} />
      <GalleryFooter />
    </main>
  )
}
