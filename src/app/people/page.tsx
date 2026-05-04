import GalleryStack, { GalleryItem } from '../components/GalleryStack'
import GalleryFooter from '../components/GalleryFooter'

const B = '/images/gallery'

const items: GalleryItem[] = [
  { type: 'single', src: `${B}/PP00004.webp`, alt: 'King Charles III', w: 3598, h: 2024 },
  { type: 'pair', images: [
    { src: `${B}/PP00001.webp`, alt: 'Jamie',            w: 4800, h: 2700 },
    { src: `${B}/PP00010.webp`, alt: 'Alexander Frisch', w: 4950, h: 2784 },
  ]},
  { type: 'single', src: `${B}/PP00005.webp`, alt: 'Bryce Anderville Hixson Jr.', w: 3200, h: 2133 },
  { type: 'pair', images: [
    { src: `${B}/PP00007.webp`, alt: 'Lolly & Matt', w: 3690, h: 2076 },
    { src: `${B}/PP00006.webp`, alt: 'Drag Queen',   w: 4660, h: 2621 },
  ]},
  { type: 'single', src: `${B}/PP00003.webp`, alt: 'Distortion Punter', w: 4613, h: 2595 },
  { type: 'pair', images: [
    { src: `${B}/PP00011.webp`, alt: 'Aaron Vogelmann', w: 3122, h: 3122 },
    { src: `${B}/PP00009.webp`, alt: 'Anders Malmgren', w: 3200, h: 2133 },
  ]},
  { type: 'single', src: `${B}/PP00002.webp`, alt: 'Young Solomon Islanders', w: 4031, h: 2687 },
  { type: 'single', src: `${B}/PP00012.webp`, alt: 'Danish Skater',           w: 3200, h: 2400 },
]

export default function People() {
  return (
    <main>
      <GalleryStack items={items} />
      <GalleryFooter />
    </main>
  )
}
