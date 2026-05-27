'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'
import dynamic from 'next/dynamic'
import type { ProductType, LicenseTier } from '@/lib/shop'

const CheckoutModal = dynamic(() => import('./CheckoutModal'), { ssr: false })

export interface PickerProduct {
  sku: string
  type: ProductType
  label: string
  /** Spec line — pixel size (digital) or paper size in cm (print/fine-art). */
  spec: string | null
  price: number
  priceText: string
  approxText: string
  format?: 'jpeg' | 'tiff'
  /** GMP-XXXXXXX token — customer-facing filename reference for digital downloads. */
  downloadToken?: string
  /** Usage-rights tier bundled with this product. */
  license?: LicenseTier
}

const TYPE_ORDER: ProductType[] = ['print', 'fine-art', 'digital']

const LICENSE_I18N: Record<LicenseTier, string> = {
  personal:          'licensePersonal',
  editorial:         'licenseEditorial',
  commercial:        'licenseCommercial',
  'full-commercial': 'licenseFullCommercial',
}

const LICENSE_DESC_I18N: Record<LicenseTier, string> = {
  personal:          'licensePersonalDesc',
  editorial:         'licenseEditorialDesc',
  commercial:        'licenseCommercialDesc',
  'full-commercial': 'licenseFullCommercialDesc',
}

function InfoIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="7" cy="7" r="6.25" stroke="currentColor" strokeWidth="1"/>
      <line x1="7" y1="6" x2="7" y2="10.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      <circle cx="7" cy="3.75" r="0.7" fill="currentColor"/>
    </svg>
  )
}

/* ── RAW request modal ────────────────────────────────────────────────────── */

