'use client'

export default function Home() {
  return (
    <div className="relative min-h-screen min-h-[100dvh] isolate">
      {/* Hero Image */}
      <div className="absolute inset-0 hero-image-container">
        <picture>
          <source srcSet="/images/dark.webp" type="image/webp" />
          <img
            src="/images/dark.jpg"
            alt="Gus McEwan's sports photograph"
            loading="eager"
            className="object-cover object-top w-full h-full landscape-position"
          />
        </picture>
      </div>

      {/* Overlay Content */}
      <div className="relative min-h-screen flex flex-col items-center justify-center">
  <div className="w-full flex justify-center">
    <h1 
  className="text-[15vw] md:text-[12vw] lg:text-[14vw] tracking-[0.2em] md:tracking-[0.3em] font-bold md:font-medium text-black mix-blend-overlay"
  style={{ marginRight: '-0.3em' }}
>
  McEWAN
</h1>
  </div>
</div>

      {/* Copyright overlay */}
      <div className="absolute bottom-0 left-0 right-0 pb-4 sm:pb-6">
        <p className="text-center text-xs sm:text-sm text-[#1a1208] opacity-90" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
          Copyright © {new Date().getFullYear()} Gus McEwan Photography. All rights reserved.
        </p>
      </div>
    </div>
  )
}
