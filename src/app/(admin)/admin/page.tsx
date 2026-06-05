'use client'

import { useState, useEffect } from 'react'
import type { ReferenceLookup } from '@/lib/shop'
import type { AdminOrder } from '@/lib/downloads'
import Logo from '../_components/Logo'

type Tab = 'products' | 'orders'

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('products')

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 sm:px-10 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Logo height={40} />
          <span className="hidden sm:inline text-[11px] font-mono-ibm uppercase tracking-[0.28em] text-white/40">
            Studio Admin
          </span>
        </div>
        <div className="flex items-center gap-5 sm:gap-7">
          <ShopStatusToggle />
          <form method="post" action="/api/admin/logout">
            <button
              type="submit"
              className="text-[11px] font-mono-ibm uppercase tracking-[0.22em] text-white/40 transition-colors hover:text-white"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-6 sm:px-10 py-12 sm:py-16">
        {/* Tabs */}
        <div className="flex gap-1 mb-10 border-b border-white/10">
          {(['products', 'orders'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-[11px] font-mono-ibm uppercase tracking-[0.22em] transition-colors border-b-2 -mb-px ${
                tab === t
                  ? 'border-[#931020] text-white'
                  : 'border-transparent text-white/40 hover:text-white/70'
              }`}
            >
              {t === 'products' ? 'Product lookup' : 'Orders'}
            </button>
          ))}
        </div>

        {tab === 'products' ? <ProductsTab /> : <OrdersTab />}
      </main>
    </div>
  )
}

// ── Shop online/offline switch ──────────────────────────────────────────────
// Hides/shows the SHOP link in the public site nav. Backed by Cloudflare KV.
function ShopStatusToggle() {
  const [online, setOnline] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/admin/shop-status')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setOnline((d as { online: boolean }).online))
      .catch(() => setOnline(null))
  }, [])

  async function toggle() {
    if (online === null || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/shop-status', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ online: !online }),
      })
      if (res.ok) {
        const d = (await res.json()) as { online: boolean }
        setOnline(d.online)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <span className="hidden sm:inline-flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${
            online === null ? 'bg-white/25' : online ? 'bg-emerald-500' : 'bg-white/30'
          }`}
        />
        <span className="text-[11px] font-mono-ibm uppercase tracking-[0.22em] text-white/40">
          {online === null ? 'Shop —' : online ? 'Shop online' : 'Shop offline'}
        </span>
      </span>
      <button
        type="button"
        onClick={toggle}
        disabled={online === null || busy}
        className={`min-w-[6.5rem] rounded-md border px-3 py-1.5 text-[10px] font-mono-ibm uppercase tracking-[0.2em] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          online
            ? 'border-white/15 text-white/55 hover:border-white/35 hover:text-white'
            : 'border-[#931020] bg-[#931020] text-white hover:bg-[#a8131f]'
        }`}
      >
        {busy ? <span className="admin-btn-spinner" aria-hidden /> : online ? 'Take offline' : 'Take online'}
      </button>
    </div>
  )
}

// ── Products tab ──────────────────────────────────────────────────────────────

type LookupResponse =
  | { found: true; result: ReferenceLookup }
  | { found: false }
  | { error: string }

