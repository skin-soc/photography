/**
 * The shop's own legal/VAT identity — fixed (won't change). Used as the VIES
 * *requester* (so each VAT check returns an official consultation number we keep
 * as proof) and as the header on VAT invoices.
 *
 * Source of truth: the VIES record for DK34922993 (Gus McEwan Photography).
 */
export const SELLER = {
  name: 'Gus McEwan Photography',
  /** Full VAT id with country prefix. */
  vat: 'DK34922993',
  /** VIES requester fields (country + number without prefix). */
  vatCountry: 'DK',
  vatNumber: '34922993',
  /** Danish CVR (business reg. no.) — same digits as the VAT number. */
  cvr: '34922993',
  addressLines: ['Ryesgade 62, 4. 35', '2100 København Ø', 'Denmark'],
} as const
