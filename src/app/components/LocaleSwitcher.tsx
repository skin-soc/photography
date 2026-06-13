'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import GB from 'country-flag-icons/react/3x2/GB'
import DK from 'country-flag-icons/react/3x2/DK'
import SE from 'country-flag-icons/react/3x2/SE'
import NO from 'country-flag-icons/react/3x2/NO'
import FI from 'country-flag-icons/react/3x2/FI'
import DE from 'country-flag-icons/react/3x2/DE'
import NL from 'country-flag-icons/react/3x2/NL'
import FR from 'country-flag-icons/react/3x2/FR'
import ES from 'country-flag-icons/react/3x2/ES'
import PT from 'country-flag-icons/react/3x2/PT'
import RU from 'country-flag-icons/react/3x2/RU'
import CN from 'country-flag-icons/react/3x2/CN'
import JP from 'country-flag-icons/react/3x2/JP'
import IT from 'country-flag-icons/react/3x2/IT'
import PL from 'country-flag-icons/react/3x2/PL'
import KR from 'country-flag-icons/react/3x2/KR'
import SA from 'country-flag-icons/react/3x2/SA'
import { usePathname, useRouter } from '@/i18n/navigation'
import { routing, type Locale } from '@/i18n/routing'

type FlagComponent = React.ComponentType<{ className?: string; title?: string }>

const FLAGS: Record<Locale, FlagComponent> = {
  en: GB,
  da: DK,
  sv: SE,
  nb: NO,
  fi: FI,
  de: DE,
  nl: NL,
  fr: FR,
  es: ES,
  pt: PT,
  ru: RU,
  zh: CN,
  ja: JP,
  it: IT,
  pl: PL,
  ko: KR,
  ar: SA,
}

export default function LocaleSwitcher() {
  const t = useTranslations('languageSwitcher')
  const locale = useLocale() as Locale
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  function pick(next: Locale) {
    setOpen(false)
    if (next === locale) return
    // Tell Nav to keep the mobile menu open across the locale-switch remount.
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 767px)').matches
    ) {
      sessionStorage.setItem('preserveMobileMenu', Date.now().toString())
    }
    // Capture scroll position so we can restore it through the
    // remount — Next's `scroll: false` doesn't always survive when
    // the layout segment unmounts.
    const scrollY = window.scrollY
    const restoreScroll = () => {
      if (window.scrollY !== scrollY) window.scrollTo(0, scrollY)
    }

    const navigate = () =>
      startTransition(() => {
        router.replace(pathname, { locale: next, scroll: false })
      })
    // Use the View Transitions API to crossfade across the brief
    // remount window. Falls back to a plain transition on browsers
    // that don't support it.
    const doc = document as Document & {
      startViewTransition?: (cb: () => Promise<void> | void) => unknown
    }
    if (typeof doc.startViewTransition === 'function') {
      doc.startViewTransition(() => {
        navigate()
        return new Promise<void>((resolve) =>
          setTimeout(() => {
            restoreScroll()
            resolve()
          }, 80),
        )
      })
    } else {
      navigate()
      requestAnimationFrame(restoreScroll)
    }
  }

  const Current = FLAGS[locale]

  return (
    <div ref={ref} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('label')}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={isPending}
        className="inline-flex items-center justify-center transition-opacity hover:opacity-100 opacity-80 disabled:opacity-40 md:translate-y-[2px]"
        style={{ padding: '2px 0', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))' }}
      >
        <Current title={t(locale)} className="block w-6 md:w-[17px] h-auto" />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t('label')}
          className="absolute top-full mt-3 z-50 grid grid-cols-[repeat(7,1.5rem)] justify-start gap-2 left-0 right-auto md:flex md:flex-col md:flex-nowrap md:items-center md:gap-1.5 md:left-auto md:right-[-8px] rounded-sm py-2 px-2"
          style={{ backgroundColor: 'rgb(var(--bg) / 0.92)', backdropFilter: 'blur(4px)' }}
        >
          {routing.locales.map((l) => {
            const Flag = FLAGS[l]
            return (
              <li key={l}>
                <button
                  type="button"
                  role="option"
                  aria-selected={l === locale}
                  onClick={() => pick(l)}
                  title={t(l)}
                  className="flex items-center justify-center w-6 h-[18px] md:w-[17px] md:h-[11px] transition-opacity hover:opacity-100"
                  style={{ opacity: l === locale ? 1 : 0.5 }}
                >
                  <Flag title={t(l)} className="block w-6 md:w-[17px] h-auto" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
