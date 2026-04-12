'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'

const categories = ['All', 'Nature', 'People', 'Places']

type GalleryImage = {
  src: string
  alt: string
  category: string
  title: string
}

const images: GalleryImage[] = [
  { src: '/images/gallery/PL00001.jpg', alt: 'Danish Supreme Court', category: 'Places', title: 'Københavns Domhus' },
  { src: '/images/gallery/PL00002.jpg', alt: 'Copenhagen Marble Church - Marmorkirken (infrared)', category: 'Places', title: 'Marmorkirken' },
  { src: '/images/gallery/PL00003.jpg', alt: 'Volcano in Fuerteventura, Spain', category: 'Places', title: 'Calderon Hondo' },
  { src: '/images/gallery/PL00006.jpg', alt: 'The Kelpies, Falkirk, Scotland', category: 'Places', title: 'The Kelpies' },
  { src: '/images/gallery/PL00007.jpg', alt: 'Copenhagen Ski and Inceneration Plant', category: 'Places', title: 'ARC' },
  { src: '/images/gallery/PL00008.jpg', alt: 'Copenhagen Gemini Residence', category: 'Places', title: 'Gemini' },
  { src: '/images/gallery/PP00005.jpg', alt: 'Bryce Anderville Hixson Jr.', category: 'People', title: 'Bryce' },
  { src: '/images/gallery/PP00007.jpg', alt: 'Torquay Drag Queens', category: 'People', title: 'Matt' },
  { src: '/images/gallery/PP00004.jpg', alt: 'His Majesty King Charles III', category: 'People', title: 'Charles III' },
  { src: '/images/gallery/PP00002.jpg', alt: 'Rhys Wells', category: 'People', title: 'Rhys' },
  { src: '/images/gallery/PP00003.jpg', alt: 'A punter dances at Distortion in Copenhagen, Denmark', category: 'People', title: 'Amelie' },
  { src: '/images/gallery/PP00001.jpg', alt: 'English waterpolo player', category: 'People', title: 'Jamie' },
  { src: '/images/gallery/NT00011.jpg', alt: 'Persian Lynx', category: 'Nature', title: 'Persiam Lynx' },
  { src: '/images/gallery/NT00012.jpg', alt: 'A lone fisherman during the 2020 COVID pandemic', category: 'Nature', title: 'COVID' },
  { src: '/images/gallery/NT00002.jpg', alt: 'An Australian seagull', category: 'Nature', title: 'Surfer Gull' },
  { src: '/images/gallery/NT00005.jpg', alt: 'Blackhead gull on a frozen lake', category: 'Nature', title: 'Blackhead Freezer' },
  { src: '/images/gallery/NT00007.jpg', alt: 'Royal stag morning mating call', category: 'Nature', title: 'Royal Stag' },
  { src: '/images/gallery/NT00004.jpg', alt: 'Swan in Copenhagen Lakes', category: 'Nature', title: 'Swanset' },
]

if (process.env.NODE_ENV === 'development') {
  if (images.length === 0) {
    for (let i = 1; i <= 9; i++) {
      images.push({
        src: `https://picsum.photos/800/1200?random=${i}`,
        alt: `Sample Photo ${i}`,
        category: categories[Math.floor((i - 1) / 3) + 1],
        title: `Sample Photo ${i}`
      })
    }
  }
}

export default function Portfolio() {
  const [activeCategory, setActiveCategory] = useState('All')
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null)
  const lightboxRef = useRef<HTMLDivElement>(null)

  const filteredImages = images.filter(
    img => activeCategory === 'All' || img.category === activeCategory
  )

  const getWebPSrc = (src: string) => src.replace(/\.\w+$/, '.webp')

  const openLightbox = (image: GalleryImage) => {
    setSelectedImage(image)
    setTimeout(() => {
      if (lightboxRef.current && document.fullscreenEnabled) {
        lightboxRef.current.requestFullscreen().catch(() => {})
      }
    }, 50)
  }

  const closeLightbox = () => {
    setSelectedImage(null)
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    }
  }

  return (
    <>
      <div className="min-h-screen bg-black py-32">
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
                    : 'bg-gray-800 text-white hover:bg-[#931020] hover:text-white shadow-sm'
                  }`}
              >
                {category}
              </button>
            ))}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredImages.map((image, i) => (
              <div key={i} className="relative group cursor-pointer bg-gray-800 rounded-lg overflow-hidden shadow-md">
                <div className="relative aspect-[3/4]">
                  <picture>
                    <source srcSet={getWebPSrc(image.src)} type="image/webp" />
                    <Image
                      src={image.src}
                      alt={image.alt}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                      loading="lazy"
                      unoptimized={true}
                    />
                  </picture>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-300"></div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <button
                      onClick={() => openLightbox(image)}
                      className="bg-[#931020] text-white px-6 py-3 rounded-md text-sm font-medium hover:bg-[#931020]/90 shadow-lg transform transition-transform duration-200 hover:scale-105"
                    >
                      View Full Size
                    </button>
                  </div>
                </div>
                <div className="p-4 bg-gray-900">
                  <h3 className="text-lg font-medium text-white">{image.title}</h3>
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
          ref={lightboxRef}
          className="fixed inset-0 bg-black z-50 flex items-center justify-center p-6 sm:p-10"
          onClick={closeLightbox}
        >
          <div
            className="relative flex items-center justify-center"
            style={{ maxWidth: '90vw', maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Prev arrow */}
            {filteredImages.indexOf(selectedImage) > 0 && (
              <button
                onClick={() => setSelectedImage(filteredImages[filteredImages.indexOf(selectedImage) - 1])}
                className="absolute -left-10 sm:-left-14 text-[#931020] hover:text-[#931020]/70 transition-colors"
                aria-label="Previous image"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}

            {/* Gallery-style white mat */}
            <div className="bg-white p-3 sm:p-5 shadow-2xl">
              <picture>
                <source srcSet={getWebPSrc(selectedImage.src)} type="image/webp" />
                <img
                  src={selectedImage.src}
                  alt={selectedImage.alt}
                  style={{
                    maxWidth: '80vw',
                    maxHeight: '80vh',
                    width: 'auto',
                    height: 'auto',
                    display: 'block',
                  }}
                />
              </picture>
            </div>

            {/* Next arrow */}
            {filteredImages.indexOf(selectedImage) < filteredImages.length - 1 && (
              <button
                onClick={() => setSelectedImage(filteredImages[filteredImages.indexOf(selectedImage) + 1])}
                className="absolute -right-10 sm:-right-14 text-[#931020] hover:text-[#931020]/70 transition-colors"
                aria-label="Next image"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}

            {/* Close button */}
            <button
              onClick={closeLightbox}
              className="absolute -top-4 -right-4 text-white hover:text-[#931020] p-2 bg-black rounded-full shadow-lg"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Caption */}
            <div className="absolute -bottom-8 left-0 right-0 text-center">
              <span className="text-white text-sm opacity-70">{selectedImage.title}</span>
              <span className="text-[#931020] text-sm font-medium"> · {selectedImage.category}</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
