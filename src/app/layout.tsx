import type { Metadata } from 'next'
import { Italiana } from 'next/font/google'
import Navigation from './components/Navigation'
import './globals.css'

const italiana = Italiana({ 
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-italiana',
})

export const metadata: Metadata = {
  title: 'Gus McEwan Photography',
  description: 'Professional photography portfolio of Gus McEwan: recording light and shadows',
  openGraph: {
    title: 'Gus McEwan Photography',
    description: 'Professional photography portfolio of Gus McEwan: recording light and shadows',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    creator: '@mcewangus',
    title: 'Gus McEwan Photography',
    description: 'Professional photography portfolio of Gus McEwan: recording light and shadows',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
      <link rel="icon" type="image/png" href="/images/favicon-96x96.png" sizes="96x96" />
      <link rel="icon" type="image/svg+xml" href="/images/favicon.svg" />
      <link rel="shortcut icon" href="/images/favicon.ico" />
      <link rel="apple-touch-icon" sizes="180x180" href="/images/apple-touch-icon.png" />
      <meta name="apple-mobile-web-app-title" content="Gus" />
      <link rel="manifest" href="/images/site.webmanifest" />
      </head>
      <body className={`${italiana.className} bg-white dark:bg-black text-black dark:text-white`}>
        <Navigation />
        <main className="min-h-screen">
          {children}
        </main>
        <footer className="border-t border-black dark:border-white py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center space-y-2">
              <p className="text-black dark:text-white text-sm md:text-base">Copyright © {new Date().getFullYear()} Gus McEwan Photography. All rights reserved.</p>
              <a 
                href="https://x.com/mcewangus" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="inline-block text-[#931020] hover:text-black dark:hover:text-white text-sm"
              >
                𝕏
              </a>
            </div>
          </div>
        </footer>
        <script dangerouslySetInnerHTML={{ __html: `
          window.addEventListener('scroll', function() {
            const nav = document.getElementById('main-nav');
            if (window.scrollY > window.innerHeight - 100) {
              nav.classList.add('bg-white/80', 'dark:bg-black/80', 'backdrop-blur-sm', 'border-black', 'dark:border-white');
              nav.classList.remove('border-white/20');
            } else {
              nav.classList.remove('bg-white/80', 'dark:bg-black/80', 'backdrop-blur-sm', 'border-black', 'dark:border-white');
              nav.classList.add('border-white/20');
            }
          });
        ` }} />
      </body>
    </html>
  )
} 
