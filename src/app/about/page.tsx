'use client'

import { useState } from 'react'
import GalleryStack, { GalleryItem } from '../components/GalleryStack'
import GalleryFooter from '../components/GalleryFooter'

const B = '/images'

/* ── Gear gallery items ───────────────────────────────────────────────────── */
const gearItems: GalleryItem[] = [
  {
    type: 'triple', images: [
      { src: `${B}/gear.00018.jpg`, alt: 'Camera gear', w: 3000, h: 2000 },
      { src: `${B}/gear.00017.jpg`, alt: 'Camera gear', w: 3000, h: 2000 },
      { src: `${B}/gear.00016.jpg`, alt: 'Camera gear', w: 3000, h: 2000 },
    ]
  },
  {
    type: 'triple', images: [
      { src: `${B}/gear.00015.jpg`, alt: 'Camera gear', w: 3000, h: 2000 },
      { src: `${B}/gear.00014.jpg`, alt: 'Camera gear', w: 3000, h: 2000 },
      { src: `${B}/gear.00013.jpg`, alt: 'Camera gear', w: 3000, h: 2000 },
    ]
  },
  {
    type: 'triple', images: [
      { src: `${B}/gear.00012.jpg`, alt: 'Camera gear', w: 3000, h: 2000 },
      { src: `${B}/gear.00011.jpg`, alt: 'Camera gear', w: 3000, h: 2000 },
      { src: `${B}/gear.00010.jpg`, alt: 'Camera gear', w: 3000, h: 2000 },
    ]
  },
  {
    type: 'triple', images: [
      { src: `${B}/gear.00009.jpg`, alt: 'Camera gear', w: 3000, h: 2000 },
      { src: `${B}/gear.00008.jpg`, alt: 'Camera gear', w: 3000, h: 2000 },
      { src: `${B}/gear.00007.jpg`, alt: 'Camera gear', w: 3000, h: 2000 },
    ]
  },
  {
    type: 'triple', images: [
      { src: `${B}/gear.00006.jpg`, alt: 'Camera gear', w: 3000, h: 2000 },
      { src: `${B}/gear.00005.jpg`, alt: 'Camera gear', w: 3000, h: 2000 },
      { src: `${B}/gear.00004.jpg`, alt: 'Camera gear', w: 3000, h: 2000 },
    ]
  },
  {
    type: 'triple', images: [
      { src: `${B}/gear.00003.jpg`, alt: 'Camera gear', w: 3000, h: 2000 },
      { src: `${B}/gear.00002.jpg`, alt: 'Camera gear', w: 3000, h: 2000 },
      { src: `${B}/gear.00001.jpg`, alt: 'Camera gear', w: 3000, h: 2000 },
    ]
  },
]

const galleryItems: GalleryItem[] = [
  { type: 'single', src: `${B}/gus-travels.jpg`, alt: 'Gus McEwan on location', w: 4800, h: 2700 },
  ...gearItems,
]

/* ── Contact form ─────────────────────────────────────────────────────────── */
function ContactForm() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')

  const inputStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '4px 0 12px 0',
    minHeight: '48px',
    height: '48px',
    boxSizing: 'border-box',
    WebkitAppearance: 'none',
    backgroundColor: 'transparent',
    borderBottom: '1px solid rgba(255, 255, 255, 0.15)',
    borderLeft: 'none',
    borderTop: 'none',
    borderRight: 'none',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 300,
    letterSpacing: '0.04em',
    outline: 'none',
    cursor: 'text',
    transition: 'border-color 0.3s ease',
  }

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    fontFamily: 'inherit',
    resize: 'none',
    minHeight: '100px',
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
      <div className="flex flex-col md:flex-row md:items-start px-6 md:px-10 pt-20 pb-28 gap-10 md:gap-0">

        {/* Left: bio */}
        <div className="md:w-[55%] md:pr-12" style={{ position: 'relative', zIndex: 1, pointerEvents: 'none' }}>
          <p
            className="font-serif leading-[1.45] tracking-wide text-white font-light mb-5"
            style={{ fontSize: 'clamp(1.25rem, 2.2vw, 1.75rem)', textAlign: 'right' }}
          >
            Gus McEwan is a photographer based between Copenhagen and London.
          </p>
          <p
            className="font-serif leading-[1.45] tracking-wide text-white font-light"
            style={{ fontSize: 'clamp(1.25rem, 2.2vw, 1.75rem)', textAlign: 'right' }}
          >
            His work spans people, places, and the natural worlds.<br />
            Drawn to light, stillness, and the space between moments.
          </p>
        </div>

        {/* Right: contact */}
        <div className="md:w-[45%] md:pl-12 md:border-l md:border-white/10" style={{ position: 'relative', zIndex: 10, pointerEvents: 'auto' }}>
          <p className="text-[9px] font-light tracking-[0.22em] uppercase text-white mb-3">
            Contact
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