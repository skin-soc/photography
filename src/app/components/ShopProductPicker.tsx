'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { ProductType } from '@/lib/shop'

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
}

const TYPE_ORDER: ProductType[] = ['print', 'fine-art', 'digital']

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
    display: 'block',
    width: '100%',
    padding: '4px 0 6px 0',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '1px solid rgba(255,255,255,0.15)',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 300,
    letterSpacing: '0.04em',
    outline: 'none',
    boxSizing: 'border-box',
  }

  return (
    /* Backdrop — click outside to close */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.78)' }}
      onClick={onClose}
    >
      {/* Card */}
      <div
        className="relative w-full rounded-[20px] border border-white/10"
        style={{ maxWidth: '420px', margin: '0 16px', backgroundColor: '#0c0c0c', padding: '28px 28px 24px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: '16px', right: '20px',
            background: 'none', border: 'none', padding: 0,
            cursor: 'pointer', color: 'rgba(255,255,255,0.35)',
            fontSize: '22px', lineHeight: 1, transition: 'color 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#fff' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)' }}
        >
          ×
        </button>

        {/* Header */}
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
            {/* Hidden fields for Formspree email subject + photo context */}
            <input type="hidden" name="_subject" value={`RAW file request — ${photoTitle}`} />
            <input type="hidden" name="photo" value={photoTitle} />

            <input type="text"  name="name"    placeholder={tf('name')}    required style={fieldStyle} />
            <input type="email" name="email"   placeholder={tf('email')}   required style={fieldStyle} />
            <textarea           name="message" placeholder={tf('message')}
              style={{ ...fieldStyle, minHeight: '80px', resize: 'none' }}
            />

            <button
              type="submit"
              disabled={status === 'sending'}
              style={{
                alignSelf: 'flex-start',
                marginTop: '6px',
                fontSize: '9px', fontWeight: 300,
                letterSpacing: '0.22em', textTransform: 'uppercase',
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

/**
 * Interactive product chooser for a shop photo. Each product class (Prints /
 * Fine Art / Digital Downloads) is one rounded "pill" — a shaded header over
 * its selectable options. Picking an option drives the Add to cart button.
 */
export default function ShopProductPicker({
  products,
  rawAvailable = false,
  photoTitle = '',
}: {
  products: PickerProduct[]
  rawAvailable?: boolean
  /** Photo title — used to pre-fill the RAW request modal subject. */
  photoTitle?: string
}) {
  const t = useTranslations('shop')

  const typeLabel: Record<ProductType, string> = {
    print: t('prints'),
    'fine-art': t('fineArt'),
    digital: t('digital'),
  }

  // Default to the cheapest option so the CTA always shows a price.
  const cheapest = products.reduce((lo, p) => (p.price < lo.price ? p : lo))
  const [selectedSku, setSelectedSku] = useState(cheapest.sku)
  const selected = products.find((p) => p.sku === selectedSku) ?? cheapest

  const [rawModalOpen, setRawModalOpen] = useState(false)

  const groups = TYPE_ORDER.map((type) => ({
    type,
    items: products.filter((p) => p.type === type),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="mt-10">
      {rawModalOpen && (
        <RawRequestModal photoTitle={photoTitle} onClose={() => setRawModalOpen(false)} />
      )}

      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.type} className="overflow-hidden rounded-[20px] border border-white/10">
            {/* Shaded header */}
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
                return (
                  <button
                    key={p.sku}
                    type="button"
                    onClick={() => setSelectedSku(p.sku)}
                    aria-pressed={on}
                    className={`flex w-full items-start gap-3 px-5 py-3 text-left transition-colors ${
                      on ? 'bg-accent/[0.14]' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    {/* Radio indicator — centered to the label's text line */}
                    <span className="flex h-[22px] shrink-0 items-center">
                      <span
                        className={`grid h-3.5 w-3.5 place-items-center rounded-full border transition-colors ${
                          on ? 'border-accent bg-accent' : 'border-white/35'
                        }`}
                      >
                        {on && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </span>
                    </span>

                    <span className="flex-1">
                      <span className="flex items-center gap-2">
                        <span className="block text-[15px] leading-[22px] text-white/85">
                          {p.label}
                        </span>
                        {isTiff && (
                          <span className="rounded px-1.5 py-0.5 text-[9px] font-light tracking-[0.14em] uppercase"
                            style={{ backgroundColor: 'rgba(147,16,32,0.25)', color: 'rgba(200,80,90,0.9)' }}>
                            TIFF
                          </span>
                        )}
                      </span>
                      {p.spec && (
                        <span className="mt-1 block text-[12px] font-light tracking-wide text-white/60">{p.spec}</span>
                      )}
                    </span>

                    <span className="shrink-0 text-right">
                      <span className="block leading-[22px] text-white">{p.priceText}</span>
                      <span className="mt-0.5 block text-[11px] text-white/40">
                        ≈ {p.approxText}
                      </span>
                    </span>
                  </button>
                )
              })}

              {/* RAW on request — opens modal, not a selectable product */}
              {g.type === 'digital' && rawAvailable && (
                <button
                  type="button"
                  onClick={() => setRawModalOpen(true)}
                  className="flex w-full items-center gap-3 px-5 py-3 transition-colors hover:bg-white/[0.03]"
                >
                  <span className="flex-1 text-left text-[13px] text-white/55">
                    {t('rawOnRequest')}
                  </span>
                  <span className="text-[13px] text-accent">→</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled
        className="mt-7 w-full cursor-not-allowed rounded-[20px] bg-accent/80 py-3.5 text-[11px] font-light tracking-[0.22em] uppercase text-white"
      >
        {t('addToCart')} — {selected.priceText}
      </button>
      <p className="mt-3 text-[13px] text-white/40">
        {t('priceNote')} {t('checkoutSoon')}
      </p>
    </div>
  )
}
