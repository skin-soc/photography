/**
 * VAT jurisdiction logic — manual (non-Stripe-Tax) approach.
 *
 * The shop is registered for VAT in Denmark ONLY. While under the EU's
 * €10,000/yr cross-border B2C threshold, a Danish business legitimately charges
 * Danish VAT on ALL EU consumer sales (the "home country" simplification) and
 * files them on its normal DK return. So our rule is:
 *
 *   • Denmark        → DK VAT (default 25%), filed on the DK return.
 *   • EU (excl. DK)  → DK VAT too (under threshold) — but tracked SEPARATELY so
 *                      we can see when we're approaching the €10k OSS line.
 *   • Outside the EU → 0% (outside the scope of EU VAT for digital goods).
 *
 * Country comes from the buyer's IP (Cloudflare cf-ipcountry), reconciled in the
 * admin against the card-issuer country as second location evidence.
 *
 * This module is dependency-free so it can be imported on both the server
 * (checkout) and the client (Finances tab).
 */

export const HOME_COUNTRY = 'DK'

/** The 27 EU member states (ISO 3166-1 alpha-2). */
export const EU_COUNTRIES: ReadonlySet<string> = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
])

export function isEU(country?: string | null): boolean {
  return country ? EU_COUNTRIES.has(country.toUpperCase()) : false
}

export type VatJurisdiction = 'DK' | 'EU' | 'NON_EU' | 'UNKNOWN'

/**
 * Classify a buyer country into one of our three reporting buckets (plus
 * UNKNOWN when we have no country). DK and EU are both *taxable* at the home
 * rate while under the OSS threshold; NON_EU is 0%.
 */
export function vatJurisdiction(country?: string | null): VatJurisdiction {
  if (!country) return 'UNKNOWN'
  const c = country.toUpperCase()
  if (c === HOME_COUNTRY) return 'DK'
  if (EU_COUNTRIES.has(c)) return 'EU'
  return 'NON_EU'
}

/** Whether VAT should be charged for this country (DK + EU under threshold). */
export function isTaxable(country?: string | null): boolean {
  const j = vatJurisdiction(country)
  return j === 'DK' || j === 'EU'
}

/** Human label for a jurisdiction bucket, used in the Finances tab. */
export function jurisdictionLabel(j: VatJurisdiction): string {
  switch (j) {
    case 'DK': return 'Denmark'
    case 'EU': return 'EU (excl. DK)'
    case 'NON_EU': return 'Outside EU'
    default: return 'Unknown location'
  }
}
