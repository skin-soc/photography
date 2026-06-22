/**
 * Shared (server + client) helpers for ordering fine-art/poster size options and
 * choosing the default fine-art variant. These live OUTSIDE the `'use client'`
 * ShopProductPicker so the server-rendered ShopProductView can call them too — a
 * client-module export can't be invoked from a server component.
 */
import type { PickerProduct } from '@/app/components/ShopProductPicker'

/** Print area (cm²) parsed from a "W × H cm" size label — for ordering size
 *  options smallest → largest. Returns 0 when the label has no dimensions. */
export function printArea(p: PickerProduct): number {
  const m = (p.label || '').match(/([\d.]+)\s*[×x]\s*([\d.]+)/)
  return m ? parseFloat(m[1]) * parseFloat(m[2]) : 0
}

/** The fine-art product to pre-select on a fine-art page: the LARGEST canvas in
 *  black (the gallery hero piece). Falls back to the largest of whatever family is
 *  offered if the photo's resolution doesn't qualify for canvas. Returns undefined
 *  when there are no fine-art products. Used by both the picker (initial selection)
 *  and the hero (first-paint default) so they always agree. */
export function defaultFineArtProduct(products: PickerProduct[]): PickerProduct | undefined {
  const fineArt = products.filter((p) => p.type === 'fine-art')
  if (fineArt.length === 0) return undefined
  // Prefer canvas; within it prefer black; pick the largest by print area.
  const canvas = fineArt.filter((p) => p.family === 'canvas')
  const pool = canvas.length > 0 ? canvas : fineArt.filter((p) => p.family === fineArt[0].family)
  const black = pool.filter((p) => p.frameColor === 'black')
  const candidates = black.length > 0 ? black : pool
  return candidates.reduce((big, p) => (printArea(p) > printArea(big) ? p : big))
}
