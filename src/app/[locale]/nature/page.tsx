import { setRequestLocale } from 'next-intl/server'
import GalleryStack, { GalleryItem } from '../../components/GalleryStack'
import GalleryFooter from '../../components/GalleryFooter'

const B = '/images/gallery'

const items: GalleryItem[] = [
  // Caracal as opener — more unexpected than the gull (which leads the homepage)
  { type: 'single', src: `${B}/NT00011.webp`, alt: 'Persian Lynx',    w: 3200, h: 1800, fx: 35, fy: 50 },
  { type: 'single', src: `${B}/NT00002.webp`, alt: 'Australian Gull', w: 3200, h: 1800, fx: 51, fy: 30 },
  { type: 'pair', images: [
    { src: `${B}/NT00001.webp`, alt: 'Baby African Elephant', w: 3200, h: 3200, fx: 35, fy: 65 },
    { src: `${B}/NT00008.webp`, alt: 'Polar Bear',            w: 1643, h: 1643, fx: 40, fy: 50 },
  ]},
  { type: 'single', src: `${B}/NT00004.webp`, alt: 'King Swan',       w: 3200, h: 1800, fx: 50, fy: 33 },
  { type: 'single', src: `${B}/NT00012.webp`, alt: 'COVID Fisherman', w: 6000, h: 3375, fx: 50, fy: 99 },
  { type: 'single', src: `${B}/NT00007.webp`, alt: 'Royal King Stag', w: 3200, h: 1800, fx: 45, fy: 57 },
]

export default async function Nature({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  return (
    <main>
      <GalleryStack items={items} />
      <GalleryFooter />
    </main>
  )
}
