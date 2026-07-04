/**
 * Server-computed data for the shop's navigation CARDS (landing product-type
 * cards; folder cards later). These are small — a count + a few hero image URLs
 * per card — so they're cheap to serialize into the page, unlike the full photo
 * tile list (2,600+ photos), which stays a client fetch from the edge-cached
 * /api/shop/catalog. Rendering the cards server-side keeps "entering the shop"
 * instant without re-introducing the per-request CPU blow-up (error 1102).
 *
 * Mirrors the hero/preview logic ShopGrid uses on the client so cards look the
 * same whether rendered from these props or (as a fallback) from fetched photos.
 */

import { type ShopPhoto, type CategoryNode, photoTypes, displayTitle, fromPrice } from '@/lib/shop'
import { formatDKK } from '@/lib/currency'
import { PRODUCT_TYPE_ORDER, type ProductType } from '@/lib/product-types'

/** One slide of the landing's "gallery wall" hero — a fine-art room mockup with
 *  its caption facts. The client builds the loki mockup URL (room07 view) from
 *  the variant + the mockup version it already has (see lib/mockup-url.ts). */
export interface HeroSlide {
  id: string
  slug: string
  /** Preview URL — the client derives the mockup asset host from it. */
  previewUrl: string
  family: string
  size: string
  color: string
  title: string
  location: string
  /** Lowest price on the photo, formatted ("270 kr.") — caption "from X". */
  fromText: string
}

/** The photo's strongest fine-art variant for a room scene — largest offered
 *  size, framed preferred over canvas at equal area. Null for photos without
 *  fine-art products. Per the standing rule every offered (family, size) has a
 *  pre-rendered room07 mockup, so this variant is always renderable. Used by
 *  the landing hero, the product-page schema images and the sitemap. */
export function fineArtHeroVariant(
  p: ShopPhoto,
): { family: string; size: string; color: string } | null {
  let best: { family: string; size: string; color: string; area: number } | null = null
  for (const x of p.products) {
    if (x.type !== 'fine-art' || !x.family || !x.faSize) continue
    const area = (x.printSize?.w ?? 0) * (x.printSize?.h ?? 0)
    const better =
      !best ||
      area > best.area ||
      (area === best.area && x.family === 'framed' && best.family !== 'framed')
    if (better) best = { family: x.family, size: x.faSize, color: x.frameColor ?? 'black', area }
  }
  return best && { family: best.family, size: best.size, color: best.color }
}

/**
 * Curated slides for the landing hero: fine-art photos (they have real room
 * mockups), green-labelled `key` photos first, capped at `max`. Each uses its
 * LARGEST offered variant (framed preferred — the strongest room shot), which
 * per the standing rule always has a pre-rendered mockup.
 */
export function landingHeroSlides(catalog: ShopPhoto[], max = 4): HeroSlide[] {
  const fineArt = catalog.filter((p) => photoTypes(p).includes('fine-art'))
  const ordered = [...fineArt.filter((p) => p.key), ...fineArt.filter((p) => !p.key)]
  const slides: HeroSlide[] = []
  for (const p of ordered) {
    if (slides.length >= max) break
    const best = fineArtHeroVariant(p)
    if (!best) continue
    slides.push({
      id: p.id,
      slug: p.slug,
      previewUrl: p.previewUrl,
      family: best.family,
      size: best.size,
      color: best.color,
      title: displayTitle(p),
      location: p.location,
      fromText: formatDKK(fromPrice(p).price),
    })
  }
  return slides
}

export interface TypeCard {
  type: ProductType
  count: number
  /** Pre-built preview URLs (already `?v=…&max=800[&logo=0]`) for the rotating hero. */
  heroSrcs: string[]
}

export interface FolderCard {
  name: string
  count: number
  heroSrcs: string[]
  /** Full nav-path to this folder ([type, ...subjectFolders]) — caller builds the href. */
  path: string[]
}

/** How many photos to rotate as a hero when a set has no curated (`key`) photo. */
const HERO_FALLBACK_MAX = 6
/** Posters / fine art preview without the logo badge (judging the print). */
const isPhysical = (t: ProductType) => t === 'print' || t === 'fine-art'
const previewSrc = (url: string, noLogo: boolean) => `${url}&max=800${noLogo ? '&logo=0' : ''}`

/** Prefer curated green-labelled (`key`) photos; else the first few, so a card
 *  is never blank. Same rule as ShopGrid's `heroUrls`. */
function heroSrcs(matching: ShopPhoto[], noLogo: boolean): string[] {
  const keyed = matching.filter((p) => p.key)
  const chosen = keyed.length > 0 ? keyed : matching.slice(0, HERO_FALLBACK_MAX)
  return chosen.map((p) => previewSrc(p.previewUrl, noLogo))
}

/** The landing's product-type cards (Fine Art · Posters · Digital), in publish
 *  order, with each type's photo count + hero URLs. */
export function landingTypeCards(catalog: ShopPhoto[], available: ProductType[]): TypeCard[] {
  return PRODUCT_TYPE_ORDER.filter((t) => available.includes(t)).map((type) => {
    const matching = catalog.filter((p) => photoTypes(p).includes(type))
    return { type, count: matching.length, heroSrcs: heroSrcs(matching, isPhysical(type)) }
  })
}

/** Does a photo sit under `path` (prefix-match on any of its category trails)? */
function matchesCategory(p: ShopPhoto, path: string[]): boolean {
  if (path.length === 0) return true
  return p.category.some((c) => path.every((seg, i) => c[i] === seg))
}

/** Photos under a folder path, optionally constrained to a product type. */
function inFolder(catalog: ShopPhoto[], folderPath: string[], type: ProductType | null): ShopPhoto[] {
  return catalog.filter(
    (p) => matchesCategory(p, folderPath) && (type === null || photoTypes(p).includes(type)),
  )
}

/**
 * The sub-folder cards for a category view, mirroring ShopGrid's `subCategories`:
 * the children of the current folder level that actually hold photos of the
 * chosen type. `isLeaf` is true when there are none — i.e. the view is an actual
 * photo collection, whose tiles ShopGrid fetches client-side.
 */
export function shopFolderCards(
  catalog: ShopPhoto[],
  categoryTree: CategoryNode[],
  navPath: string[],
): { cards: FolderCard[]; isLeaf: boolean } {
  if (navPath.length === 0) return { cards: [], isLeaf: false } // landing — handled by type cards
  const type = navPath[0] as ProductType
  const subjectPath = navPath.slice(1)

  // Descend the tree to the current level's child folders.
  let level = categoryTree
  for (const seg of subjectPath) {
    const node = level.find((n) => n.name === seg)
    if (!node) { level = []; break }
    level = node.children
  }

  const cards: FolderCard[] = level
    .map((node) => [...subjectPath, node.name] as string[])
    .map((folderPath) => ({ folderPath, photos: inFolder(catalog, folderPath, type) }))
    .filter(({ photos }) => photos.length > 0)
    .sort((a, b) => a.folderPath[a.folderPath.length - 1].localeCompare(b.folderPath[b.folderPath.length - 1]))
    .map(({ folderPath, photos }) => ({
      name: folderPath[folderPath.length - 1],
      count: photos.length,
      heroSrcs: heroSrcs(photos, isPhysical(type)),
      path: [type, ...folderPath],
    }))

  return { cards, isLeaf: cards.length === 0 }
}
