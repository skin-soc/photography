import type { Metadata } from 'next'
import { Cormorant_Garamond } from 'next/font/google'
import Nav from './components/Nav'
import './globals.css'

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Gus McEwan Photography',
  description: 'Photographer based between Copenhagen and London.',

  icons: {
    // Primary: SVG for modern browsers
    icon: [
      {
        url: '/images/favicon.svg',
        type: 'image/svg+xml',   // Important
        sizes: 'any',            // Allows any size (SVG advantage)
      },
      {
        url: '/images/favicon.ico',
        sizes: '32x32',          // or 'any'
      },
    ],
  },
  apple: '/images/apple-touch-icon.png', // if you have one

  openGraph: {
    title: 'Gus McEwan Photography',
    description: 'Photographer based between Copenhagen and London.',
    url: 'https://gusmcewan.com',
    siteName: 'Gus McEwan Photography',
    locale: 'en_GB',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cormorant.variable}>
      <body className="bg-black text-white antialiased">
        <Nav />
        {children}
      </body>
    </html>
  )
}
