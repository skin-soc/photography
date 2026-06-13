'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

export default function LicensingContactButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="underline underline-offset-2 decoration-white/20 hover:text-foreground/80 transition-colors"
      >
        contact us
      </button>
      {open && <ContactModal onClose={() => setOpen(false)} />}
    </>
  )
}

function ContactModal({ onClose }: { onClose: () => void }) {
  const t  = useTranslations('about.form')
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('sending')
    const form = e.currentTarget
    try {
      const res = await fetch('https://formspree.io/f/mykojgpp', {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
      })
      if (res.ok) { setStatus('success'); form.reset() }
      else setStatus('error')
    } catch {
      setStatus('error')
    }
  }

  const fieldStyle: React.CSSProperties = {
    display: 'block', width: '100%', padding: '4px 0 6px 0',
    backgroundColor: 'transparent', border: 'none',
    borderBottom: '1px solid rgb(var(--fg) / 0.15)',
    color: 'rgb(var(--fg))', fontSize: '13px', fontWeight: 300,
    letterSpacing: '0.04em', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.78)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full rounded-[20px] border border-foreground/10"
        style={{ maxWidth: '420px', margin: '0 16px', backgroundColor: 'rgb(var(--bg))', padding: '28px 28px 24px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          type="button" onClick={onClose} aria-label="Close"
          style={{
            position: 'absolute', top: '16px', right: '20px',
            background: 'none', border: 'none', padding: 0,
            cursor: 'pointer', color: 'rgb(var(--fg) / 0.35)',
            fontSize: '22px', lineHeight: 1, transition: 'color 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'rgb(var(--fg))' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgb(var(--fg) / 0.35)' }}
        >×</button>

        <p style={{ fontSize: '9px', fontWeight: 300, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgb(var(--fg) / 0.5)', marginBottom: '4px' }}>
          Gus McEwan Photography
        </p>
        <p style={{ fontSize: '13px', fontWeight: 300, letterSpacing: '0.02em', color: 'rgb(var(--fg) / 0.55)', marginBottom: '22px' }}>
          Custom licensing &amp; enquiries
        </p>

        {status === 'success' ? (
          <p style={{ fontSize: '11px', fontWeight: 300, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgb(var(--fg) / 0.55)' }}>
            Message sent — I&apos;ll be in touch shortly.
          </p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input type="hidden" name="_subject" value="Licensing enquiry" />
            <input type="text"  name="name"    placeholder={t('name')}    required style={fieldStyle} />
            <input type="email" name="email"   placeholder={t('email')}   required style={fieldStyle} />
            <textarea           name="message" placeholder={t('message')}
              style={{ ...fieldStyle, minHeight: '90px', resize: 'none' }} />
            <button
              type="submit" disabled={status === 'sending'}
              style={{
                alignSelf: 'flex-start', marginTop: '6px',
                fontSize: '9px', fontWeight: 300, letterSpacing: '0.22em', textTransform: 'uppercase',
                color: status === 'sending' ? 'rgb(var(--fg) / 0.25)' : 'rgb(var(--fg) / 0.55)',
                backgroundColor: 'transparent', border: 'none',
                cursor: status === 'sending' ? 'default' : 'pointer',
                padding: '4px 0', transition: 'color 0.3s',
              }}
              onMouseEnter={(e) => { if (status !== 'sending') e.currentTarget.style.color = 'rgb(var(--fg))' }}
              onMouseLeave={(e) => { if (status !== 'sending') e.currentTarget.style.color = 'rgb(var(--fg) / 0.55)' }}
            >
              {status === 'sending' ? t('sending') : t('send')}
            </button>
            {status === 'error' && (
              <p style={{ fontSize: '9px', fontWeight: 300, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,100,100,0.7)', margin: 0 }}>
                {t('error')}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
