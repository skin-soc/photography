/**
 * Validate an EU VAT number via VIES for B2B checkout. Public (the checkout is
 * unauthenticated). Returns the normalised VIES result so the cart can show the
 * registered business name and let the buyer confirm before we apply the
 * intra-EU reverse charge. See [[vies]].
 */

import { verifyVatNumber } from '@/lib/vies'

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { vatId?: string }
  const vatId = String(body.vatId ?? '').trim()
  if (!vatId) {
    return Response.json({ status: 'malformed', error: 'no VAT id' }, { status: 400 })
  }
  if (vatId.length > 20) {
    return Response.json({ status: 'malformed', error: 'too long' }, { status: 400 })
  }
  const result = await verifyVatNumber(vatId)
  // Don't leak VIES internals; return just what the UI needs.
  return Response.json({
    status: result.status,
    countryCode: result.countryCode,
    vatNumber: result.vatNumber,
    fullId: result.fullId,
    name: result.name ?? null,
    address: result.address ?? null,
  })
}
