import GalleryStack, { GalleryItem } from '../components/GalleryStack'
import GalleryFooter from '../components/GalleryFooter'

const B = '/images/gallery'

const items: GalleryItem[] = [
  { type: 'single', aspect: 'wide', src: `${B}/PP00002.webp`, alt: 'Young Solomon Islanders' },
  { type: 'pair', images: [
    { src: `${B}/PP00001.webp`, alt: 'Jamie' },
    { src: `${B}/PP00010.webp`, alt: 'Alexander Frisch' },
  ]},
  { type: 'single', aspect: 'hero', src: `${B}/PP00005.webp`, alt: 'Bryce Anderville Hixson Jr.' },
  { type: 'single', aspect: 'hero', src: `${B}/PP00004.webp`, alt: 'King Charles III' },
  { type: 'pair', images: [
    { src: `${B}/PP00007.webp`, alt: 'Lolly & Matt' },
    { src: `${B}/PP00006.webp`, alt: 'Drag Queen' },
  ]},
  { type: 'single', aspect: 'hero', src: `${B}/PP00003.webp`, alt: 'Distortion Punter' },
  { type: 'pair', images: [
    { src: `${B}/PP00011.webp`, alt: 'Aaron Vogelmann' },
    { src: `${B}/PP00009.webp`, alt: 'Anders Malmgren' },
  ]},
  { type: 'single', aspect: 'hero', src: `${B}/PP00012.webp`, alt: 'Danish Skater' },
]

export default function People() {
  return (
    <main>
      <GalleryStack items={items} />
      <GalleryFooter />
    </main>
  )
}
