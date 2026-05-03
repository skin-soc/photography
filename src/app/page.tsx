import Link from 'next/link'

// Cover images — chosen as the strongest hero candidates per category:
//   People:  PP00001 — opens the gallery, assumed strong portrait
//   Places:  PL00003 — Calderon Hondo, volcanic, dramatic
//   Nature:  NT00001 — opens the gallery, assumed strong landscape
// All images are served from /images/gallery (local public dir) — no hotlink risk.
// WebP preferred via <picture> source, jpg fallback.

const categories = [
  {
    href: '/people',
    label: 'People',
    sub: 'Portraiture & humanity',
    webp: '/images/gallery/PP00005.webp',
    jpg:  '/images/gallery/PP00005.jpg',
    alt:  'People — Gus McEwan Photography',
    hero: true,
  },
  {
    href: '/places',
    label: 'Places',
    sub: 'Cities & architecture',
    webp: '/images/gallery/PL00003.webp',
    jpg:  '/images/gallery/PL00003.jpg',
    alt:  'Calderon Hondo, Fuerteventura — Gus McEwan Photography',
    hero: false,
  },
  {
    href: '/nature',
    label: 'Nature',
    sub: 'Light & the natural world',
    webp: '/images/gallery/NT00007.webp',
    jpg:  '/images/gallery/NT00007.jpg',
    alt:  'Nature — Gus McEwan Photography',
    hero: false,
  },
]

export default function Home() {
  return (
    <main className="pt-[52px]">
      <div className="grid grid-cols-2 gap-[3px] p-[3px]">
        {categories.map(({ href, label, sub, webp, jpg, alt, hero }) => (
          <Link
            key={href}
            href={href}
            className={`group relative overflow-hidden bg-[#111] ${
              hero ? 'col-span-2 aspect-[16/7]' : 'aspect-[4/3]'
            }`}
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
          >
            <picture className="absolute inset-0 w-full h-full">
              <source srcSet={webp} type="image/webp" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={jpg}
                alt={alt}
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
                onDragStart={(e) => e.preventDefault()}
                className="w-full h-full object-cover brightness-75 transition-all duration-700 ease-out group-hover:scale-[1.03] group-hover:brightness-50 select-none pointer-events-none"
                style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                loading={hero ? 'eager' : 'lazy'}
              />
            </picture>
            {/* gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent pointer-events-none" />
            {/* label */}
            <div className="absolute bottom-0 left-0 right-0 px-7 pb-6 pt-16 pointer-events-none">
              <h2
                className="font-serif font-light text-white tracking-wide leading-none"
                style={{ fontSize: hero ? '2.25rem' : '1.6rem' }}
              >
                {label}
              </h2>
              <span className="block text-[9px] font-light tracking-[0.22em] uppercase text-white/45 mt-2">
                {sub}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  )
}
