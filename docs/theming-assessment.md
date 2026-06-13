# Theme-friendliness assessment — light / dark / auto

_Last updated: 2026-06-13. Branch: `fap`. Goal: an admin setting (Settings) for
**Auto / Light / Dark** that themes the public site, fully responsive incl. mobile._

## Verdict

Feasible. The **mechanism is easy** — the admin setting, KV storage, and
(crucially) flash-free rendering are low-risk because the theme is a single
**global** choice set in admin, not a per-visitor toggle, so the server knows it
at render time. The **real work is the recoloring pass and the light-mode
design**, because the site hardcodes a dark palette in ~850 places and several
"whites" are physical product surfaces that must **not** flip.

## How the site is themed today

No theme system — dark is baked in at every layer:

- `globals.css` → `body { background:#000; color:#fff }`, plus a hardcoded white
  spinner, white placeholders, white admin spinners.
- Root layout → `<body className="bg-black text-white">`
  (`src/app/(site)/[locale]/layout.tsx`).
- Components write colour as literal Tailwind utilities, not tokens:

| Pattern | Count |
|---|---|
| `text-white` | 411 |
| `white/NN` · `black/NN` (opacity) | 433 |
| `bg-white` | 65 |
| `bg-black` | 13 |
| inline hex (`#931020`, etc.) | 185 across 21 files |
| **Files touching colour** | **28 of 37** |

No existing infra: `tailwind.config.js` has no `darkMode`, **0** `dark:` variants,
no CSS colour variables (only font vars), no `<meta name="theme-color">`. Two
separate `<html>` roots: public `(site)` and `(admin)`.

KV/admin is already a solved pattern: `shop-settings.ts` has clean getter/setter
idioms, the root layout already reads a KV setting server-side (`getShopOnline()`),
and the Settings tab composes panels (`<VatRateSettings />`) backed by
`/api/admin/*` routes.

## The insight that de-risks it

The theme is **one global admin value**, so the server knows it when rendering:

- **Light / Dark** → root layout writes `<html class="light|dark">` in SSR. No
  flash, no script.
- **Auto** → emit `<html class="theme-auto">` and let pure CSS decide via
  `@media (prefers-color-scheme: dark)`. Still SSR, no JS, **no FOUC**, identical
  on mobile.

The notorious flash/hydration problem **doesn't apply** unless a per-visitor
switch is added later.

## What the full build requires

1. **Semantic token layer** — CSS variables for roles (`--bg`, `--fg`, `--muted`,
   `--hairline`, …) switched by theme class; mapped into Tailwind colours;
   `color-scheme` set so native controls follow.
2. **The migration (the bulk)** — replace literal utilities with tokens across 28
   files. Mostly mechanical but each needs a judgment, because some colours stay
   **fixed**:
   - **Brand red `#931020`** — fixed (accent, sale pills, danger zone).
   - **Physical-product whites — must NOT flip:** the poster mat is white paper
     (`bg-white`, `PosterMat.tsx`), the 21px gallery frame (`border-white`,
     `ShopProductView.tsx`), typeset poster text — all previews of a real print.
   - The logo badge / watermark are baked into the image pixels at the origin
     (`?logo=`), not CSS, so product imagery is already theme-independent.
3. **Design, not just token swap** — hero/card scrims (`from-black/80`) over photos
   stay dark for legibility (fixed, not themed); image framing, shadows, spinner,
   placeholders need light treatments. A photography portfolio is *designed* dark,
   so light mode is a real aesthetic pass over the chrome, not a recolour.
4. **Mobile** — responsiveness is orthogonal/unaffected; add `<meta name="theme-color">`
   media variants, `color-scheme` for iOS controls, check Safari status bar.
5. **Admin control (easy)** — `getThemePref()/setThemePref()` in `shop-settings.ts`,
   `/api/admin/theme`, an `<AppearanceSettings />` panel in the Settings tab.

## Scope

Admin is a separate `<html>` root, itself heavily dark-styled. **Recommendation:
theme the public site only** — admin is an internal tool, leave it dark. Including
admin roughly doubles the migration.

## Effort & phasing

