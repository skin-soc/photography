# Go-live runbook — sandbox → live

**Deploy model:** the `photography` prod Worker is **git-connected via Cloudflare
Workers Builds**. A push/merge to the production branch (`main`) triggers CI
(`opennextjs-cloudflare deploy`, top-level `photography` env) and **the site goes
live**. There is no separate manual prod deploy step. Therefore:

> **The merge to `main` IS the cutover.** Every live secret, build var, and the
> `PRODIGI_MODE=live` flag must already be staged BEFORE the merge. The merge is
> the one irreversible action; treat it as the go/no-go.

The `photography-preview` Worker (deployed manually via `wrangler deploy --env
preview`) stays on sandbox and is untouched by this — it remains the rollback/QA
surface.

---

## 0. Authorisation gate (blocks everything)

- [ ] **Explicitly lift the standing rules in writing:** `stripe-live-calls-test-only`
      (live Stripe = read-only/test only) and Prodigi sandbox-only
      (`fap-print-fulfilment`). Nothing below runs until this is stated.
- [ ] Prodigi order→fulfilment flow is **built and end-to-end verified on sandbox**
      (webhook receiver `src/app/api/webhook/prodigi/` wired + verify-by-refetch
      confirmed). This is the parked "main remaining build" per `docs/next-steps.md`.

## 1. Green production build (do FIRST — before any live config)

- [x] **Fixed 2026-07-01** (`c9c80a4`): every recent `photography` prod build was
      failing on `npm ci` — `package-lock.json` had drifted from `package.json`
      (missing `@swc/helpers@0.5.23` etc). Regenerated **under the exact CI
      toolchain** (node 22.16.0 / npm 10.9.2, via `nvm use 22.16.0` —
      regenerating under local npm 11 produces a much larger, spurious diff).
      Verified `npm ci` and `next build` both pass clean under that toolchain.
- [ ] Confirm the CF build command and production branch in the Workers Builds
      settings (dashboard → Worker `photography` → Settings → Builds).

## 2. Stripe (live) — external, you do these

- [ ] KYB complete; account activated for live payments.
- [ ] (If no-float Issuing model) Issuing approved, card created, funding arranged
      (`docs/fap-print-fulfilment.md`).
- [ ] Create the **live webhook endpoint** → `https://gusmcewan.com/api/webhook/stripe`,
      subscribe to the same events as the test endpoint (see
      `src/app/api/webhook/stripe/route.ts`). Copy the live `whsec_…`.
