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
import { useResolvedTheme, type ResolvedTheme } from '@/lib/use-theme'

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
  /** Country to seed the shipping form with (buyer's IP country if we ship there,
   *  else DK). Stops the element defaulting to GB, whose address autocomplete
   *  collapses the form to a single line. */
  shippingDefaultCountry?: string | null
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

// ── Stripe appearance — follows the site theme ────────────────────────────────
// The Payment Element renders in a cross-origin iframe, so it can't read our CSS
// variables; we hand it a concrete light/dark appearance built from the resolved
// theme (see `useResolvedTheme`). Brand red and danger are fixed in both.
function buildAppearance(theme: ResolvedTheme): StripeElementsOptions['appearance'] {
  const dark = theme === 'dark'
  return {
    theme: dark ? 'night' : 'stripe',
    variables: {
      colorPrimary: '#931020',
      colorBackground: dark ? '#161616' : '#ffffff',
      colorText: dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.85)',
      colorTextSecondary: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.45)',
      colorDanger: dark ? '#f87171' : '#dc2626',
      fontFamily: 'inherit',
      borderRadius: '10px',
      fontSizeBase: '13px',
      spacingUnit: '4px',
    },
    rules: {
      '.Input': {
        border: dark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.12)',
        backgroundColor: dark ? '#0d0d0d' : '#fafafa',
        boxShadow: 'none',
      },
      '.Input:focus': {
        border: dark ? '1px solid rgba(255,255,255,0.30)' : '1px solid rgba(0,0,0,0.35)',
        boxShadow: 'none',
      },
      '.Label': {
        fontSize: '10px',
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.45)',
      },
      '.Tab': {
        border: dark ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(0,0,0,0.10)',
        backgroundColor: dark ? '#0d0d0d' : '#fafafa',
      },
      '.Tab--selected': {
        border: '1px solid rgba(147,16,32,0.7)',
      },
    },
  }
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
        <p className="mb-3 text-[10px] font-light tracking-[0.22em] uppercase text-foreground/35">
          {t('emailLabel')}
        </p>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-[8px] border border-foreground/15 bg-foreground/[0.04] px-4 py-3 text-[14px] text-foreground placeholder:text-foreground/25 focus:border-[#931020] focus:outline-none transition-colors"
        />
      </div>

      {/* Shipping address — only for physical items */}
      {hasPhysical && (
        <div>
          <p className="mb-3 text-[10px] font-light tracking-[0.22em] uppercase text-foreground/35">
            {t('shippingAddress')}
          </p>
          <ShippingAddressElement />
        </div>
      )}

      {/* Payment method */}
      <div>
        <p className="mb-3 text-[10px] font-light tracking-[0.22em] uppercase text-foreground/35">
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
            <span className="text-[12px] font-light text-foreground/70">
              <span className="font-mono-ibm tracking-wide">{appliedCoupon}</span>
              {summary && summary.discountMinor > 0 && (
                <> · <span className="text-[#931020]">−{summary.discount}</span></>
              )}
            </span>
            <button
              type="button"
              onClick={onRemoveCoupon}
              disabled={couponBusy}
              className="text-[10px] font-light tracking-[0.18em] uppercase text-foreground/40 hover:text-foreground transition-colors disabled:opacity-40"
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
              className="flex-1 rounded-[8px] border border-foreground/15 bg-foreground/[0.04] px-4 py-2.5 font-mono-ibm text-[13px] tracking-wide text-foreground placeholder:text-foreground/25 focus:border-[#931020] focus:outline-none transition-colors"
            />
            <button
              type="button"
              onClick={onApplyCoupon}
              disabled={couponBusy || !promo.trim()}
              className="shrink-0 rounded-[8px] border border-foreground/15 px-4 py-2.5 text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-foreground/70 hover:border-foreground/40 hover:text-foreground transition-colors disabled:opacity-40"
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
      <div className="border-t border-foreground/[0.07] pt-4 space-y-1.5">
        {summary && (summary.vatMinor > 0 || summary.discountMinor > 0) && (
          <div className="flex items-baseline justify-between">
            <p className="text-[10px] font-light tracking-[0.22em] uppercase text-foreground/25">{t('subtotal')}</p>
            <p className="text-[12px] font-light text-foreground/45">{summary.subtotal}</p>
          </div>
        )}
        {summary && summary.discountMinor > 0 && (
          <div className="flex items-baseline justify-between">
            <p className="text-[10px] font-light tracking-[0.22em] uppercase text-foreground/25">{t('discount')}</p>
            <p className="text-[12px] font-light text-[#931020]">−{summary.discount}</p>
          </div>
        )}
        {summary && summary.vatMinor > 0 && (
          <div className="flex items-baseline justify-between">
            <p className="text-[10px] font-light tracking-[0.22em] uppercase text-foreground/25">
              {t('vat')}{summary.vatRate ? ` (${summary.vatRate}%)` : ''}
            </p>
            <p className="text-[12px] font-light text-foreground/45">{summary.vat}</p>
          </div>
        )}
        <div className="flex items-baseline justify-between">
          <p className="text-[10px] font-light tracking-[0.22em] uppercase text-foreground/35">{t('total')}</p>
          <p className="text-[16px] font-light text-foreground">{totalDisplay}</p>
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
        className="text-center text-[10px] font-light tracking-[0.18em] uppercase text-foreground/25 hover:text-foreground/55 transition-colors disabled:pointer-events-none"
      >
        ← {t('backToCart')}
      </button>
    </form>
  )
}

// ── Public export — wraps form in the Checkout provider ───────────────────────
export default function CheckoutPane(props: CheckoutPaneProps) {
  const theme = useResolvedTheme()
  return (
    <CheckoutElementsProvider
      stripe={stripePromise}
      options={{
        clientSecret: props.clientSecret,
        elementsOptions: { appearance: buildAppearance(theme) },
        // Seed the shipping country with the buyer's own (from IP). Otherwise the
        // Shipping Address Element defaults to GB (browser locale), whose Stripe
        // address autocomplete collapses the form to a single "Address" search line
        // — so the buyer only sees address line 1. The element exposes no default-
        // country option in Custom Checkout, so we prefill via the checkout SDK's
        // defaultValues; line1 must be a string, so the rest is seeded empty.
        ...(props.shippingDefaultCountry
          ? {
              defaultValues: {
                shippingAddress: {
                  name: '',
                  address: {
                    line1: '',
                    line2: '',
                    city: '',
                    state: '',
                    postal_code: '',
                    country: props.shippingDefaultCountry,
                  },
                },
              },
            }
          : {}),
      }}
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
