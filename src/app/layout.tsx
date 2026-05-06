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
    icon: [
      {
        url: '/images/favicon.svg',
        type: 'image/svg+xml',
        sizes: 'any',
      },
      {
        url: '/images/favicon.ico',
        sizes: '32x32',
      },
    ],
    apple: '/images/apple-touch-icon.png',
  },

  openGraph: {
    title: 'Gus McEwan Photography',
    description: 'Photographer based between Copenhagen and London.',
    url: 'https://gusmcewan.com',
    siteName: 'Gus McEwan Photography',
    locale: 'en_GB',
    type: 'website',
    images: [
      {
        url: 'https://gusmcewan.com/images/gallery/PL00003.webp',
        width: 3200,
        height: 1800,
        alt: 'Gus McEwan Photography',
      },
    ],
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