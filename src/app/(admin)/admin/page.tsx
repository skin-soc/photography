'use client'

import { useState } from 'react'
import type { ReferenceLookup } from '@/lib/shop'
import Logo from '../_components/Logo'

type LookupResponse =
  | { found: true; result: ReferenceLookup }
  | { found: false }
  | { error: string }

export default function AdminLookup() {
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
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 sm:px-10 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Logo height={40} />
          <span className="hidden sm:inline text-[11px] font-mono-ibm uppercase tracking-[0.28em] text-white/40">
            Studio Admin
          </span>
        </div>
        <form method="post" action="/api/admin/logout">
          <button
            type="submit"
            className="text-[11px] font-mono-ibm uppercase tracking-[0.22em] text-white/40 transition-colors hover:text-white"
          >
            Sign out
          </button>
        </form>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-6 sm:px-10 py-12 sm:py-16">
        <h1 className="font-serif font-light text-4xl sm:text-5xl tracking-wide">
          Product lookup
        </h1>
        <p className="mt-2 text-sm text-white/45 max-w-prose">
          Enter a GMP reference or download token to find the original file and its preview.
        </p>

        {/* Search */}
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
            className="inline-flex items-center justify-center gap-2 min-w-[7rem] rounded-md bg-[#931020] px-5 py-3 text-[11px] font-mono-ibm uppercase tracking-[0.22em] text-white transition-colors hover:bg-[#a8131f] disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#931020] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            {loading ? <span className="admin-btn-spinner" aria-hidden /> : 'Find'}
          </button>
        </form>

        {/* States */}
        <div className="mt-12">
          {loading && (
            <div className="flex flex-col items-center py-16 text-white/40">
              <span className="shop-spinner" />
              <p className="mt-8 text-[11px] font-mono-ibm uppercase tracking-[0.28em]">
                Searching catalogue
              </p>
            </div>
          )}

          {!loading && errored && (
            <Notice tone="error" title="Lookup failed" body="Something went wrong. Please try again." />
          )}

          {!loading && notFound && (
            <Notice
              tone="muted"
              title="No match"
              body="No product in the catalogue matches that code. Check for typos."
            />
          )}

          {!loading && result && <ResultCard result={result} />}
        </div>
      </main>
    </div>
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
            value={
              result.category.length
                ? result.category.map((p) => p.join('  ›  ')).join('      ')
                : '—'
            }
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

function Row({
  label,
  value,
  mono,
  accent,
}: {
  label: string
  value: string
  mono?: boolean
  accent?: boolean
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-4 py-3.5">
      <dt className="text-[10px] font-mono-ibm uppercase tracking-[0.2em] text-white/35 pt-0.5">
        {label}
      </dt>
      <dd
        className={`break-all ${mono ? 'font-mono-ibm text-sm' : 'text-[15px]'} ${
          accent ? 'text-[#e0566a]' : 'text-white/90'
        }`}
      >
        {value}
      </dd>
    </div>
  )
}

function Notice({
  tone,
  title,
  body,
}: {
  tone: 'error' | 'muted'
  title: string
  body: string
}) {
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
