'use client'

import { useState, useEffect } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { usePathname } from 'next/navigation'
import { useCartStore } from '@/store/cart'
import dynamic from 'next/dynamic'
import type { DownloadItem, CheckoutSummary } from './CheckoutPane'

const CheckoutPane = dynamic(() => import('./CheckoutPane'), { ssr: false })

type Step = 'cart' | 'payment' | 'success'

interface PaymentData {
  clientSecret: string
  hasPhysical: boolean
  downloadItems: DownloadItem[]
  currency: string
  billingCountry: string | null
  summary: CheckoutSummary | null
  /** The coupon the session was created with: applied code, or an error reason. */
  coupon: { code: string; error: string | null } | null
  /** B2B: VAT was reverse-charged (0%) for a validated EU business. */
  reverseCharge?: boolean
  businessName?: string | null
}

interface VatCheck {
  status: 'valid' | 'invalid' | 'unavailable' | 'malformed' | 'self'
  name: string | null
  address: string | null
  fullId: string
  countryCode: string
  /** Server-signed token (valid checks only) — passed to checkout so it can
   *  skip a second slow VIES call. */
  token: string | null
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
  const [successData, setSuccessData] = useState<{ downloads: DownloadItem[]; hasPhysical: boolean; orderId: string } | null>(null)
  const [intentLoading, setIntentLoading] = useState(false)
  const [intentError, setIntentError] = useState(false)
  // Coupon — our own (not Stripe). The applied code is part of the session, so
  // applying/removing re-creates it. `promo` is the input; `couponBusy` covers
  // the re-creation; `couponError` is already localized for display.
  const [promo, setPromo] = useState('')
  const [couponCode, setCouponCode] = useState<string | null>(null)
  const [couponBusy, setCouponBusy] = useState(false)
  const [couponError, setCouponError] = useState<string | null>(null)
  // Download grant issuing — 'issuing' while we create it, 'ready' once the
  // downloads page is usable, 'error' if it couldn't be issued.
  const [issueState, setIssueState] = useState<'idle' | 'issuing' | 'ready' | 'error'>('idle')
  const [issuedPasscode, setIssuedPasscode] = useState<string | null>(null)

  // B2B / VAT — buyer opts into a business purchase and validates their EU VAT
  // id via VIES before paying (the server re-validates before granting 0%).
  const [b2b, setB2b] = useState(false)
  const [vatInput, setVatInput] = useState('')
  const [vatBusy, setVatBusy] = useState(false)
  const [vatCheck, setVatCheck] = useState<VatCheck | null>(null)
  // The buyer must explicitly confirm the VIES-returned business name + address
  // before we apply business treatment (and capture it for audit).
  const [vatConfirmed, setVatConfirmed] = useState(false)
  // Some member states (e.g. Germany) validate the number but DON'T disclose the
  // name/address via VIES — the buyer types them in for the invoice/audit.
  const [declaredName, setDeclaredName] = useState('')
  const [declaredAddress, setDeclaredAddress] = useState('')
  // Capture name and address independently — any member state can withhold
  // either (Germany withholds both); we collect whatever VIES doesn't return.
  const needName = vatCheck?.status === 'valid' && !vatCheck.name
  const needAddress = vatCheck?.status === 'valid' && !vatCheck.address
  const detailsReady = vatCheck?.status === 'valid'
    && (!!vatCheck.name || declaredName.trim() !== '')
    && (!!vatCheck.address || declaredAddress.trim() !== '')
  // Only a confirmed-valid id, with complete details, is sent to checkout.
  const confirmedVat = b2b && vatCheck?.status === 'valid' && detailsReady && vatConfirmed ? vatCheck.fullId : null

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
      setIssueState('idle')
      setIssuedPasscode(null)
      setPromo('')
      setCouponCode(null)
      setCouponBusy(false)
      setCouponError(null)
      setB2b(false)
      setVatInput('')
      setVatCheck(null)
      setVatConfirmed(false)
      setDeclaredName('')
      setDeclaredAddress('')
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

