export default function GalleryFooter() {
  return (
    <footer className="w-full py-10 mt-[3px] border-t border-white/5 text-center">
      <span className="text-[9px] font-light tracking-[0.2em] uppercase text-white/25">
        Copyright © {new Date().getFullYear()} Gus McEwan Photography
      </span>
    </footer>
  )
}