function RawRequestModal({
  photoTitle,
  onClose,
}: {
  photoTitle: string
  onClose: () => void
}) {
  const t  = useTranslations('shop')
  const tf = useTranslations('about.form')
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('sending')
    const form = e.currentTarget
    try {
      const res = await fetch('https://formspree.io/f/mykojgpp', {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
      })
      if (res.ok) { setStatus('success'); form.reset() }
      else setStatus('error')
    } catch {
      setStatus('error')
    }
  }

  const fieldStyle: React.CSSProperties = {
    display: 'block', width: '100%', padding: '4px 0 6px 0',
    backgroundColor: 'transparent', border: 'none',
    borderBottom: '1px solid rgba(255,255,255,0.15)',
    color: '#fff', fontSize: '13px', fontWeight: 300,
    letterSpacing: '0.04em', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.78)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full rounded-[20px] border border-white/10"
        style={{ maxWidth: '420px', margin: '0 16px', backgroundColor: '#0c0c0c', padding: '28px 28px 24px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button" onClick={onClose} aria-label="Close"
          style={{
            position: 'absolute', top: '16px', right: '20px',
            background: 'none', border: 'none', padding: 0,
            cursor: 'pointer', color: 'rgba(255,255,255,0.35)',
            fontSize: '22px', lineHeight: 1, transition: 'color 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#fff' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)' }}
        >×</button>

        <p style={{ fontSize: '9px', fontWeight: 300, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#fff', marginBottom: '4px' }}>
          {t('rawRequestTitle')}
        </p>
        <p style={{ fontSize: '13px', fontWeight: 300, letterSpacing: '0.02em', color: 'rgba(255,255,255,0.45)', marginBottom: '22px' }}>
          {photoTitle}
        </p>

        {status === 'success' ? (
          <p style={{ fontSize: '11px', fontWeight: 300, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)' }}>
            {t('rawRequestSuccess')}
          </p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input type="hidden" name="_subject" value={`RAW file request — ${photoTitle}`} />
            <input type="hidden" name="photo" value={photoTitle} />
            <input type="text"  name="name"    placeholder={tf('name')}    required style={fieldStyle} />
            <input type="email" name="email"   placeholder={tf('email')}   required style={fieldStyle} />
            <textarea           name="message" placeholder={tf('message')}
              style={{ ...fieldStyle, minHeight: '80px', resize: 'none' }} />
            <button
              type="submit" disabled={status === 'sending'}
              style={{
                alignSelf: 'flex-start', marginTop: '6px',
                fontSize: '9px', fontWeight: 300, letterSpacing: '0.22em', textTransform: 'uppercase',
                color: status === 'sending' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.55)',
                backgroundColor: 'transparent', border: 'none',
                cursor: status === 'sending' ? 'default' : 'pointer',
                padding: '4px 0', transition: 'color 0.3s',
              }}
              onMouseEnter={(e) => { if (status !== 'sending') e.currentTarget.style.color = '#fff' }}
              onMouseLeave={(e) => { if (status !== 'sending') e.currentTarget.style.color = 'rgba(255,255,255,0.55)' }}
            >
              {status === 'sending' ? t('rawRequestSending') : t('rawRequestSend')}
            </button>
            {status === 'error' && (
              <p style={{ fontSize: '9px', fontWeight: 300, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,100,100,0.7)', margin: 0 }}>
                {t('rawRequestError')}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  )
}

/* ── Product picker ───────────────────────────────────────────────────────── */

export default function ShopProductPicker({
  products,
  rawAvailable = false,
  photoTitle = '',
  location,
  caption,
  licenseNote,
}: {
  products: PickerProduct[]
  rawAvailable?: boolean
  photoTitle?: string
  location?: string
  caption?: string
  licenseNote?: React.ReactNode
}) {
  const t = useTranslations('shop')

  const typeLabel: Record<ProductType, string> = {
    print: t('prints'),
    'fine-art': t('fineArt'),
    digital: t('digital'),
  }

  const cheapest = products.reduce((lo, p) => (p.price < lo.price ? p : lo))
  const [selectedSku, setSelectedSku] = useState(cheapest.sku)
  const selected = products.find((p) => p.sku === selectedSku) ?? cheapest

  const locale = useLocale()
  const [rawModalOpen, setRawModalOpen] = useState(false)
  const [expandedSku, setExpandedSku] = useState<string | null>(null)

  // Stripe checkout state
  const [checkoutState, setCheckoutState] = useState<'idle' | 'loading' | 'open' | 'error'>('idle')
  const [clientSecret, setClientSecret] = useState<string | null>(null)

  async function handleBuy() {
    if (selected.type !== 'digital' || checkoutState === 'loading') return
    setCheckoutState('loading')
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: selected.sku, locale }),
      })
      if (!res.ok) throw new Error('checkout request failed')
      const { clientSecret: secret } = await res.json() as { clientSecret: string }
      setClientSecret(secret)
      setCheckoutState('open')
    } catch {
      setCheckoutState('error')
    }
  }

  const returnUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/${locale}/shop/order-complete`
    : `/${locale}/shop/order-complete`

  const groups = TYPE_ORDER.map((type) => ({
    type,
    items: products.filter((p) => p.type === type),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="mt-[9px]">
      {rawModalOpen && (
        <RawRequestModal photoTitle={photoTitle} onClose={() => setRawModalOpen(false)} />
      )}

      <div className="space-y-4">
        {groups.map((g, groupIndex) => (
          <div key={g.type} className="overflow-hidden rounded-[20px] border border-white/10">

            {/* Title section — rendered inside the first card only */}
            {groupIndex === 0 && (
              <div className="px-5 pt-5 pb-4 border-b border-white/[0.06]">
                {location && (
                  <p className="text-[10px] tracking-[0.3em] uppercase text-accent/80 mb-1.5">
                    {location}
                  </p>
                )}
                <h1 className="mt-[9px] text-4xl sm:text-5xl lg:text-6xl font-mono-ibm font-[200] leading-[1.05] tracking-tight text-accent">
                  {photoTitle}
                </h1>
                {caption && (
                  <p className="mt-4 text-[15px] font-light italic text-white/50 leading-relaxed">
                    {caption}
                  </p>
                )}
                {licenseNote}
              </div>
            )}

            {/* Shaded type header */}
            <div className="bg-white/[0.07] px-5 py-2.5">
              <h2 className="text-[12px] font-light tracking-[0.2em] uppercase text-accent">
                {typeLabel[g.type]}
              </h2>
            </div>

            {/* Selectable options */}
            <div className="divide-y divide-white/[0.07]">
              {g.items.map((p) => {
                const on = p.sku === selectedSku
                const isTiff = p.format === 'tiff'
                const infoOpen = expandedSku === p.sku

                return (
                  // div instead of button to allow nested button (info toggle)
                  <div
                    key={p.sku}
                    role="radio"
                    aria-checked={on}
                    onClick={() => setSelectedSku(p.sku)}
                    className={`flex w-full items-start gap-3 px-5 py-4 text-left transition-colors cursor-pointer select-none ${
                      on ? 'bg-accent/[0.14]' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    {/* Radio indicator */}
                    <span className="flex h-[22px] shrink-0 items-center">
                      <span
                        className={`grid h-3.5 w-3.5 place-items-center rounded-[3px] border transition-colors ${
                          on ? 'border-accent bg-accent' : 'border-white/35'
                        }`}
                      >
                        {on && <span className="h-1.5 w-1.5 rounded-[1px] bg-white" />}
                      </span>
                    </span>

                    <span className="flex-1 min-w-0">
                      {/* Label row */}
                      <span className="flex items-center gap-2">
                        <span className="block text-[15px] leading-[22px] text-white/85">{p.label}</span>
                        {isTiff && (
                          <span className="rounded px-1.5 py-0.5 text-[9px] font-light tracking-[0.14em] uppercase"
                            style={{ backgroundColor: 'rgba(147,16,32,0.25)', color: 'rgba(200,80,90,0.9)' }}>
                            TIFF
                          </span>
                        )}
                      </span>

                      {/* Spec */}
                      {p.spec && (
                        <span className="mt-1 block text-[12px] font-light tracking-wide text-white/60">{p.spec}</span>
                      )}

                      {/* Download token */}
                      {p.downloadToken && (
                        <span className="mt-1 block truncate font-mono-ibm text-[11px] tracking-wide text-white/30">
                          {p.downloadToken}.{p.format === 'tiff' ? 'tiff' : 'jpg'}
                        </span>
                      )}

                      {/* License label + info toggle */}
                      {p.license && (
                        <span className="mt-1 flex items-center gap-1.5">
                          <span className="text-[10px] tracking-[0.12em] uppercase text-white/25">
                            {t(LICENSE_I18N[p.license] as Parameters<typeof t>[0])}
                          </span>
                          <button
                            type="button"
                            aria-label="License details"
                            onClick={(e) => {
                              e.stopPropagation()
                              setExpandedSku(infoOpen ? null : p.sku)
                            }}
                            className={`shrink-0 transition-opacity ${infoOpen ? 'opacity-100 text-accent' : 'opacity-50 text-accent hover:opacity-100'}`}
                          >
                            <InfoIcon />
                          </button>
                        </span>
                      )}

                      {/* Accordion — license description */}
                      {infoOpen && p.license && (
                        <p className="mt-2 mb-1 text-[11px] font-light text-white/40 leading-relaxed pr-2">
                          {t(LICENSE_DESC_I18N[p.license] as Parameters<typeof t>[0])}
                        </p>
                      )}
                    </span>

                    <span className="shrink-0 text-right">
                      <span className="block leading-[22px] text-white">{p.priceText}</span>
                      <span className="mt-0.5 block text-[11px] text-white/40">≈ {p.approxText}</span>
                    </span>
                  </div>
                )
              })}

              {/* RAW on request */}
              {g.type === 'digital' && rawAvailable && (
                <button
                  type="button"
                  onClick={() => setRawModalOpen(true)}
                  className="flex w-full items-center gap-3 px-5 py-4 transition-colors hover:bg-white/[0.03]"
                >
                  <span className="flex-1 text-left text-[13px] text-white/55">{t('rawOnRequest')}</span>
                  <span className="text-[13px] text-accent">→</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {checkoutState === 'open' && clientSecret && (
        <CheckoutModal
          clientSecret={clientSecret}
          returnUrl={returnUrl}
          onClose={() => { setCheckoutState('idle'); setClientSecret(null) }}
          priceText={selected.priceText}
          photoTitle={photoTitle}
          productLabel={selected.label}
        />
      )}

      {selected.type === 'digital' ? (
        <button
          type="button"
          onClick={handleBuy}
          disabled={checkoutState === 'loading'}
          className={`mt-7 w-full rounded-[20px] py-3.5 text-[11px] font-light tracking-[0.22em] uppercase text-white transition-colors ${
            checkoutState === 'loading'
              ? 'bg-accent/40 cursor-default'
              : 'bg-accent/80 hover:bg-accent cursor-pointer'
          }`}
        >
          {checkoutState === 'loading' ? 'Preparing checkout…' : `${t('addToCart')} — ${selected.priceText}`}
        </button>
      ) : (
        <button
          type="button"
          disabled
          className="mt-7 w-full cursor-not-allowed rounded-[20px] bg-accent/80 py-3.5 text-[11px] font-light tracking-[0.22em] uppercase text-white opacity-50"
        >
          {t('addToCart')} — {selected.priceText}
        </button>
      )}

      <p className="mt-3 text-[13px] text-white/40">
        {t('priceNote')}
        {selected.type !== 'digital' && <> {t('checkoutSoon')}</>}
      </p>
      {checkoutState === 'error' && (
        <p className="mt-2 text-[12px] text-red-400/70">
          Could not start checkout — please try again.
        </p>
      )}
    </div>
  )
}
