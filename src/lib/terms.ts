/**
 * Licensing Terms & Conditions for the invoice/receipt PDF.
 *
 * The terms live as the `licensing` namespace in the next-intl message files.
 * We snapshot them onto the order at purchase time (see the Stripe webhook) so
 * the receipt embeds the EXACT terms the buyer agreed to — an immutable record,
 * not whatever the live site says later.
 *
 * The invoice PDF is rendered on the origin with embedded Noto fonts covering
 * Latin + Cyrillic + Greek (Noto Sans) and Chinese/Japanese/Korean (Noto Sans
 * CJK). Only Arabic falls back to English: PDFKit can't do RTL/bidi reordering,
 * so Arabic would render mis-ordered (English is the governing-law language —
 * terms are governed by Danish law, drafted in English).
 */

import { routing } from '@/i18n/routing'

/** Locales the origin can't render correctly → fall back to English. Only
 *  Arabic (RTL/bidi, unsupported by PDFKit). */
const NON_LATIN = new Set(['ar'])

export type InvoiceTerms = Record<string, string> & { _locale?: string }

/**
 * Resolve the licensing namespace for a locale, falling back to English for
 * unsupported scripts or unknown locales. Returns `{}` if messages can't load
 * (the invoice then simply omits the terms page).
 */
export async function getInvoiceTerms(locale: string | null | undefined): Promise<InvoiceTerms> {
  const loc = locale ?? 'en'
  const supported = (routing.locales as readonly string[]).includes(loc) && !NON_LATIN.has(loc)
  const useLocale = supported ? loc : 'en'
  try {
    const messages = (await import(`../../messages/${useLocale}.json`)).default as Record<string, unknown>
    const licensing = (messages.licensing ?? {}) as Record<string, string>
    return { ...licensing, _locale: useLocale }
  } catch {
    return {}
  }
}
