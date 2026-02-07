'use client'

import Image from 'next/image'
import { useState, useEffect } from 'react'

export default function Home() {
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Effect to detect theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setIsDarkMode(e.matches);
    };

    // Set initial theme
    setIsDarkMode(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);

    // Cleanup listener on unmount
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return (
    <div className="relative min-h-screen">
      {/* Hero Image */}
      <div className="absolute inset-0">
        <Image
          src={isDarkMode ? '/images/dark.jpg' : '/images/light.jpg'}
          alt="Gus McEwan's architectural photograph"
          fill
          className="object-cover brightness-99 object-left-top md:object-center"
          priority
          sizes="100vw"
          style={{ objectPosition: '21% 0' }}
          quality={100}
          unoptimized={true}
        />
      </div>

      {/* Overlay Content */}
      <div className="relative min-h-screen flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-center">
          <h1 className="text-[15vw] md:text-[12vw] lg:text-[14vw] text-black dark:text-white tracking-[0.2em]">McEWAN</h1>
        </div>
      </div>
    </div>
  )
} 
