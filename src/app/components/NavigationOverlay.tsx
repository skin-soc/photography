'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'

type NavState = 'idle' | 'loading' | 'error'

// Time to wait before declaring the navigation failed
const TIMEOUT_MS = 12_000

export default function NavigationOverlay({ children }: { children: React.ReactNode }) {
  const [navState, setNavState] = useState<NavState>('idle')
  const pathname = usePathname()
  const prevPathname = useRef(pathname)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (pathname !== prevPathname.current) {
      prevPathname.current = pathname
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      setNavState('idle')
    }
  }, [pathname])

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const anchor = (e.target as HTMLElement).closest('a')
    if (!anchor) return
    let url: URL
    try {
      url = new URL(anchor.href)
    } catch {
      return
    }
    if (url.origin !== window.location.origin) return
    if (url.pathname === window.location.pathname && url.search === window.location.search) return

    e.preventDefault()
    setNavState('loading')
    router.push(anchor.href)

    timeoutRef.current = setTimeout(() => {
      setNavState('error')
    }, TIMEOUT_MS)
  }

  function dismiss() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setNavState('idle')
  }

  return (
    <div onClickCapture={handleClick}>
      {navState !== 'idle' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          {navState === 'loading' ? (
            <div className="shop-spinner" role="status" aria-label="Loading" />
          ) : (
            <div className="flex flex-col items-center gap-6 px-8 text-center">
              <p className="font-[family-name:var(--font-mono-ibm)] text-sm tracking-wide text-white/70">
                Couldn&apos;t connect — the server may be temporarily unavailable.
              </p>
              <p className="font-[family-name:var(--font-mono-ibm)] text-xs tracking-wide text-white/40">
                Please try again later.
              </p>
              <button
                onClick={dismiss}
                className="mt-2 border border-white/25 px-8 py-2.5 font-[family-name:var(--font-mono-ibm)] text-xs tracking-widest text-white/60 transition-colors hover:border-white/50 hover:text-white/90"
              >
                GO BACK
              </button>
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  )
}
