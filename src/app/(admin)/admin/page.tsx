'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { PosterTranslations, PosterLocaleText } from '@/lib/poster-translations'
import type { PosterSource } from '@/app/api/admin/poster-translations/route'
import type { ReferenceLookup, AssetInfo } from '@/lib/shop'
import type { AdminOrder, AssetAudit as AssetAuditData } from '@/lib/downloads'
import { vatJurisdiction, jurisdictionLabel, type VatJurisdiction } from '@/lib/vat'
import { SIZE_ORDER, type PaperTier } from '@/config/product-range'
import { roundUpToFiveKr } from '@/lib/currency'
import type { PricingConfig, PricingFloors, PricingValidationError, ColorLabel } from '@/lib/pricing'
import Logo from '../_components/Logo'

type Tab = 'products' | 'orders' | 'finances' | 'prices' | 'coupons' | 'translations' | 'settings'
const TABS: Tab[] = ['products', 'orders', 'finances', 'prices', 'coupons', 'translations', 'settings']

export default function AdminPage() {
  const [tab, setTabState] = useState<Tab>('products')

  // Persist the active tab in the URL hash (e.g. #prices) so a refresh stays put
  // instead of snapping back to Product lookup. Read on mount (client-only, so no
  // SSR mismatch); rewrite on every switch without adding history entries.
  useEffect(() => {
    const h = window.location.hash.replace('#', '')
    if ((TABS as string[]).includes(h)) setTabState(h as Tab)
  }, [])
  const setTab = (t: Tab) => {
    setTabState(t)
    window.history.replaceState(null, '', `#${t}`)
  }

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

      <main className="flex-1 w-full max-w-screen-2xl mx-auto px-6 sm:px-10 py-12 sm:py-16">
        {/* Tabs */}
        <div className="flex gap-1 mb-10 border-b border-white/10">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-[11px] font-mono-ibm uppercase tracking-[0.22em] transition-colors border-b-2 -mb-px ${
                tab === t
                  ? 'border-[#931020] text-white'
                  : 'border-transparent text-white/40 hover:text-white/70'
              }`}
            >
              {t === 'products' ? 'Product lookup' : t === 'orders' ? 'Orders' : t === 'finances' ? 'Finances' : t === 'prices' ? 'Prices' : t === 'coupons' ? 'Coupons' : t === 'translations' ? 'Translations' : 'Settings'}
            </button>
          ))}
        </div>

        {tab === 'products' ? <ProductsTab />
          : tab === 'orders' ? <OrdersTab />
          : tab === 'finances' ? <FinancesTab />
          : tab === 'prices' ? <PricesTab />
          : tab === 'coupons' ? <CouponsTab />
          : tab === 'translations' ? <TranslationsTab />
          : <SettingsTab />}
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
            online === null ? 'bg-white/25' : online ? 'bg-emerald-500' : 'bg-[#931020]'
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

// ── Coupons tab ──────────────────────────────────────────────────────────────

interface PromoCode {
  id: string
  code: string
  active: boolean
  discount: string
  used: number
  max: number | null
  expiresAt: number | null
  created: number
}

function CouponsTab() {
  const [codes, setCodes] = useState<PromoCode[] | null>(null)
  const [error, setError] = useState(false)
  const [type, setType] = useState<'percent' | 'amount'>('percent')
  const [percent, setPercent] = useState('10')
  const [amount, setAmount] = useState('50')
  const [currency, setCurrency] = useState('DKK')
  const [code, setCode] = useState('')
  const [maxRedemptions, setMaxRedemptions] = useState('')
  const [expiry, setExpiry] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  function load() {
    setError(false)
    fetch('/api/admin/coupons')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setCodes((d as { codes: PromoCode[] }).codes))
      .catch(() => setError(true))
  }
  useEffect(() => { load() }, [])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setNote(null)
    const body: Record<string, unknown> = {
      action: 'create',
      type,
      ...(code.trim() ? { code: code.trim() } : {}),
      ...(maxRedemptions ? { maxRedemptions: parseInt(maxRedemptions, 10) } : {}),
    }
    if (type === 'percent') body.percent = parseFloat(percent)
    else { body.amount = parseFloat(amount); body.currency = currency }
    if (expiry) body.expiresAt = Math.floor(new Date(`${expiry}T23:59:59`).getTime() / 1000)
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = (await res.json().catch(() => ({}))) as { coupon?: PromoCode; error?: string }
      if (res.ok && d.coupon) {
        // Insert directly rather than re-fetching — KV list() reads aren't
        // immediately consistent with a write that just happened, so an
        // immediate reload can come back without the coupon we just created.
        setNote(`Created ${d.coupon.code}.`)
        setCode(''); setMaxRedemptions(''); setExpiry('')
        setCodes((prev) => [d.coupon!, ...(prev ?? [])])
      }
      else setNote(d.error || 'Failed.')
    } catch { setNote('Failed.') } finally { setBusy(false) }
  }

  async function deactivate(id: string) {
    if (!window.confirm('Deactivate this code? Customers will no longer be able to use it.')) return
    try {
      await fetch('/api/admin/coupons', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'deactivate', id }),
      })
      setCodes(null); load()
    } catch { /* ignore */ }
  }

  // Uniform control height keeps the select, text inputs, date picker and button
  // visually aligned (each renders at a slightly different intrinsic height
  // otherwise). w-full so the column width comes from the label wrapper.
  const field = 'h-10 w-full rounded-md border border-white/15 bg-white/[0.04] px-3 text-[13px] text-white placeholder:text-white/25 focus:border-[#931020] focus:outline-none transition-colors'
  const lbl = 'text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white/40'

  return (
    <>
      <h1 className="font-serif font-light text-4xl sm:text-5xl tracking-wide">Coupons</h1>
      <p className="mt-2 text-sm text-white/45">
        Create discount codes customers enter at checkout — applied by us at checkout (Stripe does no
        calculation). Shows the <strong className="text-white/60">current mode</strong> (test here, live in production).
      </p>

      <form onSubmit={create} className="mt-8 rounded-lg border border-white/10 bg-white/[0.03] p-6">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-5">
          <label className="flex flex-col gap-1.5 w-44">
            <span className={lbl}>Type</span>
            <select value={type} onChange={(e) => setType(e.target.value as 'percent' | 'amount')} className={field}>
              <option value="percent">Percent off</option>
              <option value="amount">Fixed amount off</option>
            </select>
          </label>
          {type === 'percent' ? (
            <label className="flex flex-col gap-1.5 w-28">
              <span className={lbl}>Percent</span>
              <input type="number" min="1" max="100" value={percent} onChange={(e) => setPercent(e.target.value)} className={field} />
            </label>
          ) : (
            <>
              <label className="flex flex-col gap-1.5 w-32">
                <span className={lbl}>Amount</span>
                <input type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={field} />
              </label>
              <label className="flex flex-col gap-1.5 w-24">
                <span className={lbl}>Currency</span>
                <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className={field} />
              </label>
            </>
          )}
          <label className="flex flex-col gap-1.5 w-44">
            <span className={lbl}>Code (optional)</span>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="auto" className={`${field} font-mono-ibm`} />
          </label>
          <label className="flex flex-col gap-1.5 w-28">
            <span className={lbl}>Max uses</span>
            <input type="number" min="1" value={maxRedemptions} onChange={(e) => setMaxRedemptions(e.target.value)} placeholder="∞" className={field} />
          </label>
          <label className="flex flex-col gap-1.5 w-44">
            <span className={lbl}>Expires (optional)</span>
            <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={field} />
          </label>
          <button type="submit" disabled={busy} className="h-10 shrink-0 rounded-md bg-[#931020] px-5 text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white hover:bg-[#a8131f] transition-colors disabled:opacity-40">
            {busy ? 'Creating…' : 'Create code'}
          </button>
        </div>
        {note && <p className="mt-4 text-[12px] text-white/55">{note}</p>}
      </form>

      <div className="mt-12">
        <h2 className="text-[11px] font-mono-ibm uppercase tracking-[0.28em] text-white/40">Codes</h2>
        {error ? (
          <div className="mt-5"><Notice tone="error" title="Couldn’t load codes" body="Is Stripe reachable?" /></div>
        ) : !codes ? (
          <div className="flex justify-center py-10"><span className="shop-spinner" /></div>
        ) : codes.length === 0 ? (
          <div className="mt-5"><Notice tone="muted" title="No coupons yet" body="Create one above." /></div>
        ) : (
          <table className="mt-5 w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-white/10 text-[10px] font-mono-ibm uppercase tracking-[0.18em] text-white/40">
                <th className="py-2 pr-4 font-normal">Code</th>
                <th className="py-2 pr-4 font-normal">Discount</th>
                <th className="py-2 pr-4 font-normal">Created</th>
                <th className="py-2 pr-4 font-normal">Used</th>
                <th className="py-2 pr-4 font-normal">Expires</th>
                <th className="py-2 pr-4 font-normal">Status</th>
                <th className="py-2 pr-4 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {[...codes].sort((a, b) => b.created - a.created).map((c) => (
                <tr key={c.id} className={`border-b border-white/[0.06] ${c.active ? '' : 'opacity-40'}`}>
                  <td className="py-2.5 pr-4 font-mono-ibm text-[#931020] whitespace-nowrap">{c.code}</td>
                  <td className="py-2.5 pr-4 text-white/75 whitespace-nowrap">{c.discount}</td>
                  <td className="py-2.5 pr-4 text-white/45 whitespace-nowrap">{new Date(c.created * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="py-2.5 pr-4 text-white/55 whitespace-nowrap">{c.used}{c.max != null ? ` / ${c.max}` : ''}</td>
                  <td className="py-2.5 pr-4 text-white/45 whitespace-nowrap">{c.expiresAt ? new Date(c.expiresAt * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                  <td className={`py-2.5 pr-4 whitespace-nowrap ${c.active ? 'text-emerald-400/70' : 'text-white/40'}`}>{c.active ? 'Active' : 'Inactive'}</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap text-right">
                    {c.active && (
                      <button onClick={() => deactivate(c.id)} className="text-[10px] font-mono-ibm uppercase tracking-[0.16em] text-white/40 hover:text-[#931020] transition-colors">
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

// ── Settings tab ────────────────────────────────────────────────────────────

/** Email-me-on-every-real-sale toggle + recipient address. */
/** Square check control matching the shop's selection markers (square box +
 *  square inner marker) — no native tick boxes anywhere in the admin. */
function CheckBox({ checked, onChange, disabled, label, className = '' }: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label: string
  className?: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-3 w-fit text-left select-none cursor-pointer disabled:opacity-40 disabled:cursor-default ${className}`}
    >
      <span
        className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[3px] border transition-colors ${
          checked ? 'border-[#931020] bg-[#931020]' : 'border-white/35'
        }`}
      >
        {checked && <span className="h-1.5 w-1.5 rounded-[1px] bg-white" />}
      </span>
      <span className="text-[14px] font-light text-white/80">{label}</span>
    </button>
  )
}

function SaleNotifySettings() {
  const [enabled, setEnabled] = useState(false)
  const [email, setEmail] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/sale-notify')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        const v = d as { enabled: boolean; email: string }
        setEnabled(v.enabled)
        setEmail(v.email)
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  // enabledOverride lets the checkbox persist its new value immediately (state
  // hasn't updated yet within the same tick), so toggling gives instant feedback
  // like the Refunds toggle. The Save button calls save() with no override.
  async function save(enabledOverride?: boolean) {
    const nextEnabled = enabledOverride ?? enabled
    setBusy(true)
    setNote(null)
    try {
      const res = await fetch('/api/admin/sale-notify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: nextEnabled, email: email.trim() }),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string }
      setNote(res.ok ? 'Saved.' : (d.error || 'Failed.'))
    } catch {
      setNote('Failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-12 rounded-lg border border-white/10 bg-white/[0.03] p-6">
      <h2 className="text-[11px] font-mono-ibm uppercase tracking-[0.28em] text-white/40">Sale notifications</h2>
      <p className="mt-3 text-[13px] font-light text-white/55 leading-relaxed">
        Get an email for every real (live) sale. Test orders never trigger a notification.
      </p>
      <CheckBox
        className="mt-5"
        checked={enabled}
        disabled={!loaded || busy}
        onChange={(next) => { setEnabled(next); save(next) }}
        label="Email me on every real sale"
      />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@gusmcewan.com"
          className="min-w-[18rem] flex-1 rounded-md border border-white/15 bg-white/[0.04] px-4 py-2.5 text-[14px] text-white placeholder:text-white/25 focus:border-[#931020] focus:outline-none transition-colors"
        />
        <button
          onClick={() => save()}
          disabled={busy || !loaded}
          className="rounded-md bg-[#931020] px-5 py-2.5 text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white hover:bg-[#a8131f] transition-colors disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        {note && <span className="text-[12px] text-white/55">{note}</span>}
      </div>
    </section>
  )
}

/** Default emphasis for the order-card refund button. */
function RefundPrefs() {
  const [val, setVal] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/prefs')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setVal((d as { refundUndownloadedDefault: boolean }).refundUndownloadedDefault))
      .catch(() => setVal(true))
  }, [])

  async function save(next: boolean) {
    setBusy(true)
    setNote(null)
    setVal(next)
    try {
      const res = await fetch('/api/admin/prefs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refundUndownloadedDefault: next }),
      })
      setNote(res.ok ? 'Saved.' : 'Failed.')
    } catch { setNote('Failed.') } finally { setBusy(false) }
  }

  return (
    <section className="mt-10 rounded-lg border border-white/10 bg-white/[0.03] p-6">
      <h2 className="text-[11px] font-mono-ibm uppercase tracking-[0.28em] text-white/40">Refunds</h2>
      <p className="mt-3 text-[12px] font-light text-white/40 leading-relaxed">
        When on, the order card pre-selects undownloaded digital items for the itemised refund.
        Any line (physical, digital or shipping) can still be ticked on or off before refunding.
      </p>
      <CheckBox
        className="mt-5"
        checked={val === true}
        disabled={val === null || busy}
        onChange={(next) => save(next)}
        label="Pre-select undownloaded digital items for refund"
      />
      {note && <p className="mt-3 text-[12px] text-white/55">{note}</p>}
    </section>
  )
}

/** Warm previews · clear deliverables · refresh catalog cache. */
function CacheControls() {
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  async function run(action: string, label: string, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return
    setBusy(action)
    setNote(null)
    try {
      const res = await fetch('/api/admin/cache', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const d = (await res.json().catch(() => ({}))) as { deleted?: number; queued?: number; posters?: number; error?: string }
      const detail = typeof d.queued === 'number'
        ? ` (${d.posters} photos → ${d.queued} rendering in the background)`
        : typeof d.deleted === 'number' ? ` (${d.deleted} cleared)` : ''
      setNote(res.ok ? `${label} done${detail}.` : (d.error || 'Failed.'))
    } catch { setNote('Failed.') } finally { setBusy(null) }
  }

  const btn = 'w-44 shrink-0 h-10 rounded-md border border-white/15 text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white/70 hover:border-white/40 hover:text-white transition-colors disabled:opacity-40'

  const actions: { action: string; label: string; busyLabel: string; desc: string; confirm?: string }[] = [
    { action: 'refresh-catalog', label: 'Refresh catalog', busyLabel: 'Refreshing…',
      desc: 'Forces an immediate refresh. A republished Lightroom export otherwise appears within ~60s on its own.' },
    { action: 'warm-previews', label: 'Warm previews', busyLabel: 'Warming…',
      desc: 'Builds any missing watermarked previews (every size + poster/no-logo variant) and primes the loki edge cache, so the first visitor anywhere gets a cache hit.' },
    { action: 'clear-fulfil', label: 'Clear deliverables', busyLabel: 'Clearing…',
      desc: 'Frees disk — files regenerate on the next download.',
      confirm: 'Clear all generated deliverables? They regenerate on next download.' },
    { action: 'prerender-posters', label: 'Pre-render posters', busyLabel: 'Queuing…',
      desc: 'Renders every poster print master (all qualifying A-sizes) to bulk storage, ready for Prodigi. Run after publishing or editing posters; force-refreshes existing ones.',
      confirm: 'Pre-render all poster print masters? Force-regenerates every qualifying A-size on the NAS (a few minutes in the background).' },
    { action: 'prerender-mockups', label: 'Generate fine-art mockups', busyLabel: 'Queuing…',
      desc: 'Renders every fine-art room mockup (each family × frame colour) via Prodigi and caches them on the NAS, so the product hero is instant and never blanks. Run after publishing or editing fine-art photos.',
      confirm: 'Generate all fine-art room mockups? Renders each family × colour via Prodigi onto the NAS (a couple of minutes in the background).' },
  ]

  return (
    <section className="mt-10 rounded-lg border border-white/10 bg-white/[0.03] p-6">
      <h2 className="text-[11px] font-mono-ibm uppercase tracking-[0.28em] text-white/40">Cache</h2>
      <div className="mt-5 space-y-3">
        {actions.map((a) => (
          <div key={a.action} className="flex items-center gap-4">
            <button
              onClick={() => run(a.action, a.label, a.confirm)}
              disabled={busy !== null}
              className={btn}
            >
              {busy === a.action ? a.busyLabel : a.label}
            </button>
            <p className="text-[12px] font-light text-white/40 leading-relaxed">{a.desc}</p>
          </div>
        ))}
      </div>
      {note && <p className="mt-4 text-[12px] text-white/55">{note}</p>}
      <RenderProgress />
      <RerenderPreviews btn={btn} />
    </section>
  )
}

/** Live progress bars for the background pre-render batches (posters + mockups),
 *  polled from the origin. Hidden until a batch has run this session. */
interface RenderBatch { total: number; done: number; failed: number; running: boolean; finishedAt: number }
interface ProgressData { poster: RenderBatch; mockup: RenderBatch; previewVersion?: number; mockupVersion?: number }
function RenderProgress() {
  const [p, setP] = useState<ProgressData | null>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'unavailable'>('loading')
  const [syncing, setSyncing] = useState(false)
  const lastMockupVer = useRef<number | null>(null)
  useEffect(() => {
    let stop = false
    let iv: ReturnType<typeof setTimeout> | null = null
    const tick = async () => {
      try {
        const r = await fetch('/api/admin/render-progress', { cache: 'no-store' })
        if (stop) return
        if (r.ok) {
          const data = (await r.json()) as ProgressData
          setP(data); setStatus('ok')
          // AUTO cache management: when the origin's mockup version advances (a render
          // batch finished + bumped it), purge the catalog so the new version — and
          // therefore fresh mockup URLs everywhere — propagates immediately instead of
          // waiting out the 60s TTL. No manual flush, no stale covers.
          const mv = data.mockupVersion ?? null
          if (mv != null && lastMockupVer.current != null && mv > lastMockupVer.current) {
            setSyncing(true)
            fetch('/api/admin/cache', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'refresh-catalog' }) })
              .catch(() => {})
              .finally(() => { if (!stop) setSyncing(false) })
          }
          if (mv != null) lastMockupVer.current = mv
          // Poll fast only while a batch is actually running; otherwise idle slowly
          // so the admin page isn't hammering the Worker forever.
          const active = data.poster.running || data.mockup.running
          if (!stop) iv = setTimeout(tick, active ? 2500 : 30000)
        } else {
          setStatus('unavailable')
          if (!stop) iv = setTimeout(tick, 30000)
        }
      } catch {
        if (!stop) { setStatus('unavailable'); iv = setTimeout(tick, 30000) }
      }
    }
    tick()
    return () => { stop = true; if (iv) clearTimeout(iv) }
  }, [])

  const bar = (label: string, b: RenderBatch) => {
    const ran = b.total > 0 || b.running || b.finishedAt > 0
    // A finished batch reads as a full bar even when nothing was queued (total 0,
    // e.g. everything already cached) — otherwise the fill is 0%-wide and invisible.
    const pct = b.total ? Math.round((b.done / b.total) * 100) : b.finishedAt ? 100 : 0
    const state = b.running ? 'Rendering…' : b.finishedAt ? 'Done' : 'Idle'
    return (
      <div key={label}>
        <div className="flex items-baseline justify-between text-[11px] font-mono-ibm">
          <span className="uppercase tracking-[0.2em] text-white/45">{label}</span>
          <span className="tabular-nums text-white/55">
            {ran ? `${b.done}/${b.total}` : '—'}{b.failed ? ` · ${b.failed} failed` : ''}
            <span className="ml-2 text-white/30">{state}</span>
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${b.running ? 'bg-accent-bright' : b.finishedAt && !b.failed ? 'bg-emerald-500' : b.failed ? 'bg-amber-500' : 'bg-accent'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6 border-t border-white/10 pt-5">
      <h3 className="text-[10px] font-mono-ibm uppercase tracking-[0.28em] text-white/35">Render progress</h3>
      {status === 'unavailable' ? (
        <p className="mt-3 text-[11px] text-amber-400/70">Origin progress endpoint unavailable — rebuild the NAS origin (needs the render-progress build).</p>
      ) : !p ? (
        <p className="mt-3 text-[11px] text-white/35">Loading…</p>
      ) : (
        <>
          <div className="mt-3 space-y-3">{bar('Posters', p.poster)}{bar('Mockups', p.mockup)}</div>
          {/* Cache versions — bumped automatically on re-render; the catalog is
              re-synced on the spot so the new version reaches the shop instantly. */}
          <div className="mt-3 flex items-center justify-between text-[10px] font-mono-ibm text-white/30">
            <span className="uppercase tracking-[0.2em]">Cache</span>
            <span className="tabular-nums">
              preview v{p.previewVersion ?? '—'} · mockup v{p.mockupVersion ?? '—'}
              {syncing && <span className="ml-2 text-accent">re-syncing…</span>}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Force a re-render of watermarked previews — for one collection (down to leaf
 * level) or all of them. Unlike "Warm previews", this deletes the cached
 * previews first so they regenerate from source (use after a logo or
 * watermark change). The collection list comes from the live catalog.
 */
function RerenderPreviews({ btn }: { btn: string }) {
  const [collections, setCollections] = useState<{ path: string[]; count: number }[] | null>(null)
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState('') // JSON of the chosen path; '' = all
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/admin/cache', { cache: 'no-store' })
        if (!res.ok) return
        const d = (await res.json()) as { total?: number; collections?: { path: string[]; count: number }[] }
        setCollections(d.collections ?? [])
        setTotal(d.total ?? 0)
      } catch { /* leave as loading */ }
    })()
  }, [])

  // Top-tier folders are product-type roots; map the id to its Lightroom name.
  const TYPE_LABEL: Record<string, string> = { digital: 'Digital Downloads', print: 'Posters', 'fine-art': 'Fine Art' }
  const typeLabel = (t: string) => TYPE_LABEL[t] ?? t
  const pathLabel = (path: string[]) => path.map((seg, i) => (i === 0 ? typeLabel(seg) : seg)).join(' › ')

  async function rerender() {
    const path = selected ? (JSON.parse(selected) as string[]) : []
    const label = path.length ? pathLabel(path) : 'all collections'
    if (!window.confirm(`Re-render previews for ${label}? Cached previews are deleted and rebuilt from source.`)) return
    setBusy(true)
    setNote(null)
    try {
      const res = await fetch('/api/admin/cache', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'rerender-previews', path }),
      })
      const d = (await res.json().catch(() => ({}))) as { matched?: number; deleted?: number; previewVersion?: number; error?: string }
      setNote(res.ok
        ? `Re-rendering ${d.matched ?? 0} photo${d.matched === 1 ? '' : 's'} (${d.deleted ?? 0} cached preview${d.deleted === 1 ? '' : 's'} cleared) — rebuilding + re-priming the edge in the background${d.previewVersion ? ` (cache v${d.previewVersion})` : ''}.`
        : (d.error || 'Failed.'))
    } catch { setNote('Failed.') } finally { setBusy(false) }
  }

  const sel = 'h-10 min-w-[16rem] max-w-full rounded-md border border-white/15 bg-transparent px-3 text-[11px] font-mono-ibm uppercase tracking-[0.12em] text-white/70 hover:border-white/40 focus:border-white/40 focus:outline-none disabled:opacity-40 [&>option]:bg-neutral-900 [&>option]:text-white/80'

  return (
    <div className="mt-6 border-t border-white/10 pt-5">
      <p className="text-[12px] font-light text-white/40 leading-relaxed">
        Force a re-render: deletes cached previews so they rebuild from source (use after a logo or
        watermark change). Pick a collection — down to a single leaf — or all previews.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={busy || collections === null}
          className={sel}
        >
          <option value="">{collections === null ? 'Loading…' : `All previews (${total})`}</option>
          {collections?.map((c) => (
            <option key={JSON.stringify(c.path)} value={JSON.stringify(c.path)}>
              {'  '.repeat(c.path.length - 1)}{c.path.length > 1 ? '└ ' : ''}{c.path.length === 1 ? typeLabel(c.path[0]) : c.path[c.path.length - 1]} ({c.count})
            </option>
          ))}
        </select>
        <button onClick={rerender} disabled={busy || collections === null} className={btn}>
          {busy ? 'Re-rendering…' : 'Re-render previews'}
        </button>
      </div>
      {note && <p className="mt-4 text-[12px] text-white/55">{note}</p>}
    </div>
  )
}

/** Reconcile masters + poster assets against the catalog: find masters missed on
 *  export, and orphaned masters / poster assets left by deleted photos. */
function AssetAudit() {
  const [audit, setAudit] = useState<AssetAuditData | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  async function run() {
    setBusy('audit'); setNote(null)
    try {
      const res = await fetch('/api/admin/asset-audit')
      if (res.ok) setAudit((await res.json()) as AssetAuditData)
      else setNote('Audit failed — is the origin reachable?')
    } catch { setNote('Audit failed.') } finally { setBusy(null) }
  }

  async function prune(scope: 'poster-assets' | 'masters', confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return
    setBusy(scope); setNote(null)
    try {
      const res = await fetch('/api/admin/asset-audit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scope }),
      })
      const d = (await res.json().catch(() => ({}))) as { deleted?: number; total?: number; error?: string }
      if (res.ok) {
        setNote(`Deleted ${d.deleted ?? 0} of ${d.total ?? 0}.`)
        const r = await fetch('/api/admin/asset-audit')
        if (r.ok) setAudit((await r.json()) as AssetAuditData)
      } else setNote(d.error || 'Prune failed.')
    } catch { setNote('Prune failed.') } finally { setBusy(null) }
  }

  const btn = 'shrink-0 h-10 rounded-md border border-white/15 px-4 text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white/70 hover:border-white/40 hover:text-white transition-colors disabled:opacity-40'
  const danger = 'shrink-0 h-10 rounded-md border border-[#931020]/60 px-4 text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-[#931020] hover:bg-[#931020] hover:text-white transition-colors disabled:opacity-40'
  const Tally = ({ n }: { n: number }) => (
    <span className={`font-mono-ibm ${n > 0 ? 'text-[#c9293f]' : 'text-emerald-300/80'}`}>{n}</span>
  )

  return (
    <section className="mt-10 rounded-lg border border-white/10 bg-white/[0.03] p-6">
      <h2 className="text-[11px] font-mono-ibm uppercase tracking-[0.28em] text-white/40">Asset audit</h2>
      <p className="mt-3 text-[12px] font-light text-white/40 leading-relaxed">
        Reconcile the NAS against the catalog: photos whose <strong className="text-white/55">master was
        missed on export</strong>, plus <strong className="text-white/55">orphaned</strong> masters and
        pre-rendered poster assets left behind by deleted photos.
      </p>

      <div className="mt-5 flex items-center gap-3">
        <button onClick={run} disabled={busy !== null} className={btn}>
          {busy === 'audit' ? 'Auditing…' : audit ? 'Re-run audit' : 'Run audit'}
        </button>
        {note && <span className="text-[12px] text-white/55">{note}</span>}
      </div>

      {audit && (
        <div className="mt-6 space-y-5 text-[13px]">
          <p className="text-white/45">Catalog: <span className="font-mono-ibm text-white/70">{audit.catalogCount}</span> photos</p>

          {/* Missing masters */}
          <div>
            <p className="text-[11px] font-mono-ibm uppercase tracking-[0.2em] text-white/45">
              Missing masters · <Tally n={audit.missingMasters.length} />
            </p>
            {audit.missingMasters.length > 0 && (
              <ul className="mt-2 max-h-44 overflow-auto space-y-1 font-mono-ibm text-[12px] text-white/60">
                {audit.missingMasters.slice(0, 200).map((m) => (
                  <li key={m.id}>
                    <span className="text-[#c9293f]">{m.ref}</span> · {m.title || m.id} ·{' '}
                    <span className="text-white/40">needs {m.needs.join(' + ')}</span>
                  </li>
                ))}
                {audit.missingMasters.length > 200 && <li className="text-white/30">…and {audit.missingMasters.length - 200} more</li>}
              </ul>
            )}
            <p className="mt-1 text-[11px] text-white/30">Re-export masters from Lightroom for these.</p>
          </div>

          {/* Orphan poster assets */}
          <div>
            <div className="flex items-center justify-between gap-4">
              <p className="text-[11px] font-mono-ibm uppercase tracking-[0.2em] text-white/45">
                Orphaned poster assets · <Tally n={audit.orphanPosterAssets.length} />
              </p>
              {audit.orphanPosterAssets.length > 0 && (
                <button onClick={() => prune('poster-assets')} disabled={busy !== null} className={btn}>
                  {busy === 'poster-assets' ? 'Pruning…' : 'Prune'}
                </button>
              )}
            </div>
            {audit.orphanPosterAssets.length > 0 && (
              <ul className="mt-2 max-h-32 overflow-auto font-mono-ibm text-[11px] text-white/40">
                {audit.orphanPosterAssets.slice(0, 100).map((n) => <li key={n}>{n}</li>)}
              </ul>
            )}
          </div>

          {/* Orphan masters */}
          <div>
            <div className="flex items-center justify-between gap-4">
              <p className="text-[11px] font-mono-ibm uppercase tracking-[0.2em] text-white/45">
                Orphaned masters · <Tally n={audit.orphanMasters.length} />
              </p>
              {audit.orphanMasters.length > 0 && (
                <button
                  onClick={() => prune('masters', `Delete ${audit.orphanMasters.length} orphaned master file(s)? These have no catalog entry. This frees disk but is irreversible.`)}
                  disabled={busy !== null}
                  className={danger}
                >
                  {busy === 'masters' ? 'Pruning…' : 'Prune'}
                </button>
              )}
            </div>
            {audit.orphanMasters.length > 0 && (
              <ul className="mt-2 max-h-32 overflow-auto font-mono-ibm text-[11px] text-white/40">
                {audit.orphanMasters.slice(0, 100).map((n) => <li key={n}>{n}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

/** Send a test email + purge expired grants. */
function DiagnosticsSettings() {
  const [busy, setBusy] = useState<'email' | 'purge' | null>(null)
  const [note, setNote] = useState<string | null>(null)

  async function sendTest() {
    setBusy('email')
    setNote(null)
    try {
      const res = await fetch('/api/admin/email-test', { method: 'POST' })
      const d = (await res.json().catch(() => ({}))) as { to?: string; error?: string }
      setNote(res.ok ? `Test email sent to ${d.to ?? 'the default address'}.` : (d.error || 'Failed.'))
    } catch { setNote('Failed.') } finally { setBusy(null) }
  }

  async function purge() {
    if (!window.confirm('Delete all expired download grants now? (Orders past their 30-day window.)')) return
    setBusy('purge')
    setNote(null)
    try {
      const res = await fetch('/api/admin/purge-expired', { method: 'POST' })
      const d = (await res.json().catch(() => ({}))) as { deleted?: number; error?: string }
      setNote(res.ok ? `Purged ${d.deleted ?? 0} expired order${d.deleted === 1 ? '' : 's'}.` : (d.error || 'Failed.'))
    } catch { setNote('Failed.') } finally { setBusy(null) }
  }

  return (
    <section className="mt-10 rounded-lg border border-white/10 bg-white/[0.03] p-6">
      <h2 className="text-[11px] font-mono-ibm uppercase tracking-[0.28em] text-white/40">Diagnostics &amp; maintenance</h2>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          onClick={sendTest}
          disabled={busy !== null}
          className="rounded-md border border-white/15 px-4 py-2.5 text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white/70 hover:border-white/40 hover:text-white transition-colors disabled:opacity-40"
        >
          {busy === 'email' ? 'Sending…' : 'Send test email'}
        </button>
        <button
          onClick={purge}
          disabled={busy !== null}
          className="rounded-md border border-white/15 px-4 py-2.5 text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white/70 hover:border-white/40 hover:text-white transition-colors disabled:opacity-40"
        >
          {busy === 'purge' ? 'Purging…' : 'Purge expired orders'}
        </button>
        {note && <span className="text-[12px] text-white/55">{note}</span>}
      </div>
      <p className="mt-3 text-[12px] font-light text-white/40 leading-relaxed">
        Test email sends the branded download email to your sending address. Purge removes download
        grants whose 30-day window has passed (deliverables are cleaned up too).
      </p>
    </section>
  )
}

/** Read-only list of active Stripe Tax registrations.
 *  NOTE: Not currently rendered — VAT is calculated manually (Stripe Tax off).
 *  Kept (with TaxRegistrations below) for future use if Stripe Tax / OSS is
 *  re-enabled; re-add <TaxRegistrations /> to SettingsTab to show it again. */
interface TaxReg { id: string; country: string; status: string; livemode: boolean; activeFrom: number | null }
/** Manual VAT rate — applied to DK + EU buyers; non-EU pay 0%. */
type ThemePref = 'auto' | 'light' | 'dark'

/** Global site appearance — Auto (follow visitor's OS) / Light / Dark. The root
 *  layout reads this server-side and themes <html>. */
function AppearanceSettings() {
  const [theme, setTheme] = useState<ThemePref | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/theme')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setTheme((d as { theme: ThemePref }).theme))
      .catch(() => setTheme('auto'))
  }, [])

  async function save(next: ThemePref) {
    if (next === theme) return
    setBusy(true)
    setNote(null)
    const prev = theme
    setTheme(next)
    try {
      const res = await fetch('/api/admin/theme', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ theme: next }),
      })
      if (res.ok) { setNote('Saved.') } else { setTheme(prev); setNote('Failed.') }
    } catch { setTheme(prev); setNote('Failed.') } finally { setBusy(false) }
  }

  const options: { value: ThemePref; label: string; hint: string }[] = [
    { value: 'auto', label: 'Auto', hint: 'Follows the visitor’s device' },
    { value: 'light', label: 'Light', hint: 'Always light' },
    { value: 'dark', label: 'Dark', hint: 'Always dark' },
  ]

  return (
    <section className="mt-10 rounded-lg border border-white/10 bg-white/[0.03] p-6">
      <h2 className="text-[11px] font-mono-ibm uppercase tracking-[0.28em] text-white/40">Appearance</h2>
      <p className="mt-3 text-[12px] font-light text-white/40 leading-relaxed">
        Site-wide theme for the public site. <strong className="text-white/55">Auto</strong> follows each
        visitor’s device (light/dark) preference. Applied on the server, so there’s no flash on load.
      </p>
      <div className="mt-5 inline-flex rounded-md border border-white/15 overflow-hidden">
        {options.map((o, i) => (
          <button
            key={o.value}
            onClick={() => save(o.value)}
            disabled={theme === null || busy}
            title={o.hint}
            className={`px-5 py-2.5 text-[10px] font-mono-ibm uppercase tracking-[0.2em] transition-colors disabled:opacity-40 ${
              i > 0 ? 'border-l border-white/15' : ''
            } ${
              theme === o.value
                ? 'bg-[#931020] text-white'
                : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            {o.label}
          </button>
        ))}
        {note && <span className="self-center pl-4 pr-1 text-[12px] text-white/55">{note}</span>}
      </div>
    </section>
  )
}

