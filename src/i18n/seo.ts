import { routing, type Locale } from './routing'

export const SITE_URL = 'https://gusmcewan.com'

// All routes that exist under [locale]/ — keep in sync with the app dir.
export const ROUTES = ['/', '/about', '/people', '/places', '/nature'] as const
export type Route = (typeof ROUTES)[number]

function localizedUrl(locale: Locale, path: Route): string {
  const prefix = locale === routing.defaultLocale ? '' : `/${locale}`
  const suffix = path === '/' ? '' : path
  return `${SITE_URL}${prefix}${suffix}`
}

export function buildLanguagesMap(path: Route): Record<string, string> {
  const map: Record<string, string> = {}
  for (const l of routing.locales) {
    map[l] = localizedUrl(l, path)
  }
  map['x-default'] = `${SITE_URL}${path === '/' ? '' : path}`
  return map
}

export function buildSitemapEntries() {
  return ROUTES.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: localizedUrl(locale, path),
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: path === '/' ? 1.0 : 0.8,
      alternates: { languages: buildLanguagesMap(path) },
    })),
  )
}