function ProductsTab() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<LookupResponse | null>(null)

  async function search(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q || loading) return
    setLoading(true)
    setData(null)
    try {
      const res = await fetch(`/api/admin/lookup?q=${encodeURIComponent(q)}`)
      setData((await res.json()) as LookupResponse)
    } catch {
      setData({ error: 'Request failed' })
    } finally {
      setLoading(false)
    }
  }

  const result = data && 'found' in data && data.found ? data.result : null
  const notFound = data && 'found' in data && !data.found
  const errored = data && 'error' in data

  return (
    <>
      <h1 className="font-serif font-light text-4xl sm:text-5xl tracking-wide">Product lookup</h1>
      <p className="mt-2 text-sm text-white/45 max-w-prose">
        Enter a GMP reference or download token to find the original file and its preview.
      </p>

      <form onSubmit={search} className="mt-8 flex gap-3">
        <div className="relative flex-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            spellCheck={false}
            autoCapitalize="characters"
            placeholder="GMP-EB2C81E   ·   GMP-F192DAA.jpg"
            className="w-full bg-white/[0.04] border border-white/15 rounded-md pl-4 pr-10 py-3 font-mono-ibm text-sm tracking-wide outline-none transition-colors focus:border-[#931020] focus:bg-white/[0.06]"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear"
              onClick={() => {
                setQuery('')
                setData(null)
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors text-lg leading-none"
            >
              ×
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="inline-flex items-center justify-center gap-2 min-w-[7rem] rounded-md bg-[#931020] px-5 py-3 text-[11px] font-mono-ibm uppercase tracking-[0.22em] text-white transition-colors hover:bg-[#a8131f] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? <span className="admin-btn-spinner" aria-hidden /> : 'Find'}
        </button>
      </form>

      <div className="mt-12">
        {loading && (
          <div className="flex flex-col items-center py-16 text-white/40">
            <span className="shop-spinner" />
            <p className="mt-8 text-[11px] font-mono-ibm uppercase tracking-[0.28em]">Searching catalogue</p>
          </div>
        )}
        {!loading && errored && (
          <Notice tone="error" title="Lookup failed" body="Something went wrong. Please try again." />
        )}
        {!loading && notFound && (
          <Notice tone="muted" title="No match" body="No product in the catalogue matches that code. Check for typos." />
        )}
        {!loading && result && <ResultCard result={result} />}
      </div>
    </>
  )
}

function ResultCard({ result }: { result: ReferenceLookup }) {
  const matchLabel = result.matchedBy === 'product' ? 'Download token' : 'Photo reference'
  return (
    <div className="grid gap-8 sm:grid-cols-[240px_1fr] items-start animate-[fadeIn_240ms_ease]">
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${result.previewUrl}?max=600`}
          alt={result.displayTitle}
          className="w-full rounded-lg border border-white/10 bg-white/[0.03] shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
        />
        <span className="absolute top-3 left-3 rounded-full bg-black/70 backdrop-blur px-3 py-1 text-[10px] font-mono-ibm uppercase tracking-[0.18em] text-white/80 border border-white/10">
          {matchLabel}
        </span>
      </div>

      <div>
        <h2 className="font-serif font-light text-3xl leading-tight">{result.displayTitle}</h2>
        <dl className="mt-6 divide-y divide-white/[0.07]">
          <Row label="Original filename" value={result.filename} mono accent />
          <Row
            label="Collection"
            value={result.category.length ? result.category.map((p) => p.join('  ›  ')).join('      ') : '—'}
          />
          <Row label="Dimensions" value={`${result.width} × ${result.height} px`} mono />
          {result.product && (
            <>
              <Row
                label="Product"
                value={`${result.product.label} · ${cap(result.product.type)}${
                  result.product.format ? ` · ${result.product.format.toUpperCase()}` : ''
                }`}
              />
              <Row label="SKU" value={result.product.sku} mono />
              <Row label="Customer file" value={result.product.customerFilename} mono accent />
            </>
          )}
        </dl>
        <a
          href={`/shop/${result.slug}`}
          target="_blank"
          rel="noreferrer"
          className="mt-7 inline-flex items-center gap-2 text-[11px] font-mono-ibm uppercase tracking-[0.22em] text-white/60 transition-colors hover:text-white"
        >
          View live page
          <span aria-hidden className="text-[#931020]">→</span>
        </a>
      </div>
    </div>
  )
}

// ── Orders tab ────────────────────────────────────────────────────────────────

function OrdersTab() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [orders, setOrders] = useState<AdminOrder[] | null>(null)
  const [error, setError] = useState(false)

  async function search(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q || loading) return
    setLoading(true)
    setOrders(null)
    setError(false)
    try {
      const res = await fetch(`/api/admin/order?q=${encodeURIComponent(q)}`)
      if (!res.ok) throw new Error()
      const data = (await res.json()) as { orders: AdminOrder[] }
      setOrders(data.orders)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h1 className="font-serif font-light text-4xl sm:text-5xl tracking-wide">Orders</h1>
      <p className="mt-2 text-sm text-white/45 max-w-prose">
        Look up a download order by its order id (<span className="font-mono-ibm">pi_…</span>) or the
        buyer&rsquo;s email — read back the passcode, re-send the link, or extend an expired one.
      </p>

      <form onSubmit={search} className="mt-8 flex gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          spellCheck={false}
          placeholder="pi_3Q…   ·   buyer@example.com"
          className="flex-1 bg-white/[0.04] border border-white/15 rounded-md px-4 py-3 font-mono-ibm text-sm tracking-wide outline-none transition-colors focus:border-[#931020] focus:bg-white/[0.06]"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="inline-flex items-center justify-center min-w-[7rem] rounded-md bg-[#931020] px-5 py-3 text-[11px] font-mono-ibm uppercase tracking-[0.22em] text-white transition-colors hover:bg-[#a8131f] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? <span className="admin-btn-spinner" aria-hidden /> : 'Find'}
        </button>
      </form>

      <div className="mt-10 space-y-6">
        {loading && (
          <div className="flex flex-col items-center py-16 text-white/40">
            <span className="shop-spinner" />
            <p className="mt-8 text-[11px] font-mono-ibm uppercase tracking-[0.28em]">Searching orders</p>
          </div>
        )}
        {!loading && error && (
          <Notice tone="error" title="Lookup failed" body="Couldn’t reach the order store. Is the origin running?" />
        )}
        {!loading && orders && orders.length === 0 && (
          <Notice tone="muted" title="No orders" body="No order matches that id or email." />
        )}
        {!loading && orders?.map((o) => <OrderCard key={o.orderId} order={o} onChanged={() => search0(query, setLoading, setOrders, setError)} />)}
      </div>
    </>
  )
}

// Re-run a search (used after an action mutates an order).
async function search0(
  q: string,
  setLoading: (b: boolean) => void,
  setOrders: (o: AdminOrder[] | null) => void,
  setError: (b: boolean) => void,
) {
  try {
    const res = await fetch(`/api/admin/order?q=${encodeURIComponent(q.trim())}`)
    if (!res.ok) throw new Error()
    const data = (await res.json()) as { orders: AdminOrder[] }
    setOrders(data.orders)
  } catch {
    setError(true)
  } finally {
    setLoading(false)
  }
}

function OrderCard({ order, onChanged }: { order: AdminOrder; onChanged: () => void }) {
  const [busy, setBusy] = useState<'resend' | 'extend' | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const expiry = new Date(order.expiresAt).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })

  async function act(action: 'resend' | 'extend') {
    setBusy(action)
    setNote(null)
    try {
      const res = await fetch('/api/admin/order', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, orderId: order.orderId }),
      })
      const ok = res.ok
      setNote(ok ? (action === 'resend' ? 'Email re-sent.' : 'Link extended.') : 'Action failed.')
      if (ok) onChanged()
    } catch {
      setNote('Action failed.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5 sm:p-6 animate-[fadeIn_240ms_ease]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-mono-ibm text-sm text-white/90 break-all">{order.orderId}</p>
        <span
          className={`text-[10px] font-mono-ibm uppercase tracking-[0.18em] ${
            order.expired ? 'text-[#e0566a]' : 'text-white/40'
          }`}
        >
          {order.expired ? 'Expired' : 'Valid'} · until {expiry}
        </span>
      </div>

      <dl className="mt-4 divide-y divide-white/[0.07]">
        <Row label="Email" value={order.email ?? '—'} mono />
        <Row label="Passcode" value={order.passcode} mono accent />
        <Row label="Emailed" value={order.emailed ? 'yes' : 'no'} />
        <Row label="Download page" value={order.downloadUrl} mono />
      </dl>

      <ul className="mt-4 space-y-1.5">
        {order.items.map((it) => (
          <li key={it.sku} className="flex items-center justify-between gap-3 text-[13px]">
            <span className="font-mono-ibm text-white/70 truncate">{it.filename}</span>
            <span className="shrink-0 text-white/35 text-[11px]">
              {it.label} · {it.format === 'tiff' ? '16-bit TIFF' : 'JPEG'} · {it.downloads} download{it.downloads === 1 ? '' : 's'}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          onClick={() => act('resend')}
          disabled={busy !== null}
          className="rounded-md border border-white/15 px-4 py-2 text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white/70 hover:border-white/40 hover:text-white transition-colors disabled:opacity-40"
        >
          {busy === 'resend' ? 'Sending…' : 'Re-send email'}
        </button>
        <button
          onClick={() => act('extend')}
          disabled={busy !== null}
          className="rounded-md border border-white/15 px-4 py-2 text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white/70 hover:border-white/40 hover:text-white transition-colors disabled:opacity-40"
        >
          {busy === 'extend' ? 'Extending…' : 'Extend 30 days'}
        </button>
        {note && <span className="text-[11px] text-white/50">{note}</span>}
      </div>
    </div>
  )
}

// ── Shared ────────────────────────────────────────────────────────────────────

function Row({ label, value, mono, accent }: { label: string; value: string; mono?: boolean; accent?: boolean }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-4 py-3.5">
      <dt className="text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white/35 pt-0.5">{label}</dt>
      <dd className={`break-all ${mono ? 'font-mono-ibm text-sm' : 'text-[15px]'} ${accent ? 'text-[#e0566a]' : 'text-white/90'}`}>
        {value}
      </dd>
    </div>
  )
}

function Notice({ tone, title, body }: { tone: 'error' | 'muted'; title: string; body: string }) {
  return (
    <div
      className={`rounded-lg border px-5 py-6 text-center ${
        tone === 'error' ? 'border-[#931020]/40 bg-[#931020]/10' : 'border-white/10 bg-white/[0.03]'
      }`}
    >
      <p className="font-serif text-xl">{title}</p>
      <p className="mt-1 text-sm text-white/45">{body}</p>
    </div>
  )
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
