'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Wraps the shop section. Intercepts every internal-link click via capture-phase
 * event delegation and immediately shows a full-screen spinner + dimmed backdrop.
 * The spinner is cleared as soon as `usePathname` reports the new route — i.e.
 * the moment the incoming page has rendered.
 */
export default function ShopNavigationOverlay({ children }: { children: React.ReactNode }) {
  const [navigating, setNavigating] = useState(false)
  const pathname = usePathname()
  const prevPathname = useRef(pathname)

  useEffect(() => {
    if (pathname !== prevPathname.current) {
      prevPathname.current = pathname
      setNavigating(false)
    }
  }, [pathname])

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const anchor = (e.target as HTMLElement).closest('a')
    if (!anchor) return
    // External links — leave alone
    try {
      const url = new URL(anchor.href)
      if (url.origin !== window.location.origin) return
      // Hash-only or identical path with no query change — no page load
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
    } catch {
      return
    }
    setNavigating(true)
  }

  return (
    <div onClickCapture={handleClick}>
      {navigating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="shop-spinner" role="status" aria-label="Loading" />
        </div>
      )}
      {children}
    </div>
  )
}
