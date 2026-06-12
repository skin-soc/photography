# Shop / FAP — session handoff & next steps

_Last updated: 2026-06-12. Branch: `fap`. Read alongside `docs/fap-print-fulfilment.md` (the full fulfilment design)._

## Where things stand

**Preview worker:** `v1.30.2` — live at `https://photography-preview.gusmcewan.workers.dev`
(prod worker `photography` / gusmcewan.com is NOT updated; go-live is on hold).
**Origin (NAS `lan-origin`):** synced + running **v0.8.4** on valhalla.
**Latest commit:** `e2ba7c3` on `fap`.

### Done & verified this session
- **Pricing system** (admin **Prices** tab, KV-backed): general + per-colour-label
  **markup**; **cost-plus posters** (Prodigi cost × markup, no hand-set ladder);
  editable digital + fine-art base prices with a cost floor; all final prices
  **round up to the nearest 5 kr**; **Red label = on sale** with a translation-free
  `−X%` pill (discount = `red ÷ (100 + general)`). See memory `pricing-and-markup-model`.
- **Code-only slugs** — `/shop/gmp-xxxxxxx` (stable across title edits; SEO via metadata).
- **Poster presentation** — `PosterMat` is a true A-series sheet; previews served at a
  dedicated **4:5 crop** (origin `poster=1` variant); heading is **Cormorant Light 300**
  so preview = print.
- **Poster MASTER compositor** (`lan-origin/poster.js`, sharp + resvg) — photo 4:5 on a
  white A-series sheet + typeset caption/title/website, no watermark, **pixel-exact to
  Prodigi** (`printAreaSizes`: A0 9933×14043, A2 4960×7015 @ 300 dpi). Fonts load via
  `fontFiles` (resvg 2.6.x has no `fontBuffers`).
- **Pre-rendered poster assets** — admin **Settings → Cache → Pre-render posters**
  enumerates each poster × its qualifying A-sizes and the origin batch-renders them to
  **`/mnt/sydney/shop/poster-assets`** (HD). **40 assets already rendered.**
- **Storage tiers fixed** — all deliverables on **sydney HD** (`/fulfil`), never the
  chicago SSD (`/data`). See memory `nas-storage-tiers` (HARD RULE).
- **Admin niceties** — tab persists in URL hash; re-render-previews tree pegged to the
  top-tier folders (Digital Downloads / Posters / Fine Art); Product lookup shows real
  filename WITH extension + A4–A0 master preview links; readable errors.
- **Mobile** — no sticky hover on touch (`hoverOnlyWhenSupported`).

### Small loose ends
- **Lightroom plugin v0.5.1** (records `sourceFilename`) needs a **Lightroom restart**
  (not just "Reload Plug-in") + **republish** for the filename-with-extension to populate.
- Re-running **Pre-render posters** after editing/adding posters force-refreshes them.

---

## THE main remaining build: order → Prodigi fulfilment (parked, Issuing-gated)

Everything up to "produce the print asset" is done. The order pipeline that actually
ships a print is **not built** and is **blocked on financial/account setup**, not code.

**Unblock first (user/financial — see `fap-print-fulfilment.md` §5, §11):**
1. Stripe **KYB** complete; **Issuing** approved (Stripe sales); **balance transfers
   (preview)** enabled; EUR virtual card created with spend controls.
2. Prodigi **NL-only routing** account arrangement (Appendix A) — belt & braces; the
   pre-charge quote guard is the primary control.

**Then build (per `fap-print-fulfilment.md` §9 — Option C):**
1. **Quote at checkout** — Prodigi `POST /quotes` → shipping line (EUR→DKK + buffer) +
   **NL-routing pre-charge guard** (`src/lib/prodigi.ts` has `checkEuFulfilment`).
   Wire the existing `src/app/api/shop/quote/route.ts` into checkout + show shipping in cart.
2. **No-float funding cron** — payment available → balance-transfer cost
   payments→Issuing → confirm → **POST Prodigi order** (idempotent on orderCode), with a
   per-order `callbackUrl` + token.
3. **Hand Prodigi the poster asset** — a token-protected tunnel URL to the pre-rendered
   file (origin `/poster-master/:id/:size`, served from `poster-assets`). Generate-at-
   order is the fallback if an asset is missing.
4. **`/api/webhook/prodigi`** — CloudEvents receiver, verify-by-refetch (`GET /orders/{id}`).
5. **Finance** — store Prodigi cost per order; margin = retail − VAT − cost − Stripe fee
   − FX; margin-floor alert.

---

## Other backlog (lower priority)
- **Fine Art = WhiteWall** — still a placeholder (`FINE_ART_PENDING`). Needs WhiteWall
  pro/trade API + SKUs + pricing before it's real. Validator is Prodigi-only.
- **Pricing tuning** — the markup % values are the owner's call in the admin Prices tab.
- **Catalogue → KV migration** (`fap-print-fulfilment.md` §12) — only needed at ~20k+
  photos; not now. Includes per-country shipping matrix.
- **Go-live** — lift the Stripe-test-only + Prodigi-sandbox-only standing rules (explicit
  authorisation required), switch keys TEST→LIVE, deploy the prod `photography` worker,
  merge `fap` → `main`.

---

## Standing rules (do not violate)
- **`lan-origin/docker-compose.yml`** holds real secrets — **NEVER commit** (always left unstaged).
- **Stripe LIVE = read-only / test calls only** until explicitly lifted; prod go-live on hold.
- **Prodigi = sandbox only**, no real orders until authorised.
- **Deliverables on HD (sydney `/fulfil`), never the SSD (chicago `/data`)**.
- Always **bump the version** on any code/plugin change; always **build + deploy the
  preview worker** after a change (the owner tests on the preview worker, not local dev).
- Plugin version bumps **don't show** on LR "Reload Plug-in" — tell the owner to restart LR.
- Origin (`server.js`/`poster.js`) changes need a **NAS rebuild**: re-sync `lan-origin/`
  to `/mnt/chicago/photography/Shop/shop-origin`, then `./rebuild.sh`.

## Key references
- `docs/fap-print-fulfilment.md` — full fulfilment design (providers, money flow, no-float, VAT, NL routing, webhooks).
- Memory: `pricing-and-markup-model`, `nas-storage-tiers`, `fap-print-fulfilment`,
  `manual-vat-approach`, `stripe-live-calls-test-only`, `always-deploy-preview`,
  `lightroom-reload-version`, `always-bump-version`.
- Infra: data/previews on **chicago SSD** (`/mnt/chicago/photography/Shop` → `/data`);
  masters + deliverables on **sydney HD** (`/mnt/sydney/shop` → `/fulfil`). NAS over
  Cloudflare tunnel `valhalla.gusmcewan.com`.
