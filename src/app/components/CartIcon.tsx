'use client'

import { useState, useEffect } from 'react'
import { useCartStore } from '@/store/cart'

export default function CartIcon({ onClick }: { onClick: () => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const count = useCartStore((s) => s.items.length)

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Cart${mounted && count > 0 ? ` (${count} item${count > 1 ? 's' : ''})` : ''}`}
      className="relative flex items-center justify-center text-white/70 hover:text-white transition-colors"
      style={{ width: 24, height: 24 }}
    >
      {/* Minimal bag outline */}
      <svg width="18" height="20" viewBox="0 0 18 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M1.5 6.5h15l-1.5 12h-12L1.5 6.5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
        <path d="M6 6.5V5a3 3 0 0 1 6 0v1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      </svg>

      {/* Badge */}
      {mounted && count > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#931020] text-white"
          style={{ fontSize: '9px', fontWeight: 400, letterSpacing: 0 }}
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  )
}
