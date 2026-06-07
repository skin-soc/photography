'use client'

import { useState, useEffect } from 'react'
import type { ReferenceLookup } from '@/lib/shop'
import type { AdminOrder } from '@/lib/downloads'
import { vatJurisdiction, jurisdictionLabel, type VatJurisdiction } from '@/lib/vat'
import Logo from '../_components/Logo'

type Tab = 'products' | 'orders' | 'finances' | 'coupons' | 'settings'

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

      <main className="flex-1 w-full max-w-screen-2xl mx-auto px-6 sm:px-10 py-12 sm:py-16">
        {/* Tabs */}
        <div className="flex gap-1 mb-10 border-b border-white/10">
          {(['products', 'orders', 'finances', 'coupons', 'settings'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-[11px] font-mono-ibm uppercase tracking-[0.22em] transition-colors border-b-2 -mb-px ${
                tab === t
                  ? 'border-[#931020] text-white'
                  : 'border-transparent text-white/40 hover:text-white/70'
              }`}
            >
              {t === 'products' ? 'Product lookup' : t === 'orders' ? 'Orders' : t === 'finances' ? 'Finances' : t === 'coupons' ? 'Coupons' : 'Settings'}
            </button>
          ))}
        </div>

        {tab === 'products' ? <ProductsTab />
          : tab === 'orders' ? <OrdersTab />
          : tab === 'finances' ? <FinancesTab />
          : tab === 'coupons' ? <CouponsTab />
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
      const d = (await res.json().catch(() => ({}))) as { code?: string; error?: string }
      if (res.ok) { setNote(`Created ${d.code}.`); setCode(''); setMaxRedemptions(''); setExpiry(''); setCodes(null); load() }
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
        Create discount codes customers enter at checkout — created directly as Stripe promotion
        codes. Shows the <strong className="text-white/60">current Stripe mode</strong> (test here, live in production).
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

  async function save() {
    setBusy(true)
    setNote(null)
    try {
      const res = await fetch('/api/admin/sale-notify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled, email: email.trim() }),
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
      <label className="mt-5 flex items-center gap-3 cursor-pointer w-fit">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 accent-[#931020]"
        />
        <span className="text-[14px] font-light text-white/80">Email me on every real sale</span>
      </label>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@gusmcewan.com"
          className="min-w-[18rem] flex-1 rounded-md border border-white/15 bg-white/[0.04] px-4 py-2.5 text-[14px] text-white placeholder:text-white/25 focus:border-[#931020] focus:outline-none transition-colors"
        />
        <button
          onClick={save}
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
        Which refund the order card highlights as the primary action. Both buttons are always
        available regardless.
      </p>
      <label className="mt-5 flex items-center gap-3 cursor-pointer w-fit">
        <input
          type="checkbox"
          checked={val === true}
          disabled={val === null || busy}
          onChange={(e) => save(e.target.checked)}
          className="h-4 w-4 accent-[#931020]"
        />
        <span className="text-[14px] font-light text-white/80">Default to “refund undownloaded only”</span>
      </label>
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
      const d = (await res.json().catch(() => ({}))) as { deleted?: number; error?: string }
      setNote(res.ok
        ? `${label} done${typeof d.deleted === 'number' ? ` (${d.deleted} cleared)` : ''}.`
        : (d.error || 'Failed.'))
    } catch { setNote('Failed.') } finally { setBusy(null) }
  }

  const btn = 'w-44 shrink-0 h-10 rounded-md border border-white/15 text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white/70 hover:border-white/40 hover:text-white transition-colors disabled:opacity-40'

  const actions: { action: string; label: string; busyLabel: string; desc: string; confirm?: string }[] = [
    { action: 'refresh-catalog', label: 'Refresh catalog', busyLabel: 'Refreshing…',
      desc: 'Busts the 5-minute cache so a fresh Lightroom export shows at once.' },
    { action: 'warm-previews', label: 'Warm previews', busyLabel: 'Warming…',
      desc: 'Re-renders any missing watermarked previews.' },
    { action: 'clear-fulfil', label: 'Clear deliverables', busyLabel: 'Clearing…',
      desc: 'Frees disk — files regenerate on the next download.',
      confirm: 'Clear all generated deliverables? They regenerate on next download.' },
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

/** Read-only list of active Stripe Tax registrations. */
interface TaxReg { id: string; country: string; status: string; livemode: boolean; activeFrom: number | null }
/** Manual VAT rate — applied to DK + EU buyers; non-EU pay 0%. */
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

function SettingsTab() {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const [busyCoupons, setBusyCoupons] = useState(false)

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
    setNote(null)
    try {
      const res = await fetch('/api/admin/delete-test-coupons', { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as { deleted?: number; deactivated?: number; error?: string }
      setNote(res.ok
        ? `Deleted ${data.deleted ?? 0} coupon${data.deleted === 1 ? '' : 's'}${data.deactivated ? `, deactivated ${data.deactivated} code${data.deactivated === 1 ? '' : 's'}` : ''}.`
        : (data.error || 'Failed.'))
    } catch {
      setNote('Failed.')
    } finally {
      setBusyCoupons(false)
    }
  }

  return (
    <>
      <h1 className="font-serif font-light text-4xl sm:text-5xl tracking-wide">Settings</h1>
      <p className="mt-2 text-sm text-white/45">Studio tools and maintenance.</p>

      <SaleNotifySettings />
      <VatRateSettings />
      <RefundPrefs />
      <CacheControls />
      <DiagnosticsSettings />
      <TaxRegistrations />

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
          <button
            onClick={deleteTestOrders}
            disabled={busy || busyCoupons}
            className="shrink-0 rounded-md border border-[#931020]/60 px-4 py-2.5 text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-[#931020] hover:bg-[#931020] hover:text-white transition-colors disabled:opacity-40"
          >
            {busy ? 'Deleting…' : 'Delete test orders'}
          </button>
        </div>

        <div className="mt-6 border-t border-[#931020]/20 pt-6 flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-prose">
            <p className="text-[14px] font-light text-white/80">Delete test coupons</p>
            <p className="mt-1 text-[12px] font-light text-white/45 leading-relaxed">
              Deletes all test-mode coupons and deactivates their promotion codes (Stripe doesn’t
              allow deleting codes). Test mode only — refused against a live key, so live coupons are
              never affected.
            </p>
          </div>
          <button
            onClick={deleteTestCoupons}
            disabled={busy || busyCoupons}
            className="shrink-0 rounded-md border border-[#931020]/60 px-4 py-2.5 text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-[#931020] hover:bg-[#931020] hover:text-white transition-colors disabled:opacity-40"
          >
            {busyCoupons ? 'Deleting…' : 'Delete test coupons'}
          </button>
        </div>

        {note && <p className="mt-4 text-[12px] text-white/60">{note}</p>}
      </section>
    </>
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
        {!loading && result && <ResultCard result={result} />}
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

function ResultCard({ result }: { result: ReferenceLookup }) {
  const matchLabel = result.matchedBy === 'product' ? 'Download token' : 'Photo reference'
  return (
    <div className="grid gap-8 sm:grid-cols-[240px_1fr] items-start animate-[fadeIn_240ms_ease]">
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${result.previewUrl}?max=600`}
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
    const head = ['Date', 'Order code', 'Email', 'Mode', 'VAT region', 'Currency', 'Charged', 'Refunded', 'Gross', 'Tax', 'Net', 'Tax country (IP)', 'Card country', 'Location match']
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
        locationMatch(o),
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
                      <span className="ml-2 rounded-[4px] border border-[#931020]/50 px-1.5 py-0.5 text-[8px] font-mono-ibm uppercase tracking-[0.16em] text-[#931020]">
                        {o.refunded ? 'refunded' : `−${fmtMoney(o.refundedAmount, o.currency)}`}
                      </span>
                    )}
                    <UnmatchedRefundBadge order={o} />
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
  const cell = (o: AdminOrder, k: OrderSortKey): string => {
    switch (k) {
      case 'date': return fmtDate(o.createdAt)
      case 'code': return o.orderId
      case 'email': return o.email ?? ''
      case 'region': return regionCode(o)
      case 'items': return String(o.items.length)
      case 'downloads': return String(dlCount(o))
      case 'status': return o.refunded ? 'Refunded' : o.expired ? 'Expired' : 'Active'
    }
  }
  const sortVal = (o: AdminOrder, k: OrderSortKey): number | string => {
    if (k === 'date') return o.createdAt
    if (k === 'items') return o.items.length
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
                  <td className="py-2.5 pr-4 whitespace-nowrap"><RegionBadge order={o} /></td>
                  <td className="py-2.5 pr-4 text-white/60">{o.items.length}</td>
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

function OrderCard({ order, onChanged }: { order: AdminOrder; onChanged: () => void }) {
  const [busy, setBusy] = useState<'resend' | 'extend' | 'refund' | 'refund-full' | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const expiry = new Date(order.expiresAt).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
  // Items still refundable: not downloaded and not already refunded.
  const undownloaded = order.items.filter((i) => i.downloads === 0 && !i.refunded)
  // Per-item gross (price + its proportional share of VAT), so item values sum
  // to the order total and explain the refund amount.
  const subtotalSum = order.items.reduce((s, i) => s + (i.price ?? 0), 0)
  const hasVat = (order.taxAmount ?? 0) > 0
  const grossOf = (price?: number | null): number | null =>
    price == null ? null
      : order.amount != null && subtotalSum > 0
        ? Math.round((price * order.amount) / subtotalSum)
        : price
  // Which refund button is highlighted (admin preference).
  const [refundDefaultUndl, setRefundDefaultUndl] = useState(true)
  useEffect(() => {
    fetch('/api/admin/prefs')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setRefundDefaultUndl((d as { refundUndownloadedDefault: boolean }).refundUndownloadedDefault))
      .catch(() => {})
  }, [])
  const refundBase = 'rounded-md border px-4 py-2 text-[10px] font-mono-ibm uppercase tracking-[0.2em] transition-colors disabled:opacity-40'
  const refundPrimary = 'border-[#931020]/50 text-[#931020] hover:bg-[#931020] hover:text-white disabled:hover:bg-transparent disabled:hover:text-[#931020]'
  const refundSecondary = 'border-white/15 text-white/45 hover:border-[#931020]/60 hover:text-[#931020]'

  async function act(action: 'resend' | 'extend' | 'refund' | 'refund-full') {
    const confirms: Partial<Record<typeof action, string>> = {
      refund: 'Refund the items the customer has NOT downloaded? They’re refunded in Stripe (tax included) and access to those items is revoked.',
      'refund-full': 'FULL refund regardless of downloads? The customer is fully refunded and ALL download access is revoked.',
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
          ...(action === 'refund' || action === 'refund-full' ? { paymentId: order.paymentId } : {}),
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { refunded?: number; error?: string }
      if (res.ok) {
        setNote(
          action === 'resend' ? 'Email re-sent.'
            : action === 'extend' ? 'Link extended.'
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
        {order.refundedAmount != null && (
          <Row
            label="Refunded"
            value={`${fmtMoney(order.refundedAmount, order.currency)}${hasVat ? ' inc. VAT' : ''} · ${order.refunded ? 'full' : 'partial'}`}
            accent
          />
        )}
        <Row label="Download page" value={order.downloadUrl} mono />
      </dl>

      <ul className="mt-4 space-y-1.5">
        {order.items.map((it) => (
          <li key={it.sku} className={`flex items-center justify-between gap-3 text-[13px] ${it.refunded ? 'opacity-45' : ''}`}>
            <span className="font-mono-ibm text-white/70 truncate">{it.filename}</span>
            <span className="shrink-0 text-white/35 text-[11px]">
              {it.label} · {it.format === 'tiff' ? '16-bit TIFF' : 'JPEG'}
              {it.price != null && ` · ${fmtMoney(grossOf(it.price), order.currency)}${hasVat ? ' inc. VAT' : ''}`}
              {' · '}{it.downloads} download{it.downloads === 1 ? '' : 's'}
              {it.refunded && <span className="ml-1.5 text-[#931020]">· refunded</span>}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap items-center gap-3">
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
        {!order.refunded && order.paymentId && (
          <>
            <button
              onClick={() => act('refund')}
              disabled={busy !== null || undownloaded.length === 0}
              title={undownloaded.length === 0 ? 'All items downloaded — nothing to refund' : undefined}
              className={`${refundBase} ${refundDefaultUndl ? refundPrimary : refundSecondary}`}
            >
              {busy === 'refund' ? 'Refunding…' : `Refund undownloaded${undownloaded.length ? ` (${undownloaded.length})` : ''}`}
            </button>
            <button
              onClick={() => act('refund-full')}
              disabled={busy !== null}
              className={`${refundBase} ${refundDefaultUndl ? refundSecondary : refundPrimary}`}
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
