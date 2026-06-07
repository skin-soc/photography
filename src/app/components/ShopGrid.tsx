'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import type { ProductType, CategoryNode } from '@/lib/shop'

export interface GridPhoto {
  id: string
  slug: string
  title: string
  location: string
  types: ProductType[]
  previewUrl: string
  fromText: string
  fromApprox: string
  category: string[][]
  key?: boolean
  /** Seconds since Lightroom epoch (Jan 1 2001 UTC) — used for chronological sort. */
  captureDate?: number
}

const TYPE_FILTERS: { key: ProductType; label: string }[] = [
  { key: 'print', label: 'prints' },
  { key: 'fine-art', label: 'fineArt' },
  { key: 'digital', label: 'digital' },
]

// Canonical priority for picking a sensible default filter when the catalog
// doesn't offer every type.
const TYPE_PRIORITY: ProductType[] = ['digital', 'print', 'fine-art']

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

function keyPhotosForFolder(photos: GridPhoto[], folderPath: string[]): string[] {
  return photos
    .filter((p) => p.key && matchesCategory(p, folderPath))
    .map((p) => `${p.previewUrl}?max=800`)
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

function Breadcrumb({
  path,
  onNavigate,
}: {
  path: string[]
  onNavigate: (path: string[]) => void
}) {
  if (path.length === 0) return null
  const parentPath = path.slice(0, -1)
  const parentLabel = parentPath.length === 0 ? 'Browse' : parentPath[parentPath.length - 1]
  return (
    <nav className="flex items-center justify-between gap-2 text-[11px] tracking-[0.18em] uppercase mb-8">
      <div className="hidden sm:flex items-center gap-2 text-white/40">
        <button onClick={() => onNavigate([])} className="hover:text-white transition-colors">
          Browse
        </button>
        {path.map((seg, i) => (
          <span key={i} className="flex items-center gap-2">
            <span>/</span>
            <button
              onClick={() => onNavigate(path.slice(0, i + 1))}
              className={
                i === path.length - 1
                  ? 'text-white'
                  : 'hover:text-white transition-colors'
              }
            >
              {seg}
            </button>
          </span>
        ))}
      </div>
      <button
        onClick={() => onNavigate(parentPath)}
        className="text-[#931020] hover:text-[#b01226] transition-colors shrink-0"
      >
        ← {parentLabel}
      </button>
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
}: {
  photos: GridPhoto[]
  categoryTree: CategoryNode[]
  availableTypes: ProductType[]
  initialCategoryPath?: string[]
  /** Default page heading, shown until a top-level collection is selected. */
  heading: string
  /** Shop intro paragraph, shown only on the landing (no collection selected). */
  intro: string
}) {
  const t = useTranslations('shop')
  // Only show filters for types the catalog actually offers, in canonical order.
  const typeFilters = TYPE_FILTERS.filter((f) => availableTypes.includes(f.key))
  const defaultType = TYPE_PRIORITY.find((tp) => availableTypes.includes(tp)) ?? null
  const [categoryPath, setCategoryPath] = useState<string[]>(initialCategoryPath)
  const [typeFilter, setTypeFilter] = useState<ProductType | null>(defaultType)

  const currentNode: CategoryNode | null = (() => {
    if (categoryPath.length === 0) return null
    let node = categoryTree.find((n) => n.name === categoryPath[0]) ?? null
    for (let i = 1; i < categoryPath.length && node; i++) {
      node = node.children.find((c) => c.name === categoryPath[i]) ?? null
    }
    return node
  })()

  const subCategories: CategoryNode[] = (
    categoryPath.length === 0 ? categoryTree : (currentNode?.children ?? [])
  ).slice().sort((a, b) => a.name.localeCompare(b.name))

  const shown = photos
    .filter((p) => matchesCategory(p, categoryPath))
    .filter((p) => typeFilter === null || p.types.includes(typeFilter))
    // Sort chronologically within a leaf collection. The plugin now writes
    // catalog.json in capture-date order, but we sort here too as a fallback
    // (covers mock data and any catalog written before this fix was deployed).
    .sort((a, b) => (a.captureDate ?? 0) - (b.captureDate ?? 0))

  // ── First-page loading overlay ───────────────────────────────────────────
  // Grid navigation is entirely client-side (no route change), so the global
  // NavigationOverlay can't cover it. We show a spinner over the grid until the
  // first screenful of images has actually painted — at 800px previews this is
  // the gap the spinner fills.
  const isFolderView = subCategories.length > 0
  const itemCount = isFolderView ? subCategories.length : shown.length
  // A "first page" — enough tiles to fill the initial viewport across
  // breakpoints (5-col desktop ≈ 2.4 rows, 2-col mobile ≈ 6 rows).
  const FIRST_PAGE = 12
  const targetCount = Math.min(itemCount, FIRST_PAGE)
  const viewKey = `${categoryPath.join('|')}·${typeFilter ?? ''}`

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
      {/* Heading — defaults to the shop title, then becomes the top-level
          collection name once the buyer drills in (and stays at that top tier). */}
      <header className="mb-12">
        <h1 className="text-4xl md:text-5xl font-light">
          {categoryPath.length > 0 ? categoryPath[0] : heading}
        </h1>
        {categoryPath.length === 0 && (
          <p className="mt-4 max-w-2xl text-white/60 leading-relaxed">{intro}</p>
        )}
      </header>

      {/* Product type filter — only when the catalog offers more than one type */}
      {typeFilters.length > 1 && (
      <div className="flex flex-wrap gap-x-7 gap-y-2 mb-10">
        {typeFilters.map(({ key, label }) => {
          const active = typeFilter === key
          return (
            <button
              key={key}
              onClick={() => setTypeFilter(active ? null : key)}
              className={`text-[11px] font-light tracking-[0.22em] uppercase pb-[5px] border-b-2 transition-colors ${
                active
                  ? 'border-[#931020] text-white'
                  : 'border-transparent text-white/55 hover:text-white'
              }`}
            >
              {t(label)}
            </button>
          )
        })}
      </div>
      )}

      {/* Breadcrumb */}
      <Breadcrumb path={categoryPath} onNavigate={setCategoryPath} />

      <div className="relative min-h-[50vh]">
        {/* Loading overlay — shown until the first page of images has painted */}
        {showSpinner && !ready && (
          <div className="absolute inset-0 z-10 flex items-start justify-center pt-24">
            <div className="shop-spinner" role="status" aria-label="Loading" />
          </div>
        )}

        <div className={ready ? 'opacity-100 transition-opacity duration-300' : 'opacity-0 pointer-events-none'}>
          {isFolderView ? (
            /* Has sub-categories: always show folder cards, never the photo grid */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[6px] bg-white/5">
              {subCategories.map((node, nodeIdx) => {
                const nodePath = [...categoryPath, node.name]
                const count = countInCategory(photos, nodePath, typeFilter)
                const keyUrls = keyPhotosForFolder(photos, nodePath)
                return (
                  <button
                    key={node.name}
                    onClick={() => setCategoryPath(nodePath)}
                    className="group relative overflow-hidden aspect-[4/3] bg-black text-left"
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
                  </button>
                )
              })}
            </div>
          ) : (
            /* Leaf level: show photo grid */
            shown.length === 0 ? (
              <p className="text-white/40">{t('checkoutSoon')}</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {shown.map((p, i) => {
                  const from = categoryPath.length > 0
                    ? `?from=${encodeURIComponent(categoryPath.join('|'))}`
                    : ''
                  return (
                    <Link
                      key={p.id}
                      href={`/shop/${p.slug}${from}`}
                      className="group block select-none"
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      <div className="relative overflow-hidden bg-white/5 aspect-square">
                        <LazyImage
                          src={`${p.previewUrl}?max=800`}
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
