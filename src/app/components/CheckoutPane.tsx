'use client'

import { useState } from 'react'
import {
  Elements,
  PaymentElement,
  AddressElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import type { StripeElementsOptions } from '@stripe/stripe-js'
import { stripePromise } from '@/lib/stripe-client'
import { useTranslations, useLocale } from 'next-intl'
import type { CartItem } from '@/store/cart'

export interface DownloadItem {
  token: string
  format: 'jpeg' | 'tiff'
  label: string
  slug: string
}

interface CheckoutPaneProps {
  clientSecret: string
  items: CartItem[]
  hasPhysical: boolean
  subtotal: number
  taxAmount: number
  currency: string
  totalText: string
  onBack: () => void
  onSuccess: (downloads: DownloadItem[], hasPhysical: boolean, orderId: string) => void
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

// ── Inner form — must be inside <Elements> ────────────────────────────────────
function PaymentForm({
  hasPhysical,
  subtotal,
  taxAmount,
  currency,
  totalText,
  onBack,
  onSuccess,
}: Omit<CheckoutPaneProps, 'clientSecret'>) {
  const t = useTranslations('cart')
  const locale = useLocale()
  const fmt = (minor: number) =>
    new Intl.NumberFormat(locale === 'en' ? 'en-GB' : locale, {
      style: 'currency', currency,
    }).format(minor / 100)
  const stripe = useStripe()
  const elements = useElements()
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements || state === 'loading') return
    setState('loading')
    setErrorMsg('')

    // Collect address if physical items
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let shippingData: { name?: string; address?: object } | undefined
    if (hasPhysical) {
      const addressEl = elements.getElement('address')
      if (addressEl) {
        // AddressElement value is captured by Stripe internally; we pass
        // shipping via confirmParams below.
      }
    }

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        // We handle the result inline — only redirect for methods that require it
        return_url: `${window.location.origin}/en/shop/order-complete`,
      },
      redirect: 'if_required',
    })

    if (result.error) {
      setState('error')
      setErrorMsg(result.error.message ?? t('paymentFailed'))
      return
    }

    // Payment succeeded (no redirect needed)
    if (
      result.paymentIntent &&
      (result.paymentIntent.status === 'succeeded' ||
        result.paymentIntent.status === 'processing')
    ) {
      // Retrieve download items from payment intent metadata
      const meta = (result.paymentIntent as { metadata?: Record<string, string> }).metadata
      let downloads: DownloadItem[] = []
      if (meta?.downloadItems) {
        try { downloads = JSON.parse(meta.downloadItems) } catch { /* ignore */ }
      }
      onSuccess(downloads, hasPhysical, result.paymentIntent.id)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Shipping address — only for physical items */}
      {hasPhysical && (
        <div>
          <p className="mb-3 text-[10px] font-light tracking-[0.22em] uppercase text-white/35">
            {t('shippingAddress')}
          </p>
          <AddressElement
            options={{
              mode: 'shipping',
              allowedCountries: ['GB', 'DK', 'DE', 'FR', 'NL', 'SE', 'NO', 'US', 'CA', 'AU', 'JP'],
            }}
          />
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
            fields: { billingDetails: { address: 'auto' } },
          }}
        />
      </div>

      {/* Order summary */}
      <div className="border-t border-white/[0.07] pt-4 space-y-1.5">
        {taxAmount > 0 && (
          <>
            <div className="flex items-baseline justify-between">
              <p className="text-[10px] font-light tracking-[0.22em] uppercase text-white/25">{t('subtotal')}</p>
              <p className="text-[12px] font-light text-white/45">{fmt(subtotal)}</p>
            </div>
            <div className="flex items-baseline justify-between">
              <p className="text-[10px] font-light tracking-[0.22em] uppercase text-white/25">{t('vat')}</p>
              <p className="text-[12px] font-light text-white/45">{fmt(taxAmount)}</p>
            </div>
          </>
        )}
        <div className="flex items-baseline justify-between">
          <p className="text-[10px] font-light tracking-[0.22em] uppercase text-white/35">{t('total')}</p>
          <p className="text-[16px] font-light text-white">{totalText}</p>
        </div>
      </div>

      {errorMsg && (
        <p className="text-[11px] text-red-400/80 leading-snug">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={!stripe || state === 'loading'}
        className={`w-full rounded-[14px] py-3.5 text-[11px] font-light tracking-[0.22em] uppercase text-white transition-colors ${
          state === 'loading'
            ? 'bg-[#931020]/35 cursor-default'
            : 'bg-[#931020]/80 hover:bg-[#931020] cursor-pointer'
        }`}
      >
        {state === 'loading' ? t('processing') : `${t('pay')} ${totalText}`}
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

// ── Public export — wraps form in Elements provider ───────────────────────────
export default function CheckoutPane(props: CheckoutPaneProps) {
  const options: StripeElementsOptions = {
    clientSecret: props.clientSecret,
    appearance,
    locale: 'auto',
  }

  return (
    <Elements stripe={stripePromise} options={options}>
      <PaymentForm
        items={props.items}
        hasPhysical={props.hasPhysical}
        subtotal={props.subtotal}
        taxAmount={props.taxAmount}
        currency={props.currency}
        totalText={props.totalText}
        onBack={props.onBack}
        onSuccess={props.onSuccess}
      />
    </Elements>
  )
}
