import GalleryStack, { GalleryItem } from '../components/GalleryStack'
import GalleryFooter from '../components/GalleryFooter'

const B = '/images/gallery'

const items: GalleryItem[] = [
  { type: 'single', aspect: 'hero', src: `${B}/PP00001.jpg`, alt: 'People — Gus McEwan Photography' },
  { type: 'pair', images: [
    { src: `${B}/PP00002.jpg`, alt: 'People — Gus McEwan Photography' },
    { src: `${B}/PP00003.jpg`, alt: 'People — Gus McEwan Photography' },
  ]},
  { type: 'single', aspect: 'tall', src: `${B}/PP00004.jpg`, alt: 'People — Gus McEwan Photography' },
  { type: 'single', aspect: 'hero', src: `${B}/PP00005.jpg`, alt: 'People — Gus McEwan Photography' },
  { type: 'pair', images: [
    { src: `${B}/PP00006.jpg`, alt: 'People — Gus McEwan Photography' },
    { src: `${B}/PP00007.jpg`, alt: 'People — Gus McEwan Photography' },
  ]},
  { type: 'single', aspect: 'tall', src: `${B}/PP00008.jpg`, alt: 'People — Gus McEwan Photography' },
  { type: 'pair', images: [
    { src: `${B}/PP00009.jpg`, alt: 'People — Gus McEwan Photography' },
    { src: `${B}/PP00010.jpg`, alt: 'People — Gus McEwan Photography' },
  ]},
  { type: 'single', aspect: 'hero', src: `${B}/PP00011.jpg`, alt: 'People — Gus McEwan Photography' },
  { type: 'single', aspect: 'mid',  src: `${B}/PP00012.jpg`, alt: 'People — Gus McEwan Photography' },
]

export default function People() {
  return (
    <main>
      <GalleryStack items={items} />
      <GalleryFooter />
    </main>
  )
}
