import type { Metadata } from 'next'
import { Cormorant_Garamond, IBM_Plex_Mono, Space_Mono } from 'next/font/google'
import '@/app/globals.css'

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
})

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['200', '300', '400'],
  variable: '--font-mono-ibm',
  display: 'swap',
})

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-mono-space',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Studio Admin · Gus McEwan Photography',
  robots: { index: false, follow: false },
}

/**
 * Root layout for the admin route group — bare shell (no site nav, cart, or
 * i18n), but loads the same brand fonts so the tools match the site.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${cormorant.variable} ${ibmPlexMono.variable} ${spaceMono.variable}`}
    >
      <body className="bg-black text-white antialiased min-h-screen">{children}</body>
    </html>
  )
}
