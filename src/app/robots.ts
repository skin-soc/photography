import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/i18n/seo'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Keep crawl budget on sellable content: skip the admin app, API routes,
        // and per-order pages (post-purchase, not indexable content).
        disallow: ['/admin', '/api/', '/shop/downloads/', '/shop/order-complete', '/*/shop/downloads/', '/*/shop/order-complete'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