function VatRateSettings() {
  const [rate, setRate] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/vat-rate')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        const v = (d as { rate: number }).rate
        setRate(v)
        setDraft(String(v))
      })
      .catch(() => { setRate(25); setDraft('25') })
  }, [])

  async function save() {
    const pct = Number(draft)
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) { setNote('Enter 0–100.'); return }
    setBusy(true)
    setNote(null)
    try {
      const res = await fetch('/api/admin/vat-rate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rate: pct }),
      })
      if (res.ok) { setRate(pct); setNote('Saved.') } else { setNote('Failed.') }
    } catch { setNote('Failed.') } finally { setBusy(false) }
  }

  const dirty = rate != null && draft.trim() !== String(rate)

  return (
    <section className="mt-10 rounded-lg border border-white/10 bg-white/[0.03] p-6">
      <h2 className="text-[11px] font-mono-ibm uppercase tracking-[0.28em] text-white/40">VAT rate</h2>
      <p className="mt-3 text-[12px] font-light text-white/40 leading-relaxed">
        Charged on top of catalog prices to <strong className="text-white/55">Denmark and EU</strong> buyers
        (location from IP); buyers <strong className="text-white/55">outside the EU</strong> pay 0%. Stripe Tax
        is off — VAT is calculated here, so there’s no per-transaction Stripe Tax fee. While under the EU’s
        €10,000/yr cross-border B2C threshold, charging the Danish rate to all EU buyers is correct; the
        Finances tab tracks EU sales separately so you can see that threshold approaching.
      </p>
      <div className="mt-5 flex items-center gap-3">
        <div className="relative">
          <input
            type="number"
            min={0}
            max={100}
            step="0.1"
            value={draft}
            disabled={rate === null || busy}
            onChange={(e) => setDraft(e.target.value)}
            className="w-28 rounded-md border border-white/15 bg-white/[0.04] px-3 py-2.5 pr-8 text-[14px] text-white focus:border-[#931020] focus:outline-none disabled:opacity-40"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-white/40">%</span>
        </div>
        <button
          onClick={save}
          disabled={!dirty || busy}
          className="rounded-md border border-white/15 px-4 py-2.5 text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white/70 hover:border-white/40 hover:text-white transition-colors disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        {note && <span className="text-[12px] text-white/55">{note}</span>}
      </div>
    </section>
  )
}

