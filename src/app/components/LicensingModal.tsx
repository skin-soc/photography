'use client'

import { useTranslations } from 'next-intl'

/* ── Types ────────────────────────────────────────────────────────────────── */

export type LicensingModalMode = 'view' | 'agree'

interface Props {
  mode?: LicensingModalMode
  onAgree?: () => void
  onClose: () => void
}

/* ── Section + DashList helpers ───────────────────────────────────────────── */

function Section({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7 first:mt-0">
      <div className="flex items-baseline gap-2.5 mb-1.5">
        <span className="shrink-0 text-[10px] font-mono-ibm font-light tracking-[0.18em] text-accent-bright/80">{num}.</span>
        <h3 className="text-[10px] font-light tracking-[0.2em] uppercase text-accent-bright">{title}</h3>
      </div>
      <div className="pl-4 border-l border-white/[0.07]">{children}</div>
    </section>
  )
}

function Tier({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="mb-5 last:mb-0">
      <p className="mb-2 text-[9px] tracking-[0.18em] uppercase text-accent-bright/90">{label}</p>
      <DashList items={items} />
    </div>
  )
}

function DashList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-[12px] font-light text-white/80 leading-relaxed">
          <span className="shrink-0 text-accent-bright/70 select-none mt-0.5">—</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

/* ── Modal ────────────────────────────────────────────────────────────────── */

export default function LicensingModal({ mode = 'view', onAgree, onClose }: Props) {
  const t = useTranslations('licensing')

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.82)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full rounded-t-[24px] sm:rounded-[20px] border border-white/10 flex flex-col"
        style={{
          maxWidth: '540px',
          maxHeight: '90dvh',
          margin: '0 0',
          backgroundColor: '#0c0c0c',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Sticky header ── */}
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-white/[0.07] shrink-0">
          <div>
            <p className="text-[9px] font-light tracking-[0.22em] uppercase text-white/40">
              Gus McEwan Photography
            </p>
            <h2 className="mt-0.5 text-[13px] font-mono-ibm font-[200] tracking-tight text-accent-bright leading-snug">
              {t('title')}
            </h2>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close"
            className="shrink-0 text-[20px] leading-none text-white/30 hover:text-white transition-colors mt-0.5"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >×</button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="overflow-y-auto flex-1 px-6 py-5">

          {/* Intro */}
          <p className="text-[12px] font-light text-white/75 leading-relaxed mb-6">
            {t('intro')}
          </p>

          {/* 1 — License Tiers */}
          <Section num={1} title={t('s1Title')}>
            <Tier label={t('s1PersonalLabel')} items={[t('s1Personal1'), t('s1Personal2'), t('s1Personal3')]} />
            <Tier label={t('s1EditorialLabel')} items={[t('s1Editorial1'), t('s1Editorial2'), t('s1Editorial3'), t('s1Editorial4')]} />
            <Tier label={t('s1CommercialLabel')} items={[t('s1Commercial1'), t('s1Commercial2'), t('s1Commercial3')]} />
            <Tier label={t('s1FullLabel')} items={[t('s1Full1'), t('s1Full2'), t('s1Full3')]} />
          </Section>

          {/* 2 — General Restrictions */}
          <Section num={2} title={t('s2Title')}>
            <p className="mb-3 text-[12px] font-light text-white/75 leading-relaxed">{t('s2Intro')}</p>
            <DashList items={[t('s2_1'), t('s2_2'), t('s2_3'), t('s2_4'), t('s2_5')]} />
          </Section>

          {/* 3 — Public Event */}
          <Section num={3} title={t('s3Title')}>
            <p className="text-[12px] font-light text-white/80 leading-relaxed">{t('s3_1')}</p>
            <p className="mt-2.5 text-[12px] font-light text-white/80 leading-relaxed">{t('s3_2')}</p>
          </Section>

          {/* 4 — File Delivery */}
          <Section num={4} title={t('s4Title')}>
            <DashList items={[t('s4_1'), t('s4_2'), t('s4_3')]} />
          </Section>

          {/* 5 — No Warranty */}
          <Section num={5} title={t('s5Title')}>
            <p className="text-[12px] font-light text-white/80 leading-relaxed">{t('s5_1')}</p>
          </Section>

          {/* 6 — Governing Law */}
          <Section num={6} title={t('s6Title')}>
            <p className="text-[12px] font-light text-white/80 leading-relaxed">{t('s6_1')}</p>
          </Section>

          <p className="mt-7 text-[11px] font-light text-white/45 leading-relaxed">{t('s7Thanks')}</p>

          {/* bottom padding inside scroll area */}
          <div className="h-4" />
        </div>

        {/* ── Sticky footer ── */}
        <div className="shrink-0 px-6 py-4 border-t border-white/[0.07]">
          {mode === 'agree' ? (
            <button
              type="button"
              onClick={() => { onAgree?.(); onClose() }}
              className="w-full rounded-[14px] bg-accent py-3 text-[10px] font-light tracking-[0.22em] uppercase text-white hover:bg-accent/90 transition-colors"
            >
              {t('agreeAndClose')}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-[14px] border border-white/15 py-3 text-[10px] font-light tracking-[0.22em] uppercase text-white/55 hover:text-white hover:border-white/30 transition-colors"
            >
              {t('close')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
