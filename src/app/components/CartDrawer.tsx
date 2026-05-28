'use client'

import { useState, useEffect } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { usePathname } from 'next/navigation'
import { useCartStore, type CartItem } from '@/store/cart'

export default function CartDrawer() {
  const locale = useLocale()
  const t = useTranslations('cart')
  const pathname = usePathname()

  const isOpen = useCartStore((s) => s.isOpen)
  const closeCart = useCartStore((s) => s.closeCart)
  const { items, removeItem, clearCart } = useCartStore()
  const [checkoutState, setCheckoutState] = useState<'idle' | 'loading' | 'error'>('idle')

  // Close on navigation
  useEffect(() => {
    closeCart()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeCart()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, closeCart])

  // Lock body scroll while open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  const total = items.reduce((sum, i) => sum + i.price, 0)
  const hasPhysical = items.some((i) => i.type !== 'digital')

  const totalText = items.length > 0
    ? new Intl.NumberFormat(locale === 'en' ? 'en-GB' : locale, {
        style: 'currency',
        currency: items[0].currency,
      }).format(total / 100)
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

  // Always render so CSS transitions can play; visibility driven by isOpen
  return (
    <>
      {/* ── Backdrop ───────────────────────────────────────────────────── */}
      <div
        className="fixed inset-0 z-[55] bg-black/60 transition-opacity duration-300"
        style={{ opacity: isOpen ? 1 : 0, pointerEvents: isOpen ? 'auto' : 'none' }}
        onClick={closeCart}
        aria-hidden="true"
      />

      {/* ── Desktop: right-side panel ──────────────────────────────────── */}
      <div
        role="dialog"
        aria-label={t('title')}
        aria-modal="true"
        className={[
          'hidden sm:flex',
          'fixed inset-y-0 right-0 z-[60]',
          'w-[380px] flex-col',
          'bg-[#0d0d0d] border-l border-white/[0.08]',
          'transition-transform duration-300 ease-[cubic-bezier(0.32,0,0.15,1)]',
          'shadow-[-24px_0_48px_rgba(0,0,0,0.6)]',
        ].join(' ')}
        style={{ transform: isOpen ? 'translateX(0)' : 'translateX(100%)' }}
      >
        <CartContents
          t={t}
          items={items}
          totalText={totalText}
          hasPhysical={hasPhysical}
          checkoutState={checkoutState}
          onRemove={removeItem}
          onClose={closeCart}
          onCheckout={handleCheckout}
          setCheckoutState={setCheckoutState}
        />
      </div>

      {/* ── Mobile: bottom sheet ───────────────────────────────────────── */}
      <div
        role="dialog"
        aria-label={t('title')}
        aria-modal="true"
        className={[
          'flex sm:hidden',
          'fixed bottom-0 inset-x-0 z-[60]',
          'max-h-[88svh] flex-col',
          'bg-[#0d0d0d] border-t border-white/[0.08]',
          'rounded-t-[20px]',
          'transition-transform duration-300 ease-[cubic-bezier(0.32,0,0.15,1)]',
          'shadow-[0_-24px_48px_rgba(0,0,0,0.7)]',
        ].join(' ')}
        style={{ transform: isOpen ? 'translateY(0)' : 'translateY(100%)' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-8 h-[3px] rounded-full bg-white/20" />
        </div>
        <CartContents
          t={t}
          items={items}
          totalText={totalText}
          hasPhysical={hasPhysical}
          checkoutState={checkoutState}
          onRemove={removeItem}
          onClose={closeCart}
          onCheckout={handleCheckout}
          setCheckoutState={setCheckoutState}
        />
      </div>
    </>
  )
}

// ─── Shared panel content ────────────────────────────────────────────────────

type TFn = ReturnType<typeof useTranslations<'cart'>>

function CartContents({
  t,
  items,
  totalText,
  hasPhysical,
  checkoutState,
  onRemove,
  onClose,
  onCheckout,
  setCheckoutState,
}: {
  t: TFn
  items: CartItem[]
  totalText: string
  hasPhysical: boolean
  checkoutState: 'idle' | 'loading' | 'error'
  onRemove: (sku: string) => void
  onClose: () => void
  onCheckout: () => void
  setCheckoutState: (s: 'idle' | 'loading' | 'error') => void
}) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.07] shrink-0">
        <p className="text-[10px] font-light tracking-[0.28em] uppercase text-white/50">
          {t('title')}
          {items.length > 0 && (
            <span className="ml-2 text-white/25">({items.length})</span>
          )}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('close')}
          className="flex items-center justify-center w-7 h-7 rounded-full text-white/30 hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {items.length === 0 ? (
          <p className="mt-10 text-center text-[12px] font-light tracking-wide text-white/25">
            {t('empty')}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {items.map((item) => (
              <li
                key={item.sku}
                className="flex items-start justify-between gap-4 rounded-[14px] border border-white/[0.07] bg-white/[0.025] px-4 py-3.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-light text-white/80 leading-snug">{item.photoTitle}</p>
                  <p className="mt-0.5 text-[11px] font-light tracking-wide text-white/35">{item.productLabel}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[12px] text-white/65">{item.priceText}</p>
                  <button
                    type="button"
                    onClick={() => onRemove(item.sku)}
                    className="mt-1 text-[10px] font-light tracking-wide text-white/20 hover:text-white/55 transition-colors"
                  >
                    {t('remove')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      {items.length > 0 && (
        <div className="border-t border-white/[0.07] px-5 py-5 space-y-4 shrink-0">
          <div className="flex items-baseline justify-between">
            <p className="text-[10px] font-light tracking-[0.22em] uppercase text-white/35">
              {t('total')}
            </p>
            <p className="text-[17px] font-light text-white">{totalText}</p>
          </div>
          {hasPhysical && (
            <p className="text-[10px] font-light text-white/25 leading-relaxed">
              {t('shipping')}
            </p>
          )}
          <button
            type="button"
            onClick={onCheckout}
            disabled={checkoutState === 'loading'}
            className={`w-full rounded-[14px] py-3.5 text-[11px] font-light tracking-[0.22em] uppercase text-white transition-colors ${
              checkoutState === 'loading'
                ? 'bg-[#931020]/35 cursor-default'
                : 'bg-[#931020]/75 hover:bg-[#931020] cursor-pointer'
            }`}
          >
            {checkoutState === 'loading' ? t('preparing') : t('checkout')}
          </button>
          {checkoutState === 'error' && (
            <p className="text-[11px] text-red-400/70 text-center">
              {t('error')}
            </p>
          )}
        </div>
      )}
    </>
  )
}
