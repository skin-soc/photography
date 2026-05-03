// Fixed footer — always visible at the bottom of the viewport, floats above gallery content
export default function GalleryFooter() {
  return (
    <footer className="fixed bottom-0 left-0 right-0 z-40 py-4 text-center pointer-events-none">
      <span className="text-[9px] font-light tracking-[0.2em] uppercase text-white/25">
        Copyright © {new Date().getFullYear()} Gus McEwan Photography
      </span>
    </footer>
  )
}
