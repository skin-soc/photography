/**
 * Currency.
 *
 * The shop charges in Danish kroner (DKK) — the company is a Danish
 * VAT-registered entity. Prices are stored in øre (1 kr = 100 øre) to match
 * Stripe's minor-unit convention.
 *
 * Alongside the DKK price the shop shows an approximate EUR/USD/GBP figure so
 * visitors anywhere have a familiar reference. Rates come from the European
 * Central Bank daily reference feed (free, no key), cached 24h, with a static
 * fallback so a feed outage never breaks the page.
 */

export type RefCurrency = 'EUR' | 'USD' | 'GBP'

/** Units of the reference currency per 1 DKK. */
export type Rates = Record<RefCurrency, number>

/** Used only if the ECB feed is unreachable. Refresh occasionally. */
const FALLBACK_RATES: Rates = { EUR: 0.134, USD: 0.145, GBP: 0.115 }

const ECB_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'

/** Fetch DKK→EUR/USD/GBP rates from the ECB (cached 24h), or fall back. */
export async function getRates(): Promise<Rates> {
  try {
    const res = await fetch(ECB_URL, { next: { revalidate: 86400 } })
    if (!res.ok) throw new Error(`ecb responded ${res.status}`)
    const xml = await res.text()
    const rate = (code: string): number | null => {
      const m = xml.match(
        new RegExp(`currency=['"]${code}['"]\\s+rate=['"]([0-9.]+)['"]`),
      )
      return m ? Number(m[1]) : null
    }
    // ECB quotes everything per 1 EUR — convert to "per 1 DKK".
    const dkk = rate('DKK')
    const usd = rate('USD')
    const gbp = rate('GBP')
    if (!dkk || !usd || !gbp) throw new Error('ecb feed missing a rate')
    return { EUR: 1 / dkk, USD: usd / dkk, GBP: gbp / dkk }
  } catch (err) {
    console.error('[currency] using fallback rates:', err)
    return FALLBACK_RATES
  }
}

const dkkFractional = new Intl.NumberFormat('da-DK', {
  style: 'currency',
  currency: 'DKK',
  maximumFractionDigits: 2,
})
const dkkWhole = new Intl.NumberFormat('da-DK', {
  style: 'currency',
  currency: 'DKK',
  maximumFractionDigits: 0,
})

/** Format an øre amount as a DKK price, e.g. 19500 → "195 kr." */
export function formatDKK(ore: number): string {
  const kr = ore / 100
  return (kr % 1 === 0 ? dkkWhole : dkkFractional).format(kr)
}

/** Approximate reference figure, e.g. "£22 · €26 · $28" (rounded). */
export function approxLine(ore: number, rates: Rates): string {
  const kr = ore / 100
  return [
    `£${Math.round(kr * rates.GBP)}`,
    `€${Math.round(kr * rates.EUR)}`,
    `$${Math.round(kr * rates.USD)}`,
  ].join(' · ')
}
