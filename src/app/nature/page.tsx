import GalleryStack, { GalleryItem } from '../components/GalleryStack'
import GalleryFooter from '../components/GalleryFooter'

const B = '/images/gallery'

const items: GalleryItem[] = [
  { type: 'single', aspect: 'hero', src: `${B}/NT00001.jpg`, alt: 'Nature — Gus McEwan Photography' },
  { type: 'single', aspect: 'mid',  src: `${B}/NT00002.jpg`, alt: 'Nature — Gus McEwan Photography' },
  { type: 'pair', images: [
    { src: `${B}/NT00003.jpg`, alt: 'Nature — Gus McEwan Photography' },
    { src: `${B}/NT00004.jpg`, alt: 'Nature — Gus McEwan Photography' },
  ]},
  { type: 'single', aspect: 'hero', src: `${B}/NT00005.jpg`, alt: 'Nature — Gus McEwan Photography' },
  { type: 'single', aspect: 'tall', src: `${B}/NT00006.jpg`, alt: 'Nature — Gus McEwan Photography' },
  { type: 'single', aspect: 'hero', src: `${B}/NT00007.jpg`, alt: 'Nature — Gus McEwan Photography' },
  { type: 'pair', images: [
    { src: `${B}/NT00008.jpg`, alt: 'Nature — Gus McEwan Photography' },
    { src: `${B}/NT00009.jpg`, alt: 'Nature — Gus McEwan Photography' },
  ]},
  { type: 'single', aspect: 'mid',  src: `${B}/NT00010.jpg`, alt: 'Nature — Gus McEwan Photography' },
  { type: 'single', aspect: 'hero', src: `${B}/NT00011.jpg`, alt: 'Nature — Gus McEwan Photography' },
  { type: 'single', aspect: 'mid',  src: `${B}/NT00012.jpg`, alt: 'Nature — Gus McEwan Photography' },
]

export default function Nature() {
  return (
    <main className="pb-10">
      <GalleryStack items={items} />
      <GalleryFooter />
    </main>
  )
}
