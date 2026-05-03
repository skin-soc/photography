export default function About() {
  return (
    <main className="pt-[52px]">
      <div className="max-w-xl px-7 py-16">
        <h1 className="font-serif font-light text-[2.25rem] tracking-wide mb-8">
          Gus McEwan
        </h1>
        <p className="text-[13px] font-light leading-[1.9] text-white/55 tracking-wide mb-5">
          Photographer based between Copenhagen and London. Working across portraiture,
          landscape, and the natural world — drawn to light, stillness, and the space
          between moments.
        </p>
        <p className="text-[13px] font-light leading-[1.9] text-white/55 tracking-wide mb-8">
          Available for commissioned work. Selected clients and editorial enquiries welcome.
        </p>
        <a
          href="mailto:hello@gusmcewan.com"
          className="text-[9px] font-light tracking-[0.22em] uppercase text-white border-b border-[#931020] pb-px hover:text-white/70 transition-colors"
        >
          hello@gusmcewan.com
        </a>
      </div>
    </main>
  )
}
