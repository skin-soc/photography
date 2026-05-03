import GalleryStack, { GalleryItem } from '../components/GalleryStack'
import GalleryFooter from '../components/GalleryFooter'

const B = '/images/gallery'

const items: GalleryItem[] = [
  { type: 'single', aspect: 'hero', src: `${B}/PP00001.webp`, alt: 'People — Gus McEwan Photography' },
  { type: 'pair', images: [
    { src: `${B}/PP00002.webp`, alt: 'People — Gus McEwan Photography' },
    { src: `${B}/PP00003.webp`, alt: 'People — Gus McEwan Photography' },
  ]},
  { type: 'single', aspect: 'tall', src: `${B}/PP00004.webp`, alt: 'People — Gus McEwan Photography' },
  { type: 'single', aspect: 'hero', src: `${B}/PP00005.webp`, alt: 'People — Gus McEwan Photography' },
  { type: 'pair', images: [
    { src: `${B}/PP00006.webp`, alt: 'People — Gus McEwan Photography' },
    { src: `${B}/PP00007.webp`, alt: 'People — Gus McEwan Photography' },
  ]},
  { type: 'single', aspect: 'tall', src: `${B}/PP00008.webp`, alt: 'People — Gus McEwan Photography' },
  { type: 'pair', images: [
    { src: `${B}/PP00009.webp`, alt: 'People — Gus McEwan Photography' },
    { src: `${B}/PP00010.webp`, alt: 'People — Gus McEwan Photography' },
  ]},
  { type: 'single', aspect: 'hero', src: `${B}/PP00011.webp`, alt: 'People — Gus McEwan Photography' },
  { type: 'single', aspect: 'mid',  src: `${B}/PP00012.webp`, alt: 'People — Gus McEwan Photography' },
]

export default function People() {
  return (
    <main>
      <GalleryStack items={items} />
      <GalleryFooter />
    </main>
  )
}
