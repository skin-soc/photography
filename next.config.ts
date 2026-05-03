import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'gusmcewan.com',
        pathname: '/images/**',
      },
    ],
  },
}

export default nextConfig
