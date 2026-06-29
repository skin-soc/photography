/**
 * Admin poster translations — GET the current state (catalog posters + saved
 * translations) and POST to save or auto-generate via Claude.
 * Session-gated.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'
import { getCatalog, photoTypes, displayTitle } from '@/lib/shop'
import { getPosterTranslations, setPosterTranslations } from '@/lib/shop-settings'
import type { PosterTranslations, PosterLocaleText } from '@/lib/poster-translations'
import { routing } from '@/i18n/routing'

async function authed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ADMIN_COOKIE)?.value
  return verifySessionToken(token, process.env.ADMIN_PASSWORD ?? '')
}

/** MyMemory langpair target codes for each of our locales.
 *  https://mymemory.translated.net — free, no key required. */
const MYMEMORY_LANG: Record<string, string> = {
  da: 'da-DK', de: 'de-DE', es: 'es-ES', fr: 'fr-FR', it: 'it-IT',
  nl: 'nl-NL', nb: 'no-NO', pl: 'pl-PL', pt: 'pt-PT', fi: 'fi-FI',
  sv: 'sv-SE', ar: 'ar-SA', ru: 'ru-RU', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR',
}

async function myMemoryTranslate(
  text: string, targetLang: string,
): Promise<{ result: string; error?: string }> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en-GB|${targetLang}`
  try {
    const res = await fetch(url)
    if (!res.ok) return { result: text, error: `HTTP ${res.status}` }
    const data = (await res.json()) as { responseData?: { translatedText?: string }; responseStatus?: number | string; responseDetails?: string }
    const status = Number(data.responseStatus)
    if (status !== 200) return { result: text, error: `status ${data.responseStatus}: ${data.responseDetails ?? ''}` }
    return { result: data.responseData?.translatedText ?? text }
  } catch (e) {
    return { result: text, error: String(e) }
  }
}

/** Poster source record returned to the UI alongside saved translations. */
export interface PosterSource {
  id: string
  ref: string
  title: string
  caption?: string
  previewUrl: string
}

export async function GET(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const catalog = await getCatalog()
  const posters: PosterSource[] = catalog
    .filter((p) => photoTypes(p).includes('print'))
    .map((p) => ({
      id: p.id,
      ref: displayTitle(p),
      title: p.title || p.id,
      caption: p.caption,
      previewUrl: p.previewUrl,
    }))

  const translations = await getPosterTranslations()

  return NextResponse.json({ posters, translations, locales: routing.locales })
}

export async function POST(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    action?: string
    translations?: PosterTranslations
    // generate action params
    photoId?: string
    title?: string
    caption?: string
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  if (body.action === 'save') {
    if (!body.translations || typeof body.translations !== 'object') {
      return NextResponse.json({ error: 'translations required' }, { status: 400 })
    }
    // Strip 'en' entries — English is always the live Lightroom value
    const clean: PosterTranslations = {}
    for (const [id, locales] of Object.entries(body.translations)) {
      const cleaned: Record<string, PosterLocaleText> = {}
      for (const [locale, text] of Object.entries(locales)) {
        if (locale !== 'en' && text?.title?.trim()) cleaned[locale] = text
      }
      if (Object.keys(cleaned).length > 0) clean[id] = cleaned
    }
    const ok = await setPosterTranslations(clean)
    return NextResponse.json({ ok }, { status: ok ? 200 : 502 })
  }

  // ── Auto-generate translations for one photo via MyMemory ────────────────
  if (body.action === 'generate') {
    const { photoId, title, caption } = body
    if (!photoId || !title) return NextResponse.json({ error: 'photoId and title required' }, { status: 400 })

    const targetLocales = routing.locales.filter((l) => l !== 'en')

    // Translate sequentially — CF Workers cap concurrent subrequests at 6,
    // so Promise.all across 16 locales × 2 strings deadlocks and gets canceled.
    const errors: string[] = []
    const generated: Record<string, PosterLocaleText> = {}
    for (const locale of targetLocales) {
      const lang = MYMEMORY_LANG[locale]
      if (!lang) { generated[locale] = { title }; continue }
      const titleResult = await myMemoryTranslate(title, lang)
      if (titleResult.error) errors.push(`${locale}: ${titleResult.error}`)
      const entry: PosterLocaleText = { title: titleResult.result }
      if (caption) {
        const captionResult = await myMemoryTranslate(caption, lang)
        if (captionResult.error) errors.push(`${locale}(caption): ${captionResult.error}`)
        entry.caption = captionResult.result
      }
      generated[locale] = entry
    }
    return NextResponse.json({ generated, errors: errors.length ? errors : undefined })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
