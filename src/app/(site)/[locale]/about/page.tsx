'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import GalleryStack, { GalleryItem } from '@/app/components/GalleryStack'
import GalleryFooter from '@/app/components/GalleryFooter'

const B = '/images'

/* ── Gear gallery items ───────────────────────────────────────────────────── */
const gearItems: GalleryItem[] = [
  {
    type: 'triple', images: [
      { src: `${B}/gear.00018.jpg`, alt: 'Camera gear', w: 934,  h: 960,  fx: 50, fy: 50 },
      { src: `${B}/gear.00017.jpg`, alt: 'Camera gear', w: 870,  h: 960,  fx: 50, fy: 50 },
      { src: `${B}/gear.00016.jpg`, alt: 'Camera gear', w: 715,  h: 960,  fx: 50, fy: 50 },
    ]
  },
  {
    type: 'pair', images: [
      { src: `${B}/gear.00014.jpg`, alt: 'Camera gear', w: 960,  h: 720,  fx: 50, fy: 50 },
      { src: `${B}/gear.00010.jpg`, alt: 'Camera gear', w: 960,  h: 720,  fx: 50, fy: 50 },
    ]
  },  {
    type: 'pair', images: [
      { src: `${B}/gear.00002.jpg`, alt: 'Camera gear', w: 960,  h: 720,  fx: 50, fy: 50 },
      { src: `${B}/gear.00012.jpg`, alt: 'Camera gear', w: 960,  h: 720,  fx: 50, fy: 50 },
    ]
  },
  {
    type: 'pair', images: [
      { src: `${B}/gear.00005.jpg`, alt: 'Camera gear', w: 960,  h: 720,  fx: 50, fy: 50 },
      { src: `${B}/gear.00004.jpg`, alt: 'Camera gear', w: 960,  h: 720,  fx: 50, fy: 50 },
    ]
  },
  {
    type: 'triple', images: [
      { src: `${B}/gear.00009.jpg`, alt: 'Camera gear', w: 1200, h: 900,  fx: 50, fy: 50 },
      { src: `${B}/gear.00008.jpg`, alt: 'Camera gear', w: 960,  h: 720,  fx: 50, fy: 50 },
      { src: `${B}/gear.00001.jpg`, alt: 'Camera gear', w: 1248,  h: 718, fx: 10, fy: 50 },
    ]
  },
]

const galleryItems: GalleryItem[] = [
  // Hero — Gus in the Solomon Islands, subject left-of-centre
  { type: 'single', src: `${B}/gus-travels.jpg`, alt: 'Gus McEwan on location', w: 3200, h: 2133, fx: 20, fy: 75 },
  ...gearItems,
]

/* ── Contact form card ────────────────────────────────────────────────────── */
function ContactFormCard() {
  const t = useTranslations('about')
  const tf = useTranslations('about.form')
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')

  const fieldStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '8px 0',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '1px solid rgb(var(--fg) / 0.12)',
    color: 'rgb(var(--fg))',
    fontSize: '13px',
    fontWeight: 300,
    letterSpacing: '0.04em',
    outline: 'none',
    boxSizing: 'border-box',
  }

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
    } catch { setStatus('error') }
  }

  return (
    <div className="overflow-hidden rounded-[20px] border border-foreground/10 shadow-[0_28px_64px_-26px_rgba(0,0,0,0.6)]">
      {/* Card header */}
      <div className="bg-foreground/[0.07] px-5 py-3">
        <p className="text-[11px] font-light tracking-[0.22em] uppercase text-accent">
          {t('contactHeading')}
        </p>
      </div>

      {/* Intro */}
      <div className="px-5 pt-4 pb-4 border-b border-foreground/[0.06]">
        <p className="text-[13px] font-light tracking-[0.04em] text-foreground/60 leading-relaxed">
          {t('contactIntro')}
        </p>
      </div>

      {/* Form body */}
      <div className="px-5 pt-4 pb-5">
        {status === 'success' ? (
          <p className="text-[11px] font-light tracking-[0.18em] uppercase text-accent/70 py-4">
            {tf('success')}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="text" name="name" placeholder={tf('name')} required
              style={fieldStyle}
            />
            <input
              type="email" name="email" placeholder={tf('email')} required
              style={fieldStyle}
            />
            <textarea
              name="message" placeholder={tf('message')} required
              style={{ ...fieldStyle, minHeight: '100px', resize: 'none', paddingBottom: '12px' }}
            />

            <div className="flex items-center justify-between mt-1">
              <button
                type="submit"
                disabled={status === 'sending'}
                className={`rounded-full px-6 py-2 text-[11px] font-light tracking-[0.18em] uppercase transition-opacity ${
                  status === 'sending'
                    ? 'bg-accent/40 text-white cursor-default'
                    : 'bg-accent text-white hover:opacity-90'
                }`}
              >
                {status === 'sending' ? tf('sending') : tf('send')}
              </button>

              {status === 'error' && (
                <p className="text-[10px] font-light tracking-[0.14em] uppercase text-red-400/80">
                  {tf('error')}
                </p>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function About() {
  const t = useTranslations('about')
  const tp = useTranslations('pages.about')
  return (
    <main className="pt-[calc(6vw+46px)]">
      <h1 className="sr-only">{tp('h1')}</h1>

      {/* ── Bio + contact form ─────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-start px-[6vw] pt-10 md:pt-20 pb-28 gap-10 md:gap-0 max-w-[1480px] mx-auto w-full">

        {/* Bio */}
        <div className="md:w-[55%] md:pe-12" style={{
          flex: '0 0 55%',
          position: 'relative',
          zIndex: 1,
          overflow: 'hidden',
          pointerEvents: 'none'
        }}>
          <p className="font-thin leading-[1.5] tracking-[0.02em] mb-5"
            style={{
              fontSize: 'clamp(1.25rem, 2.2vw, 1.75rem)',
              color: 'rgb(var(--fg) / 0.78)',
              textAlign: 'end',
              pointerEvents: 'none'
            }}>
            {t('bio1')}
          </p>
          <p className="font-thin leading-[1.5] tracking-[0.02em] mb-5"
            style={{
              fontSize: 'clamp(1.25rem, 2.2vw, 1.75rem)',
              color: 'rgb(var(--fg) / 0.78)',
              textAlign: 'end',
              pointerEvents: 'none'
            }}>
            {t('bio2')}
          </p>
          <p className="font-thin leading-[1.5] tracking-[0.02em]"
            style={{
              fontSize: 'clamp(1.25rem, 2.2vw, 1.75rem)',
              color: 'rgb(var(--fg) / 0.78)',
              textAlign: 'end',
              pointerEvents: 'none'
            }}>
            {t('bio3')}
          </p>
        </div>

        {/* Contact */}
        <div className="md:w-[45%] md:ps-12" style={{
          flex: '0 0 45%',
          position: 'relative',
          zIndex: 10,
          pointerEvents: 'auto'
        }}>
          <ContactFormCard />
        </div>
      </div>

      {/* ── Hero + gear gallery ────────────────────────────────────────── */}
      <GalleryStack items={galleryItems} enableLightbox={false}/>

      <GalleryFooter />
    </main>
  )
}