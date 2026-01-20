import Image from 'next/image'

export default function Contact() {
  return (
    <div className="min-h-screen bg-white dark:bg-black py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          {/* Profile Section */}
          <div className="text-center mb-16">
            <div className="w-64 h-64 mx-auto mb-8 relative rounded-full overflow-hidden">
              <Image
                src="/images/logo.svg"
                alt="Gus McEwan"
                fill
                className="object-cover scale-100"
                style={{ objectPosition: '0px 0px' }}
                priority
              />
            </div>
            <h1 className="text-4xl font-bold mb-4 text-black dark:text-white">Gus McEwan Photography</h1>
            <p className="text-xl text-[#931020]">Copenhagen - London</p>
          {/* Services Section */}
          <div className="mt-16">  
            <h1 className="text-5xl font-bold mb-4 text-black dark:text-white"><a className="text-black dark:text-white hover:text-[#931020]" href="https://x.com/gusmcewanphoto" target="_blank">𝕏</a></h1>
          </div>
          <div className="mt-16">  
            <h2 className="text-3xl font-bold mb-8 text-center text-black dark:text-white">Get in touch!</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  title: 'Legal & Contracts',
                  description: 'Erika Kay copy@gusmcewan.com'
                },
                {
                  title: 'Agents',
                  description: 'Represented by SIGMA https://sigmaagency.ee'
                },
                {
                  title: 'Studio (Bow)',
                  description: 'Stefan Harden lights@gusmcewan.com'
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
          </div>

          <div className="mt-16">
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  title: 'Jobs',
                  description: 'Looking for? shoot@gusmcewan.com'
                },
                {
                  title: 'Archive',
                  description: 'Lara Chaters bytes@gusmcewan.com'
                },
                {
                  title: 'Stock',
                  description: 'Represented by ALAMY https://alamy.com'
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
          </div>

        </div>
        </div>
      </div>
    </div>
  )
} 