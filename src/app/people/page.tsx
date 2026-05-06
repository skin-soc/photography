import GalleryStack, { GalleryItem } from '../components/GalleryStack'
import GalleryFooter from '../components/GalleryFooter'

const B = '/images/gallery'

const items: GalleryItem[] = [
  // Face right-of-centre, eyes ~38% down
  { type: 'single', src: `${B}/PP00004.webp`, alt: 'King Charles III', w: 3200, h: 1800, fx: 80, fy: 45 },
  { type: 'pair', images: [
    // Jamie: face fills left side, eyes ~40% down
    { src: `${B}/PP00001.webp`, alt: 'Jamie',            w: 3200, h: 1800, fx: 30, fy: 40 },
    // Alexander Frisch: strong profile, face left-half, hat pushes subject down slightly
    { src: `${B}/PP00010.webp`, alt: 'Alexander Frisch', w: 3200, h: 1800, fx: 40, fy: 42 },
  ]},
  // Bryce: face nearly fills frame, centred, shaved head — eyes at ~38%
  { type: 'single', src: `${B}/PP00005.webp`, alt: 'Bryce Anderville Hixson Jr.', w: 3200, h: 1959, fx: 46, fy: 10 },
  { type: 'pair', images: [
    // Lolly & Matt: two faces centred, upper portion
    { src: `${B}/PP00007.webp`, alt: 'Lolly & Matt', w: 3200, h: 1800, fx: 50, fy: 35 },
    // Drag Queen: face centred, pink wig pushes mass upward
    { src: `${B}/PP00006.webp`, alt: 'Simon Cravatte',   w: 3200, h: 1800, fx: 50, fy: 30 },
  ]},
  // Distortion Punter: red-haired woman, face upper-left, leaning into frame
  { type: 'single', src: `${B}/PP00003.webp`, alt: 'Distortion Punter', w: 3200, h: 1800, fx: 42, fy: 32 },
  { type: 'pair', images: [
    // Aaron Vogelmann: face centred in square frame, lying in water, eyes ~38%
    { src: `${B}/PP00011.webp`, alt: 'Aaron Vogelmann', w: 3122, h: 3122, fx: 50, fy: 38 },
    // Anders Malmgren: head covering face, centred in square frame
    { src: `${B}/PP00009.webp`, alt: 'Anders Malmgren', w: 3200, h: 3200, fx: 50, fy: 40 },
  ]},
  // Young Solomon Islanders: group of children, faces spread upper-centre
  { type: 'single', src: `${B}/PP00002.webp`, alt: 'Young Solomon Islanders', w: 3200, h: 2133, fx: 50, fy: 42 },
  // Danish Skater: full figure right-of-centre, head at ~30%
  { type: 'single', src: `${B}/PP00012.webp`, alt: 'Danish Skater', w: 3200, h: 2400, fx: 79, fy: 35 },
]

export default function People() {
  return (
    <main>
      <GalleryStack items={items} />
      <GalleryFooter />
    </main>
  )
}
