/**
 * Issue a download grant synchronously, right after an embedded Checkout payment,
 * and auto-unlock the buyer's browser.
 *
 * The Stripe webhook (checkout.session.completed) is the authoritative issuer,
 * but it's server-to-server and can lag (and never fires against localhost in
 * dev). So the embedded flow also calls this on success: we re-fetch the
 * Checkout Session, prove the caller owns it via its client secret, confirm it's
 * paid, issue the grant (idempotent origin-side), and set the proof-of-passcode
 * cookie so the buyer can download immediately.
 */

import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe-server'
import {
  issueGrant,
  resolveDownloadItems,
  originConfigured,
  signOrder,
  cookieName,
  extractOrderLines,
  describeOrderLines,
} from '@/lib/downloads'
import { getInvoiceTerms } from '@/lib/terms'

const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 // 30 days, matches the grant TTL

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { sessionId?: string }
  const sessionId = String(body.sessionId ?? '')
  if (!sessionId) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 })
  }

  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent.latest_charge', 'line_items.data.price.product'],
    })
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  // Ownership proof: the session id (cs_…) is a long unguessable token held only
  // in the buyer's browser (returned by confirm()). We can't compare the session
  // client_secret — Stripe nulls it once the session completes. Issuing is
  // idempotent (the webhook also issues), so the worst case is a no-op.
  // Our GMP-<god>-<code> order code — minted at session creation and stored in
  // metadata, so the grant key, the download URL and the Stripe dashboard agree.
  const orderId = session.metadata?.orderCode || ''
  if (!orderId) {
    return NextResponse.json({ error: 'order code missing' }, { status: 422 })
  }

  if (session.payment_status !== 'paid') {
    // Async method still settling — the webhook will issue once it's paid.
    return NextResponse.json({ orderId, pending: true })
  }

  const items = await resolveDownloadItems((session.metadata?.skus ?? '').split(','))
  if (items.length === 0) {
    return NextResponse.json({ orderId, digital: false })
  }
  if (!originConfigured()) {
    return NextResponse.json({ error: 'origin not configured' }, { status: 503 })
  }

  const pi = session.payment_intent
  const paymentId = typeof pi === 'string' ? pi : pi?.id ?? ''
  // Card-issuer country (second VAT location evidence) from the expanded charge.
  const charge =
    typeof pi !== 'string' && pi?.latest_charge && typeof pi.latest_charge !== 'string'
      ? pi.latest_charge
      : null
  const cardCountry = charge?.payment_method_details?.card?.country ?? null
  // This route usually wins the race over the webhook (it fires on the success
  // page), so it MUST pass the full grant — receipt facts, VAT evidence and the
  // terms snapshot — or the order would be created without them.
  const locale = session.metadata?.locale || 'en'
  const paidAt = charge?.created ? charge.created * 1000 : (session.created ? session.created * 1000 : null)
  const paymentMethod = charge?.payment_method_details?.type ?? null
  // Full itemised + enriched order + shipping, same as the webhook (mixed-order
  // invoice) — this route usually wins the race, so it must record them.
  const bwSkus = new Set((session.metadata?.bwSkus ?? '').split(',').filter(Boolean))
  const raw = extractOrderLines(session)
  const shipping = raw.shipping
  const lineItems = await describeOrderLines(raw.lineItems, bwSkus, locale)

  let passcode: string | null = null
  try {
    const result = await issueGrant({
      orderId,
      paymentId,
      email: session.customer_details?.email ?? null,
      locale,
      items,
      lineItems,
      shipping,
      livemode: session.livemode,
      amount: session.amount_total,
      currency: session.currency,
      // VAT we computed at checkout (Stripe does no tax calc) — read from metadata.
      taxAmount: Number(session.metadata?.taxAmount ?? '') || 0,
      taxCountry: session.customer_details?.address?.country ?? null,
      cardCountry,
      buyerIp: session.metadata?.buyerIp ?? null,
      buyerCountry: session.metadata?.buyerCountry ?? null,
      paidAt,
      paymentMethod,
      terms: await getInvoiceTerms(locale),
      vatId: session.metadata?.vatId ?? null,
      businessName: session.metadata?.businessName ?? null,
      businessAddress: session.metadata?.businessAddress ?? null,
      reverseCharge: session.metadata?.reverseCharge === 'true',
      vatConsultation: session.metadata?.vatConsultation ?? null,
    })
    passcode = result.passcode
  } catch (err) {
    console.error('[downloads/issue] failed:', err)
    return NextResponse.json({ error: 'issue failed' }, { status: 502 })
  }

  const res = NextResponse.json({ orderId, digital: true, passcode })
  res.cookies.set(cookieName(orderId), signOrder(orderId), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })
  return res
}
