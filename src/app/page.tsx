import Image from 'next/image'
import Link from 'next/link'

const categories = [
  {
    href: '/people',
    label: 'People',
    sub: 'Portraiture & humanity',
    src: 'https://gusmcewan.com/images/gallery/PE00001.jpg',
    alt: 'People by Gus McEwan',
    span: true, // full width hero
  },
  {
    href: '/places',
    label: 'Places',
    sub: 'Cities & architecture',
    src: 'https://gusmcewan.com/images/gallery/PL00001.jpg',
    alt: 'Københavns Domhus by Gus McEwan',
    span: false,
  },
  {
    href: '/nature',
    label: 'Nature',
    sub: 'Light & the natural world',
    src: 'https://gusmcewan.com/images/gallery/PL00003.jpg',
    alt: 'Calderon Hondo by Gus McEwan',
    span: false,
  },
]

export default function Home() {
  return (
    <main className="pt-[52px]">
      <div className="grid grid-cols-2 gap-[3px] p-[3px]">
        {categories.map(({ href, label, sub, src, alt, span }) => (
          <Link
            key={href}
            href={href}
            className={`group relative overflow-hidden bg-[#111] ${
              span ? 'col-span-2 aspect-[16/7]' : 'aspect-[4/3]'
            }`}
          >
            <Image
              src={src}
              alt={alt}
              fill
              sizes={span ? '100vw' : '50vw'}
              className="object-cover brightness-75 transition-all duration-700 ease-out group-hover:scale-[1.03] group-hover:brightness-50"
              priority={span}
            />
            {/* gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />
            {/* label */}
            <div className="absolute bottom-0 left-0 right-0 p-7 pointer-events-none">
              <h2 className="font-serif font-light text-white tracking-wide leading-none" style={{ fontSize: span ? '2.2rem' : '1.6rem' }}>
                {label}
              </h2>
              <span className="block text-[9px] font-light tracking-[0.22em] uppercase text-white/50 mt-2">
                {sub}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  )
}
