import type { Metadata } from 'next'
import { Italiana } from 'next/font/google'
import Navigation from './components/Navigation'
import Footer from './components/Footer'
import './globals.css'

const italiana = Italiana({ 
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-italiana',
})

export const metadata: Metadata = {
  title: 'Gus McEwan Photography',
  description: 'Portfolio of Gus McEwan - People, places and nature',
  openGraph: {
    title: 'Gus McEwan Photography',
    description: 'Portfolio of Gus McEwan - People, places and nature',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    creator: '@gusmcewanphoto',
    title: 'Gus McEwan Photography',
    description: 'Portfolio of Gus McEwan - People, places and nature',
  },
  other: {
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
<head>
  <link rel="icon" type="image/svg+xml" href="/images/favicon.svg" />
  <link rel="icon" type="image/png" href="/images/favicon-96x96.png" sizes="96x96" />
  <link rel="shortcut icon" href="/images/favicon.ico" />
  <link rel="apple-touch-icon" sizes="180x180" href="/images/apple-touch-icon.png" />
  <meta name="apple-mobile-web-app-title" content="Gus McEwan" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="theme-color" content="transparent" />
  <link rel="manifest" href="/images/site.webmanifest" />
</head>
      <body className={`${italiana.className} bg-black text-white`}>
        <Navigation />
        <main className="min-h-screen">
          {children}
        </main>
        <Footer />
        <script dangerouslySetInnerHTML={{ __html: `
          window.addEventListener('scroll', function() {
            const nav = document.getElementById('main-nav');
            if (window.scrollY > window.innerHeight - 100) {
              nav.classList.add('bg-black/80', 'backdrop-blur-sm', 'border-white');
              nav.classList.remove('border-white/20');
            } else {
              nav.classList.remove('bg-black/80', 'backdrop-blur-sm', 'border-white');
              nav.classList.add('border-white/20');
            }
          });
        ` }} />
      </body>
    </html>
  )
}
