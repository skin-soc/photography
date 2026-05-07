import type { MetadataRoute } from 'next'
import { buildSitemapEntries } from '@/i18n/seo'

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemapEntries()
}
