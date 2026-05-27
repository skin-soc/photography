'use client'

import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { useState } from 'react'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const STRIPE_APPEARANCE = {
  appearance: {
    theme: 'night' as const,
    variables: {
      colorPrimary: '#931020',
      colorBackground: '#111111',
      colorText: '#ffffff',
      colorTextSecondary: 'rgba(255,255,255,0.45)',
      colorDanger: '#e05060',
      borderRadius: '10px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSizeBase: '14px',
      spacingUnit: '4px',
    },
    rules: {
      '.Input': { border: '1px solid rgba(255,255,255,0.12)', boxShadow: 'none' },
      '.Input:focus': { border: '1px solid rgba(147,16,32,0.6)', boxShadow: 'none' },
      '.Label': { fontSize: '10px', fontWeight: '300', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: '6px' },
      '.Tab': { border: '1px solid rgba(255,255,255,0.1)', boxShadow: 'none' },
      '.Tab--selected': { border: '1px solid rgba(147,16,32,0.5)' },
    },
  },
}

function PaymentForm({
  onClose,
  returnUrl,
  priceText,
}: {
  onClose: () => void
  returnUrl: string
  priceText: string
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements || status === 'submitting') return
    setStatus('submitting')
    setErrorMessage(null)

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
    })

    // confirmPayment only returns an error if it can't redirect
    if (error) {
      setErrorMessage(error.message ?? 'Payment failed. Please try again.')
      setStatus('error')
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <PaymentElement options={{ layout: 'tabs' }} />

      {errorMessage && (
        <p style={{ fontSize: '12px', fontWeight: 300, color: '#e05060', margin: 0, letterSpacing: '0.02em' }}>
          {errorMessage}
        </p>
      )}

      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            flex: '0 0 auto',
            padding: '12px 20px',
            fontSize: '10px', fontWeight: 300, letterSpacing: '0.22em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.35)',
            backgroundColor: 'transparent',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '10px',
            cursor: 'pointer',
            transition: 'color 0.2s, border-color 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.65)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={!stripe || !elements || status === 'submitting'}
          style={{
            flex: 1,
            padding: '12px 20px',
            fontSize: '10px', fontWeight: 300, letterSpacing: '0.22em', textTransform: 'uppercase',
            color: status === 'submitting' ? 'rgba(255,255,255,0.4)' : '#ffffff',
            backgroundColor: status === 'submitting' ? 'rgba(147,16,32,0.4)' : '#931020',
            border: 'none',
            borderRadius: '10px',
            cursor: status === 'submitting' ? 'default' : 'pointer',
            transition: 'background-color 0.2s, color 0.2s',
          }}
          onMouseEnter={(e) => { if (status !== 'submitting') e.currentTarget.style.backgroundColor = '#b01226' }}
          onMouseLeave={(e) => { if (status !== 'submitting') e.currentTarget.style.backgroundColor = '#931020' }}
        >
          {status === 'submitting' ? 'Processing…' : `Pay ${priceText}`}
        </button>
      </div>
    </form>
  )
}

export default function CheckoutModal({
  clientSecret,
  returnUrl,
  onClose,
  priceText,
  photoTitle,
  productLabel,
}: {
  clientSecret: string
  returnUrl: string
  onClose: () => void
  priceText: string
  photoTitle: string
  productLabel: string
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.82)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-[440px] sm:mx-4 rounded-t-[24px] sm:rounded-[20px] border border-white/10"
        style={{ backgroundColor: '#0c0c0c', padding: '28px 28px 24px', maxHeight: '90dvh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: '16px', right: '20px',
            background: 'none', border: 'none', padding: 0,
            cursor: 'pointer', color: 'rgba(255,255,255,0.3)',
            fontSize: '22px', lineHeight: 1, transition: 'color 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#fff' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)' }}
        >×</button>

        {/* Header */}
        <p style={{ fontSize: '9px', fontWeight: 300, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#fff', marginBottom: '2px' }}>
          Purchase
        </p>
        <p style={{ fontSize: '13px', fontWeight: 300, letterSpacing: '0.02em', color: 'rgba(255,255,255,0.45)', marginBottom: '24px' }}>
          {photoTitle} — {productLabel}
        </p>

        <Elements
          stripe={stripePromise}
          options={{ clientSecret, ...STRIPE_APPEARANCE }}
        >
          <PaymentForm onClose={onClose} returnUrl={returnUrl} priceText={priceText} />
        </Elements>
      </div>
    </div>
  )
}