| Phase | Work | Size |
|---|---|---|
| 1 | Token layer + `darkMode` + admin control + layout wiring + meta | ~1 session — low risk |
| 2 | Migrate utilities → tokens across public site; classify fixed vs themed | the bulk — 1–2 sessions |
| 3 | Light-mode design pass: scrims, poster/frame, shop, cart, checkout, spinner; QA desktop + mobile | 1–2 sessions |
| 4 | Polish: hairlines, hover/focus, contrast/AA audit in light | 0.5–1 session |

~3–5 focused sessions for a polished public-site result. Phase 1 alone gives a
working Auto/Light/Dark control (defaulting to Dark, no visual change).

## Risks

- Silent regressions in product presentation if a semantic white gets tokenized by
  accident (poster looks wrong). Mitigation: fixed-colour tokens for product
  surfaces + visual QA on shop/product pages.
- Light mode looking "unfinished" if treated as pure recolour.
- Scope creep if admin is included.

## Recommendation

Do it, scoped to the **public site**, using the CSS-variable token approach with
SSR class + `prefers-color-scheme` for auto (no client script, no flash). Ship
Phase 1 first (control working against the existing dark palette), then do the
light-mode design pass deliberately.

## Phase 1 — as built (2026-06-13)

- **Tokens** in `globals.css`: `--bg`, `--fg`, `--muted`, `--hairline` with dark
  values as the `:root`/`.dark` default (so the live dark site is byte-identical),
  real light values under `.light`, and `prefers-color-scheme` branches under
  `.theme-auto`. `color-scheme` set per class.
- **Tailwind**: `darkMode: 'selector'` + `colors.bg/foreground/muted/hairline`
  mapped to the vars (`accent` unchanged).
- **Layout**: `(site)/[locale]/layout.tsx` reads `getThemePref()` → `<html>` gets
  `dark` | `light` | `theme-auto`; `<body>` migrated to `bg-bg text-foreground`;
  `generateViewport` emits the matching `theme-color`.
- **Admin**: `getThemePref()/setThemePref()` (default `dark`), `/api/admin/theme`,
  and an `<AppearanceSettings />` segmented control in the Settings tab.
- **Default is Dark → no visual change.** Components are NOT yet migrated, so
  selecting Light/Auto currently flips only the base background; the full recolour
  is Phase 2. The panel notes this.

## Phase 2 — as built (2026-06-13)

Tokens redefined as **RGB channel triplets** (`--bg`/`--fg`) so Tailwind's opacity
modifier works; every `white/NN` chrome utility → `foreground/NN`, which inverts
correctly (white-5%-on-black ⇄ black-5%-on-white).

- **Swept** all numeric + bracket `*-white/NN` → `*-foreground/NN` across 21 site
  files (~530 utilities) + the solid chrome (page mains, headings, inputs, hovers,
  totals) in Nav, ShopGrid, ShopProductView, ShopProductPicker, CartDrawer,
  CheckoutPane, LicensingModal, CartIcon, and the static pages (about, downloads,
  order-complete, licensing).
- **Inline-style whites** in the contact/help forms → tokens; their dark modal
  panels (`#0c0c0c`) → `rgb(var(--bg))`. Shared spinner + placeholder themed.
- **Verified** in light via KV flip: `/shop`, product, `/about`, `/licensing`,
  `/order-complete` show no un-migrated chrome — only the intentional fixed
  surfaces. Dark stays byte-identical.

**Intentionally FIXED (not themed):** brand red `#931020`; white-on-accent button
text + the dot-on-accent; PosterMat white paper + black typeset; the 21px gallery
frame; ShopGrid photo-tiles (dark card + scrim + white label over imagery); image
scrims (`from-black/NN`) and modal/nav/drawer backdrops; the homepage immersive
full-bleed gallery (`page.tsx` stays `bg-black`) + GalleryStack captions (they sit
over photos).

**DEFERRED to Phase 3** (style a cross-origin Stripe iframe, so they need the
client-resolved theme, not CSS vars): the Stripe Element `appearance` objects in
`CheckoutModal.tsx` and `CheckoutPane.tsx` (incl. their `#0c0c0c`/`#0d0d0d` panels
and `rgba(255,255,255,…)` values). Until then the checkout/payment surfaces render
dark in light mode.

**Remaining for Phase 3:** Stripe Element appearance (client-resolved light/dark);
decide whether the homepage gallery should theme or stay immersive-black; visual +
mobile QA in light; contrast/AA polish (e.g. the 21px frame needs a shadow to read
on a white page).
