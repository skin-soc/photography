'use client'

import { useState } from 'react'
import LicensingModal from './LicensingModal'

/** Inline anchor-styled button that opens the licensing modal. */
export default function LicensingLink({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="underline underline-offset-2 decoration-white/20 hover:text-foreground/55 transition-colors"
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', font: 'inherit' }}
      >
        {children}
      </button>
      {open && <LicensingModal mode="view" onClose={() => setOpen(false)} />}
    </>
  )
}
