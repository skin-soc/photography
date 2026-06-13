'use client'

import { useState, useEffect } from 'react'
import { useCartStore } from '@/store/cart'
import { useTranslations } from 'next-intl'

export default function CartIcon() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const count = useCartStore((s) => s.items.length)
  const openCart = useCartStore((s) => s.openCart)
  const t = useTranslations('cart')

  const label = mounted && count > 0
    ? t('openWithCount', { count })
    : t('open')

  return (
    <button
      type="button"
      onClick={openCart}
      aria-label={label}
      className="relative flex items-center justify-center text-foreground/70 hover:text-foreground transition-colors"
      style={{ width: 20, height: 20 }}
    >
      {/* Bag — same weight/scale as nav text. No shadow: the frosted bar (or the
          page background) is always behind it, so it needs no over-photo lift. */}
      <svg width="14" height="16" viewBox="0 0 14 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M1 5h12l-1.2 10H2.2L1 5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
        <path d="M4.5 5V4a2.5 2.5 0 0 1 5 0v1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      </svg>

      {/* Count badge */}
      {mounted && count > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-1.5 -right-2 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-[#931020] text-white px-[3px]"
          style={{ fontSize: '8px', fontWeight: 400, letterSpacing: 0 }}
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  )
}
