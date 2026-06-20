'use client'

import { useState, useEffect } from 'react'
import { useLocale, useTranslations } from 'next-intl'

/** Destinations we fulfil to (mirror of the server's SHIPPING_COUNTRIES). */
const SHIP_COUNTRIES = ['DK', 'GB', 'DE', 'FR', 'NL', 'SE', 'NO', 'US', 'CA', 'AU', 'JP'] as const

export interface ShippingAddress {
  name: string
  line1: string
  line2: string
  city: string
  state: string
  postalCode: string
  country: string
}

export interface ShippingOption {
  method: string
  label: string
  amountMinor: number
  currency: string
}

/**
 * Pre-payment step for physical orders: collect the recipient address and let the
 * customer choose a delivery option. Shipping options come from Prodigi (the whole
 * basket + destination), so we re-quote whenever the country changes. On continue
 * we hand the chosen method + address up to the cart, which creates the Stripe
 * session (re-quoting server-side authoritatively).
 */
export default function ShippingStep({
  skus,
  defaultCountry,
  onBack,
  onContinue,
}: {
  skus: string[]
  defaultCountry: string
  onBack: () => void
  onContinue: (sel: { method: string; address: ShippingAddress; email: string }) => void
}) {
  const t = useTranslations('cart')
  const locale = useLocale()
  const [email, setEmail] = useState('')
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  const [addr, setAddr] = useState<ShippingAddress>({
    name: '', line1: '', line2: '', city: '', state: '', postalCode: '',
    country: (SHIP_COUNTRIES as readonly string[]).includes(defaultCountry) ? defaultCountry : 'DK',
  })
  const [options, setOptions] = useState<ShippingOption[] | null>(null)
  const [method, setMethod] = useState<string | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [quoteError, setQuoteError] = useState(false)

  const regionNames = (() => {
    try { return new Intl.DisplayNames([locale], { type: 'region' }) } catch { return null }
  })()
  const countryName = (c: string) => regionNames?.of(c) ?? c
  const money = (minor: number, currency: string) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: currency.toUpperCase() }).format(minor / 100)

  // Re-quote whenever the destination country (or basket) changes — Prodigi
  // shipping depends on both. Quote needs only the country, not the full address.
  useEffect(() => {
    let cancelled = false
    async function quote() {
      setQuoting(true); setQuoteError(false); setOptions(null); setMethod(null)
      try {
        const res = await fetch('/api/shipping-quotes', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ skus, destinationCountry: addr.country }),
        })
        const data = (await res.json().catch(() => ({}))) as { options?: ShippingOption[]; error?: string }
        if (cancelled) return
        // A real failure (unshippable destination / Prodigi down) blocks. An empty
        // list with 200 means there are no quotable (poster) items — e.g. a fine-art
        // order — so we still collect the address and continue with no charge.
        if (!res.ok) { setQuoteError(true); return }
        const opts = data.options ?? []
        setOptions(opts)
        setMethod(opts.length > 0 ? opts[0].method : null)
      } catch {
        if (!cancelled) setQuoteError(true)
      } finally {
        if (!cancelled) setQuoting(false)
      }
    }
    if (addr.country) void quote()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addr.country, skus.join(',')])

  const addressComplete =
    addr.name.trim() && addr.line1.trim() && addr.city.trim() && addr.postalCode.trim() && addr.country
  // Continue once the address is complete and the quote settled: with options we
  // need a method; with none (fine-art) the address alone is enough.
  const hasOptions = !!options && options.length > 0
  const canContinue =
    !!addressComplete && emailValid && !quoteError && !quoting && options !== null && (options.length === 0 || !!method)

  const set = (k: keyof ShippingAddress) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setAddr((a) => ({ ...a, [k]: e.target.value }))

  // Fixed height so every field (inputs AND the native select) lines up. The
  // `autofill:` rules override the browser's yellow autofill with brand red + white
  // text (the inset box-shadow trick is the only way to repaint an autofilled bg).
  const inputCls =
    'w-full h-[44px] rounded-[8px] border border-foreground/15 bg-foreground/[0.04] px-3 text-[14px] text-foreground placeholder:text-foreground/30 focus:border-[#931020] focus:outline-none transition-colors ' +
    'autofill:shadow-[inset_0_0_0_1000px_#931020] autofill:[-webkit-text-fill-color:#fff] autofill:caret-white'
  const labelCls = 'mb-1 block text-[10px] font-light tracking-[0.2em] uppercase text-foreground/55'

  return (
    <div className="pt-2 space-y-5">
      <div>
        <p className="text-[9px] font-light tracking-[0.22em] uppercase text-[#931020] mb-2">{t('deliveryHeading')}</p>
        <p className="text-[12px] font-light text-foreground/65 leading-relaxed">{t('deliveryIntro')}</p>
      </div>

      {/* Contact + address */}
      <div className="space-y-3">
        <div>
          <label className={labelCls}>{t('emailLabel')}</label>
          <input
            className={inputCls}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>{t('recipientName')}</label>
          <input className={inputCls} value={addr.name} onChange={set('name')} autoComplete="name" />
        </div>
        <div>
          <label className={labelCls}>{t('addressLine1')}</label>
          <input className={inputCls} value={addr.line1} onChange={set('line1')} autoComplete="address-line1" />
        </div>
        <div>
          <label className={labelCls}>{t('addressLine2')}</label>
          <input className={inputCls} value={addr.line2} onChange={set('line2')} autoComplete="address-line2" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>{t('postalCode')}</label>
            <input className={inputCls} value={addr.postalCode} onChange={set('postalCode')} autoComplete="postal-code" />
          </div>
          <div>
            <label className={labelCls}>{t('city')}</label>
            <input className={inputCls} value={addr.city} onChange={set('city')} autoComplete="address-level2" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>{t('stateRegion')}</label>
            <input className={inputCls} value={addr.state} onChange={set('state')} autoComplete="address-level1" />
          </div>
          <div>
            <label className={labelCls}>{t('country')}</label>
            <select className={inputCls} value={addr.country} onChange={set('country')} autoComplete="country">
              {SHIP_COUNTRIES.map((c) => (
                <option key={c} value={c}>{countryName(c)}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Delivery options — hidden when there's nothing quotable (e.g. fine art). */}
      <div>
        {quoting ? (
          <div className="flex items-center gap-2 py-3">
            <span className="shop-spinner" />
            <span className="text-[11px] font-light text-foreground/55">{t('quoting')}</span>
          </div>
        ) : quoteError ? (
          <div className="rounded-[10px] border border-[#931020]/40 bg-[#931020]/[0.06] px-4 py-3">
            <p className="text-[12px] font-light text-foreground/70 leading-relaxed">{t('shippingUnavailable')}</p>
          </div>
        ) : hasOptions ? (
          <div className="space-y-2">
            <p className="mb-2.5 text-[10px] font-light tracking-[0.22em] uppercase text-foreground/55">{t('chooseDelivery')}</p>
            {(options ?? []).map((o) => {
              const sel = method === o.method
              return (
                <button
                  type="button"
                  key={o.method}
                  role="radio"
                  aria-checked={sel}
                  onClick={() => setMethod(o.method)}
                  className={`flex w-full items-center justify-between rounded-[10px] border px-4 py-3 text-left transition-colors ${
                    sel
                      ? 'border-[#931020]/60 bg-[#931020]/[0.08]'
                      : 'border-transparent bg-foreground/[0.03] hover:bg-foreground/[0.06]'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    {/* Square selection control — matches the site's custom radios. */}
                    <span className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[3px] border ${sel ? 'border-[#931020] bg-[#931020]' : 'border-foreground/30'}`}>
                      {sel && <span className="h-1.5 w-1.5 rounded-[1px] bg-white" />}
                    </span>
                    <span className="text-[13px] font-light text-foreground/85">{o.label}</span>
                  </span>
                  <span className="text-[13px] font-mono-ibm tabular-nums text-foreground/90">{money(o.amountMinor, o.currency)}</span>
                </button>
              )
            })}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        disabled={!canContinue}
        onClick={() => onContinue({ method: method ?? '', address: addr, email: email.trim() })}
        className={`w-full rounded-[14px] py-3.5 text-[11px] font-light tracking-[0.22em] uppercase text-white transition-colors ${
          canContinue ? 'bg-[#931020]/80 hover:bg-[#931020] cursor-pointer' : 'bg-[#931020]/35 cursor-default'
        }`}
      >
        {t('continueToPayment')} →
      </button>
      <button
        type="button"
        onClick={onBack}
        className="block w-full text-center text-[10px] font-light tracking-[0.18em] uppercase text-foreground/25 hover:text-foreground/55 transition-colors"
      >
        ← {t('backToCart')}
      </button>
    </div>
  )
}
