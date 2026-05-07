import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Images served from /public/images — no next/image optimisation needed.
  // We use plain <picture>/<img> with WebP source for full control and protection.
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/images/gallery/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "default-src 'self'" },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ]
  },
}

export default withNextIntl(nextConfig)
