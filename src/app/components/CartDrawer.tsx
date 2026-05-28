'use client'

import { useState, useEffect } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { usePathname } from 'next/navigation'
import { useCartStore } from '@/store/cart'
import dynamic from 'next/dynamic'
import type { DownloadItem } from './CheckoutPane'

const CheckoutPane = dynamic(() => import('./CheckoutPane'), { ssr: false })

type Step = 'cart' | 'payment' | 'success'

interface PaymentData {
  clientSecret: string
  hasPhysical: boolean
  downloadItems: DownloadItem[]
}

export default function CartDrawer() {
  const locale = useLocale()
  const t = useTranslations('cart')
  const pathname = usePathname()

  const isOpen = useCartStore((s) => s.isOpen)
  const closeCart = useCartStore((s) => s.closeCart)
  const buyNowItem = useCartStore((s) => s.buyNowItem)
  const { items, removeItem, clearCart } = useCartStore()
  const [step, setStep] = useState<Step>('cart')
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null)
  const [successData, setSuccessData] = useState<{ downloads: DownloadItem[]; hasPhysical: boolean } | null>(null)
  const [intentLoading, setIntentLoading] = useState(false)
  const [intentError, setIntentError] = useState(false)

  // Items being checked out — cart items or the buy-now single item
  const checkoutItems = buyNowItem ? [buyNowItem] : items

  // Auto-jump to payment when Buy Now opens the cart
  useEffect(() => {
    if (isOpen && buyNowItem) {
      void startPayment([buyNowItem])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, buyNowItem])

  // Reset to cart step and clear payment state on close
  useEffect(() => {
    if (!isOpen) {
      setStep('cart')
      setPaymentData(null)
      setSuccessData(null)
      setIntentError(false)
    }
  }, [isOpen])

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

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  const total = checkoutItems.reduce((sum, i) => sum + i.price, 0)
  const currency = checkoutItems[0]?.currency ?? 'dkk'
  const totalText = checkoutItems.length > 0
    ? new Intl.NumberFormat(locale === 'en' ? 'en-GB' : locale, {
        style: 'currency',
        currency,
      }).format(total / 100)
    : '—'

  async function startPayment(itemsToCharge = checkoutItems) {
    if (itemsToCharge.length === 0) return
    setIntentLoading(true)
    setIntentError(false)
    try {
      const res = await fetch('/api/payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToCharge.map((i) => ({ sku: i.sku })), locale }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        console.error('[cart] payment-intent failed:', res.status, body)
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as PaymentData
      setPaymentData(data)
      setStep('payment')
    } catch (err) {
      console.error('[cart] startPayment error:', err)
      setIntentError(true)
    } finally {
      setIntentLoading(false)
    }
  }

  function handleSuccess(downloads: DownloadItem[], hasPhysical: boolean) {
    if (!buyNowItem) clearCart()
    setSuccessData({ downloads, hasPhysical })
    setStep('success')
  }

  function handleClose() {
    closeCart()
  }

  const panelContent = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.07] shrink-0">
        <p className="text-[10px] font-light tracking-[0.28em] uppercase text-white/50">
          {step === 'payment' ? t('payment') : step === 'success' ? t('orderConfirmed') : t('title')}
          {step === 'cart' && items.length > 0 && (
            <span className="ml-2 text-white/25">({items.length})</span>
          )}
        </p>
        <button
          type="button"
          onClick={handleClose}
          aria-label={t('close')}
          className="flex items-center justify-center w-7 h-7 rounded-full text-white/30 hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Body — scrolls */}
      <div className="flex-1 overflow-y-auto px-5 py-4">

        {/* ── Cart step ─────────────────────────────────────────────────── */}
        {step === 'cart' && (
          <>
            {items.length === 0 ? (
              <p className="mt-10 text-center text-[12px] font-light tracking-wide text-white/25">
                {t('empty')}
              </p>
            ) : (
              <ul className="space-y-2.5">
                {items.map((item) => (
                  <li
                    key={item.sku}
                    className="flex items-start gap-3 border border-white/[0.07] bg-white/[0.025] overflow-hidden"
                  >
                    {/* Thumbnail */}
                    {item.thumbnailUrl ? (
                      <div className="shrink-0 w-[60px] h-[60px] bg-white/[0.04] overflow-hidden">
                        <img
                          src={`${item.thumbnailUrl}?max=120`}
                          alt=""
                          aria-hidden="true"
                          width={60}
                          height={60}
                          className="w-full h-full object-cover"
                          draggable={false}
                        />
                      </div>
                    ) : (
                      <div className="shrink-0 w-[60px] h-[60px] bg-white/[0.04]" />
                    )}

                    <div className="flex flex-1 items-start justify-between gap-3 py-3 pr-4 min-w-0">
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-light text-white/80 leading-snug">{item.photoTitle}</p>
                        <p className="mt-0.5 text-[11px] font-light tracking-wide text-white/35">{item.productLabel}</p>
                      </div>
                      <div className="shrink-0 flex flex-col items-end justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => removeItem(item.sku)}
                          aria-label={t('remove')}
                          className="text-white/30 hover:text-white/70 transition-colors leading-none"
                        >
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                        </button>
                        <p className="text-[12px] text-white/65">{item.priceText}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {/* ── Payment step ──────────────────────────────────────────────── */}
        {step === 'payment' && paymentData && (
          <CheckoutPane
            clientSecret={paymentData.clientSecret}
            items={checkoutItems}
            hasPhysical={paymentData.hasPhysical}
            totalText={totalText}
            onBack={() => setStep('cart')}
            onSuccess={handleSuccess}
          />
        )}

        {/* ── Success step ──────────────────────────────────────────────── */}
        {step === 'success' && successData && (
          <div className="pt-2 space-y-5">
            <div>
              <p className="text-[9px] font-light tracking-[0.22em] uppercase text-[#931020] mb-2">{t('orderConfirmed')}</p>
              <p className="text-[22px] font-light text-white leading-tight">{t('thankYou')}</p>
              <p className="mt-2 text-[12px] font-light text-white/40 leading-relaxed">
                {successData.downloads.length > 0 ? t('successDigital') : t('successPhysical')}
              </p>
            </div>

            {successData.downloads.length > 0 && (
              <div className="space-y-2.5">
                <p className="text-[9px] font-light tracking-[0.22em] uppercase text-white/30">{t('fileReferences')}</p>
                {successData.downloads.map((item) => (
                  <div
                    key={item.token}
                    className="rounded-[12px] border border-white/[0.08] bg-white/[0.03] px-4 py-3.5"
                  >
                    <p className="font-[family-name:var(--font-mono-ibm)] text-[15px] font-[200] tracking-wide text-[#931020]">
                      {item.token}.{item.format === 'tiff' ? 'tiff' : 'jpg'}
                    </p>
                    <p className="mt-0.5 text-[10px] font-light tracking-wide text-white/30">
                      {item.label} · {item.format === 'tiff' ? '16-bit TIFF' : 'JPEG'}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {successData.hasPhysical && (
              <div className="rounded-[12px] border border-white/[0.08] bg-white/[0.03] px-4 py-3.5">
                <p className="text-[11px] font-light text-white/45 leading-relaxed">{t('physicalConfirm')}</p>
              </div>
            )}

            <button
              type="button"
              onClick={handleClose}
              className="w-full rounded-[14px] border border-white/15 py-3 text-[11px] font-light tracking-[0.22em] uppercase text-white/50 hover:text-white hover:border-white/35 transition-colors"
            >
              {t('continueShopping')}
            </button>
          </div>
        )}
      </div>

      {/* Footer — only on cart step when items present */}
      {step === 'cart' && items.length > 0 && (
        <div className="border-t border-white/[0.07] px-5 py-5 space-y-4 shrink-0">
          <div className="flex items-baseline justify-between">
            <p className="text-[10px] font-light tracking-[0.22em] uppercase text-white/35">{t('total')}</p>
            <p className="text-[17px] font-light text-white">{totalText}</p>
          </div>
          {intentError && (
            <p className="text-[11px] text-red-400/70">{t('error')}</p>
          )}
          <button
            type="button"
            onClick={() => startPayment()}
            disabled={intentLoading}
            className={`w-full rounded-[14px] py-3.5 text-[11px] font-light tracking-[0.22em] uppercase text-white transition-colors ${
              intentLoading
                ? 'bg-[#931020]/35 cursor-default'
                : 'bg-[#931020]/80 hover:bg-[#931020] cursor-pointer'
            }`}
          >
            {intentLoading ? t('preparing') : t('checkout')}
          </button>
        </div>
      )}
    </>
  )

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[55] bg-black/60 transition-opacity duration-300"
        style={{ opacity: isOpen ? 1 : 0, pointerEvents: isOpen ? 'auto' : 'none' }}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Desktop: right panel */}
      <div
        role="dialog"
        aria-label={t('title')}
        aria-modal="true"
        className={[
          'hidden sm:flex',
          'fixed inset-y-0 right-0 z-[60]',
          'w-[400px] flex-col',
          'bg-[#0d0d0d] border-l border-white/[0.08]',
          'transition-transform duration-300 ease-[cubic-bezier(0.32,0,0.15,1)]',
          'shadow-[-24px_0_48px_rgba(0,0,0,0.6)]',
        ].join(' ')}
        style={{ transform: isOpen ? 'translateX(0)' : 'translateX(100%)' }}
      >
        {panelContent}
      </div>

      {/* Mobile: bottom sheet */}
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
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-8 h-[3px] rounded-full bg-white/20" />
        </div>
        {panelContent}
      </div>
    </>
  )
}
