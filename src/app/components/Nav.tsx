'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const links = [
  { href: '/people', label: 'People' },
  { href: '/places', label: 'Places' },
  { href: '/nature', label: 'Nature' },
  { href: '/about',  label: 'About'  },
]

export default function Nav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-start justify-between"
        style={{ padding: '3vw 6vw' }}>

        <Link href="/" className="shrink-0" onClick={() => setOpen(false)}>
          <img
            src="/images/logo.svg"
            alt="Gus McEwan Photography"
            draggable={false}
            style={{
              height: '64px',
              width: 'auto',
              filter: 'brightness(0) saturate(100%) invert(12%) sepia(74%) saturate(2800%) hue-rotate(340deg) brightness(85%) contrast(110%)',
            }}
          />
        </Link>

        {/* Desktop links */}
        <ul className="hidden md:flex items-center" style={{ gap: '52px', paddingTop: '16px' }}>
          {links.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`text-[11px] font-light tracking-[0.22em] uppercase transition-colors ${
                    active
                      ? 'text-white border-b border-[#931020] pb-px'
                      : 'text-white hover:border-b hover:border-[#931020] hover:pb-px'
                  }`}
                >
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>

        {/* Mobile hamburger — two bars */}
        <button
          className="md:hidden flex flex-col justify-center gap-[7px] w-8 h-8 shrink-0"
          style={{ paddingTop: '16px' }}
          onClick={() => setOpen(o => !o)}
          aria-label="Menu"
        >
          <span
            className="block h-px bg-white transition-all duration-300 origin-center"
            style={{
              transform: open ? 'translateY(3.5px) rotate(45deg)' : 'none',
              opacity: open ? 1 : 0.7,
            }}
          />
          <span
            className="block h-px bg-white transition-all duration-300 origin-center"
            style={{
              transform: open ? 'translateY(-3.5px) rotate(-45deg)' : 'none',
              opacity: open ? 1 : 0.7,
            }}
          />
        </button>
      </nav>

      {/* Mobile menu overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 flex flex-col items-start justify-center md:hidden"
          style={{ backgroundColor: 'rgba(0,0,0,0.92)', paddingLeft: '60px' }}
          onClick={() => setOpen(false)}
        >
          <ul className="flex flex-col gap-8">
            {links.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="font-serif font-light text-white text-4xl tracking-wide hover:text-white/60 transition-colors"
                  onClick={() => setOpen(false)}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
