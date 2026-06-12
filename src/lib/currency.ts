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

/** Used only if the ECB feed is unreachable. Refresh occasionally. The EUR rate
 *  reflects the DKK↔EUR peg (~7.46 DKK/EUR ⇒ ~0.134 EUR/DKK), so it also serves
 *  as the dev-mock conversion for cost-plus poster pricing. */
export const FALLBACK_RATES: Rates = { EUR: 0.134, USD: 0.145, GBP: 0.115 }

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

/**
 * Buffer applied when converting a EUR cost to a DKK client price. DKK is pegged
 * to the euro (drift < ~0.3%), so this exists mainly to absorb **Stripe's FX
 * spread** (~1–2%) on the DKK→EUR Issuing top-up that pays Prodigi — not market
 * movement. See docs/fap-print-fulfilment.md §2.
 */
export const EUR_DKK_BUFFER = 1.03

/**
 * Convert a EUR amount (minor units / cents) to DKK øre for a client-facing
 * price, via the ECB daily rate already in `rates` (rates.EUR = EUR per DKK, so
 * DKK-per-EUR = 1 / rates.EUR), with the FX buffer applied. Used for the live
 * Prodigi shipping line at checkout (print prices are baked at catalog-build).
 */
export function eurToDkkOre(eurMinor: number, rates: Rates, buffer = EUR_DKK_BUFFER): number {
  if (!rates.EUR) return 0
  const dkkPerEur = 1 / rates.EUR
  return Math.round(eurMinor * dkkPerEur * buffer)
}

/**
 * Round an øre amount UP to the next whole 5 kroner (500 øre) — the shop's
 * listing-price convention, applied to every final customer-facing price so
 * they always end in 0 or 5 (e.g. 13472 → 13500 / "135 kr", 18862 → 19000 /
 * "190 kr"). Rounding only ever raises the price, so the cost floor still holds.
 */
export function roundUpToFiveKr(ore: number): number {
  return Math.ceil(ore / 500) * 500
}

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
