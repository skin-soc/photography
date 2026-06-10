/**
 * Print / fine-art product RANGE — the curated list of provider SKUs we sell.
 *
 * This is the small "products.json" that now lives WITH the worker (deploys with
 * the code, no NAS dependency, tiny even with multiple providers). It is the
 * source of truth for which products exist, their retail price (DKK), and the
 * provider mapping. The daily validator (src/lib/prodigi-validate.ts) checks each
 * entry against the provider; eventually the worker also applies this range to
 * catalogue photos by `offers`. See docs/fap-print-fulfilment.md.
 *
 * Retail `price` (DKK minor) is value-priced — TUNE per business decision; `cost`
 * (ex-tax minor, in costCurrency) is the recorded provider cost, used to detect
 * drift and to report margin. SKUs below are verified to route prodigi_eu/NL.
 */

import type { ProductType } from './../lib/product-types'

export interface RangeItem {
  type: Extract<ProductType, 'print' | 'fine-art'>
  label: string
  printSize: { w: number; h: number }
  /** Client retail price, DKK minor units (øre). */
  price: number
  currency: 'DKK'
  provider: 'prodigi'
  providerSku: string
  /** Chosen provider variant attributes (e.g. frame colour). */
  attributes: Record<string, string>
  /** Recorded provider ex-tax cost, minor units of costCurrency. */
  cost: number
  costCurrency: 'EUR'
}

export const PRINT_RANGE: RangeItem[] = [
  { type: 'print',    label: '40×60 cm — photographic',   printSize: { w: 40,   h: 60 },   price: 59500,  currency: 'DKK', provider: 'prodigi', providerSku: 'GLOBAL-PAP-16X24', attributes: {},                 cost: 1000, costCurrency: 'EUR' },
  { type: 'fine-art', label: 'A3 — giclée (EMA 200gsm)',  printSize: { w: 29.7, h: 42 },   price: 59500,  currency: 'DKK', provider: 'prodigi', providerSku: 'GLOBAL-FAP-A3',    attributes: {},                 cost: 700,  costCurrency: 'EUR' },
  { type: 'fine-art', label: 'A2 — giclée (EMA 200gsm)',  printSize: { w: 42,   h: 59.4 }, price: 89500,  currency: 'DKK', provider: 'prodigi', providerSku: 'GLOBAL-FAP-A2',    attributes: {},                 cost: 1000, costCurrency: 'EUR' },
  { type: 'fine-art', label: 'A1 — giclée (EMA 200gsm)',  printSize: { w: 59.4, h: 84.1 }, price: 129500, currency: 'DKK', provider: 'prodigi', providerSku: 'GLOBAL-FAP-A1',    attributes: {},                 cost: 1400, costCurrency: 'EUR' },
  { type: 'fine-art', label: 'A2 — framed, mounted',      printSize: { w: 42,   h: 59.4 }, price: 199500, currency: 'DKK', provider: 'prodigi', providerSku: 'GLOBAL-CFPM-A2',   attributes: { color: 'black' }, cost: 4800, costCurrency: 'EUR' },
]
