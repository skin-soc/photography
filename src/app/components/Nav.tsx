'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/people', label: 'People' },
  { href: '/places', label: 'Places' },
  { href: '/nature', label: 'Nature' },
  { href: '/about',  label: 'About'  },
]

export default function Nav() {
  const pathname = usePathname()

  return (
    // Full-width strip, but inner content constrained — matches Oskar's layout
    <nav className="fixed top-0 left-0 right-0 z-50">
      <div className="max-w-5xl mx-auto flex items-start justify-between px-6 pt-5">
        <Link href="/" className="flex items-start shrink-0">
          <img
            src="/images/logo.svg"
            alt="Gus McEwan Photography"
            className="h-12 w-auto"
            draggable={false}
            style={{
              filter: 'brightness(0) saturate(100%) invert(12%) sepia(74%) saturate(2800%) hue-rotate(340deg) brightness(85%) contrast(110%)',
            }}
          />
        </Link>
        <ul className="flex items-center gap-8 pt-1">
          {links.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`text-[10px] font-light tracking-[0.2em] uppercase transition-colors ${
                    active
                      ? 'text-white border-b border-[#931020] pb-px'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Mobile: collapse links to smaller size */}
      <style>{`
        @media (max-width: 480px) {
          nav ul { gap: 1.25rem; }
          nav ul a { font-size: 8px; letter-spacing: 0.15em; }
          nav img { height: 2.25rem; }
          nav > div { padding-left: 1rem; padding-right: 1rem; padding-top: 1rem; }
        }
      `}</style>
    </nav>
  )
}
