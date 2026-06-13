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

/** Customer-facing URL slug for a product type — the first path segment of a
 *  shop category URL, e.g. `print` → `/shop/posters`. Stable English slugs
 *  (locale-independent) so a shared link resolves the same in any language.
 *  Note: digital stays `digital` (not `downloads`) to avoid colliding with the
 *  post-purchase delivery route `/shop/downloads/<orderCode>`. */
export function typeUrlSlug(type: ProductType): string {
  return type === 'print' ? 'posters' : type === 'fine-art' ? 'fine-art' : 'digital'
}

/** Reverse of {@link typeUrlSlug}: a URL segment back to a product type, or
 *  null when the segment isn't a known type slug. */
export function typeFromUrlSlug(slug: string): ProductType | null {
  return slug === 'posters'
    ? 'print'
    : slug === 'fine-art'
      ? 'fine-art'
      : slug === 'digital'
        ? 'digital'
        : null
}
