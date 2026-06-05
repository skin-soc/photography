'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { OrderMetaItem } from '@/lib/downloads'

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
  const [unlocked, setUnlocked] = useState(initiallyUnlocked)
  const [passcode, setPasscode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

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
            <p className="font-mono-ibm text-[18px] font-[200] tracking-wide text-[#931020] truncate">
              {item.filename}
            </p>
            <p className="mt-1 text-[11px] font-light tracking-wide text-white/30">
              {item.label} — {item.format === 'tiff' ? '16-bit TIFF' : 'JPEG'}
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
