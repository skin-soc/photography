import GalleryStack, { GalleryItem } from '../components/GalleryStack'
import GalleryFooter from '../components/GalleryFooter'

const B = '/images/gallery'

const items: GalleryItem[] = [
  { type: 'single', aspect: 'hero', src: `${B}/NT00001.webp`, alt: 'Nature — Gus McEwan Photography' },
  { type: 'single', aspect: 'mid',  src: `${B}/NT00002.webp`, alt: 'Nature — Gus McEwan Photography' },
  { type: 'pair', images: [
    { src: `${B}/NT00003.webp`, alt: 'Nature — Gus McEwan Photography' },
    { src: `${B}/NT00004.webp`, alt: 'Nature — Gus McEwan Photography' },
  ]},
  { type: 'single', aspect: 'hero', src: `${B}/NT00005.webp`, alt: 'Nature — Gus McEwan Photography' },
  { type: 'single', aspect: 'tall', src: `${B}/NT00006.webp`, alt: 'Nature — Gus McEwan Photography' },
  { type: 'single', aspect: 'hero', src: `${B}/NT00007.webp`, alt: 'Nature — Gus McEwan Photography' },
  { type: 'pair', images: [
    { src: `${B}/NT00008.webp`, alt: 'Nature — Gus McEwan Photography' },
    { src: `${B}/NT00009.webp`, alt: 'Nature — Gus McEwan Photography' },
  ]},
  { type: 'single', aspect: 'mid',  src: `${B}/NT00010.webp`, alt: 'Nature — Gus McEwan Photography' },
  { type: 'single', aspect: 'hero', src: `${B}/NT00011.webp`, alt: 'Nature — Gus McEwan Photography' },
  { type: 'single', aspect: 'mid',  src: `${B}/NT00012.webp`, alt: 'Nature — Gus McEwan Photography' },
]

export default function Nature() {
  return (
    <main>
      <GalleryStack items={items} />
      <GalleryFooter />
    </main>
  )
}