  async function verifyVat() {
    const id = vatInput.trim()
    if (!id || vatBusy) return
    setVatBusy(true)
    setVatCheck(null)
    setVatConfirmed(false)
    setDeclaredName('')
    setDeclaredAddress('')
    try {
      const res = await fetch('/api/vat/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ vatId: id }),
      })
      setVatCheck((await res.json()) as VatCheck)
    } catch {
      setVatCheck({ status: 'unavailable', name: null, address: null, fullId: id.toUpperCase(), countryCode: '', token: null })
    } finally {
      setVatBusy(false)
    }
  }

  async function startPayment(itemsToCharge = checkoutItems, coupon: string | null = couponCode) {
    if (itemsToCharge.length === 0) return
    setIntentLoading(true)
    setIntentError(false)
    try {
      const res = await fetch('/api/checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: itemsToCharge.map((i) => ({ sku: i.sku })),
          locale,
          ...(coupon ? { couponCode: coupon } : {}),
          ...(confirmedVat ? { business: {
            vatId: confirmedVat,
            token: vatCheck?.token ?? undefined,
            // Sent only to fill name/address that VIES withheld (checkout uses
            // them for gaps, never overriding VIES-provided values).
            ...(declaredName.trim() ? { declaredName: declaredName.trim() } : {}),
            ...(declaredAddress.trim() ? { declaredAddress: declaredAddress.trim() } : {}),
          } } : {}),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        console.error('[cart] checkout-session failed:', res.status, body)
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as PaymentData
      setPaymentData(data)
      // Reconcile coupon state from the authoritative server response.
      if (data.coupon?.error) {
        setCouponCode(null)
        setCouponError(t('promoInvalid'))
      } else if (data.coupon?.code) {
        setCouponCode(data.coupon.code)
        setCouponError(null)
      } else {
        setCouponCode(null)
        setCouponError(null)
      }
      setStep('payment')
    } catch (err) {
      console.error('[cart] startPayment error:', err)
      setIntentError(true)
    } finally {
      setIntentLoading(false)
    }
  }

  // Apply / remove a coupon by re-creating the session with (or without) the code
  // baked in — Stripe never sees the discount as a separate calc.
  async function applyCoupon() {
    const code = promo.trim().toUpperCase()
    if (!code || couponBusy) return
    setCouponBusy(true)
    setCouponError(null)
    try {
      await startPayment(checkoutItems, code)
    } finally {
      setCouponBusy(false)
    }
  }
  async function removeCoupon() {
    if (couponBusy) return
    setCouponBusy(true)
    setCouponError(null)
    setPromo('')
    try {
      await startPayment(checkoutItems, null)
    } finally {
      setCouponBusy(false)
    }
  }

  async function handleSuccess(downloads: DownloadItem[], hasPhysical: boolean, sessionId: string) {
    if (!buyNowItem) clearCart()
    // Prefer the digital items from the payment-intent API response (reliable);
    // the client-side PaymentIntent metadata isn't always populated by Stripe.js.
    const dl = (paymentData?.downloadItems && paymentData.downloadItems.length > 0)
      ? paymentData.downloadItems
      : downloads
    // The real order code (GMP-<god>-…) comes back from the issue call below; the
    // download link/passcode box stay gated until then.
    setSuccessData({ downloads: dl, hasPhysical, orderId: '' })
    setStep('success')

    // Issue the download grant now (the webhook is the backup) and auto-unlock
    // this browser, so the buyer can download immediately — no email required.
    if (dl.length > 0) {
      setIssueState('issuing')
      try {
        const res = await fetch('/api/downloads/issue', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        })
        if (res.ok) {
          const data = (await res.json()) as { orderId?: string; passcode?: string | null }
          if (data.orderId) {
            setSuccessData((prev) => (prev ? { ...prev, orderId: data.orderId! } : prev))
          }
          setIssuedPasscode(data.passcode ?? null)
          setIssueState('ready')
        } else {
          setIssueState('error')
        }
      } catch {
        setIssueState('error')
      }
    }
  }

  function handleClose() {
    closeCart()
  }

  const panelContent = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-foreground/[0.07] shrink-0">
        <p className="text-[10px] font-light tracking-[0.28em] uppercase text-foreground/50">
          {step === 'payment' ? t('payment') : step === 'success' ? t('orderConfirmed') : t('title')}
          {step === 'cart' && items.length > 0 && (
            <span className="ml-2 text-foreground/25">({items.length})</span>
          )}
        </p>
        <button
          type="button"
          onClick={handleClose}
          aria-label={t('close')}
          className="flex items-center justify-center w-7 h-7 rounded-full text-foreground/30 hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
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
              <p className="mt-10 text-center text-[12px] font-light tracking-wide text-foreground/25">
                {t('empty')}
              </p>
            ) : (
              <ul className="space-y-2.5">
                {items.map((item) => (
                  <li
                    key={item.sku}
                    className="flex items-start gap-3 border border-foreground/[0.07] bg-foreground/[0.025] overflow-hidden"
                  >
                    {/* Thumbnail */}
                    {item.thumbnailUrl ? (
                      <div className="shrink-0 w-[60px] h-[60px] bg-foreground/[0.04] overflow-hidden">
                        <img
                          src={`${item.thumbnailUrl}${item.thumbnailUrl.includes('?') ? '&' : '?'}max=120`}
                          alt=""
                          aria-hidden="true"
                          width={60}
                          height={60}
                          className="w-full h-full object-cover"
                          draggable={false}
                        />
                      </div>
                    ) : (
                      <div className="shrink-0 w-[60px] h-[60px] bg-foreground/[0.04]" />
                    )}

                    <div className="flex flex-1 items-start justify-between gap-3 py-3 pr-4 min-w-0">
                      <div className="min-w-0">
                        {/* Digital downloads share the photo title across an event, so the
                            line shows the unique download filename instead (GMP-….jpg). */}
                        <p className="truncate text-[12px] font-light text-foreground/80 leading-snug">
                          {item.type === 'digital' && item.downloadToken
                            ? `${item.downloadToken}.${item.format === 'tiff' ? 'tiff' : 'jpg'}`
                            : item.photoTitle}
                        </p>
                        <p className="mt-0.5 text-[11px] font-light tracking-wide text-foreground/35">{item.productLabel}</p>
                      </div>
                      <div className="shrink-0 flex flex-col items-end justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => removeItem(item.sku)}
                          aria-label={t('remove')}
                          className="text-foreground/30 hover:text-foreground/70 transition-colors leading-none"
                        >
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                        </button>
                        <p className="text-[12px] text-foreground/65">{item.priceText}</p>
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
            key={paymentData.clientSecret}
            clientSecret={paymentData.clientSecret}
            hasPhysical={paymentData.hasPhysical}
            downloadItems={paymentData.downloadItems}
            billingCountry={paymentData.billingCountry}
            totalText={totalText}
            summary={paymentData.summary}
            reverseCharge={paymentData.reverseCharge}
            businessName={paymentData.businessName}
            promo={promo}
            onPromoChange={setPromo}
            appliedCoupon={couponCode}
            couponError={couponError}
            couponBusy={couponBusy}
            onApplyCoupon={applyCoupon}
            onRemoveCoupon={removeCoupon}
            onBack={() => setStep('cart')}
            onSuccess={handleSuccess}
          />
        )}

        {/* ── Success step ──────────────────────────────────────────────── */}
        {step === 'success' && successData && (
          <div className="pt-2 space-y-5">
            <div>
              <p className="text-[9px] font-light tracking-[0.22em] uppercase text-[#931020] mb-2">{t('orderConfirmed')}</p>
              <p className="text-[22px] font-light text-foreground leading-tight">{t('thankYou')}</p>
              <p className="mt-2 text-[12px] font-light text-foreground/40 leading-relaxed">
                {successData.downloads.length > 0
                  ? t('successDigitalReady')
                  : t('successPhysical')}
              </p>
            </div>

            {successData.downloads.length > 0 && (
              <div className="space-y-2.5">
                <p className="text-[9px] font-light tracking-[0.22em] uppercase text-foreground/30">{t('fileReferences')}</p>
                {successData.downloads.map((item) => (
                  <div
                    key={item.token}
                    className="rounded-[12px] border border-foreground/[0.08] bg-foreground/[0.03] px-4 py-3.5"
                  >
                    <p className="font-[family-name:var(--font-mono-ibm)] text-[15px] font-[200] tracking-wide text-[#931020]">
                      {item.token}.{item.format === 'tiff' ? 'tiff' : 'jpg'}
                    </p>
                    <p className="mt-0.5 text-[10px] font-light tracking-wide text-foreground/30">
                      {item.label} · {item.format === 'tiff' ? '16-bit TIFF' : 'JPEG'}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {successData.downloads.length > 0 && (
              <div className="space-y-2">
                {issueState === 'issuing' ? (
                  <div className="flex flex-col items-center gap-2 py-3">
                    <span className="shop-spinner" />
                    <span className="text-[10px] font-light tracking-[0.22em] uppercase text-foreground/35">{t('preparingDownloads')}</span>
                  </div>
                ) : (
                  <a
                    href={`/${locale}/shop/downloads/${successData.orderId}`}
                    className="block w-full text-center rounded-[14px] py-3 text-[11px] font-light tracking-[0.22em] uppercase text-white bg-[#931020]/80 hover:bg-[#931020] transition-colors"
                  >
                    {t('goToDownloads')} →
                  </a>
                )}
                <p className="text-[10px] font-light text-foreground/30 leading-relaxed text-center">
                  {issueState === 'error'
                    ? t('issueErrorHelp')
                    : t('downloadsUnlockedHint')}
                </p>
              </div>
            )}

            {successData.downloads.length > 0 && issuedPasscode && (
              <div className="rounded-[12px] border border-foreground/[0.08] bg-foreground/[0.03] px-4 py-3.5 space-y-1.5">
                <p className="text-[9px] font-light tracking-[0.22em] uppercase text-foreground/30">{t('saveAccess')}</p>
                <p className="text-[10px] font-light text-foreground/40 leading-relaxed">
                  {t('saveAccessHint')}
                </p>
                <p className="font-[family-name:var(--font-mono-ibm)] text-[11px] text-foreground/60 break-all">
                  /{locale}/shop/downloads/{successData.orderId}
                </p>
                <p className="text-[11px] text-foreground/50">
                  {t('passcodeLabel')}:{' '}
                  <span className="font-[family-name:var(--font-mono-ibm)] text-[#e0566a] tracking-[0.2em]">
                    {issuedPasscode}
                  </span>
                </p>
              </div>
            )}

            {successData.hasPhysical && (
              <div className="rounded-[12px] border border-foreground/[0.08] bg-foreground/[0.03] px-4 py-3.5">
                <p className="text-[11px] font-light text-foreground/45 leading-relaxed">{t('physicalConfirm')}</p>
              </div>
            )}

            <button
              type="button"
              onClick={handleClose}
              className="w-full rounded-[14px] border border-foreground/15 py-3 text-[11px] font-light tracking-[0.22em] uppercase text-foreground/50 hover:text-foreground hover:border-foreground/35 transition-colors"
            >
              {t('continueShopping')}
            </button>
          </div>
        )}
      </div>

      {/* Footer — only on cart step when items present */}
      {step === 'cart' && items.length > 0 && (
        <div className="border-t border-foreground/[0.07] px-5 py-5 space-y-3.5 shrink-0">
          {/* B2B — subtle business/VAT toggle (validated via VIES). */}
          <div className="space-y-2.5">
            <button
              type="button"
              role="checkbox"
              aria-checked={b2b}
              onClick={() => { const next = !b2b; setB2b(next); if (!next) { setVatCheck(null); setVatConfirmed(false) } }}
              className="flex items-center gap-2.5 text-left select-none cursor-pointer"
            >
              <span className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[3px] border transition-colors ${b2b ? 'border-[#931020] bg-[#931020]' : 'border-foreground/30'}`}>
                {b2b && <span className="h-1.5 w-1.5 rounded-[1px] bg-white" />}
              </span>
              <span className="text-[11px] font-light tracking-wide text-foreground/45 hover:text-foreground/70 transition-colors">
                {t('b2bToggle')}
              </span>
            </button>

            {b2b && (
              <div className="space-y-2 pl-6">
                <div className="flex gap-2">
                  <input
                    value={vatInput}
                    onChange={(e) => { setVatInput(e.target.value.toUpperCase()); setVatCheck(null); setVatConfirmed(false) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void verifyVat() } }}
                    placeholder={t('vatPlaceholder')}
                    spellCheck={false}
                    className="flex-1 rounded-[8px] border border-foreground/15 bg-foreground/[0.04] px-3 py-2 font-[family-name:var(--font-mono-ibm)] text-[12px] tracking-wide text-foreground placeholder:text-foreground/25 focus:border-[#931020] focus:outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => void verifyVat()}
                    disabled={vatBusy || !vatInput.trim()}
                    className="shrink-0 rounded-[8px] border border-foreground/15 px-3 text-[10px] font-[family-name:var(--font-mono-ibm)] uppercase tracking-[0.18em] text-foreground/70 hover:border-foreground/40 hover:text-foreground transition-colors disabled:opacity-40"
                  >
                    {t('verify')}
                  </button>
                </div>

                {vatBusy && (
                  <div className="flex flex-col items-center gap-2 py-3">
                    <span className="shop-spinner" />
                    <span className="text-[10px] font-light tracking-[0.18em] uppercase text-foreground/35">{t('checkingVies')}</span>
                  </div>
                )}

                {vatCheck && (vatCheck.status === 'valid' ? (
                  <div className="rounded-[8px] border border-emerald-400/30 bg-emerald-400/[0.05] px-3 py-2.5">
                    <p className="text-[9px] font-light tracking-[0.18em] uppercase text-foreground/30 mb-1">{t('vatValid')}</p>
                    {(needName || needAddress) && (
                      <p className="mt-1 mb-2 text-[10px] font-light text-foreground/45 leading-snug">
                        {needName && needAddress
                          ? t('viesWithholdsBoth', { country: vatCheck.countryCode })
                          : needName
                            ? t('viesWithholdsName', { country: vatCheck.countryCode })
                            : t('viesWithholdsAddress', { country: vatCheck.countryCode })}
                      </p>
                    )}
                    {/* Name — show VIES value, else ask for it. */}
                    {vatCheck.name
                      ? <p className="text-[12px] text-foreground/85">{vatCheck.name}</p>
                      : (
                        <input
                          value={declaredName}
                          onChange={(e) => setDeclaredName(e.target.value)}
                          placeholder={t('businessNamePlaceholder')}
                          className="mb-2 w-full rounded-[8px] border border-foreground/15 bg-foreground/[0.04] px-3 py-2 text-[12px] text-foreground placeholder:text-foreground/25 focus:border-[#931020] focus:outline-none transition-colors"
                        />
                      )}
                    {/* Address — show VIES value, else ask for it. */}
                    {vatCheck.address
                      ? <p className="mt-0.5 text-[10px] font-light text-foreground/45 leading-snug whitespace-pre-line">{vatCheck.address}</p>
                      : (
                        <textarea
                          value={declaredAddress}
                          onChange={(e) => setDeclaredAddress(e.target.value)}
                          placeholder={t('businessAddressPlaceholder')}
                          rows={2}
                          className="w-full resize-none rounded-[8px] border border-foreground/15 bg-foreground/[0.04] px-3 py-2 text-[12px] text-foreground placeholder:text-foreground/25 focus:border-[#931020] focus:outline-none transition-colors"
                        />
                      )}
                    <p className="mt-1.5 text-[10px] font-light text-foreground/45 leading-snug">
                      {vatCheck.countryCode === 'DK'
                        ? t('dkBusinessVat')
                        : t('reverseChargeInfo')}
                    </p>
                    {/* Explicit confirmation — required before we use these details. */}
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={vatConfirmed}
                      onClick={() => setVatConfirmed((v) => !v)}
                      className="mt-2.5 flex items-start gap-2 text-left select-none cursor-pointer"
                    >
                      <span className={`mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[3px] border transition-colors ${vatConfirmed ? 'border-emerald-400 bg-emerald-400/80' : 'border-foreground/35'}`}>
                        {vatConfirmed && <span className="h-1.5 w-1.5 rounded-[1px] bg-[#0d0d0d]" />}
                      </span>
                      <span className="text-[11px] font-light text-foreground/70">{t('confirmBusiness')}</span>
                    </button>
                    {!vatConfirmed && (
                      <p className="mt-1.5 text-[10px] font-light text-amber-300/70">{t('tickToConfirm')}</p>
                    )}
                    {vatConfirmed && !detailsReady && (
                      <p className="mt-1.5 text-[10px] font-light text-amber-300/70">{t('enterDetailsFirst')}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-[10px] font-light leading-snug text-amber-300/80">
                    {vatCheck.status === 'invalid' && t('vatInvalid')}
                    {vatCheck.status === 'unavailable' && t('vatUnavailable')}
                    {vatCheck.status === 'malformed' && (vatCheck.countryCode === 'GB' ? t('vatGb') : t('vatMalformed'))}
                    {vatCheck.status === 'self' && t('vatSelf')}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-baseline justify-between">
            <p className="text-[10px] font-light tracking-[0.22em] uppercase text-foreground/35">{t('total')}</p>
            <p className="text-[17px] font-light text-foreground">{totalText}</p>
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
          'bg-bg border-l border-foreground/[0.08]',
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
          'bg-bg border-t border-foreground/[0.08]',
          'rounded-t-[20px]',
          'transition-transform duration-300 ease-[cubic-bezier(0.32,0,0.15,1)]',
          'shadow-[0_-24px_48px_rgba(0,0,0,0.7)]',
        ].join(' ')}
        style={{ transform: isOpen ? 'translateY(0)' : 'translateY(100%)' }}
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-8 h-[3px] rounded-full bg-foreground/20" />
        </div>
        {panelContent}
      </div>
    </>
  )
}
