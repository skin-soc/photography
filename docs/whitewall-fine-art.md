# WhiteWall — fine-art fulfilment design

The plan for wiring **WhiteWall** (Avenso GmbH, lab in Frechen, Germany) as the
**fine-art** lab, alongside Prodigi for posters. Reference for the build; pairs
with [fap-print-fulfilment.md](fap-print-fulfilment.md) (Prodigi/Stripe design,
which this reuses wholesale).

Status: **research only — nothing wired.** The fine-art line is still the
placeholder in `src/config/product-range.ts` (`provider: 'whitewall'`, cost 0).

---

## TL;DR — the two questions answered

1. **Do they render mockups with the photo built in, via the API? → No.**
   WhiteWall's partner integrations require the seller to **upload their own
   product images**; the API does not return rendered mockups of the customer's
   photo in the product. (Their consumer-site *configurator* renders live previews,
   but that is not exposed to partners.) → **We render fine-art mockups ourselves**,
   exactly as we already do for posters (PosterMat / `poster.js`) and for Prodigi
   (whose API likewise returns no images — see FAP doc §3).

2. **Is there a direct REST API for a custom (non-Shopify) shop? → Unconfirmed,
   and probably not self-serve.** All *documented* WhiteWall integrations are
   **pre-built platform apps** (Shopify, PhotoDeck, WordPress/NextGEN) driven by a
   **partner token**. No public/self-serve REST API or sandbox was found (unlike
   Prodigi). Direct programmatic ordering from our bespoke Next.js shop must be
   **confirmed with their B2B team** (b2b@whitewall.com) before we commit — it may
   require a negotiated partner API, or may not exist, in which case v1 fine-art is
   a semi-manual flow. **This is the gating unknown.**

---

## 1. What WhiteWall offers (confirmed)

- **Auth**: a **partner token** created in the WhiteWall account ("MY PARTNER
  TOKENS"), pasted into the integration. (Same idea as Prodigi's `X-API-Key`.)
- **Fulfilment model**: **dropship** — an order is sent to the lab via a "Request
  fulfilment" action; WhiteWall produces, ships, and **handles customs/duties**.
  The customer pays us; **WhiteWall bills us separately for production cost.** This
  is the *same no-float shape* as Prodigi → pay COGS from the **EUR Stripe Issuing
  card**.
- **Products / materials**: acrylic-glass face-mount (their signature), metal
  (ChromaLuxe HD), **framed** (floater frame, wood ArtBox, passe-partout), **18
  fine-art papers** (Hahnemühle / Epson / Canson — Giclée), photo prints (laser /
  classic C-type), canvas, books, Masterprint (to 500×240 cm).
- **Pricing**: B2B **wholesale**, with **loyalty tiers** (Silver/Gold by volume);
  seller sets retail at a **freely selectable margin**. Sellable items are defined
  as **"configurations"** (material × format) created in WhiteWall's partner
  portal — only those can be sold.
- **Region/currency**: German lab, **EUR**, ships worldwide. Intra-EU to DK = no
  customs; non-EU = WhiteWall clears customs.
- **Access**: via **b2b@whitewall.com** / the corporate-customers contact form.
  No public API docs.

---

## 2. Mockups — we render our own (the §1.1 answer, expanded)

WhiteWall gives us **no product imagery**. So fine-art previews are ours to build,
which we already have the machinery for:

- Extend the poster compositor (`lan-origin/poster.js` + the on-screen `PosterMat`)
  to produce **fine-art presentations** — e.g. a framed-on-wall or acrylic-float
  mock — from the same edited master. One new render path, reusing the existing
  tiled-mesh/typeset pipeline.
- Pre-render + cache exactly like poster masters (`POSTER_ASSETS_DIR`, the
  prerender batch endpoint), and serve via loki with the `?v=` cache-buster.

---

## 3. Strategy — phased

### Phase 0 — Access & discovery (BLOCKING, external; user action)
Email **b2b@whitewall.com** to open a B2B account + partner token and answer the
make-or-break questions (see §4). Nothing programmatic can be designed until we
know whether a **direct API** exists for custom shops, and we have the **wholesale
price list**.

### Phase 1 — Range + mockups (we control; can start now)
- Curate a **small** fine-art range: e.g. *Hahnemühle Photo Rag Giclée*, *acrylic
  face-mount*, *framed* — 2–3 sizes each. Map each to a WhiteWall
  configuration/SKU once we have codes + costs.
- Build the **fine-art mockup render** (§2).
- Reuse the existing product model: `provider:'whitewall'`, `providerSku`,
  `cost` (EUR minor), `costCurrency:'EUR'`. The placeholder slot already exists.

### Phase 2 — Pricing & catalog
- Fine-art retail = **WhiteWall cost × markup** (cost-plus), same as Prodigi.
  Replace the `fineArt` placeholder price + 0 cost-floor with real costs; extend
  the admin Prices cost-floor/validator to WhiteWall (currently Prodigi-only).

### Phase 3 — Order integration (depends on Phase 0)
- **If direct API granted**: build `lan-origin/whitewall.js` parallel to the
  Prodigi module — submit {master image, configuration, shipping addr}, poll
  status, fetch shipping. Pay via EUR Issuing card. **Sandbox-first; live parked.**
- **If no API (Shopify/portal only)**: v1 fine-art is **semi-manual** — the origin
  records the paid order; we place it in WhiteWall's portal / "Request fulfilment".
  Flag clearly; automate later if/when they grant API access.

### Phase 4 — VAT / shipping / customs
- Fits the **manual-VAT** model (DK rate for DK+EU, 0% non-EU). EU lab → no customs
  for EU buyers; WhiteWall clears for non-EU. **Shipping** quoted at checkout —
  need WhiteWall's rates/lead-times (Phase 0).

---

## 4. Questions for b2b@whitewall.com (Phase 0)

1. **Direct API?** Is there a REST API (with sandbox) for ordering from a *custom*
   site, or only the Shopify/PhotoDeck apps? If API: docs, auth, endpoints.
2. **Wholesale price list** (EUR) for the materials/formats we want — to bake costs.
3. **Configurations**: how SKUs/configurations are created and referenced in an order.
4. **Shipping** rates + lead times to **DK / EU / worldwide**; tracking webhooks?
5. **Min order / volume** commitments; loyalty-tier thresholds.
6. **File spec** per product (resolution, colour profile, bleed) — for our masters.
7. **Returns / claims / reprint** policy (who bears cost on a defect).
8. **Mockups**: confirm no preview/mockup endpoint (we expect to render our own).

---

## 5. How it reuses what we already have
- **No-float COGS**: EUR Stripe Issuing card (same as Prodigi).
- **Product model**: `provider/providerSku/cost/costCurrency` already supports it.
- **Mockups**: poster compositor extended (no new dependency).
- **Pricing**: cost-plus markup via the admin Prices tab.
- **Delivery of assets**: loki + `POSTER_ASSETS_DIR` cache + prerender batch.
- **Standing rules**: sandbox-first, live parked, no real money until go-live.
