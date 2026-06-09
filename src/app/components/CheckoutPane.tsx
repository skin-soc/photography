'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import {
  CheckoutElementsProvider,
  PaymentElement,
  ShippingAddressElement,
  useCheckout,
} from '@stripe/react-stripe-js/checkout'
import type { StripeElementsOptions } from '@stripe/stripe-js'
import { stripePromise } from '@/lib/stripe-client'

export interface DownloadItem {
  token: string
  format: 'jpeg' | 'tiff'
  label: string
  slug: string
}

interface CheckoutPaneProps {
  clientSecret: string
  hasPhysical: boolean
  downloadItems: DownloadItem[]
  /** Buyer country from IP — set on the session for tax, no address form needed. */
  billingCountry: string | null
  totalText: string
  /** B2B: VAT reverse-charged (0%) for a validated EU business — show a note. */
  reverseCharge?: boolean
  businessName?: string | null
  onBack: () => void
  onSuccess: (downloads: DownloadItem[], hasPhysical: boolean, sessionId: string) => void
}

// ── Stripe appearance — matches site dark palette ─────────────────────────────
const appearance: StripeElementsOptions['appearance'] = {
  theme: 'night',
  variables: {
    colorPrimary: '#931020',
    colorBackground: '#161616',
    colorText: 'rgba(255,255,255,0.85)',
    colorTextSecondary: 'rgba(255,255,255,0.4)',
    colorDanger: '#f87171',
    fontFamily: 'inherit',
    borderRadius: '10px',
    fontSizeBase: '13px',
    spacingUnit: '4px',
  },
  rules: {
    '.Input': {
      border: '1px solid rgba(255,255,255,0.12)',
      backgroundColor: '#0d0d0d',
      boxShadow: 'none',
    },
    '.Input:focus': {
      border: '1px solid rgba(255,255,255,0.30)',
      boxShadow: 'none',
    },
    '.Label': {
      fontSize: '10px',
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
      color: 'rgba(255,255,255,0.35)',
    },
    '.Tab': {
      border: '1px solid rgba(255,255,255,0.10)',
      backgroundColor: '#0d0d0d',
    },
    '.Tab--selected': {
      border: '1px solid rgba(147,16,32,0.7)',
    },
  },
}

