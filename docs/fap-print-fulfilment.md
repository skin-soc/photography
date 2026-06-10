# FAP — Fine Art & Prints fulfilment design

Status: **design / pre-build**. Branch: `fap`. Last updated: 2026-06-10.

This is the reference we build against for selling physical prints and fine-art
via **Prodigi** (print-on-demand) with payment via **Stripe**. No fulfilment code
is written yet; this captures every decision so far. Read it before implementing.

---

## 0. Standing rules (do not violate)

- **Sandbox-first, both providers.** All build/test work runs against **Stripe TEST**
  and **Prodigi SANDBOX**. We hold keys for *both* sandbox and live on *both*
  providers, but live is parked.
- **Stripe live = strictly TEST calls** until the user explicitly lifts the rule
  (see memory `stripe-live-calls-test-only`). No real money operations.
- **Prodigi live = no real orders** against `api.prodigi.com` until FAP go-live is
  explicitly authorised. The live key is staged only.
- **Never commit secrets.** Keys live in `.env.local` (gitignored). `lan-origin/
  docker-compose.yml` must never be staged/committed.
- **Always bump version** on any code/plugin change (this doc is not code).

---

## 1. Providers & environments

| | Stripe | Prodigi |
|---|---|---|
| Sandbox base | test mode (`sk_test…`) | `https://api.sandbox.prodigi.com/v4.0/` |
| Live base | live mode (`sk_live…`) | `https://api.prodigi.com/v4.0/` |
| Sandbox key | `STRIPE_SECRET_KEY` (test) | `PRODIGI_SANDBOX_API_KEY` (`test_…`) |
| Live key | `LIVE_STRIPE_SECRET_KEY` (parked) | `PRODIGI_LIVE_API_KEY` (parked) |
| Active key the app reads | unprefixed `STRIPE_*` | `PRODIGI_API_KEY` (= sandbox now) |

**Prodigi account currency: EUR** (no DKK available). Sandbox key verified working
(`GET /v4.0/orders` → HTTP 200). Sandbox dashboard: `sandbox-beta-dashboard.pwinty.com`.
Prodigi auth header: `X-API-Key: <key>`.

---

## 2. Pricing model — Option C (Hybrid)

**Static print price + live shipping quote.** Chosen over fully-static (margin
erodes, shipping wrong) and fully-dynamic (latency, hard runtime dependency).

- **Print/fine-art price**: baked into the catalog at build time (markup applied
  to Prodigi cost), shown on product pages. This is what `DEFAULT_PRINT_PRODUCTS`
  already does (A4 395 / A3 595 / A2 1495 DKK).
- **Shipping**: quoted **live from Prodigi at checkout** once destination is known
  (the one genuinely variable, destination-dependent cost).

### `products.json` schema additions (origin `printProducts`)

Each print product gains:

- `provider` — `'prodigi'` (future: `'whitewall'`, etc.)
- `providerSku` — the lab's product code (maps our SKU → Prodigi catalogue item)
- `cost` — Prodigi wholesale cost (for margin + the no-float transfer amount)
- `markup` — multiplier and/or fixed handling: `retail = round(cost × mult + fixed)`

Keeps the existing LR → catalog.json → origin → shop pipeline; only the product
template grows. Provider maps onto the existing `print` vs `fine-art` types
(`print` → Prodigi everyday; a future premium tier → WhiteWall).

### Product range — replace the placeholder with the real Prodigi catalogue

**Current state is a PLACEHOLDER.** `DEFAULT_PRINT_PRODUCTS` in the origin
`server.js` (mirrored by `PRINT_TEMPLATE` in `src/lib/shop.ts` for dev) hardcodes
a skeleton — `print` A4 395 / A3 595 DKK and a single `fine-art` "A2 — archival"
1495 DKK. This pre-dates the integration and is NOT the real offering.

**To build:** drive print/fine-art variants from the **real Prodigi product
catalogue** — a proper range of **sizes, papers/media, and framed/mounted
options**, each mapped to a `providerSku` with its `cost`. Fine art should offer
more than one size/finish. Source the range from Prodigi's product data (and the
NL-produced subset per §7), not a hand-written template.

