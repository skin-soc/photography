'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

export default function Navigation() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <nav id="main-nav" className={`fixed w-full z-50 transition-colors duration-300 ${isMenuOpen ? 'border-b border-white/20' : ''}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex-shrink-0">
            <Link href="/" className="block w-12 h-12 md:w-16 md:h-16">
              <Image
                src="/images/logo.svg"
                alt="Gus McEwan Photography"
                width={64}
                height={64}
                className="w-full h-full text-white"
              />
            </Link>
          </div>
          {/* Desktop Menu */}
          <div className="hidden md:block">
            <div className="ml-10 flex items-baseline space-x-8">
              <Link href="/portfolio" className="text-black dark:text-white hover:text-[#931020] px-3 py-2 text-sm">Portfolio</Link>
              <Link href="/about" className="text-black dark:text-white hover:text-[#931020] px-3 py-2 text-sm">About</Link>
              <Link href="/contact" className="text-black dark:text-white hover:text-[#931020] px-3 py-2 text-sm">Contact</Link>
            </div>
          </div>
          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-white p-2"
              aria-label="Toggle menu"
            >
              {!isMenuOpen ? (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              ) : (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <div className={`md:hidden transition-all duration-300 ease-in-out ${isMenuOpen ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
        <div className="px-2 pt-2 pb-3 space-y-1 bg-black/90 backdrop-blur-sm">
          <Link
            href="/portfolio"
            className="text-white hover:text-[#931020] block px-3 py-2 text-base"
            onClick={() => setIsMenuOpen(false)}
          >
            Portfolio
          </Link>
          <Link
            href="/about"
            className="text-white hover:text-[#931020] block px-3 py-2 text-base"
            onClick={() => setIsMenuOpen(false)}
          >
            About
          </Link>
          <Link
            href="/contact"
            className="text-white hover:text-[#931020] block px-3 py-2 text-base"
            onClick={() => setIsMenuOpen(false)}
          >
            Contact
          </Link>
        </div>
      </div>
    </nav>
  )
} 