// ── Inner form — must be inside <CheckoutElementsProvider> ────────────────────
function PaymentForm({
  hasPhysical,
  downloadItems,
  billingCountry,
  totalText,
  reverseCharge,
  businessName,
  onBack,
  onSuccess,
}: Omit<CheckoutPaneProps, 'clientSecret'>) {
  const t = useTranslations('cart')
  const co = useCheckout()
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  // Plain email input — Stripe records it on the session (customer email), which
  // fulfilment reads to send the download link. No Link element, no phone field.
  const [email, setEmail] = useState('')
  const [countrySet, setCountrySet] = useState(false)
  const [promo, setPromo] = useState('')
  const [promoBusy, setPromoBusy] = useState(false)
  const [promoErr, setPromoErr] = useState<string | null>(null)

  // Record the buyer's country (from IP) on the session once — it's our VAT
  // location evidence (reconciled against the card-issuer country in admin). VAT
  // itself is already applied as a tax_rate at session creation from this same
  // country, so no address form is needed for a digital download.
  useEffect(() => {
    if (co.type !== 'success' || !billingCountry || countrySet) return
    setCountrySet(true)
    co.checkout
      .updateBillingAddress({ address: { country: billingCountry } })
      .catch(() => { /* non-fatal — country is just location evidence here */ })
  }, [co, billingCountry, countrySet])

  if (co.type === 'loading') {
    return (
      <div className="flex justify-center py-12">
        <span className="shop-spinner" />
      </div>
    )
  }
  if (co.type === 'error') {
    return <p className="text-[12px] text-red-400/80 leading-snug">{co.error.message}</p>
  }
  const checkout = co.checkout

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (state === 'loading') return
    setState('loading')
    setErrorMsg('')
    try {
      // Best-effort: set the buyer's email on the session (for receipt + the
      // download email). Optional — they also get the passcode on-screen.
      if (email) await checkout.updateEmail(email)
      // redirect: 'if_required' keeps card inline; Klarna/Amazon Pay redirect
      // to the session's return_url (set at session creation).
      const result = await checkout.confirm({ redirect: 'if_required' })
      if (result.type === 'error') {
        console.error('[checkout] confirm error:', result.error)
        setState('error')
        setErrorMsg(result.error.message ?? t('paymentFailed'))
        return
      }
      onSuccess(downloadItems, hasPhysical, result.session.id)
    } catch (err) {
      console.error('[checkout] confirm threw:', err)
      setState('error')
      setErrorMsg(err instanceof Error ? err.message : t('paymentFailed'))
    }
  }

  // Stripe pre-formats these amount strings (and updates tax once an address is
  // entered). Fall back to the cart total before the session has computed.
  const total = checkout.total
  const taxMinor = total?.taxExclusive?.minorUnitsAmount ?? 0
  const appliedDiscount = checkout.discountAmounts && checkout.discountAmounts.length > 0
    ? checkout.discountAmounts[0]
    : null

  async function applyPromo() {
    const code = promo.trim()
    if (!code) return
    setPromoBusy(true)
    setPromoErr(null)
    try {
      const r = await checkout.applyPromotionCode(code)
      if (r.type === 'error') setPromoErr(r.error.message || 'Invalid or expired code')
      else setPromo('')
    } catch {
      setPromoErr('Couldn’t apply code')
    } finally {
      setPromoBusy(false)
    }
  }
  async function removePromo() {
    setPromoBusy(true)
    setPromoErr(null)
    try { await checkout.removePromotionCode() } catch { /* ignore */ } finally { setPromoBusy(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Email — optional; used to send the download link + passcode. */}
      <div>
        <p className="mb-3 text-[10px] font-light tracking-[0.22em] uppercase text-white/35">
          {t('emailLabel')}
        </p>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-[8px] border border-white/15 bg-white/[0.04] px-4 py-3 text-[14px] text-white placeholder:text-white/25 focus:border-[#931020] focus:outline-none transition-colors"
        />
      </div>

      {/* Shipping address — only for physical items */}
      {hasPhysical && (
        <div>
          <p className="mb-3 text-[10px] font-light tracking-[0.22em] uppercase text-white/35">
            {t('shippingAddress')}
          </p>
          <ShippingAddressElement />
        </div>
      )}

      {/* Payment method */}
      <div>
        <p className="mb-3 text-[10px] font-light tracking-[0.22em] uppercase text-white/35">
          {t('paymentDetails')}
        </p>
        <PaymentElement
          options={{
            layout: 'tabs',
            // We supply the country ourselves (from IP, via updateBillingAddress).
            // A card form collects country + postal code by default, so both must
            // be opted out here — otherwise Stripe errors on a partial/conflicting
            // billing address. EU tax needs only the country, which we provide.
            fields: { billingDetails: { address: { country: 'never', postalCode: 'never' } } },
          }}
        />
      </div>

      {/* Promo code */}
      <div>
        {appliedDiscount ? (
          <div className="flex items-center justify-between rounded-[8px] border border-[#931020]/40 bg-[#931020]/[0.06] px-4 py-2.5">
            <span className="text-[12px] font-light text-white/70">
              {appliedDiscount.displayName} · <span className="text-[#931020]">−{appliedDiscount.amount}</span>
            </span>
            <button
              type="button"
              onClick={removePromo}
              disabled={promoBusy}
              className="text-[10px] font-light tracking-[0.18em] uppercase text-white/40 hover:text-white transition-colors disabled:opacity-40"
            >
              {t('remove')}
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              value={promo}
              onChange={(e) => setPromo(e.target.value.toUpperCase())}
              placeholder={t('promoCode')}
              spellCheck={false}
              className="flex-1 rounded-[8px] border border-white/15 bg-white/[0.04] px-4 py-2.5 font-mono-ibm text-[13px] tracking-wide text-white placeholder:text-white/25 focus:border-[#931020] focus:outline-none transition-colors"
            />
            <button
              type="button"
              onClick={applyPromo}
              disabled={promoBusy || !promo.trim()}
              className="shrink-0 rounded-[8px] border border-white/15 px-4 py-2.5 text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white/70 hover:border-white/40 hover:text-white transition-colors disabled:opacity-40"
            >
              {promoBusy ? '…' : t('apply')}
            </button>
          </div>
        )}
        {promoErr && <p className="mt-1.5 text-[11px] text-red-400/80">{promoErr}</p>}
      </div>

      {/* B2B reverse charge — no VAT line; explain why. */}
      {reverseCharge && (
        <div className="rounded-[8px] border border-emerald-400/25 bg-emerald-400/[0.04] px-3 py-2">
          <p className="text-[10px] font-light leading-snug text-emerald-300/80">
            {t('reverseChargeCheckout', { business: businessName ? ` · ${businessName}` : '' })}
          </p>
        </div>
      )}

      {/* Order summary — live totals from Stripe (incl. tax once known) */}
      <div className="border-t border-white/[0.07] pt-4 space-y-1.5">
        {taxMinor > 0 && total && (
          <>
            <div className="flex items-baseline justify-between">
              <p className="text-[10px] font-light tracking-[0.22em] uppercase text-white/25">{t('subtotal')}</p>
              <p className="text-[12px] font-light text-white/45">{total.subtotal.amount}</p>
            </div>
            <div className="flex items-baseline justify-between">
              <p className="text-[10px] font-light tracking-[0.22em] uppercase text-white/25">{t('vat')}</p>
              <p className="text-[12px] font-light text-white/45">{total.taxExclusive.amount}</p>
            </div>
          </>
        )}
        {appliedDiscount && total && (
          <div className="flex items-baseline justify-between">
            <p className="text-[10px] font-light tracking-[0.22em] uppercase text-white/25">{t('discount')}</p>
            <p className="text-[12px] font-light text-[#931020]">−{total.discount.amount}</p>
          </div>
        )}
        <div className="flex items-baseline justify-between">
          <p className="text-[10px] font-light tracking-[0.22em] uppercase text-white/35">{t('total')}</p>
          <p className="text-[16px] font-light text-white">{total?.total?.amount ?? totalText}</p>
        </div>
      </div>

      {errorMsg && (
        <p className="text-[11px] text-red-400/80 leading-snug">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={state === 'loading'}
        className={`w-full rounded-[14px] py-3.5 text-[11px] font-light tracking-[0.22em] uppercase text-white transition-colors ${
          state === 'loading'
            ? 'bg-[#931020]/35 cursor-default'
            : 'bg-[#931020]/80 hover:bg-[#931020] cursor-pointer'
        }`}
      >
        {state === 'loading' ? t('processing') : `${t('pay')} ${total?.total?.amount ?? totalText}`}
      </button>

      <button
        type="button"
        onClick={onBack}
        disabled={state === 'loading'}
        className="text-center text-[10px] font-light tracking-[0.18em] uppercase text-white/25 hover:text-white/55 transition-colors disabled:pointer-events-none"
      >
        ← {t('backToCart')}
      </button>
    </form>
  )
}

// ── Public export — wraps form in the Checkout provider ───────────────────────
export default function CheckoutPane(props: CheckoutPaneProps) {
  return (
    <CheckoutElementsProvider
      stripe={stripePromise}
      options={{ clientSecret: props.clientSecret, elementsOptions: { appearance } }}
    >
      <PaymentForm
        hasPhysical={props.hasPhysical}
        downloadItems={props.downloadItems}
        billingCountry={props.billingCountry}
        totalText={props.totalText}
        reverseCharge={props.reverseCharge}
        businessName={props.businessName}
        onBack={props.onBack}
        onSuccess={props.onSuccess}
      />
    </CheckoutElementsProvider>
  )
}
