/**
 * Prodigi order-status callback receiver.
 *
 * Prodigi POSTs a CloudEvents v1.0 envelope here whenever an order changes stage
 * (Created → InProgress → Complete), ships, or completes. Their callbacks carry
 * NO signature, so the endpoint is secured purely by an unguessable per-order
 * token in the query string (`?o=<orderCode>&t=<token>`), which we mint when we
 * register the callbackUrl at order-creation time and verify here.
 *
 * On a valid event we pull the production stage + any shipment tracking off the
 * embedded order object and persist it to the order (origin-side) so the admin
 * card reflects live Prodigi status. We always answer 200 quickly once the token
 * checks out — fulfilment recording is best-effort and must not make Prodigi retry.
 */

import { NextRequest, NextResponse } from 'next/server'
import { recordFulfilment, verifyProdigiCallback, type FulfilmentTracking } from '@/lib/downloads'
import { prodigiMode } from '@/lib/prodigi'

interface ProdigiShipment {
  carrier?: { name?: string; service?: string } | null
  tracking?: { number?: string; url?: string } | null
  dispatchDate?: string | null
  fulfillmentLocation?: { countryCode?: string; labCode?: string } | null
}
interface ProdigiCallbackOrder {
  id?: string
  merchantReference?: string
  status?: { stage?: string; details?: Record<string, unknown> } | null
  shipments?: ProdigiShipment[] | null
}
interface ProdigiCloudEvent {
  type?: string
  subject?: string
  data?: { order?: ProdigiCallbackOrder } | null
}

export async function POST(req: NextRequest) {
  const orderCode = req.nextUrl.searchParams.get('o') ?? ''
  const token = req.nextUrl.searchParams.get('t') ?? ''
  if (!orderCode || !verifyProdigiCallback(orderCode, token)) {
    return NextResponse.json({ error: 'invalid callback token' }, { status: 401 })
  }

  let event: ProdigiCloudEvent
  try {
    event = (await req.json()) as ProdigiCloudEvent
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const order = event.data?.order ?? null
  // The order code is in the URL token AND echoed as merchantReference — if they
  // disagree, the payload doesn't belong to this order; ignore it (still 200, so
  // Prodigi doesn't retry a callback we've deliberately discarded).
  if (order?.merchantReference && order.merchantReference !== orderCode) {
    return NextResponse.json({ received: true, ignored: 'merchantReference mismatch' })
  }

  // Stage from the order object; the human outcome from the CloudEvents type
  // suffix (e.g. "...stage.changed#InProgress" → "InProgress").
  const stage = order?.status?.stage ?? ''
  const outcome = (event.type?.split('#')[1] ?? stage ?? 'Updated').trim()

  // Shipment tracking — surfaced on the admin card so we (and the buyer) can
  // follow the parcel. Only included when at least one shipment has details.
  const shipments = order?.shipments ?? []
  const tracking: FulfilmentTracking[] = shipments
    .map((s) => ({
      // Prodigi's carrier name already encodes the service, e.g. "DPD NL Classic".
      carrier: s.carrier?.name ?? null,
      number: s.tracking?.number ?? null,
      url: s.tracking?.url ?? null,
    }))
    .filter((t) => t.carrier || t.number || t.url)

  // Where Prodigi produced the order (e.g. NL) + when it dispatched — surfaced on
  // the admin card. First non-empty across shipments.
  const productionCountry = shipments.map((s) => s.fulfillmentLocation?.countryCode).find(Boolean) ?? null
  const shippedAt = shipments.map((s) => s.dispatchDate).find(Boolean) ?? null

  await recordFulfilment(orderCode, {
    provider: 'prodigi',
    prodigiId: order?.id ?? event.subject ?? null,
    stage: stage || outcome,
    outcome,
    mode: prodigiMode(),
    tracking: tracking.length ? tracking : null,
    productionCountry,
    shippedAt,
  })

  return NextResponse.json({ received: true })
}
