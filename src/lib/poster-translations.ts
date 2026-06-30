/**
 * Poster text translations — locale-specific title + caption for each poster
 * photo, stored in KV and used by both the shop preview (PosterMat) and the
 * print compositor (renderPosterMaster on the NAS origin).
 *
 * Only posters (product type 'print') have typed text on the sheet. Fine art
 * and digital products are unaffected.
 *
 * Structure: { [photoId]: { [locale]: { title, caption? } } }
 * English ('en') is the fallback when a locale entry is absent.
 */

/** A single locale's text for one poster. */
export interface PosterLocaleText {
  title: string
  caption?: string
}

/** All translations for all posters: photoId → locale → text. */
export type PosterTranslations = Record<string, Record<string, PosterLocaleText>>

/**
 * Merge saved translations with the English source (from the catalog), so every
 * photo always has an 'en' entry that reflects current Lightroom metadata even
 * when the KV store has never been written.
 *
 * If a photo's ID has no saved entry (e.g. the master file was renamed), we
 * fall back to matching by English title against orphaned saved entries — so
 * translations survive file renames automatically.
 */
export function mergeWithSource(
  saved: PosterTranslations,
  source: { id: string; title: string; caption?: string }[],
): PosterTranslations {
  const liveIds = new Set(source.map((p) => p.id))
  // Orphaned entries: saved keys that no longer match any live photo ID.
  // Index them by their stored English title for fallback matching.
  const orphansByTitle = new Map<string, Record<string, PosterLocaleText>>()
  for (const [id, locales] of Object.entries(saved)) {
    if (!liveIds.has(id)) {
      const enTitle = locales['en']?.title
      if (enTitle) orphansByTitle.set(enTitle, locales)
    }
  }

  const merged: PosterTranslations = {}
  for (const ph of source) {
    // Direct match by ID (normal case).
    let locales = saved[ph.id] ? { ...saved[ph.id] } : undefined
    // Fallback: recover translations from a renamed file via title match.
    if (!locales) locales = orphansByTitle.has(ph.title) ? { ...orphansByTitle.get(ph.title)! } : {}
    // 'en' is always the live Lightroom value.
    locales['en'] = { title: ph.title, caption: ph.caption }
    merged[ph.id] = locales
  }
  return merged
}

/**
 * Resolve a single poster's text for a given locale. Falls back to English
 * when the locale is absent or incomplete. `source` is the raw catalog values.
 */
export function resolveText(
  translations: PosterTranslations,
  photoId: string,
  locale: string,
  source: { title: string; caption?: string },
): PosterLocaleText {
  if (locale === 'en') return { title: source.title, caption: source.caption }
  const localeEntry = translations[photoId]?.[locale]
  if (localeEntry?.title) return localeEntry
  return { title: source.title, caption: source.caption }
}