**Probe data (sandbox, 2026-06-10).** `GET /v4.0/products/{sku}` returns
`description`, `productDimensions`, `attributes`, `printAreas`, and `variants`
(each variant: `attributes`, `shipsTo`, `printAreaSizes`, `pagePricing`). Example
real fine-art SKU — `GLOBAL-CFPM-16X20`: *"Classic Frame, EMA 200gsm Fine Art
Print, Mounted/Matted, Perspex Glaze, 40x50cm"*; attributes include
`frame`, `color` (black/brown/dark grey/gold/light grey/natural/silver/white…),
`glaze`, `mount`, `paperType`, `style`, `substrateWeight`. So the picker's
size/paper/frame/mount/colour options come straight from `attributes`/`variants`.
**Cost basis for markup = ex-tax** (quote `costSummary.items` + `shipping`,
excluding `totalTax` — Prodigi's ~20% is reclaimable input VAT, see §6).

### In-frame preview (customer-facing) — we composite it ourselves

Show the artwork **inside the chosen frame/size** on the product page. **Prodigi's
API returns NO mockup/image URLs** (confirmed: product details has only text +
specs). So we must **generate the framed preview ourselves** — overlay the
artwork into a frame/mount template (per frame colour + aspect ratio) via CSS or
canvas. Build a small set of frame templates keyed to the `frame`/`color`/`mount`
attributes. Treat as part of the picker UX once the real range lands.

### Licensing applies to DIGITAL only

Usage-rights licence tiers are a **digital-download** concept. Print and fine-art
products are physical objects and must NOT show a licence tier in the picker
(fixed in `shop/[slug]/page.tsx`: `license` set only when `type === 'digital'`).
Physical receipts/terms are a separate, later concern from the download licence.

### EUR → DKK conversion (client prices are always DKK)

Prodigi quotes/costs are **EUR**; the shop charges **DKK**. We already have the
rate: `getRates()` (`src/lib/currency.ts`) pulls the **ECB daily feed** (incl.
DKK), cached 24h → **DKK-per-EUR = `1 / rates.EUR`**. No new FX dependency.

The rate that actually costs us is **Stripe's**, not the ECB mid: we collect DKK
but pay Prodigi EUR from the EUR Issuing card, so a **DKK→EUR balance transfer
carries a Stripe FX spread (~1–2%)** (§4). DKK is **pegged** to the euro (central
7.46038, tight band, usually <0.3% drift) — so **rate freshness barely matters;
the buffer for Stripe's spread does.**

- **Print price** (static): convert EUR cost → DKK at **catalog-build time**, with
  the markup absorbing FX. No request-time FX. Re-baked on rebuilds.
- **Shipping line** (live EUR quote): convert at **checkout** using `getRates()`
  daily `1/rates.EUR` **× a buffer (≈1.02–1.03)** so DKK shipping always covers the
  EUR outlay + Stripe FX. Round to whole kr.
- Make the buffer + rate source configurable; never ship a live mid-rate with no
  buffer. Pegged + buffer ≫ fresh rate alone.

---

## 3. Money flow — single charge, paid separately

**Prodigi never touches the customer's money.** Two separate legs:

1. **Customer → us** via Stripe: one charge for the **full retail** (print +
   live-quoted shipping + our VAT). Lands in our **Stripe payments balance**.
2. **Us → Prodigi**: paid separately as cost-of-goods from a **Stripe Issuing
   virtual card**, funded per-order (see §4).

**Stripe Connect does NOT apply** — Connect's "pay with Stripe balance" only
debits *connected accounts on our platform* (and only subscriptions). Prodigi is
an independent supplier, not a connected account. Confirmed dead end.

VAT is **ours** (a line item via `src/lib/vat.ts`), computed on the retail total
incl. shipping. Stripe does no tax calc. See §6.

---

## 4. No-float funding model (firm requirement)

**No standing float. Every order is funded directly by that customer's own cash.**
Delivery may be delayed by one or more (business) days as a result — accepted.

### The two-balance reality (EEA)

The Stripe account holds two separate pots:
- **Payments balance** — where customer payments land; pays out to bank.
- **Issuing balance** — backs Issuing-card spend. In the **EEA these are NOT
  linked in real time**; the Issuing balance must be funded before the card spends.

Funding path: **Stripe balance transfer** (payments balance → Issuing balance).
- **Programmatic** — there is a balance-transfer **API endpoint** (not dashboard-
  only). _Preview feature; confirm exact endpoint + enablement when Issuing is on._
- EU settlement: **within 1 business day** (instant in US).

### Automated pipeline (Cloudflare cron worker)

```
for each paid order not yet sent to Prodigi:
  1. Balance API → is THIS order's payment now AVAILABLE (not pending)?
  2. if yes → balance-transfer exact Prodigi cost (+ tiny buffer) payments → Issuing
  3. confirm funds landed in Issuing balance (poll Balance API / event)
  4. POST Prodigi order (now funded by the customer's own cash)
```

Issuing balance sits at ~€0 between orders. Transfer the **cost only** (markup +
VAT stay in payments → bank). Sweep dust back occasionally.

### Delivery SLA — driven by SETTLEMENT, not the transfer

```
total lag = settlement (pending → available) + transfer (≤1 biz day) + place order
```

- Only **available** funds transfer; fresh card payments are **pending** first
  (couple of biz days established; **~7 days for a new account** until seasoned).
- Settlement clock **and** SEPA transfer are **business-day** based → a Friday-
  night order may reach Prodigi Tue/Wed; bank holidays extend it.
- **Requirement: show a realistic dispatch estimate at checkout** ("made to order;
  produced once payment clears, typically X business days + production + shipping").

### Why this is safe for large orders (100k+ DKK)

We never front capital. The customer's payment funds their own order; we just wait
for it to become available, sweep it, then order. If funds never become available
→ order auto-declines and **the money is still in payments balance → trivial
refund**. No-float makes refunds *safer*.

---

## 5. Stripe Issuing setup

- **Availability**: EEA ✓ (Denmark). No setup fee. Virtual card **€0.10**.
- **Currency matching**: issue the card in **EUR** (= Prodigi settlement currency)
  and hold the Issuing balance in EUR → FX happens once at top-up, never per order.
- **PCI**: issuing for our own use → no extra PCI burden. Can read full PAN+CVC via
  API (live only) / Dashboard / Issuing Elements to enter at Prodigi.
- **Spending controls**: lock the card to Prodigi's merchant category + a daily cap,
  so a bug/compromised key can't drain it. (Real-time auth webhook optional, later.)
- **Eligibility**: EU Issuing requires **Stripe sales / BaaS approval**, not just
  self-serve KYB. **Balance transfers are preview** — must be enabled on the account.

### Setup checklist (user-performed — financial/account setup)

- [ ] Complete Stripe **KYB** (status uncertain — verify at `dashboard.stripe.com/issuing/overview`)
- [ ] Get **Issuing** approved (Stripe sales) + **balance transfers (preview)** enabled
- [ ] Create cardholder (business entity) → **EUR virtual card**
- [ ] Set spending controls (Prodigi category + daily cap)
- [ ] Put card PAN+CVC on file at Prodigi as payment method

---

## 6. VAT (unchanged — under threshold)

- `src/lib/vat.ts` is correct as-is: **DK 25% to DK + EU consumers**, 0% non-EU,
  by IP. This is the home-country simplification, valid **under the €10k EU
  distance-selling threshold**. User confirmed: nowhere near it.
- VAT computed on **retail incl. live-quoted shipping**.
- OSS registered but **dormant** (under threshold) → no per-country rates needed.
  When €10k is approached: add a 27-country EU rate table to `vat.ts` + report OSS
  VAT per country (the EU bucket already half-anticipates this). NOT now.
- **NL production matters for VAT** (see §7): UK-origin shipment to an EU buyer =
  Brexit customs + import VAT on a sale where we charged intra-EU DK VAT → breaks
  the model. So "never UK" is a tax-correctness requirement, not a preference.
- Prodigi's own charge to us may carry EU B2B VAT (reclaimable input VAT) —
  accountant/reconciliation matter, separate from customer-facing VAT.

---

## 7. NL-only production routing

**Requirement: always produce in the Netherlands / EU, never UK.**

Prodigi's API gives **no payload control** over production location — allocation
is automatic and cost-driven; no order/quote parameter for country/lab/routing;
orders can **split** across facilities. Account currency (EUR) does **not**
constrain the lab.

**RESOLVED (sandbox probe, 2026-06-10): the QUOTE exposes the production lab
pre-charge.** A `POST /v4.0/quotes` to NL returned, per shipment:
`fulfillmentLocation: { countryCode: "NL", labCode: "prodigi_eu" }` and
`carrier: "DPD NL"`. So we get the lab/country **before** charging — a clean
**pre-charge gate** is feasible (no post-charge cancellations needed).

Enforce in layers:

1. **Pre-charge guard in code (primary, now feasible).** At quote time, read each
   shipment's `fulfillmentLocation.countryCode`; if any is not in the EU/NL
   allow-list (or any `labCode` is a UK lab), **block the sale** before charging.
   The no-float funding gate (§4) is the natural checkpoint.
2. **Account-level routing arrangement with Prodigi** (belt & braces) — ask support
   to pin the account to EU/NL and exclude UK. See Appendix A for the message.
3. **Catalogue curation** — prefer `providerSku`s that route EU (the probe SKU
   `GLOBAL-CFPM-16X20` routed to `prodigi_eu`/NL for an NL destination).

Open: confirm whether a quote can ever return a **split** across an EU + UK lab
(then we block the whole order), and whether routing changes by destination
country (an EU buyer outside NL may still pull a non-NL EU lab — acceptable, since
the rule is "EU, never UK", with NL as the ideal).

---

## 8. Webhook / callbacks (receiver: `/api/webhook/prodigi`)

- Prodigi callbacks are **CloudEvents**, fired at **3 stages**: order created →
  shipment(s) made → order completed. Payload includes the full order object.
- **Set `callbackUrl` per-order in code** (NOT the global dashboard field): lets us
  route sandbox→preview / live→prod automatically and append a per-order secret
  token. So **nothing to configure in the Prodigi dashboard.**
- **No HMAC/signature** on Prodigi callbacks → security is ours:
  - per-order **secret token** in the callback URL (`?token=…`), and
  - **verify-by-refetch**: on receipt, call `GET /v4.0/orders/{id}` with our key to
    confirm real status before acting. The callback only *triggers* a verified read.
- Mirror the existing signed Stripe webhook shape (`src/app/api/webhook/stripe/route.ts`).

---

## 9. Order lifecycle (Option C, end to end)

| Phase | What | API | Balance |
|---|---|---|---|
| 1. Browse/cart | static retail price; no calls | — | — |
| 2. Quote (pre-charge) | destination → cost + shipping + availability; compute net→VAT→gross; show shipping+ETA; **fail → block, don't charge** | Prodigi `POST /quotes` | — |
| 3. Charge | Stripe collects full retail; metadata: SKUs, quote id, recipient, Prodigi cost | Stripe Checkout/PI | → payments |
| 4. Fund + order | cron: funds available? → transfer cost payments→Issuing → confirm → POST order (idempotent on orderCode); per-order `callbackUrl`+token; **NL-routing guard** | balance-transfer + Prodigi `POST /orders` | payments → Issuing → card |
| 5. Track | callbacks (created→shipped→completed) → verify token → refetch → store tracking → email customer | `/api/webhook/prodigi` + Prodigi `GET /orders/{id}` | — |
| 6. Reconcile | payments → bank on schedule; Finance: retail − VAT − cost − Stripe fee − FX = margin | Stripe payouts | — |

**Failure/refund**: quote fail (Phase 2) → block before charge. Order fail (Phase 4
— OOS, UK-routing, funds never available) → money still in payments balance → refund
+ owner alert. Idempotent on orderCode (like `issueGrant`) so retries don't double-order.

---

## 10. Finance / margin reporting

Store **Prodigi cost** per order (from quote/order response) alongside Stripe retail
so the Finances tab shows **true margin** = retail − VAT − Prodigi cost − Stripe fee
− FX. Add a **margin-floor alert**: warn the owner when realised margin on a SKU
drops below a floor (signal to rebuild the catalog after a Prodigi price rise) —
needed because the print price is static while Prodigi cost can drift.

---

## 10a. Build progress

**Built & verified (sandbox), read-only half:**
- `src/lib/prodigi.ts` — product details, quotes (normalised, ex-tax), per-shipment
  fulfilment, `checkEuFulfilment()` pre-charge guard.
- `src/lib/currency.ts` — `eurToDkkOre()` (ECB rate × buffer).
- `lan-origin/server.js` — catalogue now passes `provider/providerSku/attributes/
  cost` through (backward-compatible).
- `lan-origin/products.example.json` — verified Prodigi-backed starter range
  (FAP A3/A2/A1 giclée, PAP photographic, CFPM A2 framed; all route NL). **Copy to
  the NAS DATA_DIR as `products.json` + rebuild to activate.** Retail prices are
  starters — tune (fine art is value-priced).
- `src/app/api/shop/quote/route.ts` — POST {items,country} → DKK shipping + NL
  guard; returns `physical:false` when no `providerSku` items.
- `src/app/components/FramePreview.tsx` + product page — in-frame mockup, shown
  when a framed product is offered (frame colour from the product attribute).

**Not yet built / pending:**
- Populate the NAS catalogue (load `products.example.json`, rebuild) — unblocks the
  picker range, the quote route, and the frame preview live.
- Wire the quote route into checkout (Phase 3 shipping line) + show shipping in cart.
- Live frame-colour reactivity (preview reacts to the picker selection).
- Order creation + no-float funding cron + `/api/webhook/prodigi` (gated on Issuing).

## 11. Open blockers (all non-code)

1. **Stripe Issuing** approved (sales) + **balance transfers (preview)** enabled +
   KYB complete + EUR card created with spend controls.
2. **Prodigi NL-only routing** arrangement (Appendix A) — now *belt & braces*; the
   pre-charge quote guard (§7) is the primary control. Still worth doing.
3. ~~Sandbox probe: does the quote expose lab/country?~~ **DONE** — yes, quote
   returns `fulfillmentLocation.countryCode`/`labCode` pre-charge (§7).
4. **Confirm** Prodigi settlement currency is EUR in account billing settings.

---

## Appendix A — Prodigi support message (EU/NL-only routing)

> Subject: Restricting production to EU / Netherlands facilities (exclude UK)
>
> Hello,
>
> We're integrating the Print API (EUR account) for a Danish business selling to EU
> customers. For VAT and customs reasons it is essential that **all of our orders
> are produced within the EU — ideally your Netherlands facility — and never routed
> to a UK lab**, since UK-origin shipments to EU customers incur import VAT/customs
> that break our intra-EU VAT treatment.
>
> I can see the Print API allocates labs automatically by cost and exposes
> `countryCode`/`labCode` only after allocation, with no order/quote parameter to
> constrain production location. Could you please tell me:
>
> 1. Can you configure our **account** to restrict production to EU/Netherlands
>    facilities (exclude UK), so this applies to every order automatically?
> 2. If not account-wide, which **products/SKUs are produced in the Netherlands**,
>    so we can curate our catalogue to NL-only items?
> 3. Is production location ever visible **at quote time** (before order creation),
>    so we can decline an order that would route outside the EU?
>
> Thank you.

_(Drafted for the user to review and send — outward comms are the user's to make.)_
