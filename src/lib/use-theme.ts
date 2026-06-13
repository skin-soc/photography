'use client'

import { useState, useEffect } from 'react'

export type ResolvedTheme = 'light' | 'dark'

/** Read the concrete theme from the class the server stamped on <html>. */
function readTheme(): ResolvedTheme {
  if (typeof document === 'undefined') return 'dark'
  const root = document.documentElement
  if (root.classList.contains('light')) return 'light'
  if (root.classList.contains('dark')) return 'dark'
  // `theme-auto` (or unclassed) → follow the OS.
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Resolve the ACTIVE theme on the client to a concrete `light` | `dark`.
 *
 * The server stamps `dark` | `light` | `theme-auto` on <html> and CSS handles the
 * rest — but some surfaces can't use CSS variables (notably the cross-origin
 * Stripe Element, which needs a concrete `appearance` object). Those read the
 * resolved value here. For `theme-auto` it follows `prefers-color-scheme` and
 * updates if the OS preference flips mid-session.
 */
export function useResolvedTheme(): ResolvedTheme {
  const [theme, setTheme] = useState<ResolvedTheme>(readTheme)

  useEffect(() => {
    setTheme(readTheme())
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setTheme(readTheme())
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return theme
}
