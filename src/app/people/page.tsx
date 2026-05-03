import GalleryStack, { GalleryItem } from '../components/GalleryStack'
import GalleryFooter from '../components/GalleryFooter'

const B = '/images/gallery'

const items: GalleryItem[] = [
  { type: 'single', aspect: 'tall', src: `${B}/PP00012.webp`, alt: 'Skater' },
  { type: 'pair', images: [
    { src: `${B}/PP00001.webp`, alt: 'Jamie' },
    { src: `${B}/PP00010.webp`, alt: 'Alexander Frisch' },
  ]},
  { type: 'single', aspect: 'tall', src: `${B}/PP00005.webp`, alt: 'Bryce Anderville Hixson Jr.' },
  { type: 'single', aspect: 'hero', src: `${B}/PP00004.webp`, alt: 'King Charles III' },
  { type: 'pair', images: [
    { src: `${B}/PP00007.webp`, alt: 'Lolly & Matt' },
    { src: `${B}/PP00006.webp`, alt: 'Drag Queen' },
  ]},
  { type: 'single', aspect: 'hero', src: `${B}/PP00003.webp`, alt: 'Distortion Punter' },
  { type: 'pair', images: [
    { src: `${B}/PP00011.webp`, alt: 'Tom Francis' },
    { src: `${B}/PP00009.webp`, alt: 'Anders Malmgren' },
  ]},
]

export default function People() {
  return (
    <main>
      <GalleryStack items={items} />
      <GalleryFooter />
    </main>
  )
}
