'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

/**
 * Footer help line on the downloads page. The "contact us" phrase is a branded
 * link that opens our standard contact form in a modal, pre-filled with the
 * order code as the email subject so we can tie a help request to the order.
 * Submits to the same Formspree endpoint as the site contact form.
 */
export default function DownloadsHelp({ orderId }: { orderId: string }) {
  const t = useTranslations('downloads')
  const tf = useTranslations('about.form')
  const [open, setOpen] = useState(false)
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
    borderBottom: '1px solid rgba(255,255,255,0.15)',
    color: '#fff', fontSize: '13px', fontWeight: 300,
    letterSpacing: '0.04em', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <>
      <p className="mt-12 text-[11px] font-light text-foreground/25 leading-relaxed">
        {t.rich('footerHelp', {
          link: (chunks) => (
            <button
              type="button"
              onClick={() => { setStatus('idle'); setOpen(true) }}
              className="text-[#931020] hover:text-white transition-colors underline-offset-2"
            >
              {chunks}
            </button>
          ),
        })}
      </p>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.78)' }}
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full rounded-[20px] border border-foreground/10"
            style={{ maxWidth: '420px', margin: '0 16px', backgroundColor: '#0c0c0c', padding: '28px 28px 24px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button" onClick={() => setOpen(false)} aria-label="Close"
              style={{
                position: 'absolute', top: '16px', right: '20px',
                background: 'none', border: 'none', padding: 0,
                cursor: 'pointer', color: 'rgba(255,255,255,0.35)',
                fontSize: '22px', lineHeight: 1, transition: 'color 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#fff' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)' }}
            >×</button>

            <p style={{ fontSize: '9px', fontWeight: 300, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#fff', marginBottom: '4px' }}>
              {t('contactTitle')}
            </p>
            <p style={{ fontSize: '13px', fontWeight: 300, letterSpacing: '0.02em', color: 'rgba(255,255,255,0.45)', marginBottom: '22px' }}>
              {orderId}
            </p>

            {status === 'success' ? (
              <p style={{ fontSize: '11px', fontWeight: 300, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)' }}>
                {tf('success')}
              </p>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <input type="hidden" name="_subject" value={`Download help — ${orderId}`} />
                <input type="hidden" name="order" value={orderId} />
                <input type="text"  name="name"    placeholder={tf('name')}    required style={fieldStyle} />
                <input type="email" name="email"   placeholder={tf('email')}   required style={fieldStyle} />
                <textarea           name="message" placeholder={tf('message')}
                  style={{ ...fieldStyle, minHeight: '80px', resize: 'none' }} />
                <button
                  type="submit" disabled={status === 'sending'}
                  style={{
                    alignSelf: 'flex-start', marginTop: '6px',
                    fontSize: '9px', fontWeight: 300, letterSpacing: '0.22em', textTransform: 'uppercase',
                    color: status === 'sending' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.55)',
                    backgroundColor: 'transparent', border: 'none',
                    cursor: status === 'sending' ? 'default' : 'pointer',
                    padding: '4px 0', transition: 'color 0.3s',
                  }}
                  onMouseEnter={(e) => { if (status !== 'sending') e.currentTarget.style.color = '#fff' }}
                  onMouseLeave={(e) => { if (status !== 'sending') e.currentTarget.style.color = 'rgba(255,255,255,0.55)' }}
                >
                  {status === 'sending' ? tf('sending') : tf('send')}
                </button>
                {status === 'error' && (
                  <p style={{ fontSize: '9px', fontWeight: 300, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,100,100,0.7)', margin: 0 }}>
                    {tf('error')}
                  </p>
                )}
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
