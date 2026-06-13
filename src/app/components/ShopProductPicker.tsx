'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { ProductType, LicenseTier } from '@/lib/shop'
import { useCartStore } from '@/store/cart'
import type { CartItemType } from '@/store/cart'

export interface PickerProduct {
  sku: string
  type: ProductType
  label: string
  /** Spec line — pixel size (digital) or paper size in cm (print/fine-art). */
  spec: string | null
  price: number
  currency: string
  priceText: string
  approxText: string
  format?: 'jpeg' | 'tiff'
  /** GMP-XXXXXXX token — customer-facing filename reference for digital downloads. */
  downloadToken?: string
  /** Usage-rights tier bundled with this product. */
  license?: LicenseTier
  // ── Poster paper variant (posters only) ──
  /** Paper code, e.g. 'FAP' — posters are grouped by paper, then size. */
  paper?: string
  /** Customer-facing paper name, e.g. 'Enhanced Matte'. */
  paperLabel?: string
  /** Short paper descriptor. */
  paperBlurb?: string
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
    borderBottom: '1px solid rgb(var(--fg) / 0.15)',
    color: 'rgb(var(--fg))', fontSize: '13px', fontWeight: 300,
    letterSpacing: '0.04em', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.78)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full rounded-[20px] border border-foreground/10"
        style={{ maxWidth: '420px', margin: '0 16px', backgroundColor: 'rgb(var(--bg))', padding: '28px 28px 24px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button" onClick={onClose} aria-label="Close"
          style={{
            position: 'absolute', top: '16px', right: '20px',
            background: 'none', border: 'none', padding: 0,
            cursor: 'pointer', color: 'rgb(var(--fg) / 0.35)',
            fontSize: '22px', lineHeight: 1, transition: 'color 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'rgb(var(--fg))' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgb(var(--fg) / 0.35)' }}
        >×</button>

        <p style={{ fontSize: '9px', fontWeight: 300, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgb(var(--fg))', marginBottom: '4px' }}>
          {t('rawRequestTitle')}
        </p>
        <p style={{ fontSize: '13px', fontWeight: 300, letterSpacing: '0.02em', color: 'rgb(var(--fg) / 0.45)', marginBottom: '22px' }}>
          {photoTitle}
        </p>

        {status === 'success' ? (
          <p style={{ fontSize: '11px', fontWeight: 300, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgb(var(--fg) / 0.55)' }}>
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
                color: status === 'sending' ? 'rgb(var(--fg) / 0.25)' : 'rgb(var(--fg) / 0.55)',
                backgroundColor: 'transparent', border: 'none',
                cursor: status === 'sending' ? 'default' : 'pointer',
                padding: '4px 0', transition: 'color 0.3s',
              }}
              onMouseEnter={(e) => { if (status !== 'sending') e.currentTarget.style.color = 'rgb(var(--fg))' }}
              onMouseLeave={(e) => { if (status !== 'sending') e.currentTarget.style.color = 'rgb(var(--fg) / 0.55)' }}
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
  photoSlug,
  rawAvailable = false,
  photoTitle = '',
  location,
  caption,
  licenseNote,
  previewUrl,
  primaryType,
}: {
  products: PickerProduct[]
  photoSlug: string
  rawAvailable?: boolean
  photoTitle?: string
  location?: string
  caption?: string
  licenseNote?: React.ReactNode
  previewUrl?: string
  /** The product type the customer arrived through (from the shop section they
   *  were browsing). Its group leads and keeps a plain heading; the other types
   *  are framed as "Also available as …". Undefined ⇒ canonical order, plain. */
  primaryType?: ProductType
}) {
  const t = useTranslations('shop')
  const addItem = useCartStore((s) => s.addItem)
  const buyNow = useCartStore((s) => s.buyNow)
  const cartItems = useCartStore((s) => s.items)

  const typeLabel: Record<ProductType, string> = {
    print: t('prints'),
    'fine-art': t('fineArt'),
    digital: t('digital'),
  }

  const cheapest = products.reduce((lo, p) => (p.price < lo.price ? p : lo))
  const [selectedSku, setSelectedSku] = useState(cheapest.sku)
  const selected = products.find((p) => p.sku === selectedSku) ?? cheapest

  // Poster papers (distinct, in product order) — posters offer a paper choice,
  // then the sizes that pass for this photo on that paper.
  const posterPapers: { code: string; label: string; blurb?: string }[] = []
  for (const p of products) {
    if (p.type === 'print' && p.paper && !posterPapers.some((x) => x.code === p.paper)) {
      posterPapers.push({ code: p.paper, label: p.paperLabel ?? p.paper, blurb: p.paperBlurb })
    }
  }
  const [selectedPaper, setSelectedPaper] = useState<string | null>(
    () => products.find((p) => p.type === 'print' && p.paper)?.paper ?? null,
  )
  // Switch paper, keeping the same size when it's offered on the new paper.
  function selectPaper(paper: string) {
    setSelectedPaper(paper)
    const cur = products.find((p) => p.sku === selectedSku)
    const sameSize = products.find((p) => p.type === 'print' && p.paper === paper && p.label === cur?.label)
    const firstOfPaper = products.find((p) => p.type === 'print' && p.paper === paper)
    const next = sameSize ?? firstOfPaper
    if (next) setSelectedSku(next.sku)
  }

  const [rawModalOpen, setRawModalOpen] = useState(false)
  const [expandedSku, setExpandedSku] = useState<string | null>(null)

  const [cartAdded, setCartAdded] = useState(false)

  const alreadyInCart = cartItems.some((i) => i.sku === selected.sku)

  function buildCartItem() {
    return {
      sku: selected.sku,
      photoSlug,
      photoTitle,
      productLabel: selected.paper ? `${selected.label} · ${selected.paperLabel}` : selected.label,
      price: selected.price,
      currency: selected.currency,
      priceText: selected.priceText,
      type: selected.type as CartItemType,
      thumbnailUrl: previewUrl,
      downloadToken: selected.downloadToken,
      format: selected.format,
    }
  }

  function handleBuyNow() {
    buyNow(buildCartItem())
  }

  function handleAddToCart() {
    addItem(buildCartItem())
    setCartAdded(true)
    setTimeout(() => setCartAdded(false), 2500)
  }

  // Order types canonically, but float the section the customer came through to
  // the top so the page leads with what they were browsing.
  const orderedTypes = primaryType
    ? [primaryType, ...TYPE_ORDER.filter((t) => t !== primaryType)]
    : TYPE_ORDER
  const groups = orderedTypes
    .map((type) => ({ type, items: products.filter((p) => p.type === type) }))
    .filter((g) => g.items.length > 0)

  // Digital-download lead: every photo in an event shares the same title, so the
  // heading shows the unique photo code (GMP-…) and the title drops to a bold
  // sub-line — otherwise every digital page looks identical. Posters/fine-art keep
  // the title as the heading.
  const isDigital = primaryType === 'digital'

  // Cross-sell framing only kicks in when we know the section the customer came
  // through AND that section is actually present on this photo.
  const hasPrimary = primaryType != null && groups.some((g) => g.type === primaryType)
  const groupHeading = (type: ProductType) =>
    hasPrimary && type !== primaryType
      ? t('alsoAvailableAs', { name: typeLabel[type] })
      : typeLabel[type]

  return (
    <div className="mt-[9px] xl:mt-0">
      {rawModalOpen && (
        <RawRequestModal photoTitle={photoTitle} onClose={() => setRawModalOpen(false)} />
      )}

      <div className="space-y-4">
        {groups.map((g, groupIndex) => {
          // Posters: a paper chooser, then only the sizes that pass for this photo
          // on the chosen paper. Other types: the plain option list.
          const isPoster = g.type === 'print' && posterPapers.length > 0
          const items = isPoster && selectedPaper
            ? g.items.filter((p) => p.paper === selectedPaper)
            : g.items
          const paperBlurb = isPoster
            ? posterPapers.find((x) => x.code === selectedPaper)?.blurb
            : undefined
          return (
          <div key={g.type} className="overflow-hidden rounded-[20px] border border-foreground/10">

            {/* Title section — rendered inside the first card only */}
            {groupIndex === 0 && (
              <div className="px-5 pt-5 pb-4 border-b border-foreground/[0.06]">
                {location && (
                  <p className="text-[10px] tracking-[0.3em] uppercase text-accent/80 mb-1.5">
                    {location}
                  </p>
                )}
                <h1 className="mt-[9px] text-4xl sm:text-5xl lg:text-6xl font-mono-ibm font-[200] leading-[1.05] tracking-tight text-accent">
                  {isDigital ? photoSlug.toUpperCase() : photoTitle}
                </h1>
                {isDigital ? (
                  <p className="mt-4 text-[15px] font-light text-foreground leading-relaxed">
                    {photoTitle}
                  </p>
                ) : caption ? (
                  <p className="mt-4 text-[15px] font-light italic text-foreground/50 leading-relaxed">
                    {caption}
                  </p>
                ) : null}
                {licenseNote}
              </div>
            )}

            {/* Shaded type header */}
            <div className="bg-foreground/[0.07] px-5 py-2.5">
              <h2 className="text-[12px] font-light tracking-[0.2em] uppercase text-accent">
                {groupHeading(g.type)}
              </h2>
            </div>

            {/* Paper chooser (posters only) */}
            {isPoster && (
              <div className="px-5 pt-4 pb-3 border-b border-foreground/[0.06]">
                <div className="flex flex-wrap gap-2">
                  {posterPapers.map((pp) => {
                    const on = pp.code === selectedPaper
                    return (
                      <button
                        key={pp.code}
                        type="button"
                        onClick={() => selectPaper(pp.code)}
                        className={`rounded-full px-3 py-1.5 text-[11px] tracking-[0.04em] transition-colors ${
                          on
                            ? 'bg-accent/90 text-white'
                            : 'border border-foreground/15 text-foreground/55 hover:border-foreground/35 hover:text-foreground/80'
                        }`}
                      >
                        {pp.label}
                      </button>
                    )
                  })}
                </div>
                {paperBlurb && (
                  <p className="mt-2 text-[11px] font-light text-foreground/35">{paperBlurb}</p>
                )}
              </div>
            )}

            {/* Selectable options */}
            <div className="divide-y divide-foreground/[0.07]">
              {items.map((p) => {
                const on = p.sku === selectedSku
                const isTiff = p.format === 'tiff'
                const infoOpen = expandedSku === p.sku

                return (
                  <div
                    key={p.sku}
                    role="radio"
                    aria-checked={on}
                    onClick={() => setSelectedSku(p.sku)}
                    className={`flex w-full items-start gap-3 px-5 py-4 text-left transition-colors cursor-pointer select-none ${
                      on ? 'bg-accent/[0.14]' : 'hover:bg-foreground/[0.03]'
                    }`}
                  >
                    {/* Radio indicator */}
                    <span className="flex h-[22px] shrink-0 items-center">
                      <span
                        className={`grid h-3.5 w-3.5 place-items-center rounded-[3px] border transition-colors ${
                          on ? 'border-accent bg-accent' : 'border-foreground/35'
                        }`}
                      >
                        {on && <span className="h-1.5 w-1.5 rounded-[1px] bg-white" />}
                      </span>
                    </span>

                    <span className="flex-1 min-w-0">
                      {/* Label row */}
                      <span className="flex items-center gap-2">
                        <span className="block text-[15px] leading-[22px] text-foreground/85">{p.label}</span>
                        {isTiff && (
                          <span className="rounded px-1.5 py-0.5 text-[9px] font-light tracking-[0.14em] uppercase"
                            style={{ backgroundColor: 'rgba(147,16,32,0.25)', color: 'rgba(200,80,90,0.9)' }}>
                            TIFF
                          </span>
                        )}
                      </span>

                      {/* Spec */}
                      {p.spec && (
                        <span className="mt-1 block text-[12px] font-light tracking-wide text-foreground/60">{p.spec}</span>
                      )}

                      {/* Download token */}
                      {p.downloadToken && (
                        <span className="mt-1 block truncate font-mono-ibm text-[11px] tracking-wide text-foreground/30">
                          {p.downloadToken}.{p.format === 'tiff' ? 'tiff' : 'jpg'}
                        </span>
                      )}

                      {/* License label + info toggle */}
                      {p.license && (
                        <span className="mt-1 flex items-center gap-1.5">
                          <span className="text-[10px] tracking-[0.12em] uppercase text-foreground/25">
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
                        <p className="mt-2 mb-1 text-[11px] font-light text-foreground/40 leading-relaxed pr-2">
                          {t(LICENSE_DESC_I18N[p.license] as Parameters<typeof t>[0])}
                        </p>
                      )}
                    </span>

                    <span className="shrink-0 text-right">
                      <span className="block leading-[22px] text-foreground">{p.priceText}</span>
                      <span className="mt-0.5 block text-[11px] text-foreground/40">≈ {p.approxText}</span>
                    </span>
                  </div>
                )
              })}

              {/* RAW on request */}
              {g.type === 'digital' && rawAvailable && (
                <button
                  type="button"
                  onClick={() => setRawModalOpen(true)}
                  className="flex w-full items-center gap-3 px-5 py-4 transition-colors hover:bg-foreground/[0.03]"
                >
                  <span className="flex-1 text-left text-[13px] text-foreground/55">{t('rawOnRequest')}</span>
                  <span className="text-[13px] text-accent">→</span>
                </button>
              )}
            </div>
          </div>
          )
        })}
      </div>

      {/* Buy Now + Add to Cart — equal halves */}
      <div className="mt-7 grid grid-cols-2 gap-2">
        {/* Buy Now — primary */}
        <button
          type="button"
          onClick={handleBuyNow}
          aria-label={`${t('buyNow')} — ${selected.priceText}`}
          className="flex items-center justify-center gap-2 rounded-[20px] py-3.5 text-[11px] font-light tracking-[0.18em] uppercase text-white transition-colors bg-accent/80 hover:bg-accent cursor-pointer"
        >
          <svg width="11" height="16" viewBox="0 0 11 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M6.5 1L1 9h4.5L4.5 15 10 7H5.5L6.5 1Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
          </svg>
          {t('buyNow')} — {selected.priceText}
        </button>

        {/* Add to Cart — secondary */}
        <button
          type="button"
          onClick={handleAddToCart}
          disabled={alreadyInCart}
          aria-label={alreadyInCart ? t('inCart') : t('addToCart')}
          title={alreadyInCart ? t('inCart') : t('addToCart')}
          className={`flex items-center justify-center gap-2 rounded-[20px] border py-3.5 text-[11px] font-light tracking-[0.18em] uppercase transition-colors ${
            alreadyInCart
              ? 'border-foreground/15 text-foreground/30 cursor-default'
              : 'border-foreground/20 text-foreground/55 hover:border-foreground/40 hover:text-foreground/80 cursor-pointer'
          }`}
        >
          {alreadyInCart && cartAdded ? (
            <>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M2 7l4 4 6-6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {t('added')}
            </>
          ) : (
            <>
              <svg width="14" height="16" viewBox="0 0 18 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M1.5 6.5h15l-1.5 12h-12L1.5 6.5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
                <path d="M6 6.5V5a3 3 0 0 1 6 0v1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
              </svg>
              {alreadyInCart ? t('inCart') : t('addToCart')}
            </>
          )}
        </button>
      </div>

      {/* Tax disclosure — prices are exclusive of VAT, applied at checkout */}
      <p className="mt-3 text-center text-[10px] font-light tracking-[0.16em] uppercase text-foreground/30">
        {t('priceExclVat')}
      </p>

    </div>
  )
}
