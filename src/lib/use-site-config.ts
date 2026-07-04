'use client'

/**
 * Live site config on the client — see /api/site-config. Prerendered pages bake
 * the build-time theme ('auto') and shop-online (true) into their HTML; this
 * hook fetches the real values once per page load (the response is
 * browser-cached 60s, so SPA remounts are free) and:
 *   - stamps the current theme class on <html> (matching the server logic in
 *     the locale layout, so SSR'd pages just re-apply the same class), and
 *   - returns the runtime shopOnline for the Nav to honour the kill-switch.
 * Returns null until the config has loaded — callers keep their server value.
 */

import { useState, useEffect } from 'react'
import type { ThemePref } from '@/lib/shop-settings'

export interface SiteConfig {
  theme: ThemePref
  shopOnline: boolean
}

const THEME_CLASSES = ['theme-auto', 'light', 'dark']

export function useSiteConfig(): SiteConfig | null {
  const [cfg, setCfg] = useState<SiteConfig | null>(null)

  useEffect(() => {
    let live = true
    fetch('/api/site-config')
      .then((r) => (r.ok ? (r.json() as Promise<SiteConfig>) : null))
      .then((c) => {
        if (!live || !c) return
        setCfg(c)
        const cls = c.theme === 'auto' ? 'theme-auto' : c.theme
        const el = document.documentElement
        if (!el.classList.contains(cls)) {
          el.classList.remove(...THEME_CLASSES)
          el.classList.add(cls)
        }
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  return cfg
}
