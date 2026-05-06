'use client'

import { useState } from 'react'
import GalleryStack, { GalleryItem } from '../components/GalleryStack'
import GalleryFooter from '../components/GalleryFooter'

const B = '/images'

/* ── Gear gallery items ───────────────────────────────────────────────────── */
const gearItems: GalleryItem[] = [
  {
    type: 'triple', images: [
      { src: `${B}/gear.00018.jpg`, alt: 'Camera gear', w: 934,  h: 960,  fx: 50, fy: 50, noParallax: true },
      { src: `${B}/gear.00017.jpg`, alt: 'Camera gear', w: 870,  h: 960,  fx: 50, fy: 50, noParallax: true },
      { src: `${B}/gear.00016.jpg`, alt: 'Camera gear', w: 715,  h: 960,  fx: 50, fy: 50, noParallax: true },
    ]
  },
  {
    type: 'pair', images: [
      { src: `${B}/gear.00014.jpg`, alt: 'Camera gear', w: 960,  h: 720,  fx: 50, fy: 50, noParallax: true },
      { src: `${B}/gear.00010.jpg`, alt: 'Camera gear', w: 960,  h: 720,  fx: 50, fy: 50, noParallax: true },
    ]
  },  {
    type: 'pair', images: [
      { src: `${B}/gear.00002.jpg`, alt: 'Camera gear', w: 960,  h: 720,  fx: 50, fy: 50, noParallax: true },
      { src: `${B}/gear.00012.jpg`, alt: 'Camera gear', w: 960,  h: 720,  fx: 50, fy: 50, noParallax: true },
    ]
  },
  {
    type: 'pair', images: [
      { src: `${B}/gear.00005.jpg`, alt: 'Camera gear', w: 960,  h: 720,  fx: 50, fy: 50, noParallax: true },
      { src: `${B}/gear.00004.jpg`, alt: 'Camera gear', w: 960,  h: 720,  fx: 50, fy: 50, noParallax: true },
    ]
  },
  {
    type: 'triple', images: [
      { src: `${B}/gear.00009.jpg`, alt: 'Camera gear', w: 1200, h: 900,  fx: 50, fy: 50, noParallax: true },
      { src: `${B}/gear.00008.jpg`, alt: 'Camera gear', w: 960,  h: 720,  fx: 50, fy: 50, noParallax: true },
      { src: `${B}/gear.00001.jpg`, alt: 'Camera gear', w: 1248,  h: 718, fx: 10, fy: 50, noParallax: true },
    ]
  },
]

const galleryItems: GalleryItem[] = [
  // Hero — Gus in the Solomon Islands, subject left-of-centre
  { type: 'single', src: `${B}/gus-travels.jpg`, alt: 'Gus McEwan on location', w: 3200, h: 2133, fx: 20, fy: 45 },
  ...gearItems,
]

/* ── Contact form ─────────────────────────────────────────────────────────── */
function ContactForm() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')

  const inputStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '8px 0 10px 0',
    minHeight: '48px',
    height: '48px',
    boxSizing: 'border-box',
    backgroundColor: 'transparent',
    borderBottom: '1px solid rgba(255,255,255,0.2)',
    border: 'none',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 300,
    letterSpacing: '0.04em',
    outline: 'none',
    cursor: 'text',
  }

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    resize: 'none',
    minHeight: '120px',
    height: 'auto',
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

      if (res.ok) {
        setStatus('success')
        form.reset()
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <p
        style={{
          fontSize: '11px',
          fontWeight: 300,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'rgba(255, 255, 255, 0.55)',
        }}
      >
        Message sent.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <input type="text" name="name" placeholder="Name" required style={inputStyle} />
      <input type="email" name="email" placeholder="Email" required style={inputStyle} />
      <textarea name="message" placeholder="Message" required style={textareaStyle} />

      <button
        type="submit"
        disabled={status === 'sending'}
        style={{
          alignSelf: 'flex-start',
          fontSize: '9px',
          fontWeight: 300,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: status === 'sending' ? 'rgba(255,255,255,0.25)' : 'rgba(255, 255, 255, 0.55)',
          backgroundColor: 'transparent',
          border: 'none',
          cursor: status === 'sending' ? 'default' : 'pointer',
          padding: '4px 0',
          transition: 'color 0.3s ease',
        }}
        onMouseEnter={e => { if (status !== 'sending') e.currentTarget.style.color = '#ffffff' }}
        onMouseLeave={e => { if (status !== 'sending') e.currentTarget.style.color = 'rgba(255, 255, 255, 0.55)' }}
      >
        {status === 'sending' ? 'Sending…' : 'Send'}
      </button>

      {status === 'error' && (
        <p
          style={{
            fontSize: '9px',
            fontWeight: 300,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'rgba(255,100,100,0.7)',
            margin: 0,
          }}
        >
          Something went wrong. Please try again.
        </p>
      )}
    </form>
  )
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function About() {
  return (
    <main className="pt-[72px]">

      {/* ── Bio + contact form ─────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-start px-6 md:px-10 pt-20 pb-28 gap-10 md:gap-0 max-w-[1480px] mx-auto w-full">

        {/* Bio */}
        <div className="md:w-[55%] md:pr-12" style={{
          flex: '0 0 55%',
          position: 'relative',
          zIndex: 1,
          overflow: 'hidden',
          pointerEvents: 'none'
        }}>
          <p className="font-serif leading-[1.45] tracking-wide text-white font-light mb-5"
            style={{
              fontSize: 'clamp(1.25rem, 2.2vw, 1.75rem)',
              textAlign: 'right',
              pointerEvents: 'none'
            }}>
            Gus McEwan is a photographer based between Copenhagen and London.
          </p>
          <p className="font-serif leading-[1.45] tracking-wide text-white font-light mb-5"
            style={{
              fontSize: 'clamp(1.25rem, 2.2vw, 1.75rem)',
              textAlign: 'right',
              pointerEvents: 'none'
            }}>
            His work spans people, places, and the natural world — drawn to natural light, stillness, and the space between moments.
          </p>
          <p className="font-serif leading-[1.45] tracking-wide text-white font-light"
            style={{
              fontSize: 'clamp(1.25rem, 2.2vw, 1.75rem)',
              textAlign: 'right',
              pointerEvents: 'none'
            }}>
            Through his lens, he invites you to pause, feel, and remember.
          </p>
        </div>

        {/* Contact */}
        <div className="md:w-[45%] md:pl-12 md:border-l md:border-white/10" style={{
          flex: '0 0 45%',
          position: 'relative',
          zIndex: 10,
          pointerEvents: 'auto'
        }}>
          <p className="text-[9px] font-light tracking-[0.22em] uppercase text-white mb-3">Contact</p>
          <p className="text-[13px] font-light tracking-[0.04em] text-white/70 mb-6">
            Let's create something together. Drop me a line. Say hi. Ask a question. Or just say hello.
          </p>
          <ContactForm />
        </div>
      </div>

      {/* ── Hero + gear gallery ────────────────────────────────────────── */}
      <GalleryStack items={galleryItems} />

      <GalleryFooter />
    </main>
  )
}