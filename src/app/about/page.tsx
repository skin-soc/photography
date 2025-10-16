import Image from 'next/image'

export default function About() {
  return (
    <div className="min-h-screen bg-white dark:bg-black py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          {/* Profile Section */}
          <div className="text-center mb-16">
            <div className="w-64 h-64 mx-auto mb-8 relative rounded-full overflow-hidden">
              <Image
                src="/images/gus-mcewan.jpg"
                alt="Gus McEwan"
                fill
                className="object-cover scale-100"
                style={{ objectPosition: '0px 0px' }}
                priority
              />
            </div>
            <h1 className="text-4xl font-bold mb-4 text-black dark:text-white">Gus McEwan</h1>
            <p className="text-xl text-[#931020]">Husband, Photographer, Scientist</p>
          </div>

          {/* Bio Section */}
          <div className="prose prose-lg mx-auto">
            <h2 className="text-3xl font-bold mb-8 text-black dark:text-white">About Gus</h2>
            <p className="mb-6 text-black dark:text-white">
              My journey in photography began when my grandfather gave me his old
              Leica camera, I was 12 years old. Since then, I&apos;ve had the privilege 
              of learning and working with amazing people and cultures from all around
              the world.
            </p>
            <p className="mb-6 text-black dark:text-white">
              I spent a long part of my life studying Earth sciences and I tended to 
              use photography to escape the rigors of science, until the day when it 
              was no longer possible to return from my escapades. That said I am proud
              of my contributions to the battle against human cognitive dissonance on 
              climate change.
            </p>
            <p className="mb-6 text-black dark:text-white">
              I specialise in natural light photography. I believe it is important to
              be a faithful recording agent. Recording light (and shadows) can be very
              challenging in itself, particularly when we all perceive and sense it ever 
              so slightly differently. For me, photography is one of mankind&apos;s attempts 
              to freeze time, an eternally failed attempt - and yet - one that continues 
              to illude us all. 
            </p>
            <p className="mb-6 text-black dark:text-white">
              My work has been featured in several publications such as Vogue, 
              National Geographic and The Guardian. I&apos;ve also had the honor of 
              receiving some awards, such as The Best Music Moment of The Year 
              from the British Journal of Photography in 2017.
            </p>
          </div>

          {/* Services Section */}
          {/* <div className="mt-16">
            <h2 className="text-3xl font-bold mb-8 text-center text-black dark:text-white">Services</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  title: 'Portrait Photography',
                  description: 'Capturing your unique personality and style.'
                },
                {
                  title: 'Event Coverage',
                  description: 'Documenting your special moments with care.'
                },
                {
                  title: 'Commercial Photography',
                  description: 'Professional images for your business needs.'
                }
              ].map((service) => (
                <div
                  key={service.title}
                  className="bg-white dark:bg-black border border-[#931020] p-6 rounded-lg text-center"
                >
                  <h3 className="text-xl font-bold mb-4 text-black dark:text-white">{service.title}</h3>
                  <p className="text-[#931020]">{service.description}</p>
                </div>
              ))}
            </div>
          </div> */}
        </div>
      </div>
    </div>
  )
} 