'use client'

import { useState, useEffect, useRef, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type NavState = 'idle' | 'loading' | 'error'

// Don't flash the spinner for near-instant navigations.
const SPINNER_DELAY_MS = 200
// How long to wait before the first connectivity check. The server's upstream
// (NAS) fetch is bounded at ~8s, so a healthy navigation — even with a slow
// NAS — should resolve within ~10s. We only start probing after that.
const PROBE_AFTER_MS = 10_000
// How often to re-check connectivity while a navigation is still pending.
const PROBE_INTERVAL_MS = 4_000
// Abort an individual probe if it doesn't answer in time.
const PROBE_TIMEOUT_MS = 5_000
// Absolute ceiling. If the server keeps answering health checks but the page
// still hasn't rendered after this long, something is genuinely wrong — surface
// the error rather than spinning forever.
const MAX_WAIT_MS = 45_000

export default function NavigationOverlay({ children }: { children: React.ReactNode }) {
  const [navState, setNavState] = useState<NavState>('idle')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const startedAtRef = useRef(0)
  const pendingHrefRef = useRef<string | null>(null)

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }, [])

  // isPending goes false when Next.js commits the new page's HTML to the DOM,
  // but eager images (hero rotators, above-fold tiles) may still be in flight.
  // We hold the overlay until every eager img has loaded — or 5s has passed —
  // so the user never sees a half-painted page.
  useEffect(() => {
    if (!isPending) {
      clearTimers()

      const settle = () => setNavState('idle')

      const pending = Array.from(
        document.querySelectorAll<HTMLImageElement>('img:not([loading="lazy"])'),
      ).filter((img) => !img.complete)

      if (pending.length === 0) { settle(); return }

      const ceiling = setTimeout(settle, 5000)
      let resolved = 0
      const onSettled = () => { if (++resolved >= pending.length) { clearTimeout(ceiling); settle() } }
      pending.forEach((img) => {
        img.addEventListener('load',  onSettled, { once: true })
        img.addEventListener('error', onSettled, { once: true })
      })
      return () => {
        clearTimeout(ceiling)
        pending.forEach((img) => {
          img.removeEventListener('load',  onSettled)
          img.removeEventListener('error', onSettled)
        })
      }
    }
  }, [isPending, clearTimers])

  // Clean up on unmount.
  useEffect(() => clearTimers, [clearTimers])

  const probe = useCallback(async () => {
    if (Date.now() - startedAtRef.current > MAX_WAIT_MS) {
      setNavState('error')
      return
    }
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS)
      const res = await fetch('/api/health', { cache: 'no-store', signal: ctrl.signal })
      clearTimeout(t)
      if (res.ok) {
        timersRef.current.push(setTimeout(probe, PROBE_INTERVAL_MS))
      } else {
        setNavState('error')
      }
    } catch {
      setNavState('error')
    }
  }, [])

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const anchor = (e.target as HTMLElement).closest('a')
    if (!anchor) return
    if (anchor.hasAttribute('download')) return
    if (anchor.target && anchor.target !== '_self') return
    let url: URL
    try {
      url = new URL(anchor.href)
    } catch {
      return
    }
    if (url.origin !== window.location.origin) return
    if (url.pathname.startsWith('/api/')) return
    if (url.pathname === window.location.pathname && url.search === window.location.search) return

    e.preventDefault()
    clearTimers()
    startedAtRef.current = Date.now()
    pendingHrefRef.current = anchor.href

    // Wrap in startTransition so isPending stays true until the new page's
    // server components finish — that's when we dismiss the spinner.
    startTransition(() => { router.push(anchor.href) })

    timersRef.current.push(setTimeout(() => setNavState('loading'), SPINNER_DELAY_MS))
    timersRef.current.push(setTimeout(probe, PROBE_AFTER_MS))
  }

  function dismiss() {
    clearTimers()
    setNavState('idle')
  }

  function retry() {
    const href = pendingHrefRef.current
    if (!href) { dismiss(); return }
    clearTimers()
    startedAtRef.current = Date.now()
    setNavState('loading')
    startTransition(() => { router.push(href) })
    timersRef.current.push(setTimeout(probe, PROBE_AFTER_MS))
  }

  return (
    <div onClickCapture={handleClick}>
      {navState !== 'idle' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80">
          {navState === 'loading' ? (
            <div className="shop-spinner" role="status" aria-label="Loading" />
          ) : (
            <div className="flex flex-col items-center gap-6 px-8 text-center max-w-sm">
              <div className="shop-spinner opacity-30" role="presentation" />
              <p className="font-[family-name:var(--font-mono-ibm)] text-sm tracking-wide text-foreground/80">
                The site is under load right now.
              </p>
              <p className="font-[family-name:var(--font-mono-ibm)] text-xs tracking-wide text-foreground/45 leading-relaxed">
                This usually clears in under a minute — please wait a moment and try again.
              </p>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={retry}
                  className="border border-accent/60 px-8 py-2.5 font-[family-name:var(--font-mono-ibm)] text-xs tracking-widest text-accent/80 transition-colors hover:border-accent hover:text-accent"
                >
                  TRY AGAIN
                </button>
                <button
                  onClick={dismiss}
                  className="border border-foreground/20 px-8 py-2.5 font-[family-name:var(--font-mono-ibm)] text-xs tracking-widest text-foreground/50 transition-colors hover:border-foreground/40 hover:text-foreground/80"
                >
                  GO BACK
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  )
}
