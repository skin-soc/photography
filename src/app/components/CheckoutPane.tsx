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

/** Order summary computed by US at session creation (Stripe does no tax/discount
 *  calc — see [[stripe-payments-only]]). All `*Minor` are in minor units; the
 *  string fields are pre-formatted for display. */
export interface CheckoutSummary {
  vatRate: number
  subtotalMinor: number
  discountMinor: number
  vatMinor: number
  totalMinor: number
  subtotal: string
  discount: string
  vat: string
  total: string
}

interface CheckoutPaneProps {
  clientSecret: string
  hasPhysical: boolean
  downloadItems: DownloadItem[]
  /** Buyer country from IP — set on the session for tax, no address form needed. */
  billingCountry: string | null
  totalText: string
  summary: CheckoutSummary | null
  /** B2B: VAT reverse-charged (0%) for a validated EU business — show a note. */
  reverseCharge?: boolean
  businessName?: string | null
  // ── Coupon (owned by the parent: applying re-creates the session) ──
  promo: string
  onPromoChange: (v: string) => void
  /** The code currently applied to this session, or null. */
  appliedCoupon: string | null
  /** Last coupon error (already localized), or null. */
  couponError: string | null
  couponBusy: boolean
  onApplyCoupon: () => void
  onRemoveCoupon: () => void
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
  summary,
  reverseCharge,
  businessName,
  promo,
  onPromoChange,
  appliedCoupon,
  couponError,
  couponBusy,
  onApplyCoupon,
  onRemoveCoupon,
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

  // Record the buyer's country (from IP) on the session once — it's our VAT
  // location evidence (reconciled against the card-issuer country in admin). VAT
  // itself is computed by us (a line item) from this same country at session
  // creation, so no address form is needed for a digital download.
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

  const totalDisplay = summary?.total ?? totalText

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

      {/* Promo code — our own coupons. Applying re-creates the session (parent),
          so entering a code after card details will reset the payment fields. */}
      <div>
        {appliedCoupon ? (
          <div className="flex items-center justify-between rounded-[8px] border border-[#931020]/40 bg-[#931020]/[0.06] px-4 py-2.5">
            <span className="text-[12px] font-light text-white/70">
              <span className="font-mono-ibm tracking-wide">{appliedCoupon}</span>
              {summary && summary.discountMinor > 0 && (
                <> · <span className="text-[#931020]">−{summary.discount}</span></>
              )}
            </span>
            <button
              type="button"
              onClick={onRemoveCoupon}
              disabled={couponBusy}
              className="text-[10px] font-light tracking-[0.18em] uppercase text-white/40 hover:text-white transition-colors disabled:opacity-40"
            >
              {t('remove')}
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              value={promo}
              onChange={(e) => onPromoChange(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (promo.trim()) onApplyCoupon() } }}
              placeholder={t('promoCode')}
              spellCheck={false}
              className="flex-1 rounded-[8px] border border-white/15 bg-white/[0.04] px-4 py-2.5 font-mono-ibm text-[13px] tracking-wide text-white placeholder:text-white/25 focus:border-[#931020] focus:outline-none transition-colors"
            />
            <button
              type="button"
              onClick={onApplyCoupon}
              disabled={couponBusy || !promo.trim()}
              className="shrink-0 rounded-[8px] border border-white/15 px-4 py-2.5 text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white/70 hover:border-white/40 hover:text-white transition-colors disabled:opacity-40"
            >
              {couponBusy ? '…' : t('apply')}
            </button>
          </div>
        )}
        {couponError && <p className="mt-1.5 text-[11px] text-red-400/80">{couponError}</p>}
      </div>

      {/* B2B reverse charge — no VAT line; explain why. */}
      {reverseCharge && (
        <div className="rounded-[8px] border border-emerald-400/25 bg-emerald-400/[0.04] px-3 py-2">
          <p className="text-[10px] font-light leading-snug text-emerald-300/80">
            {t('reverseChargeCheckout', { business: businessName ? ` · ${businessName}` : '' })}
          </p>
        </div>
      )}

      {/* Order summary — our own figures (subtotal / discount / VAT / total). */}
      <div className="border-t border-white/[0.07] pt-4 space-y-1.5">
        {summary && (summary.vatMinor > 0 || summary.discountMinor > 0) && (
          <div className="flex items-baseline justify-between">
            <p className="text-[10px] font-light tracking-[0.22em] uppercase text-white/25">{t('subtotal')}</p>
            <p className="text-[12px] font-light text-white/45">{summary.subtotal}</p>
          </div>
        )}
        {summary && summary.discountMinor > 0 && (
          <div className="flex items-baseline justify-between">
            <p className="text-[10px] font-light tracking-[0.22em] uppercase text-white/25">{t('discount')}</p>
            <p className="text-[12px] font-light text-[#931020]">−{summary.discount}</p>
          </div>
        )}
        {summary && summary.vatMinor > 0 && (
          <div className="flex items-baseline justify-between">
            <p className="text-[10px] font-light tracking-[0.22em] uppercase text-white/25">
              {t('vat')}{summary.vatRate ? ` (${summary.vatRate}%)` : ''}
            </p>
            <p className="text-[12px] font-light text-white/45">{summary.vat}</p>
          </div>
        )}
        <div className="flex items-baseline justify-between">
          <p className="text-[10px] font-light tracking-[0.22em] uppercase text-white/35">{t('total')}</p>
          <p className="text-[16px] font-light text-white">{totalDisplay}</p>
        </div>
      </div>

      {errorMsg && (
        <p className="text-[11px] text-red-400/80 leading-snug">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={state === 'loading' || couponBusy}
        className={`w-full rounded-[14px] py-3.5 text-[11px] font-light tracking-[0.22em] uppercase text-white transition-colors ${
          state === 'loading' || couponBusy
            ? 'bg-[#931020]/35 cursor-default'
            : 'bg-[#931020]/80 hover:bg-[#931020] cursor-pointer'
        }`}
      >
        {state === 'loading' ? t('processing') : `${t('pay')} ${totalDisplay}`}
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
        summary={props.summary}
        reverseCharge={props.reverseCharge}
        businessName={props.businessName}
        promo={props.promo}
        onPromoChange={props.onPromoChange}
        appliedCoupon={props.appliedCoupon}
        couponError={props.couponError}
        couponBusy={props.couponBusy}
        onApplyCoupon={props.onApplyCoupon}
        onRemoveCoupon={props.onRemoveCoupon}
        onBack={props.onBack}
        onSuccess={props.onSuccess}
      />
    </CheckoutElementsProvider>
  )
}
