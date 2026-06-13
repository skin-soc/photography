'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import type { CategoryNode } from '@/lib/shop'
import {
  type ProductType,
  PRODUCT_TYPE_ORDER,
  isProductType,
  typeMessageKey,
} from '@/lib/product-types'
import PosterMat from '@/app/components/PosterMat'
import SalePill from '@/app/components/SalePill'
import { categoryUrl } from '@/lib/shop-url'

export interface GridPhoto {
  id: string
  slug: string
  title: string
  location: string
  /** Lightroom caption — sub-heading on poster cards. */
  caption?: string
  types: ProductType[]
  previewUrl: string
  fromText: string
  fromApprox: string
  category: string[][]
  key?: boolean
  /** Discount off the normal price (whole percent) when on sale — drives the
   *  "−X%" pill. Absent when not on sale. */
  salePct?: number
  /** Seconds since Lightroom epoch (Jan 1 2001 UTC) — used for chronological sort. */
  captureDate?: number
}

function matchesCategory(photo: GridPhoto, path: string[]): boolean {
  if (path.length === 0) return true
  return photo.category.some((c) => path.every((seg, i) => c[i] === seg))
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** How many photos to rotate as a hero when falling back to non-key photos. */
const HERO_FALLBACK_MAX = 6

/** Posters / fine art are previewed WITHOUT the logo badge (the customer is
 *  judging the physical print, not buying a file); only digital downloads keep
 *  it. The repeating mesh watermark stays on every variant regardless. */
function isPhysical(type: ProductType | null): boolean {
  return type === 'print' || type === 'fine-art'
}

/** Build a preview URL, suppressing the logo badge for physical product types and
 *  requesting the 4:5 poster crop in poster contexts. */
function previewSrc(previewUrl: string, max: number, noLogo: boolean, poster = false): string {
  return `${previewUrl}?max=${max}${noLogo ? '&logo=0' : ''}${poster ? '&poster=1' : ''}`
}

/** Hero URLs for a set of matching photos: prefer the curated green-labelled
 *  (`key`) photos; if a category has none, fall back to the first few matching
 *  photos so the card is never blank (e.g. Nature with nothing green-labelled). */
function heroUrls(matching: GridPhoto[], noLogo: boolean): string[] {
  const keyed = matching.filter((p) => p.key)
  const chosen = keyed.length > 0 ? keyed : matching.slice(0, HERO_FALLBACK_MAX)
  return chosen.map((p) => previewSrc(p.previewUrl, 800, noLogo))
}

/** Hero photos of a product type — rotating hero on type cards. */
function keyPhotosForType(photos: GridPhoto[], type: ProductType): string[] {
  return heroUrls(photos.filter((p) => p.types.includes(type)), isPhysical(type))
}

/** Hero photos within a subject folder (optionally constrained to a type). */
function keyPhotosForFolder(
  photos: GridPhoto[],
  folderPath: string[],
  type: ProductType | null,
): string[] {
  return heroUrls(
    photos.filter((p) => matchesCategory(p, folderPath) && (type === null || p.types.includes(type))),
    isPhysical(type),
  )
}

function RotatingImage({
  srcs,
  delay = 0,
  gen,
  onReady,
}: {
  srcs: string[]
  delay?: number
  /** Changes whenever the view (category/filter) changes — re-arms onReady. */
  gen?: string
  /** Fired once when this tile's first image is painted (or there's none). */
  onReady?: () => void
}) {
  const [order, setOrder] = useState<string[]>(srcs)
  const [idx, setIdx] = useState(0)
  const firstRef = useRef<HTMLImageElement | null>(null)
  const firedRef = useRef(false)

  const fire = useCallback(() => {
    if (firedRef.current) return
    firedRef.current = true
    onReady?.()
  }, [onReady])

  useEffect(() => {
    setOrder(shuffle([...srcs]))
    setIdx(0)
  }, [srcs.join(',')])

  useEffect(() => {
    if (order.length <= 1) return
    let interval: ReturnType<typeof setInterval>
    const timeout = setTimeout(() => {
      interval = setInterval(() => setIdx((i) => (i + 1) % order.length), 4000)
    }, delay)
    return () => { clearTimeout(timeout); clearInterval(interval) }
  }, [order.length, delay])

  // Report readiness for the loading overlay. A folder with no key photo is
  // "ready" immediately; otherwise we wait for the first image (cached images
  // are already .complete, so this resolves instantly on revisits).
  useEffect(() => {
    firedRef.current = false
    if (srcs.length === 0) { fire(); return }
    if (firstRef.current?.complete) fire()
  }, [gen, srcs.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  if (order.length === 0) return null

  return (
    <div className="absolute inset-0">
      {order.map((src, i) => (
        <img
          key={src}
          src={src}
          ref={i === 0 ? firstRef : undefined}
          onLoad={i === 0 ? fire : undefined}
          onError={i === 0 ? fire : undefined}
          loading={i === 0 ? 'eager' : 'lazy'}
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 pointer-events-none ${
            i === idx ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ))}
    </div>
  )
}

function countInCategory(photos: GridPhoto[], path: string[], typeFilter: ProductType | null): number {
  return photos
    .filter((p) => matchesCategory(p, path))
    .filter((p) => typeFilter === null || p.types.includes(typeFilter))
    .length
}

/** Photos offered in a product type, anywhere in the catalog. */
function countInType(photos: GridPhoto[], type: ProductType): number {
  return photos.filter((p) => p.types.includes(type)).length
}

function LazyImage({
  src,
  alt,
  eager = false,
  gen,
  onReady,
}: {
  src: string
  alt: string
  /** Above-the-fold tiles load eagerly so the first page paints promptly. */
  eager?: boolean
  /** Changes whenever the view (category/filter) changes — re-arms onReady. */
  gen?: string
  /** Fired once when this tile is painted. */
  onReady?: () => void
}) {
  const [loaded, setLoaded] = useState(false)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const firedRef = useRef(false)

  const fire = useCallback(() => {
    setLoaded(true)
    if (firedRef.current) return
    firedRef.current = true
    onReady?.()
  }, [onReady])

  // Re-arm when the view changes so this tile re-reports (handles filter
  // toggles where the same tile persists). Cached images are already complete.
  useEffect(() => {
    firedRef.current = false
    setLoaded(false)
    if (imgRef.current?.complete) fire()
  }, [gen, src]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      draggable={false}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      onLoad={fire}
      onError={fire}
      className={`w-full h-full object-cover transition-all duration-500 ease-out group-hover:scale-[1.04] pointer-events-none ${loaded ? 'opacity-100' : 'opacity-0'}`}
    />
  )
}

/**
 * Breadcrumb over the full nav path. Segment 0 is the product-type tier
 * (rendered with its friendly label); the rest are Lightroom subject folders.
 */
function Breadcrumb({
  navPath,
  typeLabel,
}: {
  navPath: string[]
  /** Friendly label for the leading product-type token. */
  typeLabel: (token: string) => string
}) {
  if (navPath.length === 0) return null
  const parentPath = navPath.slice(0, -1)
  const labelFor = (path: string[]) =>
    path.length === 1 ? typeLabel(path[0]) : path[path.length - 1]
  const parentLabel = parentPath.length === 0 ? 'Browse' : labelFor(parentPath)
  return (
    <nav className="flex items-center justify-between gap-2 text-[11px] tracking-[0.18em] uppercase mb-8">
      <div className="hidden sm:flex items-center gap-2 text-white/40">
        <Link href="/shop" className="hover:text-white transition-colors">
          Browse
        </Link>
        {navPath.map((seg, i) => (
          <span key={i} className="flex items-center gap-2">
            <span>/</span>
            <Link
              href={categoryUrl(navPath.slice(0, i + 1))}
              className={
                i === navPath.length - 1
                  ? 'text-white'
                  : 'hover:text-white transition-colors'
              }
            >
              {i === 0 ? typeLabel(seg) : seg}
            </Link>
          </span>
        ))}
      </div>
      <Link
        href={categoryUrl(parentPath)}
        className="text-[#931020] hover:text-[#b01226] transition-colors shrink-0"
      >
        ← {parentLabel}
      </Link>
    </nav>
  )
}

export default function ShopGrid({
  photos,
  categoryTree,
  availableTypes,
  initialCategoryPath = [],
  heading,
  intro,
  siteLabel,
}: {
  photos: GridPhoto[]
  categoryTree: CategoryNode[]
  availableTypes: ProductType[]
  /** Full nav path: [productType, ...subjectFolders]. Empty = landing. */
  initialCategoryPath?: string[]
  /** Default page heading, shown on the landing (no product type chosen). */
  heading: string
  /** Shop intro paragraph, shown only on the landing. */
  intro: string
  /** Foot line for poster cards, e.g. "WWW.GUSMCEWAN.COM". */
  siteLabel: string
}) {
  const t = useTranslations('shop')
  const typeLabel = useCallback(
    (token: string) => (isProductType(token) ? t(typeMessageKey(token)) : token),
    [t],
  )

  // The browse position is the URL path (resolved to real folder names by the
  // server); navigation is via real <Link>s, so refresh/share land here exactly.
  const navPath = initialCategoryPath
  const typeFilter: ProductType | null =
    navPath.length > 0 && isProductType(navPath[0]) ? navPath[0] : null
  const subjectPath = typeFilter ? navPath.slice(1) : []
  const isLanding = navPath.length === 0

  // The product-type cards shown on the landing, in publish-tree order.
  const typeCards = PRODUCT_TYPE_ORDER.filter((tp) => availableTypes.includes(tp))

  const currentNode: CategoryNode | null = (() => {
    if (subjectPath.length === 0) return null
    let node = categoryTree.find((n) => n.name === subjectPath[0]) ?? null
    for (let i = 1; i < subjectPath.length && node; i++) {
      node = node.children.find((c) => c.name === subjectPath[i]) ?? null
    }
    return node
  })()

  // Subject folders at the current level — only those that actually hold photos
  // of the selected product type (so e.g. Fine Art hides folders with no fine-art).
  const subCategories: CategoryNode[] = (
    subjectPath.length === 0 ? categoryTree : (currentNode?.children ?? [])
  )
    .filter((node) => countInCategory(photos, [...subjectPath, node.name], typeFilter) > 0)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))

  const shown = photos
    .filter((p) => matchesCategory(p, subjectPath))
    .filter((p) => typeFilter === null || p.types.includes(typeFilter))
    // Sort chronologically within a leaf collection. The plugin now writes
    // catalog.json in capture-date order, but we sort here too as a fallback
    // (covers mock data and any catalog written before this fix was deployed).
    .sort((a, b) => (a.captureDate ?? 0) - (b.captureDate ?? 0))

  // ── First-page loading overlay ───────────────────────────────────────────
  // Grid navigation is entirely client-side (no route change), so the global
  // NavigationOverlay can't cover it. We show a spinner over the grid until the
  // first screenful of images has actually painted.
  const isFolderView = !isLanding && subCategories.length > 0
  // Posters leaf: photo cards are rendered as full poster mats (not square tiles).
  const isPosterLeaf = !isLanding && !isFolderView && typeFilter === 'print'
  const itemCount = isLanding ? typeCards.length : isFolderView ? subCategories.length : shown.length
  // A "first page" — enough tiles to fill the initial viewport across
  // breakpoints (5-col desktop ≈ 2.4 rows, 2-col mobile ≈ 6 rows).
  const FIRST_PAGE = 12
  // Poster cards don't wire into the per-image readiness probe (they reuse the
  // shared PosterMat, not LazyImage), so skip the spinner for the poster leaf —
  // they load progressively with native lazy-loading.
  const targetCount = isPosterLeaf ? 0 : Math.min(itemCount, FIRST_PAGE)
  const viewKey = navPath.join('|') || '·landing'

  const loadedRef = useRef(0)
  const targetRef = useRef(targetCount)
  targetRef.current = targetCount
  const [ready, setReady] = useState(targetCount === 0)
  const [showSpinner, setShowSpinner] = useState(false)

  // Reset readiness synchronously when the view changes (before children
  // commit), so tile reports for the new view count from zero.
  const prevKeyRef = useRef(viewKey)
  if (prevKeyRef.current !== viewKey) {
    prevKeyRef.current = viewKey
    loadedRef.current = 0
    setReady(targetCount === 0)
  }

  const handleTileLoad = useCallback(() => {
    loadedRef.current += 1
    if (loadedRef.current >= targetRef.current) setReady(true)
  }, [])

  // Delay the spinner slightly so instant (cached) transitions never flash it.
  useEffect(() => {
    if (ready) { setShowSpinner(false); return }
    const id = setTimeout(() => setShowSpinner(true), 180)
    return () => clearTimeout(id)
  }, [viewKey, ready])

  // Safety net: never trap the spinner if an image stalls or never loads.
  useEffect(() => {
    if (ready) return
    const id = setTimeout(() => setReady(true), 8000)
    return () => clearTimeout(id)
  }, [viewKey, ready])

  return (
    <>
      {/* Heading — the shop title on the landing, then "<Type> Shop" once a
          product type is chosen, held at that tier while browsing subjects. */}
      <header className="mb-12">
        <h1 className="text-4xl md:text-5xl font-light">
          {typeFilter ? t('sectionTitle', { name: t(typeMessageKey(typeFilter)) }) : heading}
        </h1>
        {isLanding && (
          <p className="mt-4 max-w-2xl text-white/60 leading-relaxed">{intro}</p>
        )}
      </header>

      {/* Breadcrumb (hidden on the landing) */}
      <Breadcrumb navPath={navPath} typeLabel={typeLabel} />

      <div className="relative min-h-[50vh]">
        {/* Loading overlay — shown until the first page of images has painted */}
        {showSpinner && !ready && (
          <div className="absolute inset-0 z-10 flex items-start justify-center pt-24">
            <div className="shop-spinner" role="status" aria-label="Loading" />
          </div>
        )}

        <div className={ready ? 'opacity-100 transition-opacity duration-300' : 'opacity-0 pointer-events-none'}>
          {isLanding ? (
            /* Landing: one card per product type — Fine Art · Prints · Digital */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[6px] bg-white/5">
              {typeCards.map((type, idx) => {
                const count = countInType(photos, type)
                const keyUrls = keyPhotosForType(photos, type)
                return (
                  <Link
                    key={type}
                    href={categoryUrl([type])}
                    className="group relative block overflow-hidden aspect-[4/3] bg-black text-left"
                  >
                    <RotatingImage
                      srcs={keyUrls}
                      delay={idx * 700}
                      gen={viewKey}
                      onReady={idx < targetCount ? handleTileLoad : undefined}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent group-hover:from-black/65 transition-all duration-500" />
                    <div className="absolute bottom-0 left-0 p-6 z-10">
                      <p className="text-2xl font-light text-white">{t(typeMessageKey(type))}</p>
                      {count > 0 && (
                        <p className="mt-1 text-[11px] tracking-[0.18em] uppercase text-accent/70">
                          {count} {count === 1 ? 'photo' : 'photos'}
                        </p>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          ) : isFolderView ? (
            /* Has sub-categories: always show folder cards, never the photo grid */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[6px] bg-white/5">
              {subCategories.map((node, nodeIdx) => {
                const nodePath = [...subjectPath, node.name]
                const count = countInCategory(photos, nodePath, typeFilter)
                const keyUrls = keyPhotosForFolder(photos, nodePath, typeFilter)
                return (
                  <Link
                    key={node.name}
                    href={categoryUrl([...navPath, node.name])}
                    className="group relative block overflow-hidden aspect-[4/3] bg-black text-left"
                  >
                    <RotatingImage
                      srcs={keyUrls}
                      delay={nodeIdx * 700}
                      gen={viewKey}
                      onReady={nodeIdx < targetCount ? handleTileLoad : undefined}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent group-hover:from-black/65 transition-all duration-500" />
                    <div className="absolute bottom-0 left-0 p-6 z-10">
                      <p className="text-xl font-light text-white">{node.name}</p>
                      {count > 0 && (
                        <p className="mt-1 text-[11px] tracking-[0.18em] uppercase text-accent/70">
                          {count} {count === 1 ? 'photo' : 'photos'}
                        </p>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          ) : (
            /* Leaf level: show photo grid */
            shown.length === 0 ? (
              <p className="text-white/40">{t('checkoutSoon')}</p>
            ) : isPosterLeaf ? (
              /* Posters: each card is the full poster mat as shown on the product
                 page — the title is part of the poster, so no card caption. */
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 sm:gap-8">
                {shown.map((p, i) => {
                  return (
                    <Link
                      key={p.id}
                      href={`/shop/${p.slug}`}
                      className="group relative block select-none transition-transform duration-300 hover:-translate-y-1"
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      {p.salePct ? <SalePill pct={p.salePct} className="absolute top-3 left-3 z-10" /> : null}
                      <PosterMat
                        src={previewSrc(p.previewUrl, 800, true, true)}
                        alt={`${p.title} — ${p.location}`}
                        title={p.title}
                        caption={p.caption}
                        siteLabel={siteLabel}
                        maxWidth={600}
                        eager={i < 4}
                        grayscaleHover
                      />
                    </Link>
                  )
                })}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {shown.map((p, i) => {
                  return (
                    <Link
                      key={p.id}
                      href={`/shop/${p.slug}`}
                      className="group block select-none"
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      <div className="relative overflow-hidden bg-white/5 aspect-square">
                        {p.salePct ? <SalePill pct={p.salePct} className="absolute top-2 left-2 z-10" /> : null}
                        <LazyImage
                          src={previewSrc(p.previewUrl, 800, isPhysical(typeFilter))}
                          alt={`${p.title} — ${p.location}`}
                          eager={i < targetCount}
                          gen={viewKey}
                          onReady={i < targetCount ? handleTileLoad : undefined}
                        />
                      </div>
                      <p className="mt-1.5 text-[12px] font-light leading-tight text-white/70 truncate">{p.title}</p>
                      <p className="text-[10px] tracking-[0.15em] uppercase text-white/35 truncate">{p.location}</p>
                    </Link>
                  )
                })}
              </div>
            )
          )}
        </div>
      </div>
    </>
  )
}
