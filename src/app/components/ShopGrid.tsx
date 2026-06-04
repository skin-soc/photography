'use client'

import { useState, useEffect } from 'react'
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

function RotatingImage({ srcs, delay = 0 }: { srcs: string[]; delay?: number }) {
  const [order, setOrder] = useState<string[]>(srcs)
  const [idx, setIdx] = useState(0)

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

  if (order.length === 0) return null

  return (
    <div className="absolute inset-0">
      {order.map((src, i) => (
        <img
          key={src}
          src={src}
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

function LazyImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      draggable={false}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      onLoad={() => setLoaded(true)}
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
}: {
  photos: GridPhoto[]
  categoryTree: CategoryNode[]
  availableTypes: ProductType[]
  initialCategoryPath?: string[]
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

  return (
    <>
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

      {subCategories.length > 0 ? (
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
                <RotatingImage srcs={keyUrls} delay={nodeIdx * 700} />
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
            {shown.map((p) => {
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
    </>
  )
}
