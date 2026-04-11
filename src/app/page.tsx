'use client'

import { useState, useEffect } from 'react'

export default function Home() {
  const [isDarkMode, setIsDarkMode] = useState(true);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setIsDarkMode(e.matches);
    };

    setIsDarkMode(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return (
    <div className="relative min-h-screen">
      {/* Hero Image */}
      <div className="absolute inset-0">
        <picture>
          <source srcSet={isDarkMode ? '/images/dark.webp' : '/images/light.webp'} type="image/webp" />
          <img
            src={isDarkMode ? '/images/dark.jpg' : '/images/light.jpg'}
            alt="Gus McEwan's photograph"
            loading="eager"
            className="object-cover brightness-99 object-left-top md:object-center w-full h-full"
            style={{ objectPosition: '21% 0' }}
          />
        </picture>
      </div>

      {/* Overlay Content */}
      <div className="relative min-h-screen flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-center">
          <h1
            className="text-[15vw] md:text-[12vw] lg:text-[14vw] text-black dark:text-white tracking-[0.2em]"
            style={{
              WebkitTextStroke: isDarkMode ? '1px black' : '1px white',
            }}
          >
            McEWAN
          </h1>
        </div>
      </div>
    </div>
  )
}
