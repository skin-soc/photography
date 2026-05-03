import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Images served from /public/images — no next/image optimisation needed.
  // We use plain <picture>/<img> with WebP source for full control and protection.
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        // Apply to all image files in /images/gallery/
        source: '/images/gallery/:path*',
        headers: [
          // Block hotlinking: only allow images to load from our own origin
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'",
          },
          // Prevent caching on other origins from persisting
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // Tell browsers not to sniff the content type
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          // Cache images aggressively on the user's browser (immutable)
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },
}

export default nextConfig
