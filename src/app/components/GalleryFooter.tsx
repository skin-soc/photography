import Link from 'next/link'

interface Props {
  links: { href: string; label: string }[]
}

export default function GalleryFooter({ links }: Props) {
  return (
    <footer className="flex items-center gap-7 px-7 py-12 border-t border-white/5 mt-[3px]">
      {links.map(({ href, label }, i) => (
        <span key={href} className="flex items-center gap-7">
          {i > 0 && <span className="w-[3px] h-[3px] rounded-full bg-white/25" />}
          <Link
            href={href}
            className="text-[9px] font-light tracking-[0.22em] uppercase text-white/35 hover:text-white transition-colors"
          >
            {label}
          </Link>
        </span>
      ))}
    </footer>
  )
}
