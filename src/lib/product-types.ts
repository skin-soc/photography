/**
 * Product-type primitives — pure, dependency-free, and safe to import from
 * CLIENT components. (The main `shop.ts` data layer uses `node:crypto`, so it
 * must not be imported by client bundles; these helpers live here instead and
 * are re-exported from `shop.ts` for server-side convenience.)
 */

export type ProductType = 'digital' | 'print' | 'fine-art'

/** Display order of the top-level product-type tier in the shop (matches the
 *  Lightroom publish tree: Fine Art · Prints · Digital Downloads). */
export const PRODUCT_TYPE_ORDER: ProductType[] = ['fine-art', 'print', 'digital']

/** Whether a nav-path segment is a product-type token (the first tier of the
 *  shop tree is the product type; the rest are Lightroom subject collections). */
export function isProductType(seg: string): seg is ProductType {
  return seg === 'digital' || seg === 'print' || seg === 'fine-art'
}

/** The `shop` i18n key for a product type's friendly label. */
export function typeMessageKey(type: ProductType): 'fineArt' | 'prints' | 'digital' {
  return type === 'fine-art' ? 'fineArt' : type === 'print' ? 'prints' : 'digital'
}