// Not currently rendered (manual VAT — see note on TaxReg). Kept for future use.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function TaxRegistrations() {
  const [regs, setRegs] = useState<TaxReg[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/api/admin/tax-registrations')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setRegs((d as { registrations: TaxReg[] }).registrations))
      .catch(() => setError(true))
  }, [])

  return (
    <section className="mt-10 rounded-lg border border-white/10 bg-white/[0.03] p-6">
      <h2 className="text-[11px] font-mono-ibm uppercase tracking-[0.28em] text-white/40">Tax registrations</h2>
      <p className="mt-3 text-[12px] font-light text-white/40 leading-relaxed">
        Informational only — VAT is now calculated manually (see <strong className="text-white/55">VAT rate</strong> above),
        so Stripe Tax registrations don’t drive checkout. This lists any registrations still configured in the
        <strong className="text-white/55"> current Stripe mode</strong> (this admin shows <em>test</em>). Manage them in
        the Stripe Dashboard → Tax → Registrations.
      </p>
      {error ? (
        <p className="mt-4 text-[12px] text-[#931020]">Couldn’t load registrations.</p>
      ) : !regs ? (
        <div className="mt-4 flex justify-center py-4"><span className="shop-spinner" /></div>
      ) : regs.length === 0 ? (
        <p className="mt-4 text-[12px] text-white/45">None — no tax is collected anywhere yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {regs.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
              <span className="font-mono-ibm text-white/80 w-10">{r.country}</span>
              <span className="text-white/40 text-[10px] font-mono-ibm uppercase tracking-[0.16em]">{r.status}</span>
              <span className={`rounded-[4px] border px-1.5 py-0.5 text-[8px] font-mono-ibm uppercase tracking-[0.16em] ${
                r.livemode ? 'border-emerald-400/40 text-emerald-300' : 'border-amber-400/40 text-amber-300'
              }`}>
                {r.livemode ? 'Live' : 'Test'}
              </span>
              {r.activeFrom && (
                <span className="text-white/30 text-[11px]">from {new Date(r.activeFrom * 1000).toISOString().slice(0, 10)}</span>
              )}
              <span className="font-mono-ibm text-white/25 text-[10px]">{r.id}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ── Translations tab ──────────────────────────────────────────────────────────

const LOCALE_LABELS: Record<string, string> = {
  en: 'English', da: 'Dansk', de: 'Deutsch', es: 'Español', fr: 'Français',
  it: 'Italiano', nl: 'Nederlands', nb: 'Norsk', pl: 'Polski', pt: 'Português',
  fi: 'Suomi', sv: 'Svenska', ar: 'العربية', ru: 'Русский', zh: '中文', ja: '日本語', ko: '한국어',
}

const MYMEMORY_LANG: Record<string, string> = {
  da: 'da-DK', de: 'de-DE', es: 'es-ES', fr: 'fr-FR', it: 'it-IT',
  nl: 'nl-NL', nb: 'no-NO', pl: 'pl-PL', pt: 'pt-PT', fi: 'fi-FI',
  sv: 'sv-SE', ar: 'ar-SA', ru: 'ru-RU', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR',
}

async function clientTranslate(text: string, targetLang: string): Promise<string> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en-GB|${targetLang}`
  try {
    const res = await fetch(url)
    if (!res.ok) return text
    const data = await res.json() as { responseData?: { translatedText?: string }; responseStatus?: number | string }
    if (Number(data.responseStatus) !== 200) return text
    const translated = data.responseData?.translatedText ?? text
    // Match source capitalisation: if source is title case, apply title case to result
    const isTitleCase = text.split(' ').filter(w => w.length > 3).every(w => w[0] === w[0].toUpperCase())
    if (isTitleCase) return translated.split(' ').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ')
    // Otherwise just capitalise first letter
    return translated.charAt(0).toUpperCase() + translated.slice(1)
  } catch { return text }
}

function TranslationsTab() {
  const [posters, setPosters] = useState<PosterSource[] | null>(null)
  const [allLocales, setAllLocales] = useState<string[]>([])
  // Draft state: photoId → locale → text
  const [draft, setDraft] = useState<PosterTranslations>({})
  const [selectedLocale, setSelectedLocale] = useState('de')
  const [busy, setBusy] = useState(false)
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [generatingAll, setGeneratingAll] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  // Load posters + saved translations
  useEffect(() => {
    fetch('/api/admin/poster-translations')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        const { posters, translations, locales } = d as { posters: PosterSource[]; translations: PosterTranslations; locales: string[] }
        setPosters(posters)
        setAllLocales(locales.filter((l) => l !== 'en'))
        setDraft(translations)
      })
      .catch(() => setPosters([]))
  }, [])

  const updateField = useCallback((photoId: string, locale: string, field: 'title' | 'caption', value: string) => {
    setDraft((prev) => ({
      ...prev,
      [photoId]: {
        ...(prev[photoId] ?? {}),
        [locale]: {
          ...(prev[photoId]?.[locale] ?? { title: '' }),
          [field]: value,
        },
      },
    }))
    setDirty(true)
  }, [])

  async function save() {
    setBusy(true)
    setNote(null)
    try {
      const res = await fetch('/api/admin/poster-translations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'save', translations: draft }),
      })
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      setNote(res.ok && d.ok ? 'Saved.' : (d.error || 'Failed.'))
      if (res.ok && d.ok) setDirty(false)
    } catch { setNote('Failed.') } finally { setBusy(false) }
  }

  async function applyGenerated(posterId: string, generated: Record<string, PosterLocaleText>) {
    setDraft((prev) => {
      const updated = { ...prev }
      const existing = updated[posterId] ?? {}
      const merged: Record<string, PosterLocaleText> = { ...existing }
      for (const [locale, text] of Object.entries(generated)) {
        merged[locale] = {
          title: existing[locale]?.title?.trim() ? existing[locale].title : text.title,
          ...(text.caption !== undefined
            ? { caption: existing[locale]?.caption?.trim() ? existing[locale].caption : text.caption }
            : existing[locale]?.caption !== undefined ? { caption: existing[locale].caption } : {}),
        }
      }
      updated[posterId] = merged
      return updated
    })
    setDirty(true)
  }

  async function translatePoster(poster: PosterSource): Promise<Record<string, PosterLocaleText>> {
    const generated: Record<string, PosterLocaleText> = {}
    for (const locale of allLocales) {
      const lang = MYMEMORY_LANG[locale]
      if (!lang) { generated[locale] = { title: poster.title }; continue }
      const title = await clientTranslate(poster.title, lang)
      const entry: PosterLocaleText = { title }
      if (poster.caption) entry.caption = await clientTranslate(poster.caption, lang)
      generated[locale] = entry
    }
    return generated
  }

  async function generateForPoster(poster: PosterSource) {
    setGeneratingId(poster.id)
    setNote(null)
    try {
      const generated = await translatePoster(poster)
      await applyGenerated(poster.id, generated)
      setNote(`Translated "${poster.title}". Review and save.`)
    } catch { setNote('Translation failed.') } finally { setGeneratingId(null) }
  }

  async function generateAll() {
    if (!posters || posters.length === 0) return
    setGeneratingAll(true)
    setNote(null)
    let done = 0
    for (const poster of posters) {
      setGeneratingId(poster.id)
      try {
        const generated = await translatePoster(poster)
        await applyGenerated(poster.id, generated)
        done++
      } catch { setNote(`Failed on "${poster.title}".`) }
    }
    setGeneratingId(null)
    setGeneratingAll(false)
    if (done > 0) setNote(`Translated ${done} poster${done > 1 ? 's' : ''}. Review and save.`)
  }

  const field = 'h-9 w-full rounded-md border border-white/15 bg-white/[0.04] px-3 text-[13px] text-white placeholder:text-white/25 focus:border-[#931020] focus:outline-none transition-colors'

  return (
    <>
      <h1 className="font-serif font-light text-4xl sm:text-5xl tracking-wide">Poster translations</h1>
      <p className="mt-2 text-sm text-white/45">
        Locale-specific title and caption for each poster — printed on the physical sheet and shown
        in the shop preview. English always comes from Lightroom and cannot be overridden here.
      </p>

      {/* Locale picker */}
      <div className="mt-8 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white/35 mr-1">Locale</span>
        {allLocales.map((l) => (
          <button
            key={l}
            onClick={() => setSelectedLocale(l)}
            className={`rounded-md px-3 py-1.5 text-[11px] font-mono-ibm uppercase tracking-[0.16em] transition-colors border ${
              selectedLocale === l
                ? 'border-[#931020] bg-[#931020]/20 text-white'
                : 'border-white/15 text-white/50 hover:border-white/35 hover:text-white/80'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      <p className="mt-2 text-[12px] text-white/35">
        {LOCALE_LABELS[selectedLocale] ?? selectedLocale}
      </p>

      {/* Poster grid */}
      <div className="mt-8">
        {!posters ? (
          <div className="flex justify-center py-16"><span className="shop-spinner" /></div>
        ) : posters.length === 0 ? (
          <Notice tone="muted" title="No posters in catalog" body="Publish posters via Lightroom first." />
        ) : (
          <div className="space-y-4">
            {posters.map((poster) => {
              const locText = draft[poster.id]?.[selectedLocale]
              return (
                <div key={poster.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex gap-5 items-start">
                    {/* Thumbnail */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${poster.previewUrl}&max=200`}
                      alt={poster.title}
                      className="w-16 shrink-0 rounded border border-white/10 bg-white/[0.03] object-cover"
                      style={{ aspectRatio: '1 / 1.41' }}
                    />

                    <div className="flex-1 min-w-0">
                      {/* English source (read-only) */}
                      <div className="flex items-baseline gap-3 mb-3">
                        <span className="text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white/30 shrink-0">en</span>
                        <div className="min-w-0">
                          <p className="text-[14px] font-light text-white/80 leading-snug">{poster.title}</p>
                          {poster.caption && (
                            <p className="text-[11px] text-white/35 mt-0.5">{poster.caption}</p>
                          )}
                        </div>
                      </div>

                      {/* Editable locale fields */}
                      <div className="flex items-start gap-3">
                        <span className="text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-[#931020] shrink-0 pt-2.5">{selectedLocale}</span>
                        <div className="flex-1 min-w-0 space-y-2">
                          <input
                            type="text"
                            value={locText?.title ?? ''}
                            onChange={(e) => updateField(poster.id, selectedLocale, 'title', e.target.value)}
                            placeholder={`Title in ${LOCALE_LABELS[selectedLocale] ?? selectedLocale}…`}
                            className={field}
                          />
                          {poster.caption !== undefined && (
                            <input
                              type="text"
                              value={locText?.caption ?? ''}
                              onChange={(e) => updateField(poster.id, selectedLocale, 'caption', e.target.value)}
                              placeholder={`Caption in ${LOCALE_LABELS[selectedLocale] ?? selectedLocale}…`}
                              className={field}
                            />
                          )}
                        </div>

                        {/* Per-poster generate button */}
                        <button
                          onClick={() => generateForPoster(poster)}
                          disabled={generatingId !== null || busy}
                          title="Auto-translate all locales for this poster"
                          className="shrink-0 h-9 rounded-md border border-white/15 px-3 text-[10px] font-mono-ibm uppercase tracking-[0.16em] text-white/50 hover:border-white/35 hover:text-white transition-colors disabled:opacity-40 whitespace-nowrap"
                        >
                          {generatingId === poster.id ? 'Translating…' : 'Auto-translate'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Save bar */}
      {posters && posters.length > 0 && (
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            onClick={generateAll}
            disabled={generatingAll || generatingId !== null || busy}
            className="rounded-md border border-white/15 px-4 py-2.5 text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white/60 hover:border-white/35 hover:text-white transition-colors disabled:opacity-40"
          >
            {generatingAll ? `Translating ${posters.findIndex((p) => p.id === generatingId) + 1}/${posters.length}…` : 'Translate all'}
          </button>
          <button
            onClick={save}
            disabled={busy || !dirty}
            className="rounded-md bg-[#931020] px-6 py-2.5 text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white hover:bg-[#a8131f] transition-colors disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Save translations'}
          </button>
          {note && <span className="text-[12px] text-white/55">{note}</span>}
          {dirty && !busy && <span className="text-[11px] text-amber-400/70">Unsaved changes</span>}
        </div>
      )}

      <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] p-5">
        <p className="text-[12px] font-light text-white/40 leading-relaxed">
          <strong className="text-white/55">Translate all</strong> auto-fills all 16 non-English locales for every poster via MyMemory.
          Existing translations are not overwritten — only empty fields are filled.
          After saving, run <strong className="text-white/55">Pre-render posters</strong> from the Settings → Cache
          section to rebuild print masters for every locale.
        </p>
      </div>
    </>
  )
}

function SettingsTab() {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const [busyCoupons, setBusyCoupons] = useState(false)
  const [noteCoupons, setNoteCoupons] = useState<string | null>(null)

  async function deleteTestOrders() {
    if (!window.confirm(
      'Delete ALL test-mode orders from the database? Live orders are not affected. This cannot be undone.'
    )) return
    setBusy(true)
    setNote(null)
    try {
      const res = await fetch('/api/admin/delete-test-orders', { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as { deleted?: number; error?: string }
      setNote(res.ok
        ? `Deleted ${data.deleted ?? 0} test order${data.deleted === 1 ? '' : 's'}.`
        : (data.error || 'Failed.'))
    } catch {
      setNote('Failed.')
    } finally {
      setBusy(false)
    }
  }

  async function deleteTestCoupons() {
    if (!window.confirm(
      'Delete ALL test-mode coupons and deactivate their promotion codes? This only affects test mode and cannot be undone.'
    )) return
    setBusyCoupons(true)
    setNoteCoupons(null)
    try {
      const res = await fetch('/api/admin/delete-test-coupons', { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as { deleted?: number; deactivated?: number; error?: string }
      setNoteCoupons(res.ok
        ? `Deleted ${data.deleted ?? 0} coupon${data.deleted === 1 ? '' : 's'}${data.deactivated ? `, deactivated ${data.deactivated} code${data.deactivated === 1 ? '' : 's'}` : ''}.`
        : (data.error || 'Failed.'))
    } catch {
      setNoteCoupons('Failed.')
    } finally {
      setBusyCoupons(false)
    }
  }

  return (
    <>
      <h1 className="font-serif font-light text-4xl sm:text-5xl tracking-wide">Settings</h1>
      <p className="mt-2 text-sm text-white/45">Studio tools and maintenance.</p>

      <AppearanceSettings />
      <SaleNotifySettings />
      <VatRateSettings />
      <RefundPrefs />
      <CacheControls />
      <AssetAudit />
      <DiagnosticsSettings />
      {/* Tax registrations panel hidden — VAT is now calculated manually (see
          VatRateSettings), so Stripe Tax registrations don't drive checkout.
          The <TaxRegistrations /> component + /api/admin/tax-registrations route
          are kept for future use if Stripe Tax / OSS is ever re-enabled. */}

      <section className="mt-10 rounded-lg border border-[#931020]/30 bg-[#931020]/[0.04] p-6">
        <h2 className="text-[11px] font-mono-ibm uppercase tracking-[0.28em] text-[#931020]">Danger zone</h2>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-prose">
            <p className="text-[14px] font-light text-white/80">Delete test orders</p>
            <p className="mt-1 text-[12px] font-light text-white/45 leading-relaxed">
              Permanently removes all test-mode orders from the order database. Live orders are
              untouched. (Stripe’s own test payments are separate — clear those from the Stripe
              Dashboard if needed.)
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {note && <span className="text-[12px] text-white/60">{note}</span>}
            <button
              onClick={deleteTestOrders}
              disabled={busy || busyCoupons}
              className="rounded-md border border-[#931020]/60 px-4 py-2.5 text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-[#931020] hover:bg-[#931020] hover:text-white transition-colors disabled:opacity-40"
            >
              {busy ? 'Deleting…' : 'Delete test orders'}
            </button>
          </div>
        </div>

        <div className="mt-6 border-t border-[#931020]/20 pt-6 flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-prose">
            <p className="text-[14px] font-light text-white/80">Delete test coupons</p>
            <p className="mt-1 text-[12px] font-light text-white/45 leading-relaxed">
              Deletes all test-mode coupons from our store. Test mode only — refused against a live
              key, so live coupons are never affected.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {noteCoupons && <span className="text-[12px] text-white/60">{noteCoupons}</span>}
            <button
              onClick={deleteTestCoupons}
              disabled={busy || busyCoupons}
              className="rounded-md border border-[#931020]/60 px-4 py-2.5 text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-[#931020] hover:bg-[#931020] hover:text-white transition-colors disabled:opacity-40"
            >
              {busyCoupons ? 'Deleting…' : 'Delete test coupons'}
            </button>
          </div>
        </div>
      </section>
    </>
  )
}

// ── Products tab ──────────────────────────────────────────────────────────────

type LookupResponse =
  | { found: true; result: ReferenceLookup; assets: AssetInfo | null }
  | { found: false }
  | { error: string }

function ProductsTab() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<LookupResponse | null>(null)

  async function runSearch(raw: string) {
    const q = raw.trim()
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

  function search(e: React.FormEvent) {
    e.preventDefault()
    runSearch(query)
  }

  const result = data && 'found' in data && data.found ? data.result : null
  const assets = data && 'found' in data && data.found ? data.assets : null
  const notFound = data && 'found' in data && !data.found
  const errored = data && 'error' in data

  return (
    <>
      <h1 className="font-serif font-light text-4xl sm:text-5xl tracking-wide">Product lookup</h1>
      <p className="mt-2 text-sm text-white/45">
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
        {!loading && result && <ResultCard result={result} assets={assets} />}
      </div>

      <TopProducts
        onSelect={(filename) => {
          setQuery(filename)
          runSearch(filename)
          if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
        }}
      />
    </>
  )
}

interface TopProduct {
  sku: string
  name: string
  category: string
  filename: string | null
  live: number
  test: number
}

/** Top 10 best-selling products (all categories), from paid Stripe sessions. */
function TopProducts({ onSelect }: { onSelect: (filename: string) => void }) {
  const [items, setItems] = useState<TopProduct[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/api/admin/top-products?days=365')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setItems((d as { products: TopProduct[] }).products))
      .catch(() => setError(true))
  }, [])

  return (
    <div className="mt-16">
      <h2 className="text-[11px] font-mono-ibm uppercase tracking-[0.28em] text-white/40">
        Top sellers · last 12 months
      </h2>
      <p className="mt-1.5 text-[10px] font-light text-white/30 leading-relaxed">
        Real (live) sales only, from Stripe payments — test purchases are excluded.
      </p>

      {error ? (
        <div className="mt-5"><Notice tone="error" title="Couldn’t load top sellers" body="Is Stripe reachable?" /></div>
      ) : !items ? (
        <div className="flex justify-center py-10"><span className="shop-spinner" /></div>
      ) : items.length === 0 ? (
        <div className="mt-5"><Notice tone="muted" title="No sales yet" body="Best-selling products will appear here once orders come in." /></div>
      ) : (
        <ol className="mt-5 space-y-px">
          {items.map((p, i) => {
            const clickable = !!p.filename
            return (
              <li
                key={p.sku}
                onClick={clickable ? () => onSelect(p.filename!) : undefined}
                title={clickable ? `Look up ${p.filename}` : undefined}
                className={`flex items-center gap-4 border-b border-white/[0.06] py-3 transition-colors ${clickable ? 'cursor-pointer hover:bg-white/[0.04]' : ''}`}
              >
                <span className="w-6 shrink-0 text-right font-mono-ibm text-[13px] text-white/30">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-light text-white/80">
                  {p.name}
                  {p.filename && (
                    <span className="ml-2 font-mono-ibm text-[12px] text-white/35">({p.filename})</span>
                  )}
                </span>
                <span className="shrink-0 rounded-full border border-white/10 px-2.5 py-0.5 text-[9px] font-mono-ibm uppercase tracking-[0.16em] text-white/45">
                  {p.category}
                </span>
                <span className="w-16 shrink-0 text-right font-mono-ibm text-[13px] text-[#931020]">
                  {p.live} sold
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

const LABEL_COLOR: Record<string, string> = {
  red: '#dc2626', yellow: '#eab308', green: '#16a34a', blue: '#2563eb', purple: '#9333ea',
}

function ResultCard({ result, assets }: { result: ReferenceLookup; assets: AssetInfo | null }) {
  const matchLabel = result.matchedBy === 'product' ? 'Download token' : 'Photo reference'
  const isPoster = result.types.includes('print')
  const isDigital = result.types.includes('digital')
  const posterSizes = SIZE_ORDER.filter((s) => assets?.posterSizes.includes(s))
  const label = result.colorLabel?.trim() ?? ''
  const assetLink =
    'rounded-md border border-white/15 px-3 py-1.5 text-[11px] font-mono-ibm uppercase tracking-[0.16em] text-white/70 transition-colors hover:border-[#931020] hover:text-white'
  return (
    <div className="grid gap-8 sm:grid-cols-[240px_1fr] items-start animate-[fadeIn_240ms_ease]">
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${result.previewUrl}&max=600`}
          alt={result.displayTitle}
          className="w-full rounded-lg border border-white/10 bg-white/[0.03] shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
        />
        <p className="mt-2 text-[9px] font-mono-ibm uppercase tracking-[0.18em] text-white/30">
          Matched via {matchLabel}
        </p>
      </div>

      <div>
        <h2 className="font-serif font-light text-3xl leading-tight">{result.displayTitle}</h2>
        <dl className="mt-6 divide-y divide-white/[0.07]">
          <Row label="Original filename" value={result.sourceFilename ?? result.filename} mono accent />
          <Row
            label="Collection"
            value={result.category.length ? result.category.map((p) => p.join('  ›  ')).join('      ') : '—'}
          />
          <Row label="Dimensions" value={`${result.width} × ${result.height} px`} mono />
          {/* Colour label — Lightroom label, drives the per-label pricing markup. */}
          <div className="grid grid-cols-[140px_1fr] gap-4 py-3.5">
            <dt className="text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white/35 pt-0.5">Colour label</dt>
            <dd className="text-[15px] text-white/90">
              {label ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: LABEL_COLOR[label] ?? '#888' }} />
                  {cap(label)}
                </span>
              ) : (
                <span className="text-white/40">None</span>
              )}
            </dd>
          </div>
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

        {/* Pre-rendered posters — POSTERS ONLY, and only those already rendered
            on the NAS (links never trigger a render). */}
        {isPoster && (
          <div className="mt-7">
            <p className="text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white/40">
              Pre-rendered posters · 300 dpi
            </p>
            {posterSizes.length > 0 ? (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {posterSizes.map((s) => (
                  <a
                    key={s}
                    href={`/api/admin/poster-master/${result.slug}/${s}`}
                    target="_blank"
                    rel="noreferrer"
                    className={assetLink}
                    title={`Open the pre-rendered ${s} poster`}
                  >
                    {s}
                  </a>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[12px] font-light text-white/40">
                None pre-rendered yet — run <span className="text-white/60">Settings → Pre-render posters</span>.
              </p>
            )}
          </div>
        )}

        {/* Master files — DIGITAL DOWNLOADS only; whichever masters exist. */}
        {isDigital && (
          <div className="mt-7">
            <p className="text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white/40">
              Master files
            </p>
            {assets?.masters.jpeg || assets?.masters.tiff ? (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {assets.masters.jpeg && (
                  <a href={`/api/admin/master/${result.slug}/jpeg`} target="_blank" rel="noreferrer" className={assetLink} title="Open the JPEG master">
                    Master · JPEG
                  </a>
                )}
                {assets.masters.tiff && (
                  <a href={`/api/admin/master/${result.slug}/tiff`} target="_blank" rel="noreferrer" className={assetLink} title="Open the TIFF original">
                    Original · TIFF
                  </a>
                )}
              </div>
            ) : (
              <p className="mt-2 text-[12px] font-light text-white/40">
                No master found on the NAS — re-publish this photo.
              </p>
            )}
          </div>
        )}

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

  async function runSearch(q: string) {
    const v = q.trim()
    if (!v) return
    setLoading(true)
    setOrders(null)
    setError(false)
    await search0(v, setLoading, setOrders, setError)
  }

  function search(e: React.FormEvent) {
    e.preventDefault()
    if (!loading) runSearch(query)
  }

  return (
    <>
      <h1 className="font-serif font-light text-4xl sm:text-5xl tracking-wide">Orders</h1>
      <p className="mt-2 text-sm text-white/45">
        Look up a download order by its order code (<span className="font-mono-ibm">GMP-…</span>) or the
        buyer&rsquo;s email — read back the passcode, re-send the link, or extend an expired one.
      </p>

      <form onSubmit={search} className="mt-8 flex gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          spellCheck={false}
          placeholder="GMP-THOR-…   ·   buyer@example.com"
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

      {/* Last 90 days — overview table; click a row to load it above for actions. */}
      <RecentOrdersTable
        onSelect={(code) => {
          setQuery(code)
          runSearch(code)
          if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
        }}
      />
    </>
  )
}

// ── Finances tab ──────────────────────────────────────────────────────────────
// Real (live) sales grouped into tax reporting quarters, each with its filing
// deadline and per-currency gross/tax/net totals. Test orders are listed but
// flagged and never counted toward the figures.

interface TaxPeriod {
  year: number
  q: 1 | 2 | 3 | 4
  start: number
  end: number
  deadline: number
}

/** The calendar quarter a timestamp falls in. */
function quarterOf(ms: number): { year: number; q: 1 | 2 | 3 | 4 } {
  const d = new Date(ms)
  return { year: d.getFullYear(), q: (Math.floor(d.getMonth() / 3) + 1) as 1 | 2 | 3 | 4 }
}

/** Period bounds + filing deadline (1st of the third month after quarter end). */
function periodMeta(year: number, q: 1 | 2 | 3 | 4): TaxPeriod {
  const start = new Date(year, (q - 1) * 3, 1).getTime()
  const end = new Date(year, q * 3, 0, 23, 59, 59, 999).getTime() // last day of quarter
  const deadline = new Date(year, q * 3 + 2, 1).getTime() // Q1→1 Jun, Q4→1 Mar next yr
  return { year, q, start, end, deadline }
}

type PeriodState = 'open' | 'due' | 'passed'
function periodState(p: TaxPeriod, now: number): PeriodState {
  if (now <= p.end) return 'open'
  if (now < p.deadline) return 'due'
  return 'passed'
}

interface EuThreshold {
  threshold: number
  year: number
  current: { eurTotal: number; count: number }
  previous: { year: number; eurTotal: number; count: number }
  exceeded: boolean
  ratesMissing: boolean
}

const fmtEur = (n: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

/** Running EU (excl. DK) cross-border total vs the €10,000 OSS threshold, valued
 *  in EUR at Danmarks Nationalbank's official daily rates (ex-VAT). */
/** Accounting export — download a ZIP of all invoices between two dates, rendered
 *  in one language (Danish default / English) regardless of how each was issued. */
function InvoiceExportCard() {
  const today = new Date().toISOString().slice(0, 10)
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`)
  const [to, setTo] = useState(today)
  const [lang, setLang] = useState<'da' | 'en'>('da')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  async function download() {
    setBusy(true)
    setNote(null)
    try {
      const res = await fetch(`/api/admin/invoices-zip?from=${from}&to=${to}&lang=${lang}`, { cache: 'no-store' })
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string }
        setNote(d.error || 'Export failed.')
        return
      }
      const blob = await res.blob()
      const cd = res.headers.get('content-disposition') ?? ''
      const m = /filename="([^"]+)"/.exec(cd)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = m?.[1] ?? `Invoices-${from}_${to}-${lang}.zip`
      a.click()
      URL.revokeObjectURL(url)
      setNote('Download started.')
    } catch {
      setNote('Export failed.')
    } finally {
      setBusy(false)
    }
  }

  const field = 'h-10 rounded-md border border-white/15 bg-transparent px-3 text-[12px] text-white/80 [color-scheme:dark] focus:border-white/40 focus:outline-none disabled:opacity-40'
  const btn = 'h-10 shrink-0 rounded-md border border-white/15 px-5 text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white/70 hover:border-white/40 hover:text-white transition-colors disabled:opacity-40'

  return (
    <section className="mt-8 rounded-lg border border-white/10 bg-white/[0.03] p-6">
      <h2 className="text-[11px] font-mono-ibm uppercase tracking-[0.28em] text-white/40">Invoice export (accounting)</h2>
      <p className="mt-2 text-[12px] font-light text-white/40 leading-relaxed">
        Download a ZIP of every invoice between two dates, rendered in one language regardless of how each was issued.
        Files are named <span className="font-mono-ibm">YYYYMMDD-Invoice-…</span> so they sort by date.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[10px] font-mono-ibm uppercase tracking-[0.18em] text-white/40">
          From <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={field} />
        </label>
        <label className="flex items-center gap-2 text-[10px] font-mono-ibm uppercase tracking-[0.18em] text-white/40">
          To <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className={field} />
        </label>
        <select value={lang} onChange={(e) => setLang(e.target.value as 'da' | 'en')} className={`${field} [&>option]:bg-neutral-900`}>
          <option value="da">Dansk</option>
          <option value="en">English</option>
        </select>
        <button onClick={download} disabled={busy} className={btn}>{busy ? 'Preparing…' : 'Download ZIP'}</button>
      </div>
      {note && <p className="mt-4 text-[12px] text-white/55">{note}</p>}
    </section>
  )
}

function EuThresholdBanner() {
  const [data, setData] = useState<EuThreshold | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/api/admin/eu-threshold')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setData(d as EuThreshold))
      .catch(() => setError(true))
  }, [])

  if (error) return null
  if (!data) {
    return (
      <div className="mt-8 rounded-lg border border-white/10 bg-white/[0.03] p-5">
        <span className="text-[12px] text-white/40">Calculating EU threshold…</span>
      </div>
    )
  }

  const { current, threshold } = data
  const pct = Math.min(100, (current.eurTotal / threshold) * 100)
  const tone = data.exceeded || pct >= 100 ? 'red' : pct >= 80 ? 'amber' : 'ok'
  const barColor = tone === 'red' ? 'bg-[#931020]' : tone === 'amber' ? 'bg-amber-400' : 'bg-emerald-400/70'
  const ring = tone === 'red' ? 'border-[#931020]/40 bg-[#931020]/[0.05]' : tone === 'amber' ? 'border-amber-400/30 bg-amber-400/[0.04]' : 'border-white/10 bg-white/[0.03]'

  return (
    <div className={`mt-8 rounded-lg border p-5 ${ring}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[11px] font-mono-ibm uppercase tracking-[0.24em] text-white/55">
          EU cross-border (excl. DK) · {data.year}
        </h2>
        <span className="text-[13px] tabular-nums">
          <span className="text-white/90">{fmtEur(current.eurTotal)}</span>
          <span className="text-white/35"> / {fmtEur(threshold)} · {current.count} sale{current.count === 1 ? '' : 's'}</span>
        </span>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/[0.08]">
        <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-3 text-[11px] font-light leading-relaxed text-white/40">
        {data.exceeded ? (
          <span className="text-[#931020]">
            Threshold exceeded ({data.year} or {data.previous.year}). You must register for OSS and charge
            each EU customer their own country’s VAT rate — the flat Danish rate no longer applies.
          </span>
        ) : pct >= 80 ? (
          <span className="text-amber-300/90">Approaching the €10,000 OSS threshold — plan to switch to OSS + destination VAT rates.</span>
        ) : (
          <>Under the €10,000/yr OSS threshold, so charging the Danish rate to EU buyers is fine.</>
        )}{' '}
        Valued in EUR at Danmarks Nationalbank’s official daily rate per transaction date, excluding VAT.
        {data.previous.eurTotal > 0 && ` ${data.previous.year}: ${fmtEur(data.previous.eurTotal)}.`}
        {data.ratesMissing && <span className="text-amber-300/80"> Some rates were unavailable — total may be approximate.</span>}
      </p>
    </div>
  )
}

function FinancesTab() {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    // Wide window so older reporting periods are still covered.
    fetch('/api/admin/order?recent=750')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setOrders((d as { orders: AdminOrder[] }).orders))
      .catch(() => setError(true))
  }, [])

  const fmtDay = (ms: number) =>
    new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  // Group into periods, newest first.
  const groups = (() => {
    const map = new Map<string, { period: TaxPeriod; orders: AdminOrder[] }>()
    for (const o of orders ?? []) {
      const { year, q } = quarterOf(o.createdAt)
      const key = `${year}-Q${q}`
      if (!map.has(key)) map.set(key, { period: periodMeta(year, q), orders: [] })
      map.get(key)!.orders.push(o)
    }
    return Array.from(map.values())
      .map((g) => ({ ...g, orders: g.orders.sort((a, b) => b.createdAt - a.createdAt) }))
      .sort((a, b) => b.period.start - a.period.start)
  })()

  const now = Date.now()

  return (
    <>
      <h1 className="font-serif font-light text-4xl sm:text-5xl tracking-wide">Finances</h1>
      <p className="mt-2 text-sm text-white/45">
        Real sales grouped by tax reporting quarter, each with its filing deadline and
        gross / tax / net totals — split into <strong className="text-white/65">Denmark</strong>,{' '}
        <strong className="text-white/65">EU (excl. DK)</strong> and{' '}
        <strong className="text-white/65">Outside EU</strong> for VAT reporting.{' '}
        <span className="text-amber-300/80">Test</span> orders are listed but never counted.
      </p>

      <EuThresholdBanner />

      <InvoiceExportCard />

      {error ? (
        <div className="mt-10"><Notice tone="error" title="Couldn’t load finances" body="Is the origin running?" /></div>
      ) : !orders ? (
        <div className="flex justify-center py-16"><span className="shop-spinner" /></div>
      ) : groups.length === 0 ? (
        <div className="mt-10"><Notice tone="muted" title="No sales yet" body="Completed orders will appear here, grouped by tax period." /></div>
      ) : (
        <div className="mt-10 space-y-12">
          {groups.map((g) => (
            <PeriodBlock key={`${g.period.year}-Q${g.period.q}`} period={g.period} orders={g.orders} now={now} fmtDay={fmtDay} />
          ))}
        </div>
      )}
    </>
  )
}

function PeriodBlock({
  period, orders, now, fmtDay,
}: {
  period: TaxPeriod
  orders: AdminOrder[]
  now: number
  fmtDay: (ms: number) => string
}) {
  const state = periodState(period, now)
  const live = orders.filter((o) => o.livemode === true)
  const testCount = orders.length - live.length

  // Totals per currency (live only), net of refunds. A full refund contributes
  // nothing and isn't counted as a sale; a partial refund reduces gross (and tax
  // proportionally).
  const totals = (() => {
    const m = new Map<string, { gross: number; tax: number; count: number }>()
    for (const o of live) {
      const cur = (o.currency ?? '—').toUpperCase()
      const { gross, tax } = effectiveAmounts(o)
      const t = m.get(cur) ?? { gross: 0, tax: 0, count: 0 }
      t.gross += gross
      t.tax += tax
      if (!o.refunded) t.count += 1 // fully-refunded orders aren't sales
      m.set(cur, t)
    }
    return Array.from(m.entries())
  })()

  // Same totals, split into the three VAT reporting buckets — Denmark, EU
  // (excl. DK, watch the OSS threshold), Outside EU — each per currency. This is
  // what the manual VAT filing is built from.
  const byJurisdiction = (() => {
    const order: VatJurisdiction[] = ['DK', 'EU', 'NON_EU', 'UNKNOWN']
    const m = new Map<VatJurisdiction, Map<string, { gross: number; tax: number; count: number }>>()
    for (const o of live) {
      const j = orderJurisdiction(o)
      const cur = (o.currency ?? '—').toUpperCase()
      const { gross, tax } = effectiveAmounts(o)
      if (!m.has(j)) m.set(j, new Map())
      const byCur = m.get(j)!
      const t = byCur.get(cur) ?? { gross: 0, tax: 0, count: 0 }
      t.gross += gross
      t.tax += tax
      if (!o.refunded) t.count += 1
      byCur.set(cur, t)
    }
    return order
      .filter((j) => m.has(j))
      .map((j) => ({ jurisdiction: j, currencies: Array.from(m.get(j)!.entries()) }))
  })()

  const rangeLabel = `${new Date(period.start).toLocaleDateString('en-GB', { month: 'short' })}–${new Date(period.end).toLocaleDateString('en-GB', { month: 'short' })} ${period.year}`

  const exportCsv = () => {
    // Gross/Tax/Net are net of refunds (matching the on-screen totals); the
    // Charged + Refunded columns preserve the original figures for audit.
    const head = ['Date', 'Order code', 'Email', 'Mode', 'VAT region', 'Currency', 'Charged', 'Refunded', 'Gross', 'Tax', 'Net', 'Tax country (IP)', 'Card country', 'Buyer country (CF)', 'Buyer IP', 'Payment method', 'Paid date', 'Location match', 'Reverse charge', 'VAT ID', 'Business', 'Business address', 'VIES consultation']
    const rows = orders.map((o) => {
      const eff = effectiveAmounts(o)
      return [
        new Date(o.createdAt).toISOString().slice(0, 10),
        o.orderId,
        o.email ?? '',
        orderMode(o),
        jurisdictionLabel(orderJurisdiction(o)),
        (o.currency ?? '').toUpperCase(),
        ((o.amount ?? 0) / 100).toFixed(2),
        ((o.refundedAmount ?? 0) / 100).toFixed(2),
        (eff.gross / 100).toFixed(2),
        (eff.tax / 100).toFixed(2),
        (eff.net / 100).toFixed(2),
        o.taxCountry ?? '',
        o.cardCountry ?? '',
        o.buyerCountry ?? '',
        o.buyerIp ?? '',
        o.paymentMethod ?? '',
        o.paidAt ? new Date(o.paidAt).toISOString().slice(0, 10) : '',
        locationMatch(o),
        o.reverseCharge ? 'yes' : '',
        o.vatId ?? '',
        o.businessName ?? '',
        o.businessAddress ?? '',
        o.vatConsultation ?? '',
      ]
    })
    const csv = [head, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `GMP-${period.year}-Q${period.q}-sales.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b border-white/10 pb-3">
        <div className="flex items-baseline gap-3">
          <h2 className="font-serif font-light text-2xl tracking-wide text-white">Q{period.q} {period.year}</h2>
          <span className="text-[11px] font-mono-ibm uppercase tracking-[0.18em] text-white/35">{rangeLabel}</span>
        </div>
        <div className="flex items-center gap-4">
          <DeadlineBadge state={state} deadline={fmtDay(period.deadline)} />
          <button
            onClick={exportCsv}
            className="text-[10px] font-mono-ibm uppercase tracking-[0.18em] text-white/45 hover:text-white transition-colors"
          >
            Export CSV →
          </button>
        </div>
      </div>

      {/* Per-currency totals (live sales only). */}
      <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
        {totals.length === 0 ? (
          <span className="text-[12px] text-white/35">No live sales in this period{testCount > 0 ? ` · ${testCount} test order${testCount > 1 ? 's' : ''}` : ''}.</span>
        ) : (
          totals.map(([cur, t]) => (
            <div key={cur} className="text-[13px]">
              <span className="font-mono-ibm text-white/35 text-[10px] uppercase tracking-[0.18em] mr-2">{cur}</span>
              <span className="text-white/85 tabular-nums">{fmtMoney(t.gross, cur)}</span>
              <span className="text-white/35"> gross</span>
              <span className="text-white/30 mx-2">·</span>
              <span className="text-white/70 tabular-nums">{fmtMoney(t.tax, cur)}</span>
              <span className="text-white/35"> tax</span>
              <span className="text-white/30 mx-2">·</span>
              <span className="text-white/85 tabular-nums">{fmtMoney(t.gross - t.tax, cur)}</span>
              <span className="text-white/35"> net · {t.count} sale{t.count > 1 ? 's' : ''}</span>
            </div>
          ))
        )}
      </div>

      {/* VAT reporting buckets — DK / EU (excl. DK) / Outside EU. */}
      {byJurisdiction.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {byJurisdiction.map(({ jurisdiction, currencies }) => (
            <div
              key={jurisdiction}
              className={`rounded-md border p-3 ${
                jurisdiction === 'UNKNOWN' ? 'border-amber-400/25 bg-amber-400/[0.03]' : 'border-white/10 bg-white/[0.02]'
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-mono-ibm uppercase tracking-[0.18em] text-white/45">
                  {jurisdictionLabel(jurisdiction)}
                </span>
                {jurisdiction === 'EU' && (
                  <span className="text-[9px] font-mono-ibm uppercase tracking-[0.16em] text-amber-300/70" title="Watch the €10,000/yr cross-border B2C threshold — above it you must switch to OSS.">
                    OSS watch
                  </span>
                )}
              </div>
              <div className="mt-2 space-y-1">
                {currencies.map(([cur, t]) => (
                  <div key={cur} className="text-[12px] leading-tight">
                    <span className="font-mono-ibm text-white/30 text-[9px] uppercase tracking-[0.16em] mr-1.5">{cur}</span>
                    <span className="text-white/80 tabular-nums">{fmtMoney(t.gross, cur)}</span>
                    <span className="text-white/30"> g · </span>
                    <span className="text-white/65 tabular-nums">{fmtMoney(t.tax, cur)}</span>
                    <span className="text-white/30"> vat · </span>
                    <span className="text-white/80 tabular-nums">{fmtMoney(t.gross - t.tax, cur)}</span>
                    <span className="text-white/30"> net</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Orders in this period. */}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b border-white/10 text-[10px] font-mono-ibm uppercase tracking-[0.18em] text-white/40">
              <th className="py-2 pr-4 font-normal">Date</th>
              <th className="py-2 pr-4 font-normal">Order code</th>
              <th className="py-2 pr-4 font-normal">Mode</th>
              <th className="py-2 pr-4 font-normal">Gross</th>
              <th className="py-2 pr-4 font-normal">Tax</th>
              <th className="py-2 pr-4 font-normal">Net</th>
              <th className="py-2 pr-4 font-normal">Location</th>
              <th className="py-2 pr-4 font-normal">Invoice</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const test = o.livemode !== true
              // Net-of-refund figures so each row reconciles with the totals above.
              const eff = effectiveAmounts(o)
              const refundTitle = o.refundedAmount
                ? `Originally charged ${fmtMoney(o.amount, o.currency)}; ${fmtMoney(o.refundedAmount, o.currency)} refunded`
                : undefined
              return (
                <tr key={o.orderId} className={`border-b border-white/[0.06] ${test || o.refunded ? 'opacity-40' : ''}`}>
                  <td className="py-2.5 pr-4 whitespace-nowrap text-white/60">{fmtDay(o.createdAt)}</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap font-mono-ibm text-[#931020]">
                    {o.orderId}
                    {o.refundedAmount != null && (
                      <a
                        href={`/api/admin/refund/${o.orderId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Refund credit note (PDF)"
                        className="ml-2 inline-block rounded-[4px] border border-[#931020]/50 px-1.5 py-0.5 text-[8px] font-mono-ibm uppercase tracking-[0.16em] text-[#931020] hover:bg-[#931020]/15 transition-colors"
                      >
                        {o.refunded ? 'refunded ↗' : `−${fmtMoney(o.refundedAmount, o.currency)} ↗`}
                      </a>
                    )}
                    <UnmatchedRefundBadge order={o} />
                    <B2bBadge order={o} />
                  </td>
                  <td className="py-2.5 pr-4 whitespace-nowrap"><ModeBadge order={o} /></td>
                  <td className="py-2.5 pr-4 whitespace-nowrap text-white/80 tabular-nums" title={refundTitle}>{fmtMoney(eff.gross, o.currency)}</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap text-white/60 tabular-nums">{fmtMoney(eff.tax, o.currency)}</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap text-white/80 tabular-nums">
                    {o.amount != null ? fmtMoney(eff.net, o.currency) : '—'}
                  </td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">
                    <span className="inline-flex items-center gap-2">
                      <RegionBadge order={o} />
                      <LocationCell order={o} />
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">
                    <a
                      href={`/api/admin/invoice/${o.orderId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-mono-ibm uppercase tracking-[0.14em] text-[#931020] hover:text-white transition-colors"
                      title="Invoice in the language it was issued"
                    >
                      Invoice ↗
                    </a>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function DeadlineBadge({ state, deadline }: { state: PeriodState; deadline: string }) {
  if (state === 'open') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-mono-ibm uppercase tracking-[0.16em] text-white/45">
        <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
        Open · file by {deadline}
      </span>
    )
  }
  if (state === 'due') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-mono-ibm uppercase tracking-[0.16em] text-amber-300">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        File by {deadline}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-mono-ibm uppercase tracking-[0.16em] text-white/35">
      Was due {deadline}
    </span>
  )
}

type OrderSortKey = 'date' | 'code' | 'email' | 'region' | 'items' | 'downloads' | 'status'

/** Minor units → localized currency, e.g. 1299/"eur" → €12.99. */
function fmtMoney(minor?: number | null, currency?: string | null): string {
  if (minor == null || !currency) return '—'
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(minor / 100)
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency.toUpperCase()}`
  }
}

/** Test vs live mode for an order. null = placed before we recorded it. */
function orderMode(o: AdminOrder): 'Test' | 'Live' | 'Unknown' {
  if (o.livemode === true) return 'Live'
  if (o.livemode === false) return 'Test'
  return 'Unknown'
}

/** A loud, unmissable TEST badge so mock purchases can't be mistaken for real
 *  sales; live orders get a quiet dot. */
function ModeBadge({ order }: { order: AdminOrder }) {
  const mode = orderMode(order)
  if (mode === 'Test') {
    return (
      <span className="inline-flex items-center rounded-[5px] border border-amber-400/40 bg-amber-400/15 px-2 py-[3px] text-[9px] font-mono-ibm uppercase tracking-[0.18em] text-amber-300">
        Test
      </span>
    )
  }
  if (mode === 'Live') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-mono-ibm uppercase tracking-[0.18em] text-emerald-400/70">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70" />
        Live
      </span>
    )
  }
  return <span className="text-[10px] font-mono-ibm text-white/25">—</span>
}

/** Which VAT reporting bucket an order falls in. Uses the IP-derived tax country
 *  (what we charged on), falling back to the card-issuer country. */
function orderJurisdiction(o: AdminOrder): VatJurisdiction {
  return vatJurisdiction(o.taxCountry ?? o.cardCountry ?? null)
}

/**
 * Effective gross / tax / net (minor units) after refunds — the figures the
 * Finances totals, rows and CSV all reconcile to.
 *
 * VAT reversed = taxAmount × refunded / amount. Refunds are always whole line
 * items, and every line in an order carries the same VAT rate (one buyer ⇒ one
 * country ⇒ one rate), so VAT is strictly proportional to value: this reverses
 * exactly the VAT charged on the refunded items — the legally correct amount.
 * It's driven by the actual charged gross + VAT (so it stays correct when a
 * coupon was applied), and Stripe refunds gross-inclusive, so money and VAT
 * agree. A full refund zeroes everything.
 */
function effectiveAmounts(o: AdminOrder): { gross: number; tax: number; net: number } {
  const amount = o.amount ?? 0
  const refunded = o.refundedAmount ?? 0
  const gross = Math.max(0, amount - refunded)
  const tax = amount > 0 ? Math.round((o.taxAmount ?? 0) * (gross / amount)) : 0
  return { gross, tax, net: Math.max(0, gross - tax) }
}

/** EU VAT two-evidence reconciliation: IP-derived tax country vs card-issuer
 *  country. 'match' | 'mismatch' | 'unknown' (one or both missing). */
function locationMatch(o: AdminOrder): 'match' | 'mismatch' | 'unknown' {
  const ip = o.taxCountry?.toUpperCase()
  const card = o.cardCountry?.toUpperCase()
  if (!ip || !card) return 'unknown'
  return ip === card ? 'match' : 'mismatch'
}

/** Tax/IP country with a ✓ when the card-issuer country agrees, or a ⚠ with
 *  both when they differ (a VAT location-evidence conflict worth reviewing). */
function LocationCell({ order }: { order: AdminOrder }) {
  const m = locationMatch(order)
  if (m === 'mismatch') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[12px] text-amber-300"
        title={`Tax/IP country: ${order.taxCountry} · Card issuer: ${order.cardCountry} — evidence conflict`}
      >
        {order.taxCountry} / {order.cardCountry} <span aria-hidden>⚠</span>
      </span>
    )
  }
  if (m === 'match') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[12px] text-white/50"
        title={`Tax/IP and card issuer both ${order.taxCountry}`}
      >
        {order.taxCountry} <span className="text-emerald-400/60" aria-hidden>✓</span>
      </span>
    )
  }
  return <span className="text-[12px] text-white/50">{order.taxCountry ?? '—'}</span>
}

/** DK / EU (excl. DK) / INT (outside EU) / ? — the coarse region for an order. */
function regionCode(o: AdminOrder): 'DK' | 'EU' | 'INT' | '?' {
  const j = orderJurisdiction(o)
  return j === 'DK' ? 'DK' : j === 'EU' ? 'EU' : j === 'NON_EU' ? 'INT' : '?'
}

/** Coloured region tag; International stands out (violet) so non-DK/EU orders are
 *  easy to spot at a glance. */
function RegionBadge({ order }: { order: AdminOrder }) {
  const r = regionCode(order)
  const cls: Record<typeof r, string> = {
    DK: 'border-white/15 text-white/55',
    EU: 'border-sky-400/30 text-sky-300/80',
    INT: 'border-violet-400/45 bg-violet-400/10 text-violet-300',
    '?': 'border-white/10 text-white/30',
  }
  const title = r === 'INT' ? `International (outside EU) · ${order.taxCountry ?? order.cardCountry ?? 'unknown'}`
    : r === 'EU' ? `EU, excl. DK · ${order.taxCountry ?? order.cardCountry}`
    : r === 'DK' ? 'Denmark' : 'Location unknown'
  return (
    <span title={title} className={`inline-flex items-center rounded-[4px] border px-1.5 py-0.5 text-[9px] font-mono-ibm uppercase tracking-[0.16em] ${cls[r]}`}>
      {r}
    </span>
  )
}

/** Amber "review" tag for a partial refund made outside our line-item flow
 *  (e.g. an arbitrary amount refunded in the Stripe Dashboard). */
function UnmatchedRefundBadge({ order }: { order: AdminOrder }) {
  if (!order.refundUnmatched) return null
  return (
    <span
      title="Partial refund made outside the admin (no line items revoked). VAT is split proportionally — review against the actual refunded items."
      className="ml-2 inline-flex items-center gap-1 rounded-[4px] border border-amber-400/45 bg-amber-400/10 px-1.5 py-0.5 text-[8px] font-mono-ibm uppercase tracking-[0.16em] text-amber-300"
    >
      <span aria-hidden>⚠</span> review
    </span>
  )
}

/** B2B reverse-charge marker — these EU sales carry 0% VAT and belong on the EC
 *  Sales List. Tooltip shows the business name + validated VAT id. */
function B2bBadge({ order }: { order: AdminOrder }) {
  if (!order.reverseCharge && !order.vatId) return null
  const title = [order.businessName, order.vatId].filter(Boolean).join(' · ') || 'Business purchase'
  return (
    <span
      title={`B2B — ${title}${order.reverseCharge ? ' · VAT reverse-charged (0%)' : ''}`}
      className="ml-2 inline-flex items-center rounded-[4px] border border-sky-400/40 bg-sky-400/10 px-1.5 py-0.5 text-[8px] font-mono-ibm uppercase tracking-[0.16em] text-sky-300"
    >
      B2B
    </span>
  )
}

function RecentOrdersTable({ onSelect }: { onSelect: (code: string) => void }) {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null)
  const [error, setError] = useState(false)
  const [sort, setSort] = useState<{ key: OrderSortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 })
  const [filters, setFilters] = useState<Record<OrderSortKey, string>>({
    date: '', code: '', email: '', region: '', items: '', downloads: '', status: '',
  })

  useEffect(() => {
    fetch('/api/admin/order?recent=90')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setOrders((d as { orders: AdminOrder[] }).orders))
      .catch(() => setError(true))
  }, [])

  const fmtDate = (ms: number) =>
    new Date(ms).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
  const dlCount = (o: AdminOrder) => o.items.reduce((n, i) => n + i.downloads, 0)
  // All charged product lines (physical + digital), not just digital downloads —
  // a poster-only order used to show "0 items" because only `items` (digital
  // deliverables) was counted. Falls back for orders that pre-date lineItems.
  const itemCount = (o: AdminOrder) =>
    o.lineItems?.length
      ? o.lineItems.filter((l) => l.sku !== 'shipping').reduce((n, l) => n + l.qty, 0)
      : o.items.length
  const cell = (o: AdminOrder, k: OrderSortKey): string => {
    switch (k) {
      case 'date': return fmtDate(o.createdAt)
      case 'code': return o.orderId
      case 'email': return o.email ?? ''
      case 'region': return regionCode(o)
      case 'items': return String(itemCount(o))
      case 'downloads': return String(dlCount(o))
      case 'status': return o.refunded ? 'Refunded' : o.expired ? 'Expired' : 'Active'
    }
  }
  const sortVal = (o: AdminOrder, k: OrderSortKey): number | string => {
    if (k === 'date') return o.createdAt
    if (k === 'items') return itemCount(o)
    if (k === 'downloads') return dlCount(o)
    return cell(o, k).toLowerCase()
  }

  const cols: { key: OrderSortKey; label: string; num?: boolean }[] = [
    { key: 'date', label: 'Date' },
    { key: 'code', label: 'Order code' },
    { key: 'email', label: 'Email' },
    { key: 'region', label: 'Region' },
    { key: 'items', label: 'Items', num: true },
    { key: 'downloads', label: 'Downloads', num: true },
    { key: 'status', label: 'Status' },
  ]

  const rows = (orders ?? [])
    .filter((o) =>
      (Object.keys(filters) as OrderSortKey[]).every((k) => {
        const f = filters[k].trim().toLowerCase()
        return !f || cell(o, k).toLowerCase().includes(f)
      }),
    )
    .sort((a, b) => {
      const av = sortVal(a, sort.key)
      const bv = sortVal(b, sort.key)
      return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir
    })

  const toggleSort = (k: OrderSortKey) =>
    setSort((s) => (s.key === k ? { key: k, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 } : { key: k, dir: 1 }))

  return (
    <div className="mt-16">
      <h2 className="text-[11px] font-mono-ibm uppercase tracking-[0.28em] text-white/40">
        Last 90 days{orders ? ` · ${orders.length}` : ''}
      </h2>

      {error ? (
        <div className="mt-5"><Notice tone="error" title="Couldn’t load orders" body="Is the origin running?" /></div>
      ) : !orders ? (
        <div className="flex justify-center py-12"><span className="shop-spinner" /></div>
      ) : orders.length === 0 ? (
        <div className="mt-5"><Notice tone="muted" title="No orders yet" body="Orders from the last 90 days will appear here." /></div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-white/10">
                {cols.map((c) => (
                  <th key={c.key} className="py-2 pr-4">
                    <button
                      onClick={() => toggleSort(c.key)}
                      className="inline-flex items-center gap-1 text-[10px] font-mono-ibm uppercase tracking-[0.18em] text-white/45 hover:text-white transition-colors"
                    >
                      {c.label}
                      <span className="text-[8px] text-[#931020]">{sort.key === c.key ? (sort.dir === 1 ? '▲' : '▼') : ''}</span>
                    </button>
                  </th>
                ))}
              </tr>
              <tr className="border-b border-white/10">
                {cols.map((c) => (
                  <th key={c.key} className="pb-2 pr-4">
                    <input
                      value={filters[c.key]}
                      onChange={(e) => setFilters((f) => ({ ...f, [c.key]: e.target.value }))}
                      placeholder="filter"
                      spellCheck={false}
                      className="w-full min-w-[5rem] bg-white/[0.04] border border-white/10 rounded px-2 py-1 font-mono-ibm text-[11px] text-white/80 outline-none focus:border-[#931020]"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr
                  key={o.orderId}
                  onClick={() => onSelect(o.orderId)}
                  className={`border-b border-white/[0.06] cursor-pointer hover:bg-white/[0.04] transition-colors ${o.livemode !== true ? 'opacity-40' : ''}`}
                >
                  <td className="py-2.5 pr-4 whitespace-nowrap text-white/60">{fmtDate(o.createdAt)}</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap font-mono-ibm text-[#931020]">{o.orderId}</td>
                  <td className="py-2.5 pr-4 text-white/70 truncate max-w-[14rem]">{o.email ?? '—'}</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap"><RegionBadge order={o} /><B2bBadge order={o} /></td>
                  <td className="py-2.5 pr-4 text-white/60">{itemCount(o)}</td>
                  <td className="py-2.5 pr-4 text-white/60">{dlCount(o)}</td>
                  <td className={`py-2.5 pr-4 whitespace-nowrap ${o.refunded || o.expired ? 'text-[#931020]' : 'text-white/45'}`}>
                    {o.refunded ? 'Refunded' : o.expired ? 'Expired' : 'Active'}
                    <UnmatchedRefundBadge order={o} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={cols.length} className="py-8 text-center text-white/30 text-[12px]">No rows match the filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
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

/** One row of the unified order-composition list — physical, digital and
 *  shipping lines rendered identically, with a preview thumb where one exists. */
interface DisplayLine {
  sku: string
  label: string
  detail?: string | null
  qty: number
  net: number | null
  previewUrl?: string | null
  /** Download count for digital deliverables; null for physical/shipping. */
  downloads: number | null
  refunded: boolean
  shipping: boolean
}

function OrderCard({ order, onChanged }: { order: AdminOrder; onChanged: () => void }) {
  const [busy, setBusy] = useState<'resend' | 'extend' | 'refund' | 'refund-full' | 'refund-lines' | 'force-submit' | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const expiry = new Date(order.expiresAt).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
  const hasVat = (order.taxAmount ?? 0) > 0

  // Unified composition: prefer the charged lineItems (covers posters,
  // fine-art, digital and shipping alike); fall back to the digital-only
  // items list for orders that pre-date itemised recording.
  const dlBySku = new Map(order.items.map((i) => [i.sku, i]))
  const revoked = new Set(order.revokedSkus ?? [])
  const hasLines = (order.lineItems?.length ?? 0) > 0
  const lines: DisplayLine[] = hasLines
    ? order.lineItems!.map((l) => {
        const dl = dlBySku.get(l.sku)
        return {
          sku: l.sku,
          label: l.label,
          detail: dl && l.detail ? `${l.detail} · ${dl.filename}` : l.detail,
          qty: l.qty,
          net: l.net,
          previewUrl: l.previewUrl,
          downloads: dl ? dl.downloads : null,
          refunded: !!order.refunded || revoked.has(l.sku) || !!dl?.refunded,
          shipping: l.sku === 'shipping',
        }
      })
    : order.items.map((i) => ({
        sku: i.sku,
        label: i.filename,
        detail: `${i.label} · ${i.format === 'tiff' ? '16-bit TIFF' : 'JPEG'}`,
        qty: 1,
        net: i.price ?? null,
        downloads: i.downloads,
        refunded: !!order.refunded || !!i.refunded,
        shipping: false,
      }))
  // Per-line gross (net + proportional VAT share) so line values sum to the
  // charged total and explain refund amounts.
  const netSum = lines.reduce((s, l) => s + (l.net ?? 0), 0)
  const grossOf = (net?: number | null): number | null =>
    net == null ? null
      : order.amount != null && netSum > 0
        ? Math.round((net * order.amount) / netSum)
        : net
  // Items still refundable: not downloaded and not already refunded (legacy flow).
  const undownloaded = order.items.filter((i) => i.downloads === 0 && !i.refunded)

  // Line selection for the itemised refund. Undownloaded digital items are
  // pre-selected when the admin preference says so.
  const refundable = !order.refunded && !!order.paymentId
  const [sel, setSel] = useState<Set<string>>(new Set())
  const selGross = lines.filter((l) => sel.has(l.sku)).reduce((s, l) => s + (grossOf(l.net) ?? 0), 0)
  useEffect(() => {
    fetch('/api/admin/prefs')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if ((d as { refundUndownloadedDefault: boolean }).refundUndownloadedDefault) {
          setSel(new Set(order.items.filter((i) => i.downloads === 0 && !i.refunded).map((i) => i.sku)))
        }
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.orderId])
  const toggleSel = (sku: string) =>
    setSel((prev) => {
      const next = new Set(prev)
      if (next.has(sku)) next.delete(sku)
      else next.add(sku)
      return next
    })

  // Refund actions are destructive — always unmistakably red.
  const refundBtn =
    'rounded-md border border-[#931020] bg-[#931020]/15 px-4 py-2 text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-[#e0485a] hover:bg-[#931020] hover:text-white transition-colors disabled:opacity-40 disabled:hover:bg-[#931020]/15 disabled:hover:text-[#e0485a]'

  async function act(action: 'resend' | 'extend' | 'refund' | 'refund-full' | 'refund-lines' | 'force-submit') {
    const hasPhysicalSel = lines.some((l) => sel.has(l.sku) && l.downloads === null && !l.shipping)
    const confirms: Partial<Record<typeof action, string>> = {
      'force-submit': 'MANUAL OVERRIDE — send this order to Prodigi NOW, before the customer’s payment has settled? The Prodigi debit card is charged immediately, so you are bridging the float from your own funds. No automatic payout will be created for this order — transfer the settled amount to the bank manually.',
      refund: 'Refund the items the customer has NOT downloaded? They’re refunded in Stripe (tax included) and access to those items is revoked.',
      'refund-full': `FULL refund of ${order.amount != null ? fmtMoney(order.amount - (order.refundedAmount ?? 0), order.currency) : 'the remaining balance'}? The customer is refunded in Stripe and ALL download access is revoked.${hasLines && lines.some((l) => l.downloads === null && !l.shipping) ? ' Physical production is NOT auto-cancelled — cancel with Prodigi separately if it hasn’t shipped.' : ''}`,
      'refund-lines': `Refund the ${sel.size} selected item${sel.size === 1 ? '' : 's'} (${fmtMoney(selGross, order.currency)}${hasVat ? ' inc. VAT' : ''})? Digital access to them is revoked.${hasPhysicalSel ? ' Physical production is NOT auto-cancelled — cancel with Prodigi separately if it hasn’t shipped.' : ''}`,
    }
    if (confirms[action] && !window.confirm(confirms[action]!)) return
    setBusy(action)
    setNote(null)
    try {
      const res = await fetch('/api/admin/order', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action,
          orderId: order.orderId,
          ...(action.startsWith('refund') ? { paymentId: order.paymentId } : {}),
          ...(action === 'refund-lines' ? { skus: Array.from(sel) } : {}),
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { refunded?: number; error?: string }
      if (res.ok) {
        setNote(
          action === 'resend' ? 'Email re-sent.'
            : action === 'extend' ? 'Link extended.'
            : action === 'force-submit' ? `Sent to Prodigi: ${(data as { prodigiId?: string }).prodigiId ?? 'ok'}. Remember to transfer the settled funds manually.`
            : `Refunded ${fmtMoney(data.refunded ?? 0, order.currency)}.`,
        )
        onChanged()
      } else {
        setNote(data.error || 'Action failed.')
      }
    } catch {
      setNote('Action failed.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5 sm:p-6 animate-[fadeIn_240ms_ease]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-mono-ibm text-sm font-bold text-[#931020] break-all">{order.orderId}</p>
        <span
          className={`text-[10px] font-mono-ibm uppercase tracking-[0.18em] ${
            order.refunded || order.expired ? 'text-[#931020]' : 'text-white/40'
          }`}
        >
          {order.refunded ? 'Refunded' : order.expired ? 'Expired' : 'Valid'} · until {expiry}
        </span>
      </div>

      <dl className="mt-4 divide-y divide-white/[0.07]">
        <Row label="Email" value={order.email ?? '—'} mono />
        <Row label="Passcode" value={order.passcode} mono accent />
        <Row label="Emailed" value={order.emailed ? 'yes' : 'no'} />
        {order.invoiceNumber && <Row label="Invoice no." value={order.invoiceNumber} mono />}
        {order.businessName && <Row label="Business" value={order.businessName} />}
        {order.businessAddress && <Row label="Address" value={order.businessAddress} />}
        {order.vatId && <Row label="VAT ID" value={order.vatId} mono />}
        {order.vatConsultation && <Row label="VIES ref" value={order.vatConsultation} mono />}
        {order.paidAt && (
          <Row label="Paid" value={`${new Date(order.paidAt).toLocaleDateString('en-GB')}${order.paymentMethod ? ` · ${order.paymentMethod}` : ''}`} />
        )}
        {order.amount != null && (
          <Row
            label="Amount"
            value={`${fmtMoney(order.amount, order.currency)}${hasVat ? ` (incl. ${fmtMoney(order.taxAmount ?? 0, order.currency)} VAT)` : ''}`}
            accent
          />
        )}
        {(order.buyerCountry || order.buyerIp) && (
          <Row label="VAT evidence" value={`${order.buyerCountry ?? '—'}${order.buyerIp ? ` · ${order.buyerIp}` : ''}`} mono />
        )}
        {order.shipping?.name && (
          <Row
            label="Ship to"
            value={[
              order.shipping.name,
              order.shipping.address?.line1,
              [order.shipping.address?.postalCode, order.shipping.address?.city].filter(Boolean).join(' '),
              order.shipping.address?.country,
            ].filter(Boolean).join(', ')}
          />
        )}
        {!order.fulfilment && order.lineItems?.some((l) => l.sku === 'shipping') && (
          <Row
            label="Fulfilment"
            value="Awaiting settlement / payout — not yet sent to Prodigi"
          />
        )}
        {order.fulfilment && (() => {
          const f = order.fulfilment
          // Humanise the Prodigi stage: "InProgress" → "In Progress"; an error
          // outcome reads "Failed". Mode shown as a plain word.
          const rawStage = f.stage || f.outcome || '—'
          const friendly = f.outcome === 'error'
            ? 'Failed'
            : rawStage.replace(/([a-z])([A-Z])/g, '$1 $2')
          const made = (() => {
            if (!f.productionCountry) return null
            try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(f.productionCountry) ?? f.productionCountry }
            catch { return f.productionCountry }
          })()
          return (
            <>
              <Row label="Fulfilment" value={`${friendly}${f.mode ? ` · ${f.mode}` : ''}`} accent />
              {f.prodigiId && <Row label="Prodigi ref" value={f.prodigiId} mono />}
              {made && <Row label="Made in" value={made} />}
              {f.shippedAt && <Row label="Shipped" value={new Date(f.shippedAt).toLocaleDateString('en-GB')} />}
              {f.error && <Row label="Prodigi error" value={f.error} />}
            </>
          )
        })()}
        {order.fulfilment?.tracking && order.fulfilment.tracking.length > 0 && (
          <div className="grid grid-cols-[140px_1fr] gap-4 py-3.5">
            <dt className="text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white/35 pt-0.5">Tracking</dt>
            <dd className="font-mono-ibm text-sm text-white/90 break-all space-y-1">
              {order.fulfilment.tracking.map((t, i) => {
                const text = [t.carrier, t.number].filter(Boolean).join(' · ') || t.url || '—'
                return (
                  <div key={i}>
                    {t.url ? (
                      <a href={t.url} target="_blank" rel="noreferrer" className="text-[#931020] underline">
                        {text}
                      </a>
                    ) : (
                      text
                    )}
                  </div>
                )
              })}
            </dd>
          </div>
        )}
        {order.refundedAmount != null && (
          <Row
            label="Refunded"
            value={`${fmtMoney(order.refundedAmount, order.currency)}${hasVat ? ' inc. VAT' : ''} · ${order.refunded ? 'full' : 'partial'}`}
            accent
          />
        )}
        {/* Same URL serves every order type — invoice/license/tracking, not just
            downloads — so the label shouldn't imply file downloads for a
            physical-only order. */}
        <Row label="Order status page" value={order.downloadUrl} mono />
      </dl>

      {/* Unified order composition — every charged line (posters, fine-art,
          digital, shipping) with a preview thumb, gross value and per-line
          refund selection. */}
      <ul className="mt-5 divide-y divide-white/[0.06] rounded-lg border border-white/10 overflow-hidden">
        {lines.map((l) => (
          <li
            key={l.sku}
            className={`flex items-center gap-3 bg-white/[0.02] px-3 py-2.5 text-[13px] ${l.refunded ? 'opacity-45' : ''}`}
          >
            {refundable && hasLines && (
              <input
                type="checkbox"
                checked={sel.has(l.sku)}
                disabled={l.refunded || busy !== null}
                onChange={() => toggleSel(l.sku)}
                className="h-3.5 w-3.5 shrink-0 accent-[#931020]"
                title={l.refunded ? 'Already refunded' : 'Include in itemised refund'}
              />
            )}
            {l.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`${l.previewUrl}&max=200`}
                alt=""
                className="h-11 w-9 shrink-0 rounded object-cover border border-white/10"
              />
            ) : (
              <span className="flex h-11 w-9 shrink-0 items-center justify-center rounded border border-white/10 text-[13px] text-white/25">
                {l.shipping ? '⛟' : '—'}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono-ibm text-white/80">
                {l.qty > 1 ? `${l.qty}× ` : ''}{l.label}
              </span>
              <span className="block truncate text-[11px] text-white/35">
                {l.detail}
                {l.downloads != null && `${l.detail ? ' · ' : ''}${l.downloads} download${l.downloads === 1 ? '' : 's'}`}
                {l.refunded && <span className="ml-1.5 text-[#e0485a]">· refunded</span>}
              </span>
            </span>
            {l.net != null && (
              <span className="shrink-0 text-[11px] text-white/45 tabular-nums" title={hasVat ? 'Gross — includes proportional VAT share' : undefined}>
                {fmtMoney(grossOf(l.net), order.currency)}
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {/* Invoice + licence are always available — permanent records, even after refund. */}
        <a
          href={`/api/admin/invoice/${order.orderId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-white/15 px-4 py-2 text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white/70 hover:border-white/40 hover:text-white transition-colors"
        >
          Invoice ↗
        </a>
        <a
          href={`/api/admin/license/${order.orderId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-white/15 px-4 py-2 text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white/70 hover:border-white/40 hover:text-white transition-colors"
        >
          Licence ↗
        </a>
        {order.refundedAmount != null && (
          <a
            href={`/api/admin/refund/${order.orderId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-[#931020]/40 px-4 py-2 text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-[#931020] hover:border-[#931020] hover:text-white transition-colors"
          >
            Refund ↗
          </a>
        )}
        {/* Re-send / Extend make no sense once an order is fully refunded
            (access is revoked). They stay available on a partial refund — the
            re-sent email then only lists the items the buyer still has. */}
        {!order.refunded && (
          <>
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
          </>
        )}
        {/* No-float manual override: physical order not yet (really) submitted
            to Prodigi — a sentinel/failed state may be forced through; a real
            Prodigi id may not. Charges the debit card immediately. */}
        {!order.refunded &&
          order.lineItems?.some((l) => l.sku === 'shipping') &&
          !(order.fulfilment?.prodigiId && !order.fulfilment.prodigiId.startsWith('payout-pending:')) && (
            <button
              onClick={() => act('force-submit')}
              disabled={busy !== null}
              className={refundBtn}
              title="Bypasses the settlement/payout wait — you bridge the float manually"
            >
              {busy === 'force-submit' ? 'Sending…' : 'Send to Prodigi now (override)'}
            </button>
          )}
        {refundable && (
          <>
            {hasLines ? (
              <button
                onClick={() => act('refund-lines')}
                disabled={busy !== null || sel.size === 0}
                title={sel.size === 0 ? 'Tick the items to refund in the list above' : undefined}
                className={refundBtn}
              >
                {busy === 'refund-lines'
                  ? 'Refunding…'
                  : `Refund selected${sel.size ? ` (${sel.size}) · ${fmtMoney(selGross, order.currency)}` : ''}`}
              </button>
            ) : (
              // Orders that pre-date itemised lineItems: digital-only flow.
              <button
                onClick={() => act('refund')}
                disabled={busy !== null || undownloaded.length === 0}
                title={undownloaded.length === 0 ? 'All items downloaded — nothing to refund' : undefined}
                className={refundBtn}
              >
                {busy === 'refund' ? 'Refunding…' : `Refund undownloaded${undownloaded.length ? ` (${undownloaded.length})` : ''}`}
              </button>
            )}
            <button
              onClick={() => act('refund-full')}
              disabled={busy !== null}
              className={refundBtn}
            >
              {busy === 'refund-full' ? 'Refunding…' : 'Full refund (override)'}
            </button>
          </>
        )}
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
      <dd className={`break-all ${mono ? 'font-mono-ibm text-sm' : 'text-[15px]'} ${accent ? 'text-[#931020]' : 'text-white/90'}`}>
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

// ── Prices tab ──────────────────────────────────────────────────────────────
// Edit the retail price of every product line. A price can never be set below
// the provider cost (the floor): the input goes red and the server refuses the
// save. Posters seed with the proposed A-series ladder; digital downloads and
// fine art have no provider cost so their floor is zero.

/** øre → a compact kr string, e.g. 24500 → "245". */
function oreToKr(ore: number): string {
  const kr = ore / 100
  return kr % 1 === 0 ? String(kr) : kr.toFixed(2)
}

/** A single price field (entered in kroner, stored in øre). Turns red and shows
 *  the floor when the value drops below cost. */
function PriceInput({
  value,
  floor,
  onChange,
  invalid,
  markupPct = 0,
}: {
  value: number
  floor: number
  onChange: (ore: number) => void
  /** Server-flagged below-cost (persists until re-saved). */
  invalid?: boolean
  /** General markup % — drives the live "final price to customer" preview. */
  markupPct?: number
}) {
  const below = value < floor || invalid
  const markup = floor > 0 ? Math.round(((value - floor) / floor) * 100) : null
  // What a customer pays at the general markup (color labels adjust per photo),
  // rounded up to the next whole 5 kr like every live listing price.
  const finalOre = roundUpToFiveKr(markupPct === 0 ? value : Math.round(value * (1 + markupPct / 100)))
  return (
    <div className="flex flex-col gap-1">
      <div className={`flex items-center h-10 rounded-md border bg-white/[0.04] px-2.5 transition-colors focus-within:border-[#931020] ${below ? 'border-[#931020]' : 'border-white/15'}`}>
        <input
          type="number"
          min={0}
          step={5}
          value={oreToKr(value)}
          onChange={(e) => {
            const kr = parseFloat(e.target.value)
            onChange(Number.isFinite(kr) ? Math.round(kr * 100) : 0)
          }}
          className="w-full bg-transparent text-[13px] text-white tabular-nums focus:outline-none"
        />
        <span className="text-[10px] font-mono-ibm text-white/30">kr</span>
      </div>
      {finalOre !== value && !below && (
        <span className="text-[12px] font-medium tabular-nums text-[#b01226]">
          → {oreToKr(finalOre)} kr
        </span>
      )}
      <span className={`text-[10px] font-mono-ibm tracking-wide ${below ? 'text-[#931020]' : 'text-white/30'}`}>
        {below
          ? `min ${oreToKr(floor)} kr`
          : floor > 0
            ? `cost ${oreToKr(floor)} · +${markup}%`
            : 'no cost'}
      </span>
    </div>
  )
}

/** A plain percentage field for the markup controls. */
function PctInput({
  value,
  onChange,
  invalid,
  prefix,
}: {
  value: number
  onChange: (pct: number) => void
  invalid?: boolean
  /** Leading glyph, e.g. '+' for additions or '−' for the red deduction. */
  prefix?: string
}) {
  return (
    <div className={`flex items-center h-10 w-28 rounded-md border bg-white/[0.04] px-2.5 transition-colors focus-within:border-[#931020] ${invalid ? 'border-[#931020]' : 'border-white/15'}`}>
      {prefix && <span className="text-[12px] text-white/40 pr-0.5">{prefix}</span>}
      <input
        type="number"
        min={0}
        step={1}
        value={String(value)}
        onChange={(e) => {
          const n = parseFloat(e.target.value)
          onChange(Number.isFinite(n) ? n : 0)
        }}
        className="w-full bg-transparent text-[13px] text-white tabular-nums focus:outline-none"
      />
      <span className="text-[10px] font-mono-ibm text-white/30">%</span>
    </div>
  )
}

/** Color-label rows for the markup section (red leads — it's the sale label). */
const MARKUP_LABELS: { c: ColorLabel; name: string; dot: string; sale?: boolean }[] = [
  { c: 'red', name: 'Red — on sale', dot: '#cf2d2d', sale: true },
  { c: 'yellow', name: 'Yellow', dot: '#d9b310' },
  { c: 'green', name: 'Green', dot: '#3a9d3a' },
  { c: 'blue', name: 'Blue', dot: '#3b7dd8' },
  { c: 'purple', name: 'Purple', dot: '#8e44ad' },
]

function PricesTab() {
  const [cfg, setCfg] = useState<PricingConfig | null>(null)
  const [floors, setFloors] = useState<PricingFloors | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  // Lines the server rejected on the last save, keyed by dotted path.
  const [flagged, setFlagged] = useState<Set<string>>(new Set())

  function load() {
    setCfg(null)
    setLoadError(false)
    fetch('/api/admin/pricing')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: unknown) => {
        const { pricing, floors } = d as { pricing: PricingConfig; floors: PricingFloors }
        setCfg(pricing)
        setFloors(floors)
      })
      .catch(() => setLoadError(true))
  }
  useEffect(load, [])

  // Immutable nested updates.
  const setDigital = (key: 'standard' | 'medium' | 'pro', ore: number) =>
    setCfg((c) => (c ? { ...c, digital: { ...c.digital, [key]: ore } } : c))
  const setBracket = (key: 'master' | 'original', i: number, ore: number) =>
    setCfg((c) => {
      if (!c) return c
      const next = [...c.digital[key]] as [number, number, number]
      next[i] = ore
      return { ...c, digital: { ...c.digital, [key]: next } }
    })

  const setMarkupGeneral = (pct: number) =>
    setCfg((c) => (c ? { ...c, markup: { ...c.markup, general: pct } } : c))
  const setMarkupLabel = (color: ColorLabel, pct: number) =>
    setCfg((c) => (c ? { ...c, markup: { ...c.markup, labels: { ...c.markup.labels, [color]: pct } } } : c))
  const setShippingHandling = (ore: number) =>
    setCfg((c) => (c ? { ...c, shippingHandlingMinor: Math.max(0, Math.round(ore)) } : c))

  // Client-side floor check mirrors the server, so Save is disabled before a
  // doomed round-trip. (Posters are cost-plus, always ≥ cost — not checked.)
  const anyBelow = (() => {
    if (!cfg || !floors) return false
    if (cfg.fineArt < floors.fineArt) return true
    return false
  })()

  // Markup rules: percentages ≥ 0; the Red sale can't exceed the general markup
  // (so a sale never dips below the list price). Mirror of validateMarkup.
  const markupError = (() => {
    if (!cfg) return null
    const m = cfg.markup
    if (m.general < 0) return 'General markup can’t be negative.'
    for (const { c, name } of MARKUP_LABELS) if (m.labels[c] < 0) return `${name} markup can’t be negative.`
    if (m.labels.red > m.general) return `Red sale (${m.labels.red}%) can’t exceed the general markup (${m.general}%).`
    return null
  })()

  async function save() {
    if (!cfg) return
    setBusy(true)
    setNote(null)
    try {
      const res = await fetch('/api/admin/pricing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pricing: cfg }),
      })
      const d = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        pricing?: PricingConfig
        floors?: PricingFloors
        errors?: PricingValidationError[]
        markupErrors?: string[]
        error?: string
      }
      if (res.ok && d.ok) {
        setFlagged(new Set())
        if (d.pricing) setCfg(d.pricing)
        if (d.floors) setFloors(d.floors)
        setNote('Saved. New prices apply to the catalog within ~60s.')
      } else if ((d.errors && d.errors.length > 0) || (d.markupErrors && d.markupErrors.length > 0)) {
        setFlagged(new Set((d.errors ?? []).map((e) => e.path)))
        const parts: string[] = []
        if (d.errors && d.errors.length > 0)
          parts.push(`${d.errors.length} line${d.errors.length > 1 ? 's' : ''} below cost: ${d.errors.map((e) => e.label).join(', ')}`)
        if (d.markupErrors && d.markupErrors.length > 0) parts.push(d.markupErrors.join(' '))
        setNote(`Rejected — ${parts.join('. ')}.`)
      } else {
        setNote(d.error ?? 'Could not save.')
      }
    } catch {
      setNote('Could not save.')
    } finally {
      setBusy(false)
    }
  }

  const sectionTitle = 'text-[11px] font-mono-ibm uppercase tracking-[0.28em] text-white/40'
  const tierLabel: Record<PaperTier, string> = { photographic: 'Photographic', premium: 'Premium' }
  const tierBlurb: Record<PaperTier, string> = {
    photographic: 'Photographic lustre · Enhanced matte',
    premium: 'Hahnemühle Photo Rag · German Etching',
  }

  return (
    <>
      <h1 className="font-serif font-light text-4xl sm:text-5xl tracking-wide">Prices</h1>
      <p className="mt-2 text-sm text-white/45">
        Set the markup once; it drives every price. Posters are <span className="text-white/60">cost-plus</span> (Prodigi
        cost × markup, shown below — nothing to hand-set). Digital downloads and fine art have no
        provider cost, so you set a base price for each and the markup applies on top; a base can’t
        be saved below its cost floor (0 for these for now).
      </p>

      {loadError ? (
        <div className="mt-8"><Notice tone="error" title="Couldn’t load prices" body="Is KV reachable?" /></div>
      ) : !cfg || !floors ? (
        <div className="flex justify-center py-16"><span className="shop-spinner" /></div>
      ) : (
        <>
          {/* Markup — across-the-board + per color label */}
          <section className="mt-10 rounded-lg border border-white/10 bg-white/[0.03] p-6">
            <h2 className={sectionTitle}>Markup</h2>
            <p className="mt-1.5 text-[12px] text-white/40">
              The general markup sets every price — applied to the <span className="text-white/60">Prodigi cost</span> for
              posters and to the base price for digital & fine art. A photo’s Lightroom color label
              then adjusts it: Yellow / Green / Blue / Purple add on top; <span className="text-white/60">Red puts the
              photo on sale</span> (a deduction that can’t exceed the general markup, so a sale never
              drops below cost/base).
            </p>

            <div className="mt-6 flex flex-wrap items-start gap-x-12 gap-y-6">
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white/40">General · all goods</span>
                <PctInput value={cfg.markup.general} onChange={setMarkupGeneral} prefix="+" invalid={cfg.markup.general < 0} />
              </div>

              <div>
                <span className="text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white/40">Color label adjustment</span>
                <div className="mt-2.5 flex flex-col gap-2.5">
                  {MARKUP_LABELS.map(({ c, name, dot, sale }) => {
                    const v = cfg.markup.labels[c]
                    const net = sale ? cfg.markup.general - Math.min(v, cfg.markup.general) : cfg.markup.general + v
                    const bad = v < 0 || (sale && v > cfg.markup.general)
                    return (
                      <div key={c} className="flex items-center gap-3">
                        <span className="inline-block h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: dot }} />
                        <span className="w-28 text-[12px] text-white/70">{name}</span>
                        <PctInput value={v} onChange={(pct) => setMarkupLabel(c, pct)} prefix={sale ? '−' : '+'} invalid={bad} />
                        <span className={`text-[11px] font-mono-ibm tabular-nums ${bad ? 'text-[#931020]' : 'text-white/35'}`}>
                          {bad && sale ? `max ${cfg.markup.general}%` : `net +${Math.round(net)}%`}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Worked example — shows the per-label effect the line previews can't
                (color labels are per-photo). Based on the Photographic A2 cost. */}
            {(() => {
              const base = floors.posters.photographic.A2 // cost in DKK (cost-plus base)
              const at = (pct: number) => oreToKr(roundUpToFiveKr(Math.round(base * (1 + pct / 100))))
              const g = cfg.markup.general
              const greenNet = g + cfg.markup.labels.green
              const redNet = g - Math.min(cfg.markup.labels.red, g)
              return (
                <div className="mt-6 border-t border-white/[0.06] pt-4 text-[12px] text-white/45">
                  Example — Photographic A2 (cost {oreToKr(base)} kr) sells at{' '}
                  <span className="text-[#b01226] font-medium tabular-nums">{at(g)} kr</span> general
                  {cfg.markup.labels.green > 0 && (
                    <> · <span className="text-[#b01226] font-medium tabular-nums">{at(greenNet)} kr</span> if green</>
                  )}
                  {cfg.markup.labels.red > 0 && (
                    <> · <span className="text-[#b01226] font-medium tabular-nums">{at(redNet)} kr</span> on a red sale</>
                  )}
                  .
                </div>
              )
            })()}
            {markupError && <p className="mt-4 text-[12px] text-[#931020]">{markupError}</p>}
          </section>

          {/* Shipping handling — flat fee added to Prodigi's quoted shipping. */}
          <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] p-6">
            <h2 className={sectionTitle}>Shipping</h2>
            <p className="mt-1.5 text-[12px] text-white/40">
              Customers are charged Prodigi’s live shipping quote (converted to DKK) plus this flat
              handling fee, for the whole order. VAT applies to the total incl. shipping. Set to 0 for
              no handling fee.
            </p>
            <div className="mt-6 flex flex-col gap-1.5">
              <span className="text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white/40">Handling fee · kr</span>
              <input
                type="number"
                min={0}
                step={1}
                value={Math.round(cfg.shippingHandlingMinor / 100)}
                onChange={(e) => setShippingHandling((Number(e.target.value) || 0) * 100)}
                className="w-32 rounded-md border border-white/15 bg-black/30 px-3 py-2 text-[14px] font-mono-ibm tabular-nums text-white/90 focus:border-white/40 focus:outline-none"
              />
            </div>
          </section>

          {/* Posters — cost-plus (read-only). Price = Prodigi cost × (1 + general
              markup); color labels adjust per photo. No hand-set prices. */}
          <section className="mt-8 rounded-lg border border-white/10 bg-white/[0.03] p-6">
            <h2 className={sectionTitle}>Posters</h2>
            <p className="mt-1.5 text-[12px] text-white/40">
              Priced <span className="text-white/60">cost-plus</span> — each is the Prodigi cost (EUR→DKK)
              × (1 + general markup), so they’re set entirely by the markup above. Color labels adjust
              per photo. A size is only offered when the photo resolves it at the paper’s DPI floor.
            </p>
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-8">
              {(['photographic', 'premium'] as PaperTier[]).map((tier) => (
                <div key={tier}>
                  <div className="mb-3">
                    <span className="text-[13px] text-white/80">{tierLabel[tier]}</span>
                    <span className="ml-2 text-[11px] text-white/35">{tierBlurb[tier]}</span>
                  </div>
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="text-[10px] font-mono-ibm uppercase tracking-[0.16em] text-white/35">
                        <th className="text-left font-normal pb-1.5 w-10">Size</th>
                        <th className="text-right font-normal pb-1.5">Cost</th>
                        <th className="text-right font-normal pb-1.5">Sells at</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SIZE_ORDER.map((size) => {
                        const cost = floors.posters[tier][size]
                        const sell = roundUpToFiveKr(Math.round(cost * (1 + cfg.markup.general / 100)))
                        return (
                          <tr key={size} className="border-t border-white/[0.06]">
                            <td className="py-1.5 font-mono-ibm uppercase tracking-[0.16em] text-white/55">{size}</td>
                            <td className="py-1.5 text-right tabular-nums text-white/40">{oreToKr(cost)} kr</td>
                            <td className="py-1.5 text-right tabular-nums font-medium text-[#b01226]">{oreToKr(sell)} kr</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </section>

          {/* Fine art */}
          <section className="mt-8 rounded-lg border border-white/10 bg-white/[0.03] p-6">
            <h2 className={sectionTitle}>Fine art</h2>
            <p className="mt-1.5 text-[12px] text-white/40">
              WhiteWall edition — a single placeholder price until WhiteWall trade pricing is wired
              (no cost floor yet).
            </p>
            <div className="mt-5 w-44">
              <PriceInput
                value={cfg.fineArt}
                floor={floors.fineArt}
                invalid={flagged.has('fineArt')}
                markupPct={cfg.markup.general}
                onChange={(ore) => setCfg((c) => (c ? { ...c, fineArt: ore } : c))}
              />
            </div>
          </section>

          {/* Digital downloads */}
          <section className="mt-8 rounded-lg border border-white/10 bg-white/[0.03] p-6">
            <h2 className={sectionTitle}>Digital downloads</h2>
            <p className="mt-1.5 text-[12px] text-white/40">
              Licensed files — no provider cost. The full-res Master (JPEG) and Original (TIFF) are
              priced by the photo’s megapixels across three brackets.
            </p>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-5">
              <label className="flex flex-col gap-1.5 w-36">
                <span className="text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white/40">Standard · JPEG</span>
                <PriceInput value={cfg.digital.standard} floor={floors.digital.standard} markupPct={cfg.markup.general} onChange={(o) => setDigital('standard', o)} />
              </label>
              <label className="flex flex-col gap-1.5 w-36">
                <span className="text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white/40">Medium · JPEG</span>
                <PriceInput value={cfg.digital.medium} floor={floors.digital.medium} markupPct={cfg.markup.general} onChange={(o) => setDigital('medium', o)} />
              </label>
              <label className="flex flex-col gap-1.5 w-36">
                <span className="text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white/40">Pro · TIFF</span>
                <PriceInput value={cfg.digital.pro} floor={floors.digital.pro} markupPct={cfg.markup.general} onChange={(o) => setDigital('pro', o)} />
              </label>
            </div>

            <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-6">
              {(['master', 'original'] as const).map((key) => (
                <div key={key}>
                  <span className="text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white/40">
                    {key === 'master' ? 'Master · JPEG (full-res)' : 'Original · TIFF (full-res)'}
                  </span>
                  <div className="mt-2 grid grid-cols-3 gap-3">
                    {(['≤25 MP', '≤50 MP', '>50 MP'] as const).map((mp, i) => (
                      <div key={mp} className="flex flex-col gap-1">
                        <span className="text-[10px] font-mono-ibm text-white/35">{mp}</span>
                        <PriceInput value={cfg.digital[key][i]} floor={floors.digital[key]} markupPct={cfg.markup.general} onChange={(o) => setBracket(key, i, o)} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Save bar */}
          <div className="mt-8 flex items-center gap-5">
            <button
              onClick={save}
              disabled={busy || anyBelow || !!markupError}
              className="h-10 shrink-0 rounded-md bg-[#931020] px-6 text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white hover:bg-[#a8131f] transition-colors disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Save prices'}
            </button>
            <button
              onClick={load}
              disabled={busy}
              className="text-[10px] font-mono-ibm uppercase tracking-[0.18em] text-white/40 hover:text-white transition-colors disabled:opacity-40"
            >
              Discard changes
            </button>
            {anyBelow && (
              <span className="text-[11px] text-[#931020]">One or more prices are below cost.</span>
            )}
            {!anyBelow && markupError && (
              <span className="text-[11px] text-[#931020]">{markupError}</span>
            )}
            {note && <span className="text-[12px] text-white/55">{note}</span>}
          </div>
        </>
      )}
    </>
  )
}
