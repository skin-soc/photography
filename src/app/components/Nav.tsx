'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import LocaleSwitcher from './LocaleSwitcher'
import CartIcon from './CartIcon'

const portfolioHrefs = ['/people', '/places', '/nature'] as const
const topHrefs = ['/shop', '/about'] as const
type NavKey = 'people' | 'places' | 'nature' | 'shop' | 'about'

const TEXT_SHADOW = {
  textShadow: '0 1px 0 rgba(0,0,0,1), 0 1px 1px rgba(0,0,0,0.95), 0 2px 2px rgba(0,0,0,0.75)',
}

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

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const portfolioActive = portfolioHrefs.some(isActive)

  /** Underlined desktop link style, shared by top-level links and the trigger. */
  const deskLink = (active: boolean) =>
    `relative text-[11px] font-light tracking-[0.22em] uppercase text-white pb-[6px] transition-colors after:content-[''] after:absolute after:left-0 after:bottom-0 after:h-[2px] after:w-[calc(100%_-_0.22em)] after:transition-colors ${
      active ? 'after:bg-[#931020]' : 'after:bg-transparent hover:after:bg-[#931020]'
    }`

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
              height: '46px',
              width: 'auto',
              // The SVG is already brand-red (#931020); just a subtle shadow for
              // legibility over hero images.
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))',
            }}
          />
        </Link>

        {/* Desktop links */}
        <ul className="hidden md:flex items-center" style={{ gap: '52px' }}>
          {/* Portfolio — dropdown parent */}
          <li className="relative group">
            <span
              className={deskLink(portfolioActive)}
              style={TEXT_SHADOW}
              role="button"
              tabIndex={0}
              aria-haspopup="true"
            >
              {t('portfolio')}
            </span>

            {/* Bridge padding keeps hover alive between trigger and panel. */}
            <div
              className="absolute left-0 top-full pt-4 opacity-0 invisible translate-y-1 transition-all duration-200 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:visible group-focus-within:translate-y-0"
            >
              <ul className="flex flex-col items-start gap-2.5">
                {portfolioHrefs.map((href) => {
                  const active = isActive(href)
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        style={TEXT_SHADOW}
                        className={`relative inline-block text-[11px] font-light tracking-[0.22em] uppercase pb-[5px] transition-colors after:content-[''] after:absolute after:left-0 after:bottom-0 after:h-[2px] after:w-[calc(100%_-_0.22em)] after:transition-colors ${
                          active
                            ? 'text-white after:bg-[#931020]'
                            : 'text-white/60 hover:text-white after:bg-transparent hover:after:bg-[#931020]'
                        }`}
                      >
                        {t(href.slice(1) as NavKey)}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          </li>

          {topHrefs.map((href) => (
            <li key={href}>
              <Link href={href} className={deskLink(isActive(href))} style={TEXT_SHADOW}>
                {t(href.slice(1) as NavKey)}
              </Link>
            </li>
          ))}

          <li>
            <CartIcon />
          </li>
          <li>
            <LocaleSwitcher />
          </li>
        </ul>

        {/* Mobile cart + hamburger */}
        <div className="md:hidden flex items-center gap-4">
          <CartIcon />
          <button
            className="flex flex-col justify-center gap-[7px] w-8 h-8 shrink-0"
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
        </div>
      </nav>

      {/* Mobile menu overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 flex flex-col items-start justify-center md:hidden"
          style={{ backgroundColor: 'rgba(0,0,0,0.92)', paddingLeft: '60px' }}
          onClick={() => setOpen(false)}
        >
          <ul className="flex flex-col gap-6">
            {/* Portfolio — group heading + nested links */}
            <li>
              <span className="block font-light text-white text-3xl tracking-[0.22em] uppercase mb-4">
                {t('portfolio')}
              </span>
              <ul className="flex flex-col gap-4 ps-6">
                {portfolioHrefs.map((href) => {
                  const active = isActive(href)
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        className={`relative inline-block font-light text-3xl tracking-[0.22em] uppercase pb-[8px] transition-colors after:content-[''] after:absolute after:left-0 after:bottom-0 after:h-[2px] after:w-[calc(100%_-_0.22em)] after:transition-colors ${
                          active
                            ? 'text-white after:bg-[#931020]'
                            : 'text-white/65 hover:text-white after:bg-transparent hover:after:bg-[#931020]'
                        }`}
                        onClick={() => setOpen(false)}
                      >
                        {t(href.slice(1) as NavKey)}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </li>

            {topHrefs.map((href) => {
              const active = isActive(href)
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className={`relative inline-block font-light text-white text-3xl tracking-[0.22em] uppercase pb-[8px] transition-colors after:content-[''] after:absolute after:left-0 after:bottom-0 after:h-[2px] after:w-[calc(100%_-_0.22em)] after:transition-colors ${
                      active ? 'after:bg-[#931020]' : 'after:bg-transparent hover:after:bg-[#931020]'
                    }`}
                    onClick={() => setOpen(false)}
                  >
                    {t(href.slice(1) as NavKey)}
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
