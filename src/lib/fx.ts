/**
 * Official DKK→EUR conversion using Danmarks Nationalbank daily rates.
 *
 * For the EU OSS distance-selling threshold (€10,000/yr of cross-border B2C
 * supplies, excluding VAT) we must value DKK sales in EUR at the official
 * exchange rate on each transaction's date. Danmarks Nationalbank publishes the
 * daily rate (DKK per 100 EUR, business days only), mirrored in Statistics
 * Denmark's StatBank table DNVALD, which is queryable without auth.
 *
 * We fetch a whole year's daily series in one request and cache it, then map
 * each order to the rate for its date (nearest on-or-before business day, so
 * weekends/holidays and the ~1-day publication lag fall back to the last
 * published rate). SERVER-SIDE ONLY. See [[manual-vat-approach]].
 */

const STATBANK_URL = 'https://api.statbank.dk/v1/data/DNVALD/CSV'

export interface EurRate {
  /** ISO date, e.g. '2026-06-03'. */
  date: string
  /** DKK per 100 EUR, e.g. 747.39. */
  dkkPer100Eur: number
}

/** Parse 'YYYYMMDD'-style StatBank time code (e.g. '2026M06D03') → '2026-06-03'. */
function parseTidCode(code: string): string | null {
  const m = /^(\d{4})M(\d{2})D(\d{2})$/.exec(code.trim())
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/**
 * Fetch every published EUR rate for a calendar year, ascending by date.
 * Cached for a day (rates for past dates never change; today's appears once
 * published). Returns [] if the source is unavailable.
 */
export async function fetchEurRatesForYear(year: number): Promise<EurRate[]> {
  const tid = encodeURIComponent(`>=${year}M01D01`)
  const url = `${STATBANK_URL}?VALUTA=EUR&KURTYP=KBH&Tid=${tid}`
  let text: string
  try {
    const res = await fetch(url, { next: { revalidate: 86400, tags: ['fx-eur'] } })
    if (!res.ok) return []
    text = await res.text()
  } catch {
    return []
  }

  const out: EurRate[] = []
  for (const line of text.split(/\r?\n/)) {
    // Columns: VALUTA;KURTYP;TID;INDHOLD  (semicolon-separated, decimal comma).
    const cols = line.split(';')
    if (cols.length < 4) continue
    const date = parseTidCode(cols[2])
    if (!date) continue // skips BOM/header and any stray rows
    const value = Number(cols[3].replace(/\./g, '').replace(',', '.'))
    if (Number.isFinite(value) && value > 0) out.push({ date, dkkPer100Eur: value })
  }
  out.sort((a, b) => (a.date < b.date ? -1 : 1))
  return out
}

/**
 * The rate to use for a given date: the published rate on that date, or the most
 * recent one before it (weekends/holidays/publication lag). Assumes `rates` is
 * ascending. Returns null if none on or before the date exist.
 */
export function rateForDate(rates: EurRate[], iso: string): number | null {
  let chosen: number | null = null
  for (const r of rates) {
    if (r.date <= iso) chosen = r.dkkPer100Eur
    else break
  }
  // Fall back to the earliest rate if the date predates the series (shouldn't
  // happen for same-year orders, but keeps the conversion total-safe).
  return chosen ?? (rates.length > 0 ? rates[0].dkkPer100Eur : null)
}

/** Convert a DKK amount in minor units (øre) to EUR (major units), given the
 *  day's DKK-per-100-EUR rate. */
export function dkkMinorToEur(minorDkk: number, dkkPer100Eur: number): number {
  return (minorDkk / 100) / (dkkPer100Eur / 100)
}
