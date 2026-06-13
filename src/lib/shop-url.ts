/**
 * Shop URL ↔ category-path mapping — pure, client-safe helpers (no `node:crypto`,
 * so safe to import from `ShopGrid` and other client components).
 *
 * The shop's browse state lives entirely in the URL path so every view is
 * deep-linkable and survives a refresh:
 *
 *   /shop                              → landing (product-type cards)
 *   /shop/posters                      → a product type
 *   /shop/posters/copenhagen/pride-2013 → a subject collection within a type
 *   /shop/gmp-a1b2c3d                  → a product (flat, code-only, stable slug)
 *
 * A nav-path is `[productType, ...subjectFolders]`. The leading token is a
 * `ProductType`; the rest are Lightroom subject-folder names (as they appear in
 * the category tree). This module slugifies those real names for the URL and
 * resolves URL slugs back to the real names against the tree.
 */

import type { CategoryNode } from '@/lib/shop'
import {
  isProductType,
  typeUrlSlug,
  typeFromUrlSlug,
  type ProductType,
} from '@/lib/product-types'

/** A product slug is the photo's GMP code, always `gmp-…` (see `shop.ts`). */
export function isProductSlug(seg: string): boolean {
  return seg.startsWith('gmp-')
}

/** URL-safe slug for a subject-folder name, e.g. `Pride 2013` → `pride-2013`. */
export function slugifyFolder(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Build the shop URL for a nav-path (`[productType, ...subjectFolders]`).
 * Empty path → the landing. Subject folders are slugified; the product type
 * uses its customer-facing slug.
 */
export function categoryUrl(navPath: string[]): string {
  if (navPath.length === 0) return '/shop'
  const [type, ...folders] = navPath
  const head = isProductType(type) ? typeUrlSlug(type) : slugifyFolder(type)
  return '/shop/' + [head, ...folders.map(slugifyFolder)].join('/')
}

/**
 * Resolve subject-folder URL slugs back to their real names against the tree,
 * descending one level per slug. Returns the real names, or null if any slug
 * doesn't match a folder at its level (→ the caller should 404).
 */
export function resolveFolderSlugs(
  tree: CategoryNode[],
  slugs: string[],
): string[] | null {
  const real: string[] = []
  let level = tree
  for (const slug of slugs) {
    const node = level.find((n) => slugifyFolder(n.name) === slug)
    if (!node) return null
    real.push(node.name)
    level = node.children
  }
  return real
}

/**
 * Resolve a full URL path (`["posters","copenhagen",…]`) to a nav-path of real
 * names (`["print","Copenhagen",…]`). Returns null when the leading type slug or
 * any folder slug is unknown. An empty path resolves to the landing (`[]`).
 */
export function resolveShopPath(
  tree: CategoryNode[],
  path: string[],
): string[] | null {
  if (path.length === 0) return []
  const [typeSlug, ...folderSlugs] = path
  const type: ProductType | null = typeFromUrlSlug(typeSlug)
  if (!type) return null
  const folders = resolveFolderSlugs(tree, folderSlugs)
  if (folders === null) return null
  return [type, ...folders]
}