- [ ] Recreate **live coupons/promo codes** (test coupons don't carry over).
- [ ] Have live `sk_live_…`, `pk_live_…`, `whsec_…` ready. (Values already staged
      locally under `LIVE_*` in `.env.local`.)

## 3. Prodigi (live) — external

- [ ] Live Prodigi account funded/enabled; live API key in hand
      (`.env.local` → `PRODIGI_LIVE_API_KEY`).
- [ ] EU / NL-only routing arrangement confirmed, so `checkEuFulfilment` doesn't
      reject real orders. **Under live the EU guard genuinely runs** (sandbox omits
      `shipments`; the two sandbox bypasses in `shipping-quotes` and
      `checkout-session` self-disable because they're gated on
      `prodigiMode() === 'sandbox'`).
- [ ] One real low-cost live order placed to confirm assets, cropping, shipping.

## 4. Cloudflare dashboard config for the `photography` Worker (pre-stage)

**IMPORTANT — corrected 2026-07-01:** `npm run deploy` runs
`opennextjs-cloudflare deploy` with **no `--env` flag**, so CI deploys the
**top-level (unnamed) config block** in `wrangler.jsonc` — NOT a nested
`env.production` block (there isn't one, and adding one would be silently
ignored by CI). Verified via `wrangler deploy --dry-run`: with no `--env`, the
top-level `vars` resolve, including `PRODIGI_MODE`.

Set **once, in the dashboard**, on the production Worker — these persist across
merges and are NOT in git.

**Build-time environment variables** (Settings → Builds → Variables — needed at
`next build`, because `NEXT_PUBLIC_*` is inlined into the client bundle):

- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = pk_live_…`  ⚠️ build var, not a runtime secret

**Runtime secrets** (Settings → Variables and Secrets → encrypted):

- [ ] `STRIPE_SECRET_KEY = sk_live_…`
- [ ] `STRIPE_WEBHOOK_SECRET = whsec_…` (the live endpoint's)
- [ ] `PRODIGI_API_KEY = <live key>`
- [ ] `SHOP_ORIGIN_SECRET = <prod value>`
- [ ] `DOWNLOAD_LINK_SECRET = <prod value, rotated from preview>`
- [ ] `ADMIN_PASSWORD = <prod value, rotated from preview>`
- [ ] `CRON_SECRET = <prod value>` (also on the `prodigi-cron` Worker)

**Runtime vars** — ✅ already committed in `wrangler.jsonc` top-level (`8fe27ea`,
on branch `final`), no dashboard action needed:

- [x] `SHOP_ORIGIN_URL = https://valhalla.gusmcewan.com`
- [x] `SHOP_PREVIEW_BASE_URL = https://loki.gusmcewan.com` (despite the name,
      this is just a public image-CDN host toggle — see `src/lib/shop.ts:206-217`
      — not Worker-environment-specific, so prod reuses preview's value)
- [x] `PRODIGI_MODE = live`   ← the flip. Code defaults to `sandbox` when unset
      (`src/lib/prodigi.ts:23`); mode is explicit, never key-sniffed.

**Bindings / domain:**

- [ ] `SHOP_SETTINGS` KV bound on the prod Worker — currently **shares** preview's
      namespace id `8a07bbf…` (same in both top-level and `env.preview` config).
      Decide if pricing/settings should be a dedicated prod namespace instead.
- [ ] Custom domain / route `gusmcewan.com` attached to the `photography` Worker.

## 5. Go-live PR (the merge that flips it) — committed changes

The actual go-live PR is **`final` → `main`** — branch `final` is **277 commits**
ahead of `origin/main` (the entire shop build: cart, VAT, Prodigi fulfilment,
fine-art, admin, this go-live prep). `origin/main` hasn't moved since the last
SEO-only PR.

- [x] Top-level `vars` block with **`PRODIGI_MODE: "live"`** committed in
      `wrangler.jsonc` (`8fe27ea`). Verified with `wrangler deploy --dry-run`
      that it resolves with no `--env` flag — i.e. exactly what CI will deploy.
- [x] Version bump: `1.34.52` → `1.35.0` (`8fe27ea`).
- [ ] Decide: merge `final` → `main` as one 277-commit PR, or land it in smaller
      reviewed chunks first? Given the size, at minimum diff-review the
      accumulated changes before opening the PR.

## 6. Pre-cutover verification

Because merge = live, you can't "deploy then test" on prod cheaply. Options:

- [ ] Verify the **full 8-scenario matrix** (digital / poster / fine-art / mixed) on
      a **staging Worker built from the go-live branch with live keys** (e.g. a
      versioned preview deploy of `photography`, or a temporary named Worker), OR
- [ ] Accept a **live smoke test immediately post-merge**: one real card purchase per
      product type, refunded, watching:
  - Stripe live webhook signature validates with the live `whsec_`.
  - Order → Prodigi **live** order created (idempotent on orderCode).
  - Prodigi webhook received + verified-by-refetch.
  - Download links issued and valid.
  - VAT correct by country (manual VAT: DK rate DK+EU by IP, 0% non-EU, Stripe Tax
    OFF, one Stripe amount, no `tax_rate` objects).
  - Shipping quotes resolve; EU guard passes a real NL-routed order.

## 7. Cutover

- [ ] Confirm §0–§6 all checked.
- [ ] **Merge the go-live PR to `main`.** Watch the Workers Build succeed and deploy.
- [ ] Verify `gusmcewan.com` serves the new build; run the §6 live smoke test.
- [ ] Enable the Stripe live webhook; leave test webhook as-is.

## 8. Rollback

- [ ] Fastest: in the dashboard, **roll the `photography` Worker back to the previous
      deployment** (Workers Builds keeps prior versions), or revert the PR and let CI
      redeploy.
- [ ] `photography-preview` (sandbox) is untouched — keep it as the working QA
      surface.
- [ ] Have Stripe refund + Prodigi cancel-window ready for the first live orders.

---

### Config surface reference (what the app reads)

`process.env`: `ADMIN_PASSWORD`, `CRON_SECRET`, `DOWNLOAD_LINK_SECRET`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `PRODIGI_API_KEY`, `PRODIGI_MODE`,
`SHOP_ORIGIN_SECRET`, `SHOP_ORIGIN_URL`, `SHOP_PREVIEW_BASE_URL`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

Stripe live/test is **inferred from the `sk_…` prefix** (`src/lib/coupons.ts:38`);
Prodigi is **explicit** via `PRODIGI_MODE` (`src/lib/prodigi.ts:23`). The
`delete-test-coupons` admin route refuses to run under `sk_live`
(`src/app/api/admin/delete-test-coupons/route.ts:22`).
