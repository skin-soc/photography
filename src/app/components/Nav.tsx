'use client'

import { useState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import LocaleSwitcher from './LocaleSwitcher'
import CartIcon from './CartIcon'

const portfolioHrefs = ['/people', '/places', '/nature'] as const
type NavKey = 'people' | 'places' | 'nature' | 'shop' | 'about'

// Pages with a full-bleed hero/gallery under the nav. Only here does the bar go
// transparent over the photo and keep the over-photo text-shadow; everywhere else
// (content pages) it's frosted, so the shadow — which only helps over imagery,
// and looks grimy on a light page — is dropped. usePathname() is locale-stripped.
const HERO_PATHS: string[] = ['/', '/people', '/places', '/nature']

export default function Nav({ shopOnline = true }: { shopOnline?: boolean }) {
  const t = useTranslations('nav')
  const pathname = usePathname()
  // The shop link is hidden from the nav when the admin takes the shop offline.
  const topHrefs: ('/shop' | '/about')[] = shopOnline ? ['/shop', '/about'] : ['/about']
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

  // ── Headroom scroll behaviour ────────────────────────────────────────────
  // Hide the bar on scroll DOWN, reveal it (frosted) on scroll UP. At the very
  // top of a hero page it's transparent over the photo; otherwise it's frosted.
  const [hidden, setHidden] = useState(false)
  const [atTop, setAtTop] = useState(true)
  const lastY = useRef(0)

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      const top = y < 8
      setAtTop(top)
      if (top) { setHidden(false); lastY.current = y; return }
      const dy = y - lastY.current
      if (Math.abs(dy) > 4) {
        // Hide only once we're clear of the top; reveal on any upward move.
        if (dy > 0 && y > 80) setHidden(true)
        else if (dy < 0) setHidden(false)
        lastY.current = y
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const portfolioActive = portfolioHrefs.some(isActive)

  // Transparent + over-photo shadow only when genuinely over a hero at the top.
  const overHero = HERO_PATHS.includes(pathname) && atTop
  const frosted = !overHero
  // Keep the bar visible while the mobile menu is open.
  const navHidden = hidden && !open

  /** Underlined desktop link style, shared by top-level links and the trigger. */
  const deskLink = (active: boolean) =>
    `relative text-[11px] font-light tracking-[0.22em] uppercase text-foreground pb-[6px] transition-colors after:content-[''] after:absolute after:left-0 after:bottom-0 after:h-[2px] after:w-[calc(100%_-_0.22em)] after:transition-colors ${
      active ? 'after:bg-[#931020]' : 'after:bg-transparent hover:after:bg-[#931020]'
    }`

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between transition-[transform,background-color,border-color] duration-300 ease-out ${
          frosted
            ? 'bg-bg/80 backdrop-blur-md border-b border-foreground/10'
            : 'bg-transparent border-b border-transparent'
        }`}
        style={{ padding: '3vw 6vw', transform: navHidden ? 'translateY(-120%)' : 'translateY(0)' }}
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
              // legibility over hero images — dropped once the bar is frosted.
              filter: overHero ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))' : 'none',
            }}
          />
        </Link>

        {/* Desktop links */}
        <ul className="hidden md:flex items-center" style={{ gap: '52px' }}>
          {/* Portfolio — dropdown parent */}
          <li className="relative group">
            <span
              className={deskLink(portfolioActive)}
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
                        className={`relative inline-block text-[11px] font-light tracking-[0.22em] uppercase pb-[5px] transition-colors after:content-[''] after:absolute after:left-0 after:bottom-0 after:h-[2px] after:w-[calc(100%_-_0.22em)] after:transition-colors ${
                          active
                            ? 'text-foreground after:bg-[#931020]'
                            : 'text-foreground/60 hover:text-foreground after:bg-transparent hover:after:bg-[#931020]'
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
              <Link href={href} className={deskLink(isActive(href))}>
                {t(href.slice(1) as NavKey)}
              </Link>
            </li>
          ))}

          {shopOnline && (
            <li>
              <CartIcon />
            </li>
          )}
          <li>
            <LocaleSwitcher />
          </li>
        </ul>

        {/* Mobile cart + hamburger */}
        <div className="md:hidden flex items-center gap-4">
          {shopOnline && <CartIcon />}
          <button
            className="flex flex-col justify-center gap-[7px] w-8 h-8 shrink-0"
            onClick={() => setOpen((o) => !o)}
            aria-label={t('menu')}
          >
            <span
              className="block h-px bg-foreground transition-all duration-300 origin-center"
              style={{
                transform: open ? 'translateY(3.5px) rotate(45deg)' : 'none',
                opacity: open ? 1 : 0.7,
              }}
            />
            <span
              className="block h-px bg-foreground transition-all duration-300 origin-center"
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
          className="fixed inset-0 z-40 flex flex-col items-start justify-center md:hidden overflow-hidden"
          style={{ backgroundColor: 'rgb(var(--bg) / 0.92)', paddingLeft: '60px' }}
          onClick={() => setOpen(false)}
        >
          <ul className="flex flex-col gap-6">
            {/* Portfolio — group heading + nested links */}
            <li>
              <span className="block font-light text-foreground text-3xl tracking-[0.22em] uppercase mb-4">
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
                            ? 'text-foreground after:bg-[#931020]'
                            : 'text-foreground/65 hover:text-foreground after:bg-transparent hover:after:bg-[#931020]'
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
                    className={`relative inline-block font-light text-foreground text-3xl tracking-[0.22em] uppercase pb-[8px] transition-colors after:content-[''] after:absolute after:left-0 after:bottom-0 after:h-[2px] after:w-[calc(100%_-_0.22em)] after:transition-colors ${
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
