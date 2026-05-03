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
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-start justify-between p-5">

      {/* Logo — top-left, large, close to corner */}
      <Link href="/" className="shrink-0">
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

      {/* Nav links — top-right, small caps, close to corner */}
      <ul className="flex items-center gap-9 pt-2">
        {links.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <li key={href}>
              <Link
                href={href}
                className={`text-[11px] font-light tracking-[0.22em] uppercase transition-colors ${
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
    </nav>
  )
}
