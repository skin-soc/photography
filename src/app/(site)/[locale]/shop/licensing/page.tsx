import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { SITE_URL, BUSINESS_NAME } from '@/i18n/seo'
import { routing } from '@/i18n/routing'
import LicensingContactButton from './LicensingContactButton'

type Params = Promise<{ locale: string }>

function localizedUrl(locale: string): string {
  const prefix = locale === routing.defaultLocale ? '' : `/${locale}`
  return `${SITE_URL}${prefix}/shop/licensing`
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params
  const title = 'Licensing Terms & Usage Rights'
  const description =
    'Full licensing terms for digital image downloads from Gus McEwan Photography — personal, editorial, commercial and full commercial use rights explained.'
  const canonical = localizedUrl(locale)
  const languages: Record<string, string> = {}
  for (const l of routing.locales) languages[l] = localizedUrl(l)
  languages['x-default'] = `${SITE_URL}/shop/licensing`

  return {
    title,
    description,
    alternates: { canonical, languages },
    openGraph: {
      title: `${title} | ${BUSINESS_NAME}`,
      description,
      url: canonical,
      type: 'website',
    },
  }
}

export default async function LicensingPage({ params }: { params: Params }) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <main className="min-h-screen bg-black text-white px-[6vw] pt-[calc(6vw+128px)] pb-32">

      {/* Back link */}
      <Link
        href="/shop"
        className="text-[10px] font-light tracking-[0.22em] uppercase text-white/35 hover:text-white/70 transition-colors"
      >
        ← Shop
      </Link>

      <div className="mt-10 max-w-2xl">

        {/* Heading */}
        <p className="text-[10px] tracking-[0.3em] uppercase text-accent/80">
          Gus McEwan Photography
        </p>
        <h1 className="mt-2 text-4xl md:text-5xl font-mono-ibm font-[200] leading-[1.1] tracking-tight text-accent">
          Licensing Terms &amp; Usage Rights
        </h1>
        <div className="mt-6 h-px bg-white/[0.10]" />

        {/* Intro */}
        <p className="mt-6 text-[14px] font-light text-white/55 leading-relaxed">
          By purchasing and downloading any digital file from this site, you agree to the following terms.
          This is a non-exclusive, non-transferable license to use the purchased digital image file strictly
          as outlined below. All rights not expressly granted remain with Gus McEwan Photography.
        </p>

        {/* ── 1. License Tiers ─────────────────────────────────────────────── */}
        <Section num="1" title="License Tiers">
          <Tier label="Personal Use" items={[
            'Permitted for personal, non-commercial purposes only (e.g. printing for your home, personal social media posts, personal gifts).',
            'Maximum resolution: as specified on the product page.',
            'No commercial use, no resale, no public display for business purposes.',
          ]} />

          <Tier label="Editorial Use — Pro tier" items={[
            'Permitted for editorial, news, documentary, or educational purposes.',
            'Maximum number of copies/reproductions: as stated on the product page (e.g. up to 5,000).',
            'Includes use in books, magazines, websites, blogs, and social media when the primary purpose is informational or documentary.',
            'Credit line "© Gus McEwan" is appreciated but not required.',
          ]} />

          <Tier label="Commercial Use — Master tier" items={[
            'Permitted for commercial purposes with the copy limit stated on the product page (e.g. up to 500,000 reproductions).',
            'Includes advertising, marketing materials, websites, packaging, and promotional use.',
            'The image may be used as part of a larger design or layout.',
          ]} />

          <Tier label="Full Commercial Use — Original tier" items={[
            'Unlimited reproductions and full commercial rights worldwide.',
            'Includes all rights granted in the Commercial tier plus the ability to use the image without copy restrictions.',
            'Suitable for large-scale campaigns, products, or resale of derivative works (subject to the restrictions below).',
          ]} />

          <p className="mt-2 text-[12px] font-light text-white/35 leading-relaxed italic">
            RAW files are available on request for an additional fee and are subject to separate terms.
          </p>
        </Section>

        {/* ── 2. General Restrictions ──────────────────────────────────────── */}
        <Section num="2" title="General Restrictions">
          <p className="mb-4 text-[13px] font-light text-white/45 leading-relaxed">
            The following restrictions apply to all license tiers. You may not:
          </p>
          <DashList items={[
            'Resell, redistribute, or sublicense the digital file itself (or any high-resolution version) in any form.',
            'Use the image in any defamatory, illegal, pornographic, or misleading context, or in a way that could harm the reputation of any person depicted.',
            'Use the image to imply endorsement of any product, service, or opinion by any person shown in the photograph unless separate written permission has been obtained.',
            'Remove or alter any embedded metadata, watermarks, or copyright information.',
            'Claim copyright or authorship of the image.',
          ]} />
        </Section>

        {/* ── 3. Public Event & Personality Rights ─────────────────────────── */}
        <Section num="3" title="Public Event & Personality Rights Notice">
          <p className="text-[13px] font-light text-white/55 leading-relaxed">
            Many images on this site were captured at public events (such as Copenhagen Pride) in public
            spaces. While photography at such events is generally permitted, the use of images featuring
            identifiable individuals may be subject to personality rights, privacy laws, or
            right-of-publicity rules in your jurisdiction.
          </p>
          <p className="mt-3 text-[13px] font-light text-white/55 leading-relaxed">
            You are responsible for ensuring that your intended use complies with all applicable local laws
            regarding the rights of any people depicted. This license does not grant you permission to use
            any person&apos;s likeness in a manner that violates their personality or privacy rights.
          </p>
        </Section>

        {/* ── 4. File Delivery ─────────────────────────────────────────────── */}
        <Section num="4" title="File Delivery & Technical Specifications">
          <DashList items={[
            'Files are delivered as high-quality digital downloads (JPEG or 16-bit TIFF as specified).',
            'You are responsible for backing up your purchased files. Replacement downloads are available for a limited period after purchase — please contact us if you lose access.',
            'Colour profiles and technical specifications are as described on each product page.',
          ]} />
        </Section>

        {/* ── 5. No Warranty ───────────────────────────────────────────────── */}
        <Section num="5" title="No Warranty & Limitation of Liability">
          <p className="text-[13px] font-light text-white/55 leading-relaxed">
            The images are provided &ldquo;as is.&rdquo; While every effort is made to deliver
            high-quality files, Gus McEwan Photography makes no warranties regarding fitness for a
            particular purpose beyond the license granted. Liability is limited to the purchase price
            of the license.
          </p>
        </Section>

        {/* ── 6. Governing Law ─────────────────────────────────────────────── */}
        <Section num="6" title="Governing Law">
          <p className="text-[13px] font-light text-white/55 leading-relaxed">
            These terms are governed by the laws of Denmark. Any disputes shall be resolved in the
            courts of Denmark.
          </p>
        </Section>

        {/* ── 7. Contact & Custom Licenses ─────────────────────────────────── */}
        <Section num="7" title="Contact & Custom Licenses">
          <p className="text-[13px] font-light text-white/55 leading-relaxed">
            For custom licensing, bulk purchases, extended rights, or RAW file requests, please{' '}
            <LicensingContactButton />.
          </p>
          <p className="mt-6 text-[12px] font-light text-white/25 leading-relaxed">
            Thank you for supporting independent photography.
          </p>
        </Section>

      </div>
    </main>
  )
}

/* ── Sub-components ──────────────────────────────────────────────────────── */

function Section({
  num,
  title,
  children,
}: {
  num: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-10">
      <div className="flex items-baseline gap-3 mb-4">
        <span className="shrink-0 text-[10px] font-mono-ibm font-light tracking-[0.2em] text-accent/50">
          {num}.
        </span>
        <h2 className="text-[11px] font-light tracking-[0.22em] uppercase text-white/60">
          {title}
        </h2>
      </div>
      <div className="pl-5 border-l border-white/[0.07]">
        {children}
      </div>
    </section>
  )
}

function Tier({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="mb-6 last:mb-0">
      <p className="mb-2.5 text-[10px] tracking-[0.18em] uppercase text-accent/60">{label}</p>
      <DashList items={items} />
    </div>
  )
}

function DashList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-[13px] font-light text-white/55 leading-relaxed">
          <span className="shrink-0 text-accent/50 mt-0.5 select-none">—</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}
