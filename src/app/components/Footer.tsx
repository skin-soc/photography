'use client'

import { usePathname } from 'next/navigation'

export default function Footer() {
  const pathname = usePathname()

  if (pathname === '/') return null

  return (
    <footer className="border-t border-white py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-2">
          <p className="text-white text-sm md:text-base">
            Copyright © {new Date().getFullYear()} Gus McEwan Photography. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
