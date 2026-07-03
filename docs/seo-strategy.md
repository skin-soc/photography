# SEO strategy — gusmcewan.com shop

_Audited 2026-07-03 (code + live production). Companion to the audit report; this
is the forward plan. Owner: shop worker (`src/i18n/seo.ts`, `sitemap.ts`,
`robots.ts`, shop `generateMetadata`, `ShopProductView` schema)._

## Where we stand (audit score ~78/100)

Strong, unusual-for-size foundation already live:

- **Indexation**: correct robots.txt (admin/API/order pages blocked), dynamic
  sitemap with **3,627 URLs** — every product + every category prefix, each with
  17-locale hreflang alternates AND an image entry (key-photo heroes).
- **Localization**: full 17-locale hreflang + x-default on-page and in the
  sitemap; localized titles/keywords/OG locales; localized poster titles reach
  pages via the translations KV.
- **Structured data**: Product + AggregateOffer + per-variant Offers on product
  pages; Person + LocalBusiness/ProfessionalService sitewide with `sameAs`.
- **Fixed in v1.41.1**: dangling "— " titles when location is empty (was live in
  SERPs), English-hardcoded product meta descriptions on all locales (now the
  localized `shop.productMetaDescription`), full-size OG images (now `max=1200`
  with true dimensions), dangling-dash alt texts.

## Pillar 1 — capitalize on preview & mockup images

The room mockups and poster-mat renders are assets competitors' listings don't
have; today they're invisible to search.

1. **Multi-image Product schema** (high, small): product `image` should be an
   array — artwork preview + room07 mockup (fine art) + poster-mat render.
   Google prefers multi-angle product images for rich results and Image Search;
   "wall art / room" contextual queries land on room scenes.
2. **Mockup images in the sitemap** (high, small): add the room07 URL as a
   second `images` entry for fine-art products in `sitemap.ts`.
3. **OG image per intent** (medium): fine-art pages could lead OG with the room
   mockup (social shares showing art *in a room* convert better than bare
   artwork). A/B-worthy; keep artwork for posters/digital.
4. **Localized alt text** (medium): alts use English catalog titles; feed
   `posterTranslations` through grid/product alts like the visible text.
5. **Check loki crawlability** (quick): confirm `loki.gusmcewan.com` serves no
   robots.txt blocking image crawlers — every sitemap image lives there.

## Pillar 2 — localization compounding

6. **Localized category descriptions** (high, small): every category page
   currently shares one generic meta description per locale. Template with the
   type + folder name + count ("Fine art prints from Copenhagen — 41 works…")
   for unique, keyword-bearing snippets in all 17 languages.
7. **Category intro copy** (medium): leaf grids have zero indexable text. One
   localized paragraph per type landing (and optionally per major folder) gives
   crawlers content to rank; also warms buyers.
8. **Keyword sets are service-photography-skewed**: `KEYWORDS` targets
   "photographer Copenhagen" (service intent), not "buy posters online /
   plakater København / kunstplakater" (shop intent). Add commerce keyword sets
   per locale and use them on shop routes only.

## Pillar 3 — drive sales (rich results & trust)

9. **BreadcrumbList JSON-LD** (high, small): the UI breadcrumb exists; emit the
   matching schema (localized names) on product + category pages → sitelink-style
   SERP breadcrumbs.
10. **OfferShippingDetails + MerchantReturnPolicy** (high, medium): EU SERPs
    increasingly show shipping/returns on product rich results. We now have the
    data: delivery estimates (`delivery-estimate.ts`) and the T&C return terms
    (made-to-order = no withdrawal, defects always covered). Add to each Offer.
11. **Sale annotations**: `salePct` photos should emit `priceSpecification` with
    strikethrough semantics (or at minimum keep AggregateOffer low price fresh) —
    sale pills deserve SERP visibility.
12. **Stable sitemap dates** (quick): `lastModified: now` on every entry tells
    Google everything changes daily — use `captureDate`/catalog `generated` so
    real changes stand out; consider a sitemap index split (7 MB single file
    regenerates per fetch today).
13. **Content moat** (long-term): no blog/editorial surface exists. Highest-ROI
    format for this catalog: localized "collection stories" (the Pride series,
    the Kelpies) interlinking to product pages — commerce anchor text, unique
    text, image-rich.

## Sequencing

| Phase | Items | Effort |
|---|---|---|
| Now (shipped) | title/description/OG/alt fixes | done, v1.41.1 |
| Next sprint | 1, 2, 6, 9 (multi-image schema, sitemap mockups, category descriptions, breadcrumbs) | ~1 day |
| Following | 10, 8, 4, 12 (shipping/returns schema, commerce keywords, localized alts, sitemap dates) | ~1–2 days |
| Ongoing | 7, 13 (category copy, collection stories) | editorial cadence |

## Measurement

Search Console per-locale queries (register all hreflang variants), Image Search
impressions for `loki.gusmcewan.com` assets, and rich-result eligibility via the
Rich Results Test after each schema change. Sales attribution: annotate deploys
against shop conversion (orders KV) — the admin Finances tab already gives
per-day revenue.
