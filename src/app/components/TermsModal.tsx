'use client'

import { useTranslations } from 'next-intl'

/**
 * Terms & Conditions modal — the pre-contract disclosure required by the EU
 * Consumer Rights Directive (2011/83/EU). The load-bearing sections:
 *  - §1 made-to-order prints carry NO 14-day right of withdrawal (Art. 16(c));
 *  - §2 digital downloads lose the withdrawal right once delivery begins with
 *    the buyer's express consent (Art. 16(m)) — that consent is collected by
 *    the cart checkbox that links here;
 *  - §3 statutory conformity rights for defective goods remain untouched
 *    (Directive (EU) 2019/771).
 * Content lives in the `terms` message namespace (all locales). Styled to
 * match LicensingModal.
 */

function Section({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7 first:mt-0">
      <div className="flex items-baseline gap-2.5 mb-1.5">
        <span className="shrink-0 text-[10px] font-mono-ibm font-light tracking-[0.18em] text-accent-bright/80">{num}.</span>
        <h3 className="text-[10px] font-light tracking-[0.2em] uppercase text-accent-bright">{title}</h3>
      </div>
      <div className="pl-4 border-l border-foreground/[0.07]">
        <p className="text-[12px] font-light text-foreground/80 leading-relaxed">{children}</p>
      </div>
    </section>
  )
}

export default function TermsModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations('terms')

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.82)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full rounded-t-[24px] sm:rounded-[20px] border border-foreground/10 flex flex-col"
        style={{ maxWidth: '540px', maxHeight: '90dvh', backgroundColor: 'rgb(var(--bg))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-foreground/[0.07] shrink-0">
          <div>
            <p className="text-[9px] font-light tracking-[0.22em] uppercase text-foreground/40">
              Gus McEwan Photography
            </p>
            <h2 className="mt-0.5 text-[13px] font-mono-ibm font-[200] tracking-tight text-accent-bright leading-snug">
              {t('title')}
            </h2>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close"
            className="shrink-0 text-[20px] leading-none text-foreground/30 hover:text-foreground transition-colors mt-0.5"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5">
          <p className="text-[12px] font-light text-foreground/75 leading-relaxed mb-6">{t('intro')}</p>
          <Section num={1} title={t('s1Title')}>{t('s1_1')}</Section>
          <Section num={2} title={t('s2Title')}>{t('s2_1')}</Section>
          <Section num={3} title={t('s3Title')}>{t('s3_1')}</Section>
          <Section num={4} title={t('s4Title')}>{t('s4_1')}</Section>
          <Section num={5} title={t('s5Title')}>{t('s5_1')}</Section>
          <div className="h-4" />
        </div>

        <div className="shrink-0 px-6 py-4 border-t border-foreground/[0.07]">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-[14px] border border-foreground/15 py-3 text-[10px] font-light tracking-[0.22em] uppercase text-foreground/55 hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  )
}
