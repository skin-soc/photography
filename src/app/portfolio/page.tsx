'use client'
import { useState } from 'react'
import Image from 'next/image'
const categories = ['All', 'Nature', 'People', 'Places']
// Add your images here
type GalleryImage = {
  src: string
  alt: string
  category: string
  title: string
}
// Using placeholder images until you add your own
const images: GalleryImage[] = [
  {
    src: '/images/gallery/PL00001.jpg',
    alt: 'Danish Supreme Court',
    category: 'Places',
    title: 'Københavns Domhus'
  },
  {
    src: '/images/gallery/PL00002.jpg',
    alt: 'Copenhagen Tivoli Gardens',
    category: 'Places',
    title: 'Tivoli'
  },
  {
    src: '/images/gallery/PL00003.jpg',
    alt: 'Volcano in Fuerteventura, Spain',
    category: 'Places',
    title: 'Calderon Hondo'
  },
  {
    src: '/images/gallery/PL00006.jpg',
    alt: 'The Kelpies, Falkirk, Scotland',
    category: 'Places',
    title: 'The Kelpies'
  },
  {
    src: '/images/gallery/PL00007.jpg',
    alt: 'Copenhagen Ski and Inceneration Plant',
    category: 'Places',
    title: 'ARC'
  },
  {
    src: '/images/gallery/PL00008.jpg',
    alt: 'Copenhagen Gemini Residence',
    category: 'Places',
    title: 'Gemini'
  },
  {
    src: '/images/gallery/PP00005.jpg',
    alt: 'Bryce Anderville Hixson Jr.',
    category: 'People',
    title: 'Bryce'
  },
  {
    src: '/images/gallery/PP00007.jpg',
    alt: 'Torquay Drag Queens',
    category: 'People',
    title: 'Matt'
  },
  {
    src: '/images/gallery/PP00004.jpg',
    alt: 'His Majesty King Charles III',
    category: 'People',
    title: 'Charles III'
  },
  {
    src: '/images/gallery/PP00002.jpg',
    alt: 'Rhys Wells',
    category: 'People',
    title: 'Rhys'
  },
  {
    src: '/images/gallery/PP00003.jpg',
    alt: 'A punter dances at Distortion in Copenhagen, Denmark',
    category: 'People',
    title: 'Amelie'
  },
  {
    src: '/images/gallery/PP00001.jpg',
    alt: 'English waterpolo player',
    category: 'People',
    title: 'Jamie'
  },
  {
    src: '/images/gallery/NT00011.jpg',
    alt: 'Persian Lynx',
    category: 'Nature',
    title: 'Persiam Lynx'
  },
  {
    src: '/images/gallery/NT00012.jpg',
    alt: 'A lone fisherman during the 2019 COVID pandemic',
    category: 'Nature',
    title: 'COVID Fishing'
  },
  {
    src: '/images/gallery/NT00002.jpg',
    alt: 'An Australian seagull',
    category: 'Nature',
    title: 'Surfer Gull'
  },
  {
    src: '/images/gallery/NT00005.jpg',
    alt: 'Blackhead gull on a frozen lake',
    category: 'Nature',
    title: 'Blackhead Freezer'
  },
  {
    src: '/images/gallery/NT00007.jpg',
    alt: 'Royal stag morning mating call',
    category: 'Nature',
    title: 'Royal Stag'
  },
  {
    src: '/images/gallery/NT00004.jpg',
    alt: 'Swan in Copenhagen Lakes',
    category: 'Nature',
    title: 'Swanset'
  }
]
// Add placeholder images for development
if (process.env.NODE_ENV === 'development') {
  // Generate placeholder images if no real images exist
  if (images.length === 0) {
    for (let i = 1; i <= 9; i++) {
      images.push({
        src: `https://picsum.photos/800/1200?random=${i}`,
        alt: `Sample Photo ${i}`,
        category: categories[Math.floor((i-1) / 3) + 1],
        title: `Sample Photo ${i}`
      })
    }
  }
}
export default function Portfolio() {
  const [activeCategory, setActiveCategory] = useState('All')
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null)
  const filteredImages = images.filter(
    img => activeCategory === 'All' || img.category === activeCategory
  )
  // Helper to get WebP src (assumes .webp exists alongside .jpg)
  const getWebPSrc = (src: string) => src.replace(/\.\w+$/, '.webp')
  return (
    <>
      <div className="min-h-screen bg-white dark:bg-black py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Category Filter */}
          <div className="flex justify-center space-x-4 mb-12">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors
                  ${activeCategory === category
                    ? 'bg-[#931020] text-white shadow-md'
                    : 'bg-gray-100 dark:bg-gray-800 text-black dark:text-white hover:bg-[#931020] hover:text-white dark:hover:bg-[#931020] shadow-sm'
                  }`}
              >
                {category}
              </button>
            ))}
          </div>
          {/* Masonry Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredImages.map((image, i) => (
              <div key={i} className="relative group cursor-pointer bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden shadow-md">
                <div className="relative aspect-[3/4]">
                  <picture>
                    <source srcSet={getWebPSrc(image.src)} type="image/webp" />
                    <Image
                      src={image.src}
                      alt={image.alt}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                      loading="lazy" // Explicit for clarity
                      unoptimized={true} // Per-component if needed, but global config handles it
                    />
                  </picture>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-300"></div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <button onClick={() => setSelectedImage(image)} className="bg-[#931020] text-white px-6 py-3 rounded-md text-sm font-medium hover:bg-[#931020]/90 shadow-lg transform transition-transform duration-200 hover:scale-105">
                      View Full Size
                    </button>
                  </div>
                </div>
                <div className="p-4 bg-white dark:bg-gray-900">
                  <h3 className="text-lg font-medium text-black dark:text-white">{image.title}</h3>
                  <p className="text-[#931020] font-medium">{image.category}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Lightbox Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative flex items-center justify-center w-full h-full">
            <picture>
              <source srcSet={getWebPSrc(selectedImage.src)} type="image/webp" />
              <Image
                src={selectedImage.src}
                alt={selectedImage.alt}
                width={0}  // Realistic placeholder for large images
                height={0}  // Adjust based on common aspect ratio
                className="w-auto h-auto max-w-full max-h-full object-contain"
                sizes="100vh"
                unoptimized={true}
              />
            </picture>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setSelectedImage(null)
              }}
              className="absolute top-4 right-4 text-white hover:text-[#931020] p-2 bg-black/50 rounded-full"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="absolute bottom-4 left-4 text-white bg-black/50 p-4 rounded-lg">
              <h3 className="text-xl font-medium text-black dark:text-white">{selectedImage.title}</h3>
              <p className="text-[#931020] font-medium">{selectedImage.category}</p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
