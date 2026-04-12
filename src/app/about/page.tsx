import Image from 'next/image'

export default function About() {
  return (
    <div className="min-h-screen bg-black py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">

          {/* Profile Section */}
          <div className="text-center mb-16">
            <div className="w-64 h-64 mx-auto mb-8 relative rounded-full overflow-hidden">
              <picture>
                <source srcSet="/images/gus-mcewan.webp" type="image/webp" />
                <Image
                  src="/images/gus-mcewan.jpg"
                  alt="Gus McEwan"
                  fill
                  className="object-cover scale-100"
                  style={{ objectPosition: '0px 0px' }}
                  priority
                />
              </picture>
            </div>
            <h1 className="text-4xl font-bold mb-4 text-white">Gus McEwan</h1>
            <p className="text-xl text-[#931020]">Husband, Photographer, Scientist</p>
          </div>

          {/* Bio Section */}
          <div className="prose prose-lg mx-auto">
            <h2 className="text-3xl font-bold mb-8 text-white">About Gus</h2>
            <p className="mb-6 text-white leading-relaxed">
              It started with a Leica. His grandfather&apos;s, to be precise — pressed into
              twelve-year-old hands with no instruction manual and no expectations.
              That camera became a lifelong companion, and the act of looking through
              a viewfinder became, for Gus McEwan, a way of making sense of the world.
            </p>
            <p className="mb-6 text-white leading-relaxed">
              Before photography consumed him entirely, Gus built a distinguished career
              in Earth sciences, contributing original research to our understanding of
              climate change and the stubborn human tendency to look away from
              uncomfortable truths. Science taught him precision, patience, and the
              value of bearing honest witness — qualities that now define his work
              behind the lens.
            </p>
            <p className="mb-6 text-white leading-relaxed">
              Gus is a natural light photographer in the most committed sense of the
              phrase. He does not bend light to his will — he waits for it, studies it,
              and follows where it leads. His images are acts of faithful observation:
              an attempt to record not just what something looks like, but how it
              actually felt to be there. Light and shadow, he believes, carry emotional
              weight that no artificial setup can replicate.
            </p>
            <p className="mb-6 text-white leading-relaxed">
              That philosophy has taken him across the world — through festivals and
              conflict zones, royal courts and coastal wilderness — and his work has
              appeared in the pages of Vogue, National Geographic, and The Guardian.
              In 2017, the British Journal of Photography recognised him with their
              Best Music Moment of the Year award.
            </p>
            <p className="mb-6 text-white leading-relaxed">
              He describes photography as mankind&apos;s most beautiful failure: an
              eternal attempt to freeze time that never quite succeeds — and is all
              the more compelling for it.
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}
