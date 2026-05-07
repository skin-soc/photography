'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import LocaleSwitcher from './LocaleSwitcher'

const linkHrefs = ['/people', '/places', '/nature', '/about'] as const
type NavKey = 'people' | 'places' | 'nature' | 'about'

export default function Nav() {
  const t = useTranslations('nav')
  const pathname = usePathname()
  // Restore mobile-menu state across locale-switch remounts. LocaleSwitcher
  // writes a timestamp to sessionStorage right before it triggers a router
  // transition; if we mount within 2s of that, the menu opens on first paint
  // (no flash of the page underneath).
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return false
    const ts = sessionStorage.getItem('preserveMobileMenu')
    if (ts && Date.now() - parseInt(ts, 10) < 2000) {
      sessionStorage.removeItem('preserveMobileMenu')
      return true
    }
    return false
  })

  const links = linkHrefs.map((href) => ({
    href,
    label: t(href.slice(1) as NavKey),
  }))

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between"
        style={{ padding: '3vw 6vw' }}
      >
        <Link href="/" className="shrink-0" onClick={() => setOpen(false)}>
          <img
            src="/images/logo.svg"
            alt="Gus McEwan Photography"
            draggable={false}
            style={{
              height: '64px',
              width: 'auto',
              filter:
                'brightness(0) saturate(100%) invert(12%) sepia(74%) saturate(2800%) hue-rotate(340deg) brightness(85%) contrast(110%) drop-shadow(0 1px 2px rgba(0,0,0,0.2))',
            }}
          />
        </Link>

        {/* Desktop links */}
        <ul
          className="hidden md:flex items-center"
          style={{ gap: '52px' }}
        >
          {links.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`relative text-[11px] font-light tracking-[0.22em] uppercase text-white pb-[6px] transition-colors after:content-[''] after:absolute after:left-0 after:bottom-0 after:h-[2px] after:w-[calc(100%_-_0.22em)] after:transition-colors ${
                    active
                      ? 'after:bg-[#931020]'
                      : 'after:bg-transparent hover:after:bg-[#931020]'
                  }`}
                  style={{
                    textShadow:
                      '0 1px 0 rgba(0,0,0,1), 0 1px 1px rgba(0,0,0,0.95), 0 2px 2px rgba(0,0,0,0.75)',
                  }}
                >
                  {label}
                </Link>
              </li>
            )
          })}
          <li>
            <LocaleSwitcher />
          </li>
        </ul>

        {/* Mobile hamburger — two bars */}
        <button
          className="md:hidden flex flex-col justify-center gap-[7px] w-8 h-8 shrink-0"
          onClick={() => setOpen((o) => !o)}
          aria-label={t('menu')}
        >
          <span
            className="block h-px bg-white transition-all duration-300 origin-center shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
            style={{
              transform: open ? 'translateY(3.5px) rotate(45deg)' : 'none',
              opacity: open ? 1 : 0.7,
            }}
          />
          <span
            className="block h-px bg-white transition-all duration-300 origin-center shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
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
            {links.map(({ href, label }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className={`relative inline-block font-light text-white text-4xl tracking-[0.22em] uppercase pb-[10px] transition-colors after:content-[''] after:absolute after:left-0 after:bottom-0 after:h-[2px] after:w-[calc(100%_-_0.22em)] after:transition-colors ${
                      active
                        ? 'after:bg-[#931020]'
                        : 'after:bg-transparent hover:after:bg-[#931020]'
                    }`}
                    onClick={() => setOpen(false)}
                  >
                    {label}
                  </Link>
                </li>
              )
            })}
            <li onClick={(e) => e.stopPropagation()}>
              <LocaleSwitcher />
            </li>
          </ul>
        </div>
      )}
    </>
  )
}
