'use client'

import { useState, useEffect } from 'react'
import { useLocale } from 'next-intl'
import { useCartStore } from '@/store/cart'

export default function CartDrawer({ onClose }: { onClose: () => void }) {
  const locale = useLocale()
  const { items, removeItem, clearCart } = useCartStore()
  const [checkoutState, setCheckoutState] = useState<'idle' | 'loading' | 'error'>('idle')

  // Trap focus and close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const total = items.reduce((sum, i) => sum + i.price, 0)
  const hasPhysical = items.some((i) => i.type !== 'digital')

  const totalText = items.length > 0
    ? new Intl.NumberFormat('da-DK', { style: 'currency', currency: items[0].currency }).format(total / 100)
    : '—'

  async function handleCheckout() {
    if (items.length === 0 || checkoutState === 'loading') return
    setCheckoutState('loading')
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: items.map((i) => ({ sku: i.sku })), locale }),
      })
      if (!res.ok) throw new Error('checkout failed')
      const { url } = await res.json() as { url: string }
      clearCart()
      window.location.href = url
    } catch {
      setCheckoutState('error')
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-label="Cart"
        className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-[#0c0c0c] sm:w-[400px] border-l border-white/10"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.07]">
          <p className="text-[10px] font-light tracking-[0.25em] uppercase text-white/60">
            Cart {items.length > 0 && <span className="text-white/30">({items.length})</span>}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close cart"
            className="text-white/30 hover:text-white transition-colors"
            style={{ fontSize: 22, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            ×
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {items.length === 0 ? (
            <p className="mt-8 text-center text-[12px] font-light tracking-wide text-white/25">
              Your cart is empty.
            </p>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <li
                  key={item.sku}
                  className="flex items-start justify-between gap-4 rounded-[14px] border border-white/[0.07] bg-white/[0.03] px-4 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-light text-white/80">{item.photoTitle}</p>
                    <p className="mt-0.5 text-[11px] font-light tracking-wide text-white/35">{item.productLabel}</p>
                    {item.downloadToken && (
                      <p className="mt-1 truncate font-mono text-[10px] text-white/20">
                        {item.downloadToken}.{item.format === 'tiff' ? 'tiff' : 'jpg'}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[13px] text-white/70">{item.priceText}</p>
                    <button
                      type="button"
                      onClick={() => removeItem(item.sku)}
                      className="mt-1 text-[10px] font-light tracking-wide text-white/25 hover:text-white/60 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t border-white/[0.07] px-6 py-5 space-y-4">
            <div className="flex items-baseline justify-between">
              <p className="text-[10px] font-light tracking-[0.2em] uppercase text-white/35">Total</p>
              <p className="text-[18px] font-light text-white">{totalText}</p>
            </div>
            {hasPhysical && (
              <p className="text-[10px] font-light text-white/25 leading-relaxed">
                Shipping address collected at checkout.
              </p>
            )}
            <button
              type="button"
              onClick={handleCheckout}
              disabled={checkoutState === 'loading'}
              className={`w-full rounded-[16px] py-3.5 text-[11px] font-light tracking-[0.22em] uppercase text-white transition-colors ${
                checkoutState === 'loading'
                  ? 'bg-[#931020]/40 cursor-default'
                  : 'bg-[#931020]/80 hover:bg-[#931020] cursor-pointer'
              }`}
            >
              {checkoutState === 'loading' ? 'Preparing…' : 'Checkout'}
            </button>
            {checkoutState === 'error' && (
              <p className="text-[11px] text-red-400/70 text-center">
                Could not start checkout — please try again.
              </p>
            )}
          </div>
        )}
      </div>
    </>
  )
}
