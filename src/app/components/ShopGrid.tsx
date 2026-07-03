'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import {
  type ProductType,
  PRODUCT_TYPE_ORDER,
  isProductType,
  typeMessageKey,
} from '@/lib/product-types'
import PosterMat from '@/app/components/PosterMat'
import SalePill from '@/app/components/SalePill'
import { categoryUrl } from '@/lib/shop-url'
import type { TypeCard, FolderCard, HeroSlide } from '@/lib/shop-cards'

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
  /** Fine-art grid covers — the largest size per (family, frame colour). The tile
   *  shows one at random as a head-on cover mockup. Absent for non-fine-art. */
  faCovers?: { family: string; size: string; color: string }[]
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
  // previewUrl already carries `?v=<version>`, so further params append with `&`.
  return `${previewUrl}&max=${max}${noLogo ? '&logo=0' : ''}${poster ? '&poster=1' : ''}`
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
    // inset-[-2px]: a real 2px layout overscan on top of the images' scale
    // overscan. Mobile Safari rounds composited layer bounds to device pixels,
    // which could leave a 1px band of the card's own background visible at the
    // bottom edge — extending the wrapper past the (overflow-hidden) card edge
    // removes it in a way transform scaling alone doesn't.
    <div className="absolute inset-[-2px]">
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
          // scale-[1.01]: each slide paints ~1% past the container edge. Browsers
          // round every object-cover image's painted box from its OWN intrinsic
          // size, so stacked slides can differ by a subpixel — leaving a 1px seam
          // at an edge where the photo behind shows through on every crossfade.
          // The overscan (clipped by the card's overflow-hidden) removes the seam.
          className={`absolute inset-0 w-full h-full object-cover scale-[1.01] transition-opacity duration-1000 pointer-events-none ${
            i === idx ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ))}
    </div>
  )
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

/** The head-on cover-mockup URL for a fine-art (family, size, colour). The worker
 *  maps the frame colour to the renderable cover; `v` busts the browser cache. */
function coverUrl(slug: string, c: { family: string; size: string; color: string }, v: number): string {
  return `/api/fineart-mockup?photo=${encodeURIComponent(slug)}&family=${encodeURIComponent(c.family)}&size=${encodeURIComponent(c.size)}&color=${encodeURIComponent(c.color)}&view=cover&v=${v}`
}

/**
 * A fine-art grid tile: always the BLACK framed-&-mounted-print cover mockup (at
 * the largest size on offer), at its natural aspect. The cover is an opaque cropped
 * rectangle, so it carries the EXACT same box-shadow as the poster mat — identical
 * in every theme, no hover change (the hover lift is the Link's -translate-y-1).
 * Falls back to the artwork preview if the cover isn't rendered yet (404).
 */
function FineArtCoverTile({ photo, version, eager }: { photo: GridPhoto; version: number; eager?: boolean }) {
  const covers = photo.faCovers ?? []
  // Always the black framed print (no longer random); fall back to whatever's first
  // if a photo somehow doesn't offer it.
  const pick = covers.find((c) => c.family === 'framed' && c.color === 'black') ?? covers[0] ?? null
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const src = pick && !failed ? coverUrl(photo.slug, pick, version) : previewSrc(photo.previewUrl, 800, true)
  return (
    <img
      src={src}
      alt={photo.location ? `${photo.title} — ${photo.location}` : photo.title}
      loading={eager ? 'eager' : 'lazy'}
      draggable={false}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      onLoad={() => setLoaded(true)}
      onError={() => { if (pick && !failed) setFailed(true); else setLoaded(true) }}
      className={`block w-full h-auto transition-opacity duration-300 pointer-events-none shadow-[0_20px_32px_-18px_rgba(0,0,0,0.85)] ${loaded ? 'opacity-100' : 'opacity-0'}`}
    />
  )
}

/**
 * Breadcrumb over the full nav path. Segment 0 is the product-type tier
 * (rendered with its friendly label); the rest are Lightroom subject folders.
 */
function Breadcrumb({
  navPath,
  backPath,
  typeLabel,
  rootLabel,
}: {
  navPath: string[]
  /** Skip-aware "back" target (nearest stable ancestor; empty = landing). */
  backPath: string[]
  /** Friendly label for the leading product-type token. */
  typeLabel: (token: string) => string
  /** Localized label for the shop root (e.g. "Shop"). */
  rootLabel: string
}) {
  if (navPath.length === 0) return null
  // "Back" goes to the previous STABLE page, not the immediate parent (which may
  // be a one-option folder that just smart-skips forward again).
  const backLabel =
    backPath.length === 0
      ? rootLabel
      : backPath.length === 1
        ? typeLabel(backPath[0])
        : backPath[backPath.length - 1]
  return (
    <nav className="flex items-center justify-between gap-2 text-[11px] tracking-[0.18em] uppercase mb-8">
      <div className="hidden sm:flex items-center gap-2 text-foreground/40">
        <Link href="/shop" className="hover:text-foreground transition-colors">
          {rootLabel}
        </Link>
        {/* Type tier, then the current folder only — intermediate folders are
            dropped to keep the trail short (matches the product page). The
            "← parent" link still steps up one level. */}
        <span className="flex items-center gap-2">
          <span>/</span>
          <Link
            href={categoryUrl([navPath[0]])}
            className={navPath.length === 1 ? 'text-foreground' : 'hover:text-foreground transition-colors'}
          >
            {typeLabel(navPath[0])}
          </Link>
        </span>
        {navPath.length > 1 && (
          <span className="flex items-center gap-2">
            <span>/</span>
            <span className="text-foreground">{navPath[navPath.length - 1]}</span>
          </span>
        )}
      </div>
      <Link
        href={categoryUrl(backPath)}
        className="text-[#931020] hover:text-[#b01226] transition-colors shrink-0"
      >
        ← {backLabel}
      </Link>
    </nav>
  )
}

/** The landing's "gallery wall" hero: a full-width fine-art room mockup slowly
 *  crossfading through curated slides, with the localized welcome copy overlaid
 *  and a caption crediting the visible work. Images are the same edge-cached
 *  room07 mockups the product pages use. Theme-safe: the overlay gradient sits
 *  on the PHOTO (like the type cards' gradients), so text stays white in both
 *  light and dark themes. */
function LandingHero({
  slides,
  mockupVersion,
  title,
  lead,
  cta,
  from,
}: {
  slides: HeroSlide[]
  mockupVersion: number
  title: string
  lead: string
  cta: string
  /** "from {price}" line, pre-localized with the CURRENT slide's price. */
  from: (price: string) => string
}) {
  const [idx, setIdx] = useState(0)
  const urlOf = (s: HeroSlide) =>
    `/api/fineart-mockup?photo=${encodeURIComponent(s.slug)}&family=${encodeURIComponent(s.family)}&size=${encodeURIComponent(s.size)}&color=${encodeURIComponent(s.color)}&v=${mockupVersion}`

  useEffect(() => {
    if (slides.length <= 1) return
    const id = setInterval(() => setIdx((i) => (i + 1) % slides.length), 6000)
    return () => clearInterval(id)
  }, [slides.length])

  // No JS warm-up needed: every slide is a mounted layer, so the browser
  // fetches them all up front and the crossfade never paints in.

  // Gentle parallax: the (slightly over-scaled) image layer drifts against the
  // scroll. Direct style writes on rAF — no re-renders per scroll tick.
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const layerRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const wrap = wrapRef.current
      const layer = layerRef.current
      if (!wrap || !layer) return
      const r = wrap.getBoundingClientRect()
      // Factor kept below the 15% overscan so the drift never exposes an edge.
      layer.style.transform = `translateY(${-r.top * 0.06}px) scale(1.15)`
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [])

  const cur = slides[idx]
  return (
    /* Standard-width hero CARD (inside the page's 6vw padding), tall enough
       for the FULL square room07 mockup — a 1:1 card showing a 1:1 image means
       nothing is ever cropped. The image layer is slightly over-scaled and
       drifts against the scroll (JS parallax), same principle as the
       full-screen version but clipped to the card. */
    <section
      ref={wrapRef}
      aria-label={`${cur.title}${cur.location ? ` — ${cur.location}` : ''}`}
      // 18% shorter than the square mockup (100:82) — the top-aligned scene
      // crops only the sofa band at the bottom, never the artwork up top.
      className="relative mb-14 w-full aspect-[100/82] overflow-hidden rounded-[20px] bg-foreground/5"
      style={{ boxShadow: '0 28px 64px -18px rgba(0,0,0,0.6)' }}
    >
      <div ref={layerRef} className="absolute inset-0 will-change-transform">
        {slides.map((s, i) => (
          <div
            key={s.slug}
            aria-hidden={i !== idx}
            className="absolute inset-0 transition-opacity duration-[2000ms] ease-in-out"
            style={{
              opacity: i === idx ? 1 : 0,
              backgroundImage: `url(${urlOf(s)})`,
              backgroundPosition: 'top center',
              backgroundSize: 'cover',
              backgroundRepeat: 'no-repeat',
            }}
          />
        ))}
      </div>
      {/* Gradient sits on the photo, so white text is safe in both themes.
          Zero darkening at the top — the artwork shows untouched; it darkens
          only toward the bottom where the copy sits. */}
      <div className="absolute inset-[-2px] bg-gradient-to-t from-black/85 via-transparent to-transparent" />
      <div className="absolute left-6 right-6 sm:left-10 bottom-8 sm:bottom-10 sm:max-w-xl">
        <h1 className="font-mono-ibm font-[200] leading-[1.05] tracking-tight text-white text-3xl sm:text-5xl">
          {title}
        </h1>
        <p className="mt-3 text-[13px] sm:text-[15px] font-light leading-relaxed text-white/65">
          {lead}
        </p>
        <a
          href="#collection"
          className="mt-5 inline-block rounded-full border border-white/35 px-6 py-3 text-[10px] font-light tracking-[0.22em] uppercase text-white hover:border-[#c2233f] hover:text-[#e0485a] transition-colors"
        >
          {cta} →
        </a>
      </div>
      {/* Caption — credits the visible work; hidden on small screens. */}
      <div className="absolute right-6 sm:right-10 bottom-8 sm:bottom-10 hidden md:block text-right font-mono-ibm text-[10px] leading-relaxed tracking-[0.2em] uppercase text-white/50">
        {cur.title}
        {cur.location ? ` · ${cur.location}` : ''}
        <br />
        {from(cur.fromText)}
      </div>
    </section>
  )
}

export default function ShopGrid({
  catalogVersion,
  landingCards = null,
  heroSlides = null,
  folderCards = [],
  isLeaf = false,
  availableTypes,
  initialCategoryPath = [],
  backPath = [],
  heading,
  intro,
  siteLabel,
  mockupVersion,
  posterTextOverrides = {},
}: {
  /** Opaque catalog version — cache-busts the client fetch of the photo tiles. */
  catalogVersion: string
  /** Server-rendered landing product-type cards — present only on the landing,
   *  so entering the shop needs no client catalog fetch. */
  landingCards?: TypeCard[] | null
  /** "Gallery wall" hero slides (fine-art room mockups) — landing only. */
  heroSlides?: HeroSlide[] | null
  /** Server-rendered sub-folder cards for a category view (empty on a leaf). */
  folderCards?: FolderCard[]
  /** True when this view is an actual photo collection (tiles are client-fetched). */
  isLeaf?: boolean
  availableTypes: ProductType[]
  /** Full nav path: [productType, ...subjectFolders]. Empty = landing. */
  initialCategoryPath?: string[]
  /** Skip-aware "back" target — the nearest stable ancestor (empty = landing). */
  backPath?: string[]
  /** Default page heading, shown on the landing (no product type chosen). */
  heading: string
  /** Shop intro paragraph, shown only on the landing. */
  intro: string
  /** Foot line for poster cards, e.g. "WWW.GUSMCEWAN.COM". */
  siteLabel: string
  /** MOCKUP_VERSION — busts the browser cache for fine-art cover tiles. */
  mockupVersion: number
  /** Locale-specific title + caption overrides for poster photos, keyed by photo
   *  id. Applied in PosterMat so the grid card matches the product page preview. */
  posterTextOverrides?: Record<string, { title: string; caption?: string }>
}) {
  const t = useTranslations('shop')
  const typeLabel = useCallback(
    (token: string) => (isProductType(token) ? t(typeMessageKey(token)) : token),
    [t],
  )

  // Photo tiles are fetched client-side from the edge-cached catalog endpoint
  // (the page no longer inlines the whole catalog — that blew the Worker CPU
  // limit). Only a LEAF collection needs the tile list; landing + folder views
  // render from server-passed cards and never fetch. The catalog is fetched ONCE
  // per version and kept across navigation — moving folder↔leaf or going back
  // never re-fetches or clears it, so revisits are instant.
  const [photos, setPhotos] = useState<GridPhoto[]>([])
  const fetchedVersion = useRef<string | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(false)
  useEffect(() => {
    // No server connection needed for this view (a card view, or a leaf whose
    // catalog we already hold) — tiles are already in the DOM, signal ready.
    // Deferred so NavigationOverlay's listener is set up before this fires
    // (React runs child effects before parent effects within the same commit).
    if (!isLeaf || fetchedVersion.current === catalogVersion) {
      setCatalogLoading(false)
      setTimeout(() => window.dispatchEvent(new CustomEvent('page:ready')), 0)
      return
    }
    let cancelled = false
    setCatalogLoading(true)
    fetch(`/api/shop/catalog?v=${encodeURIComponent(catalogVersion)}`)
      .then((r) =>
        r.ok
          ? (r.json() as Promise<{ photos?: GridPhoto[] }>)
          : Promise.reject(new Error(`HTTP ${r.status}`)),
      )
      .then((d) => {
        if (cancelled) return
        setPhotos(d.photos ?? [])
        fetchedVersion.current = catalogVersion
        setCatalogLoading(false)
      })
      .catch(() => { if (!cancelled) setCatalogLoading(false) })
    return () => { cancelled = true }
  }, [isLeaf, catalogVersion])

  // Tell the NavigationOverlay that this leaf's tiles are now in the DOM so it
  // can hold the overlay until the images actually finish loading.
  const prevCatalogLoading = useRef(catalogLoading)
  useEffect(() => {
    if (prevCatalogLoading.current && !catalogLoading) {
      window.dispatchEvent(new CustomEvent('page:ready'))
    }
    prevCatalogLoading.current = catalogLoading
  }, [catalogLoading])

  // The browse position is the URL path (resolved to real folder names by the
  // server); navigation is via real <Link>s, so refresh/share land here exactly.
  const navPath = initialCategoryPath
  const typeFilter: ProductType | null =
    navPath.length > 0 && isProductType(navPath[0]) ? navPath[0] : null
  const subjectPath = typeFilter ? navPath.slice(1) : []
  const isLanding = navPath.length === 0

  // The product-type cards shown on the landing, in publish-tree order. Prefer
  // the server-rendered cards (instant, no fetch); fall back to computing from
  // fetched photos if they weren't passed.
  const typeCards = PRODUCT_TYPE_ORDER.filter((tp) => availableTypes.includes(tp))
  const landingItems: TypeCard[] =
    landingCards ??
    typeCards.map((type) => ({
      type,
      count: countInType(photos, type),
      heroSrcs: keyPhotosForType(photos, type),
    }))

  const shown = photos
    .filter((p) => matchesCategory(p, subjectPath))
    .filter((p) => typeFilter === null || p.types.includes(typeFilter))
    // Sort chronologically within a leaf collection. The plugin now writes
    // catalog.json in capture-date order, but we sort here too as a fallback
    // (covers mock data and any catalog written before this fix was deployed).
    .sort((a, b) => (a.captureDate ?? 0) - (b.captureDate ?? 0))

  const isFolderView = !isLanding && !isLeaf
  // Posters leaf: photo cards are rendered as full poster mats (not square tiles).
  const isPosterLeaf = isLeaf && typeFilter === 'print'
  // Fine-art leaf: a masonry wall of large head-on cover mockups (random variant).
  const isFineArtLeaf = isLeaf && typeFilter === 'fine-art'
  // Changes when the view changes — re-arms each image's fade-in (LazyImage /
  // RotatingImage) so a persisting tile re-reveals on a filter/category change.
  const viewKey = navPath.join('|') || '·landing'
  // Eager-load roughly the first screenful of tiles; the rest lazy-load.
  const EAGER = 12

  // The spinner shows whenever a connection to the server is in flight — i.e.
  // while a leaf is fetching its tile catalog. Card views (landing/folder) and
  // already-fetched leaves never fetch, so they render immediately; each image
  // then fades itself in as it loads (no all-or-nothing reveal that hides ready
  // content).
  const showSpinner = catalogLoading

  return (
    <>
      {/* Landing with hero: the welcome copy (incl. the h1) lives INSIDE the
          gallery-wall hero. Other views keep the plain heading. */}
      {isLanding && (heroSlides?.length ?? 0) > 0 ? (
        <>
          {/* The hero card is desktop/tablet-only — on a phone the copy
              overruns the room scene, so mobile gets the plain welcome header
              instead (the hero's hidden h1 remains the page's single h1). */}
          <div className="hidden sm:block">
            <LandingHero
              slides={heroSlides!}
              mockupVersion={mockupVersion}
              title={t('landing.title')}
              lead={t('landing.lead')}
              cta={t('landing.cta')}
              from={(price) => t('landing.from', { price })}
            />
          </div>
          <header className="sm:hidden mb-10 mt-4">
            <p className="font-mono-ibm font-[200] leading-[1.05] tracking-tight text-3xl">{t('landing.title')}</p>
            <p className="mt-3 text-[13px] font-light leading-relaxed text-foreground/60">{t('landing.lead')}</p>
          </header>
        </>
      ) : (
        <header className="mb-12">
          <h1 className="text-4xl md:text-5xl font-light">
            {typeFilter ? t('sectionTitle', { name: t(typeMessageKey(typeFilter)) }) : heading}
          </h1>
          {isLanding && (
            <p className="mt-4 max-w-2xl text-foreground/60 leading-relaxed">{intro}</p>
          )}
        </header>
      )}

      {/* Breadcrumb (hidden on the landing) */}
      <Breadcrumb navPath={navPath} backPath={backPath} typeLabel={typeLabel} rootLabel={t('shopRoot')} />

      <div className="relative min-h-[50vh]">
        {/* Spinner — only while a leaf is fetching its tiles (first visit). */}
        {showSpinner && (
          <div className="absolute inset-0 z-10 flex items-start justify-center pt-24">
            <div className="shop-spinner" role="status" aria-label="Loading" />
          </div>
        )}

        <div>
          {isLanding ? (
            /* Landing: doorway panels — one per product type, taller than the
               old flat cards, with count + a one-line description. */
            <div id="collection" className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5 scroll-mt-28">
              {landingItems.map(({ type, heroSrcs }, idx) => {
                const doorKey =
                  type === 'print' ? 'landing.doorPrint' : type === 'fine-art' ? 'landing.doorFineArt' : 'landing.doorDigital'
                return (
                  <Link
                    key={type}
                    href={categoryUrl([type])}
                    className="group relative block overflow-hidden rounded-[16px] aspect-[4/3] sm:aspect-[3/4] bg-foreground/5 text-left transition-transform duration-300 hover:-translate-y-1 focus-visible:-translate-y-1 shadow-[0_20px_32px_-18px_rgba(0,0,0,0.85)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#931020]"
                  >
                    <RotatingImage srcs={heroSrcs} delay={idx * 700} gen={viewKey} />
                    <div className="absolute inset-[-2px] bg-gradient-to-t from-black/85 via-black/20 to-transparent group-hover:from-black/70 transition-all duration-500" />
                    <div className="absolute bottom-0 left-0 right-0 p-6 z-10 flex items-end justify-between gap-3">
                      <div>
                        <p className="font-mono-ibm font-[200] text-2xl text-white">{t(typeMessageKey(type))}</p>
                        <p className="mt-1 text-[11px] font-light text-white/55">{t(doorKey)}</p>
                      </div>
                      <span className="shrink-0 text-[#e0485a] text-lg transition-transform duration-300 group-hover:translate-x-1">→</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          ) : isFolderView ? (
            /* Has sub-categories: always show folder cards, never the photo
               grid. Same treatment as the landing doorway panels — mono white
               title on a strong gradient, shadow, rise on hover/focus. */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {folderCards.map((folder, nodeIdx) => {
                const { name, heroSrcs, path: folderPath } = folder
                return (
                  <Link
                    key={name}
                    href={categoryUrl(folderPath)}
                    className="group relative block overflow-hidden rounded-[16px] aspect-[4/3] bg-foreground/5 text-left transition-transform duration-300 hover:-translate-y-1 focus-visible:-translate-y-1 shadow-[0_20px_32px_-18px_rgba(0,0,0,0.85)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#931020]"
                  >
                    <RotatingImage srcs={heroSrcs} delay={nodeIdx * 700} gen={viewKey} />
                    <div className="absolute inset-[-2px] bg-gradient-to-t from-black/85 via-black/20 to-transparent group-hover:from-black/70 group-focus-visible:from-black/70 transition-all duration-500" />
                    <div className="absolute bottom-0 left-0 right-0 p-6 z-10 flex items-end justify-between gap-3">
                      <p className="font-mono-ibm font-[200] text-2xl text-white">{name}</p>
                      <span className="shrink-0 text-[#e0485a] text-lg transition-transform duration-300 group-hover:translate-x-1 group-focus-visible:translate-x-1">→</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          ) : (
            /* Leaf level: show photo grid */
            shown.length === 0 ? (
              <p className="text-foreground/40">{t('checkoutSoon')}</p>
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
                        alt={p.location ? `${p.title} — ${p.location}` : p.title}
                        title={posterTextOverrides[p.id]?.title ?? p.title}
                        caption={posterTextOverrides[p.id]?.caption ?? p.caption}
                        siteLabel={siteLabel}
                        maxWidth={600}
                        eager={i < 4}
                        grayscaleHover
                      />
                    </Link>
                  )
                })}
              </div>
            ) : isFineArtLeaf ? (
              /* Fine art: true masonry of large head-on cover mockups, two per row.
                 We distribute the tiles into REAL flex columns ourselves (NOT CSS
                 `columns`) — multicol mis-balances (2nd column pushed down) and
                 mis-composites transformed tiles in Chromium. Here every tile is a
                 plain block in a flex column, so the hover-raise just works and the
                 columns start flush at the top. Sequential split keeps reading order
                 on mobile (the two columns stack in order). */
              <div className="flex flex-col sm:flex-row gap-[7.5rem] sm:gap-[10.5rem] items-start">
                {(() => {
                  const half = Math.ceil(shown.length / 2)
                  return [shown.slice(0, half), shown.slice(half)].map((col, ci) => (
                    <div key={ci} className="flex-1 min-w-0 flex flex-col gap-[7.5rem] sm:gap-[10.5rem]">
                      {col.map((p, j) => (
                        <Link
                          key={p.id}
                          href={`/shop/${p.slug}`}
                          // Descending z down the column so each tile's lift-shadow
                          // always paints OVER the tile below it (never clipped → no
                          // hard line). The shadow offset is downward, so a hovered
                          // tile's glow falls on the lower-z tile below → not clipped.
                          style={{ zIndex: col.length - j }}
                          className="group relative block select-none"
                          onContextMenu={(e) => e.preventDefault()}
                        >
                          <div className="relative transition-transform duration-300 ease-out group-hover:-translate-y-1">
                            {p.salePct ? <SalePill pct={p.salePct} className="absolute top-3 left-3 z-10" /> : null}
                            <FineArtCoverTile photo={p} version={mockupVersion} eager />
                          </div>
                          <div className="mt-4 flex items-baseline justify-between gap-3">
                            <p className="min-w-0 text-[14px] font-light leading-tight text-foreground/80 truncate">{p.title}</p>
                            <p className="fa-price shrink-0 text-[12px] tracking-wide">{t('from')} {p.fromText}</p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ))
                })()}
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
                      <div className="relative overflow-hidden bg-foreground/5 aspect-square">
                        {p.salePct ? <SalePill pct={p.salePct} className="absolute top-2 left-2 z-10" /> : null}
                        <LazyImage
                          src={previewSrc(p.previewUrl, 800, isPhysical(typeFilter))}
                          alt={p.location ? `${p.title} — ${p.location}` : p.title}
                          eager={i < EAGER}
                          gen={viewKey}
                        />
                      </div>
                      {typeFilter === 'digital' ? (
                        /* Digital: title/location on the left (as before), with the
                           unique code + "from" price added on the right of each row. */
                        <>
                          <div className="mt-1.5 flex items-baseline justify-between gap-2">
                            <p className="min-w-0 text-[12px] font-light leading-tight text-foreground/70 truncate">{p.title}</p>
                            <p className="shrink-0 text-[11px] font-mono-ibm tracking-wide text-accent">{p.slug.toUpperCase()}</p>
                          </div>
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="min-w-0 text-[10px] tracking-[0.15em] uppercase text-foreground/35 truncate">{p.location}</p>
                            <p className="shrink-0 text-[10px] tracking-wide text-foreground/45">{t('from')} {p.fromText}</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="mt-1.5 text-[12px] font-light leading-tight text-foreground/70 truncate">{p.title}</p>
                          <p className="text-[10px] tracking-[0.15em] uppercase text-foreground/35 truncate">{p.location}</p>
                        </>
                      )}
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
