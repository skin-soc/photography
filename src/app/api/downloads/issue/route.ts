/**
 * Issue a download grant synchronously, right after an embedded-checkout
 * payment, and auto-unlock the buyer's browser.
 *
 * The Stripe webhook is the authoritative issuer, but it's server-to-server and
 * can lag (and never fires against localhost in dev). So the embedded flow also
 * calls this on success: we re-check the PaymentIntent with Stripe, prove the
 * caller owns it via its client secret, issue the grant (idempotent origin-side),
 * and set the proof-of-passcode cookie so they can download immediately. The
 * emailed passcode still gates the link later / on other devices.
 */

import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe-server'
import {
  issueGrant,
  originConfigured,
  signOrder,
  cookieName,
  type DownloadItem,
} from '@/lib/downloads'

const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 // 30 days, matches the grant TTL

function chargeEmail(intent: Stripe.PaymentIntent): string | null {
  const charge = intent.latest_charge
  if (charge && typeof charge !== 'string') {
    return charge.billing_details?.email ?? intent.receipt_email ?? null
  }
  return intent.receipt_email ?? null
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    paymentIntentId?: string
    clientSecret?: string
  }
  const paymentIntentId = String(body.paymentIntentId ?? '')
  const clientSecret = String(body.clientSecret ?? '')
  if (!paymentIntentId || !clientSecret) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 })
  }

  let intent: Stripe.PaymentIntent
  try {
    intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge'],
    })
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  // Ownership proof — only the buyer's browser holds the client secret.
  if (!intent.client_secret || intent.client_secret !== clientSecret) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (intent.status !== 'succeeded') {
    // Async method still settling — the webhook will issue once it succeeds.
    return NextResponse.json({ orderId: intent.id, pending: true })
  }

  let items: DownloadItem[] = []
  try {
    items = intent.metadata.downloadItems
      ? (JSON.parse(intent.metadata.downloadItems) as DownloadItem[])
      : []
  } catch {
    /* ignore malformed metadata */
  }

  if (items.length === 0) {
    return NextResponse.json({ orderId: intent.id, digital: false })
  }
  if (!originConfigured()) {
    return NextResponse.json({ error: 'origin not configured' }, { status: 503 })
  }

  let passcode: string | null = null
  try {
    const result = await issueGrant({
      orderId: intent.id,
      email: chargeEmail(intent),
      locale: intent.metadata.locale || 'en',
      items,
    })
    passcode = result.passcode
  } catch (err) {
    console.error('[downloads/issue] failed:', err)
    return NextResponse.json({ error: 'issue failed' }, { status: 502 })
  }

  const res = NextResponse.json({ orderId: intent.id, digital: true, passcode })
  res.cookies.set(cookieName(intent.id), signOrder(intent.id), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })
  return res
}
