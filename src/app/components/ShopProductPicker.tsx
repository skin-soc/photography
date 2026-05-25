'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { ProductType } from '@/lib/shop'

export interface PickerProduct {
  sku: string
  type: ProductType
  label: string
  /** Spec line — pixel size (digital) or paper size in cm (print/fine-art). */
  spec: string | null
  price: number
  priceText: string
  approxText: string
}

const TYPE_ORDER: ProductType[] = ['print', 'fine-art', 'digital']

/**
 * Interactive product chooser for a shop photo. Each product class (Prints /
 * Fine Art / Digital Downloads) is one rounded "pill" — a shaded header over
 * its selectable options. Picking an option drives the Add to cart button.
 */
export default function ShopProductPicker({
  products,
  rawAvailable = false,
  rawRequestHref,
}: {
  products: PickerProduct[]
  rawAvailable?: boolean
  rawRequestHref?: string
}) {
  const t = useTranslations('shop')

  const typeLabel: Record<ProductType, string> = {
    print: t('prints'),
    'fine-art': t('fineArt'),
    digital: t('digital'),
  }

  // Default to the cheapest option so the CTA always shows a price.
  const cheapest = products.reduce((lo, p) => (p.price < lo.price ? p : lo))
  const [selectedSku, setSelectedSku] = useState(cheapest.sku)
  const selected = products.find((p) => p.sku === selectedSku) ?? cheapest

  const groups = TYPE_ORDER.map((type) => ({
    type,
    items: products.filter((p) => p.type === type),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="mt-10">
      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.type} className="overflow-hidden rounded-[20px] border border-white/10">
            {/* Shaded header */}
            <div className="bg-white/[0.07] px-5 py-2.5">
              <h2 className="text-[12px] font-light tracking-[0.2em] uppercase text-accent">
                {typeLabel[g.type]}
              </h2>
            </div>

            {/* Selectable options */}
            <div className="divide-y divide-white/[0.07]">
              {g.items.map((p) => {
                const on = p.sku === selectedSku
                return (
                  <button
                    key={p.sku}
                    type="button"
                    onClick={() => setSelectedSku(p.sku)}
                    aria-pressed={on}
                    className={`flex w-full items-start gap-3 px-5 py-3 text-left transition-colors ${
                      on ? 'bg-accent/[0.14]' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    {/* Radio indicator — centered to the label's text line */}
                    <span className="flex h-[22px] shrink-0 items-center">
                      <span
                        className={`grid h-3.5 w-3.5 place-items-center rounded-full border transition-colors ${
                          on ? 'border-accent bg-accent' : 'border-white/35'
                        }`}
                      >
                        {on && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </span>
                    </span>

                    <span className="flex-1">
                      <span className="block text-[15px] leading-[22px] text-white/85">
                        {p.label}
                      </span>
                      {p.spec && (
                        <span className="mt-0.5 block text-[11px] text-white/35">{p.spec}</span>
                      )}
                    </span>

                    <span className="shrink-0 text-right">
                      <span className="block leading-[22px] text-white">{p.priceText}</span>
                      <span className="mt-0.5 block text-[11px] text-white/40">
                        ≈ {p.approxText}
                      </span>
                    </span>
                  </button>
                )
              })}

              {/* RAW on request — under the digital options, not a product */}
              {g.type === 'digital' && rawAvailable && (
                <a
                  href={rawRequestHref}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-white/[0.03]"
                >
                  <span className="flex-1 text-[13px] text-white/55">
                    {t('rawOnRequest')}
                  </span>
                  <span className="text-[13px] text-accent">→</span>
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled
        className="mt-7 w-full cursor-not-allowed rounded-[20px] bg-accent/80 py-3.5 text-[11px] font-light tracking-[0.22em] uppercase text-white"
      >
        {t('addToCart')} — {selected.priceText}
      </button>
      <p className="mt-3 text-[13px] text-white/40">
        {t('priceNote')} {t('checkoutSoon')}
      </p>
    </div>
  )
}
