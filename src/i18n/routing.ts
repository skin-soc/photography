import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['en', 'da', 'de', 'es', 'fr', 'it', 'nl', 'nb', 'pl', 'pt', 'fi', 'sv', 'ar', 'ru', 'zh', 'ja', 'ko'],
  defaultLocale: 'en',
  localePrefix: 'as-needed',
  localeDetection: true,
})

export type Locale = (typeof routing.locales)[number]
