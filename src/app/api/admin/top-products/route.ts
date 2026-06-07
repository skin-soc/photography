/**
 * Top-selling products for the admin Product Lookup tab.
 *
 * Sales data comes from Stripe Checkout Sessions, not the origin grants — grants
 * only record digital downloads, whereas every session's `metadata.skus` lists
 * ALL purchased items (digital, prints, fine art). We aggregate paid sessions in
 * the window, count units per SKU, then map each to its catalog name + category.
 * The secret key's mode decides the data: test on preview, live in production.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'
import { stripe } from '@/lib/stripe-server'
import { getCatalog, displayTitle, type ProductType } from '@/lib/shop'

async function authed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ADMIN_COOKIE)?.value
  return verifySessionToken(token, process.env.ADMIN_PASSWORD ?? '')
}

function categoryOf(type: ProductType): string {
  switch (type) {
    case 'digital': return 'Digital Downloads'
    case 'print': return 'Prints'
    case 'fine-art': return 'Fine Art'
    default: return '—'
  }
}

export async function GET(req: NextRequest) {
  if (!(await authed(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const days = Math.min(3650, Math.max(1, parseInt(req.nextUrl.searchParams.get('days') ?? '365', 10) || 365))
  const since = Math.floor(Date.now() / 1000) - days * 86400

  // Count units sold per SKU across paid LIVE sessions (capped at ~500). Test
  // sessions are ignored entirely, so "Top sellers" reflects only real sales —
  // no test clutter, and nothing to delete in the Stripe Dashboard.
  const counts = new Map<string, { live: number; test: number }>()
  let startingAfter: string | undefined
  let pages = 0
  try {
    do {
      const list = await stripe.checkout.sessions.list({
        limit: 100,
        created: { gte: since },
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      })
      for (const s of list.data) {
        if (s.payment_status !== 'paid' || !s.livemode) continue
        const skus = (s.metadata?.skus ?? '').split(',').map((x) => x.trim()).filter(Boolean)
        for (const sku of skus) {
          const c = counts.get(sku) ?? { live: 0, test: 0 }
          c.live += 1
          counts.set(sku, c)
        }
      }
      startingAfter = list.has_more ? list.data[list.data.length - 1]?.id : undefined
      pages += 1
    } while (startingAfter && pages < 5)
  } catch (err) {
    console.error('[top-products] stripe list failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'stripe unavailable' }, { status: 502 })
  }

  // Map SKU → catalog name + category + customer-facing filename (digital only;
  // matches the downloads page: <downloadToken>.<ext>).
  const catalog = await getCatalog()
  const meta = new Map<string, { name: string; category: string; filename: string | null }>()
  for (const photo of catalog) {
    for (const p of photo.products) {
      const filename = p.downloadToken
        ? `${p.downloadToken}.${p.format === 'tiff' ? 'tiff' : 'jpg'}`
        : null
      meta.set(p.sku, { name: `${displayTitle(photo)} — ${p.label}`, category: categoryOf(p.type), filename })
    }
  }

  const products = Array.from(counts.entries())
    .map(([sku, c]) => ({ sku, live: c.live, test: c.test, ...(meta.get(sku) ?? { name: sku, category: '—', filename: null }) }))
    // Rank by real (live) sales first, then test — so it stays meaningful in
    // production while still surfacing test rows during preview.
    .sort((a, b) => b.live - a.live || b.test - a.test)
    .slice(0, 10)

  return NextResponse.json({ products })
}
