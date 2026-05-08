import { routing, type Locale } from './routing'

export const SITE_URL = 'https://gusmcewan.com'
export const PHOTOGRAPHER_NAME = 'Gus McEwan'
export const BUSINESS_NAME = 'Gus McEwan Photography'
export const CONTACT_EMAIL = 'hello@gusmcewan.com'

// All routes that exist under [locale]/ — keep in sync with the app dir.
export const ROUTES = ['/', '/about', '/people', '/places', '/nature'] as const
export type Route = (typeof ROUTES)[number]

export function localizedUrl(locale: Locale, path: Route): string {
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

export const OG_LOCALE_MAP: Record<string, string> = {
  en: 'en_GB',
  da: 'da_DK',
  sv: 'sv_SE',
  nb: 'nb_NO',
  fi: 'fi_FI',
  de: 'de_DE',
  nl: 'nl_NL',
  fr: 'fr_FR',
  es: 'es_ES',
  pt: 'pt_PT',
  it: 'it_IT',
  pl: 'pl_PL',
  ru: 'ru_RU',
  zh: 'zh_CN',
  ja: 'ja_JP',
  ko: 'ko_KR',
  ar: 'ar_AE',
}

/** Locale-specific keyword sets — focus on photographer + city queries. */
export const KEYWORDS: Record<string, string[]> = {
  en: [
    'photographer Copenhagen',
    'Copenhagen photographer',
    'London photographer',
    'portrait photographer Copenhagen',
    'wedding photographer Copenhagen',
    'editorial photographer',
    'fine art photography',
    'Gus McEwan',
    'Gus McEwan photography',
  ],
  da: [
    'fotograf København',
    'fotograf Kobenhavn',
    'københavnsk fotograf',
    'portrætfotograf København',
    'bryllupsfotograf København',
    'eventfotograf København',
    'fotograf til portræt',
    'professionel fotograf København',
    'Gus McEwan fotograf',
  ],
  sv: ['fotograf Köpenhamn', 'fotograf London', 'porträttfotograf', 'bröllopsfotograf', 'Gus McEwan'],
  nb: ['fotograf København', 'fotograf London', 'portrettfotograf', 'bryllupsfotograf', 'Gus McEwan'],
  fi: ['valokuvaaja Kööpenhamina', 'valokuvaaja Lontoo', 'muotokuvaaja', 'häävalokuvaaja', 'Gus McEwan'],
  de: ['Fotograf Kopenhagen', 'Fotograf London', 'Porträtfotograf', 'Hochzeitsfotograf Kopenhagen', 'Gus McEwan'],
  nl: ['fotograaf Kopenhagen', 'fotograaf Londen', 'portretfotograaf', 'bruidsfotograaf', 'Gus McEwan'],
  fr: ['photographe Copenhague', 'photographe Londres', 'photographe portrait', 'photographe mariage', 'Gus McEwan'],
  es: ['fotógrafo Copenhague', 'fotógrafo Londres', 'fotógrafo retrato', 'fotógrafo de bodas', 'Gus McEwan'],
  pt: ['fotógrafo Copenhaga', 'fotógrafo Londres', 'fotógrafo de retrato', 'fotógrafo de casamento', 'Gus McEwan'],
  it: ['fotografo Copenaghen', 'fotografo Londra', 'fotografo ritratto', 'fotografo matrimoni', 'Gus McEwan'],
  pl: ['fotograf Kopenhaga', 'fotograf Londyn', 'fotograf portretowy', 'fotograf ślubny', 'Gus McEwan'],
  ru: ['фотограф Копенгаген', 'фотограф Лондон', 'портретный фотограф', 'свадебный фотограф', 'Gus McEwan'],
  zh: ['哥本哈根摄影师', '伦敦摄影师', '人像摄影师', '婚礼摄影师', 'Gus McEwan'],
  ja: ['コペンハーゲン 写真家', 'ロンドン 写真家', 'ポートレート写真家', 'ウェディングフォトグラファー', 'Gus McEwan'],
  ko: ['코펜하겐 사진작가', '런던 사진작가', '인물 사진작가', '웨딩 사진작가', 'Gus McEwan'],
  ar: ['مصور كوبنهاغن', 'مصور لندن', 'مصور بورتريه', 'مصور أعراس', 'Gus McEwan'],
}

export function getKeywords(locale: string): string[] {
  return KEYWORDS[locale] ?? KEYWORDS.en
}

/** JSON-LD: identifies the photographer + business so Google understands
 *  WHO this site is about and that they operate out of Copenhagen + London. */
export function buildStructuredData(locale: string) {
  const url = locale === routing.defaultLocale ? SITE_URL : `${SITE_URL}/${locale}`
  const heroImage = `${SITE_URL}/images/gallery/PL00003.webp`

  const person = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': `${SITE_URL}/#person`,
    name: PHOTOGRAPHER_NAME,
    url: SITE_URL,
    image: heroImage,
    jobTitle: 'Photographer',
    description:
      'Photographer based between Copenhagen and London. Portrait, editorial, and fine art photography.',
    sameAs: [
      SITE_URL,
      'https://x.com/gusmcewanphoto',
      'https://www.saatchiart.com/gusmcewan',
      'https://www.modelmanagement.com/member/gus-mcewan',
      'https://www.modelmayhem.com/gusmcewan',
      'https://www.flickr.com/people/mcewangus/',
      'https://vero.co/gusmcewan',
    ],
    address: [
      { '@type': 'PostalAddress', addressLocality: 'Copenhagen', addressCountry: 'DK' },
      { '@type': 'PostalAddress', addressLocality: 'London', addressCountry: 'GB' },
    ],
  }

  const business = {
    '@context': 'https://schema.org',
    '@type': ['ProfessionalService', 'LocalBusiness'],
    '@id': `${SITE_URL}/#business`,
    name: BUSINESS_NAME,
    alternateName: ['Gus McEwan Fotograf', 'Fotograf Gus McEwan'],
    url: SITE_URL,
    image: heroImage,
    logo: `${SITE_URL}/images/logo.svg`,
    description:
      'Professional photography by Gus McEwan — portraits, places, and nature. Based between Copenhagen and London.',
    priceRange: '$$$',
    founder: { '@id': `${SITE_URL}/#person` },
    areaServed: [
      { '@type': 'City', name: 'Copenhagen' },
      { '@type': 'City', name: 'København' },
      { '@type': 'City', name: 'London' },
      { '@type': 'Country', name: 'Denmark' },
      { '@type': 'Country', name: 'United Kingdom' },
    ],
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Copenhagen',
      addressRegion: 'Hovedstaden',
      addressCountry: 'DK',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: 55.6761,
      longitude: 12.5683,
    },
    knowsAbout: [
      'Portrait photography',
      'Editorial photography',
      'Wedding photography',
      'Travel photography',
      'Nature photography',
      'Fine art photography',
    ],
    sameAs: [
      SITE_URL,
      'https://x.com/gusmcewanphoto',
      'https://www.saatchiart.com/gusmcewan',
      'https://www.modelmanagement.com/member/gus-mcewan',
      'https://www.modelmayhem.com/gusmcewan',
      'https://www.flickr.com/people/mcewangus/',
      'https://vero.co/gusmcewan',
    ],
  }

  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: SITE_URL,
    name: BUSINESS_NAME,
    inLanguage: locale,
    publisher: { '@id': `${SITE_URL}/#business` },
  }

  const webpage = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    url,
    inLanguage: locale,
    isPartOf: { '@id': `${SITE_URL}/#website` },
    about: { '@id': `${SITE_URL}/#person` },
    primaryImageOfPage: heroImage,
  }

  return [person, business, website, webpage]
}
