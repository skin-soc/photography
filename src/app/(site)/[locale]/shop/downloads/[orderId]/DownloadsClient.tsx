'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { OrderMetaItem } from '@/lib/downloads'

/** Human file size, e.g. 124 MB, 6.2 MB, 480 KB. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

export default function DownloadsClient({
  orderId,
  items,
  initiallyUnlocked,
}: {
  orderId: string
  items: OrderMetaItem[]
  initiallyUnlocked: boolean
}) {
  const t = useTranslations('downloads')
  const router = useRouter()
  const [unlocked, setUnlocked] = useState(initiallyUnlocked)
  const [passcode, setPasscode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Files are generated in the background right after purchase, so the larger
  // ones may not have a size yet on first load. Poll the server (re-runs the
  // page's getOrderMeta) every few seconds until every file reports a size,
  // so it fills in on its own — no manual refresh needed. Capped so we don't
  // poll forever if generation genuinely fails.
  const awaitingSizes = unlocked && items.some((i) => !i.bytes)
  useEffect(() => {
    if (!awaitingSizes) return
    let ticks = 0
    const id = setInterval(() => {
      ticks += 1
      router.refresh()
      if (ticks >= 15) clearInterval(id) // ~15 × 4s = 1 min ceiling
    }, 4000)
    return () => clearInterval(id)
  }, [awaitingSizes, router])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/downloads/${orderId}/unlock`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ passcode: passcode.trim() }),
      })
      if (res.ok) {
        setUnlocked(true)
      } else {
        setError(res.status === 401 ? t('passcodeIncorrect') : t('passcodeError'))
      }
    } catch {
      setError(t('passcodeNetworkError'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!unlocked) {
    return (
      <form onSubmit={submit} className="mt-2">
        <p className="text-[9px] font-light tracking-[0.22em] uppercase text-white/30 mb-4">
          {t('enterPasscode')}
        </p>
        <p className="text-[13px] font-light text-white/50 leading-relaxed mb-5">
          {t('passcodePrompt')}
        </p>
        <input
          type="text"
          inputMode="text"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          value={passcode}
          onChange={(e) => setPasscode(e.target.value.toUpperCase())}
          placeholder="XXXXXXXX"
          className="w-full max-w-[280px] rounded-[12px] border border-white/15 bg-white/[0.04] px-5 py-3 font-mono-ibm text-[18px] font-[200] tracking-[0.3em] text-white placeholder:text-white/20 focus:border-[#931020] focus:outline-none transition-colors"
        />
        {error && (
          <p className="mt-3 text-[12px] font-light text-[#931020]">{error}</p>
        )}
        <div className="mt-5">
          <button
            type="submit"
            disabled={submitting || passcode.trim().length === 0}
            className="text-[10px] font-light tracking-[0.22em] uppercase text-[#931020] hover:text-white disabled:text-white/20 transition-colors"
          >
            {submitting ? t('unlocking') : `${t('unlockDownloads')} →`}
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className="space-y-3 mt-2">
      <p className="text-[9px] font-light tracking-[0.22em] uppercase text-white/30 mb-4">
        {t('yourFiles')}
      </p>
      {items.map((item) => (
        <div
          key={item.sku}
          className="flex items-center justify-between gap-4 rounded-[16px] border border-white/10 bg-white/[0.04] px-6 py-5"
        >
          <div className="min-w-0">
            <p className="font-mono-ibm text-[18px] font-[400] tracking-wide text-[#931020] truncate">
              {item.filename}
            </p>
            <p className="mt-1 text-[11px] font-light tracking-wide text-white/30">
              {item.label} — {item.format === 'tiff' ? '16-bit TIFF' : 'JPEG'}
              {item.dimensions ? ` · ${item.dimensions.w} × ${item.dimensions.h} px` : ''}
              {item.bytes ? ` · ${formatBytes(item.bytes)}` : (
                <span className="italic text-white/20"> · preparing…</span>
              )}
            </p>
          </div>
          <a
            href={`/api/downloads/${orderId}/${encodeURIComponent(item.sku)}`}
            download
            className="shrink-0 text-[10px] font-light tracking-[0.18em] uppercase text-white/55 hover:text-white transition-colors"
          >
            {t('download')} →
          </a>
        </div>
      ))}
    </div>
  )
}
