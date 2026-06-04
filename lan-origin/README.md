# Shop LAN origin

The bridge between the **Lightroom Classic library** and the **shop on
Cloudflare**. It runs on the TrueNAS server and is reached **exclusively
through a Cloudflare Tunnel** — no port-forwarding, no static IP, nothing
published directly to the internet.

```
Lightroom Classic ──► "Gus McEwan Shop" publish service
   (../lightroom-plugin)        │  Publish renders previews + writes
                                ▼
              shop-data/  catalog.json  +  previews/<id>.jpg
                                │
                                ▼
   shop-lan-origin  ──►  cloudflared  ──►  Cloudflare Tunnel
        │                                        │
   GET /catalog.json                             ▼
   GET /preview/:id                  Next.js shop Worker (gusmcewan.com)
```

## What it does (Phase 1 — catalog & browsing)

| Endpoint            | Purpose                                                   |
|---------------------|-----------------------------------------------------------|
| `GET /healthz`      | Liveness probe                                            |
| `GET /catalog.json` | Sellable photos + metadata + previewUrl + pricing         |
| `GET /preview/:id`  | The preview (from `previews/<id>.jpg`), downsized + watermarked — generated once, then cached |

Cloudflare edge-caches `/preview/:id` (immutable, 1-year), so each preview
crosses your home upload link **once**, not once per visitor.

Two layers of source files: the Lightroom plugin writes small **800px previews**
to `previews/<id>.jpg` on the fast SSD (web rendering), and the full-res
**masters** (`masters/<id>.jpg` + `<id>.tif` for RAW) to the bulk store — those
are the paid-download source, read only after a verified payment.

## What it does (Phase 2 — fulfilment)

Gated behind a verified Stripe payment. The shop Worker's Stripe webhook calls
these (all behind `x-shop-secret`):

| Endpoint                        | Purpose                                                       |
|---------------------------------|---------------------------------------------------------------|
| `POST /orders`                  | Issue a download grant + generate a passcode + email the buyer |
| `GET /orders/:id/meta`          | Item labels + expiry for the download page (no passcode)      |
| `POST /orders/:id/verify`       | Check the buyer's passcode                                    |
| `GET /orders/:id/file/:sku`     | Generate (once, cached) + stream the copyright-embedded file  |

**Deliverable source.** Every delivered file is produced from the Lightroom-
exported **edited master** for the photo `id`: `masters/<id>.jpg` for all photos,
plus `masters/<id>.tif` (16-bit) for RAW shots (the Pro / Original TIFF tiers).
The plugin renders these from each photo inside Lightroom with edits applied, so
a download matches the watermarked preview the customer bought. The masters are
the single source of truth — RAW originals (scattered across per-collection
folders) are never read directly. A photo that's for sale always has a master;
if one is missing, re-publish that photo.

`sharp` resizes to the purchased tier (keeping the ICC profile), then
`exiftool` embeds copyright + per-tier usage terms. Outputs are cached by SKU in
`cache/` and reused across buyers.

**Access.** A generated passcode (emailed + shown on the order-complete page)
unlocks the download page. Grants live in `orders/<orderId>.json` and expire
after `LINK_TTL_DAYS` (default 30). A daily sweep deletes expired grants and
stale cached files.

**Storage layout.** The web-facing files (`catalog.json`, `previews/`, the
watermarked preview cache) live on the fast SSD mount (`/data`). The heavy
fulfilment files — `masters/`, the generated deliverable `cache/`, and the
`orders/` grants — live on the bulk mount (`/fulfil`, e.g. `/mnt/sydney/shop`).
The Lightroom plugin writes `masters/` directly to the bulk mount (set its
"Masters folder").

**Email.** Sent from here (Node) over iCloud SMTP — the Worker can't do SMTP.
Use an app-specific password; `MAIL_FROM` must be your iCloud address or an
iCloud Custom-Domain alias. iCloud is a personal mailbox with daily send limits
and weaker transactional deliverability than a dedicated provider.

## Where the catalog comes from

The catalog and the clean preview JPEGs are produced by the **Lightroom Classic
publish-service plugin** in [`../lightroom-plugin`](../lightroom-plugin). When
you Publish a Shop collection, the plugin writes into the shop-data folder:

- `catalog.json` — which photos are for sale + metadata
  (see [`catalog.sample.json`](./catalog.sample.json) for the format)
- `previews/<id>.jpg` — a Lightroom-rendered preview (sRGB, ≤800px, clean)

This service then downsizes and watermarks those previews on demand, and adds a
`previewUrl` + a priced `products` list to each catalog entry.

## Pricing

Pricing is **not** set in Lightroom — this service applies it. Prices are in
minor units (**øre** — the shop charges in Danish kroner; 19500 = 195 kr).

- **Print / fine-art** — a fixed template (A4, A3, A2 …).
- **Digital downloads — Standard / Medium / Large** — fixed long-edge caps,
  flat-priced (same product whichever camera shot it). A tier is only offered
  when the original is genuinely larger than it (never upscaled).
- **Digital downloads — Master** — the true full-resolution original. Always
  offered. Its price is set by **megapixel brackets** so a medium-format
  master commands a premium automatically; older smaller files land in a
  lower bracket.

Copy [`products.sample.json`](./products.sample.json) to `products.json` in the
shop-data folder to override `printProducts`, `digitalTiers`, and/or
`masterBrackets`.

## Configuration

| Variable        | Default                    | Notes                                        |
|-----------------|----------------------------|----------------------------------------------|
| `PORT`          | `8787`                     |                                              |
| `DATA_DIR`      | `/data`                    | The shop-data folder                         |
| `CATALOG_PATH`  | `$DATA_DIR/catalog.json`   | Written by the Lightroom plugin              |
| `PREVIEWS_DIR`  | `$DATA_DIR/previews`       | Written by the Lightroom plugin              |
| `CACHE_DIR`     | `$DATA_DIR/preview-cache`  | Watermarked previews, written by this service |
| `PRODUCTS_PATH` | `$DATA_DIR/products.json`  | Optional pricing override                    |
| `PUBLIC_URL`    | —                          | Tunnel hostname, e.g. `https://origin.gusmcewan.com` |
| `PREVIEW_MAX`   | `1600`                     | Longest served-preview edge, px              |
| `SHARED_SECRET` | —                          | If set, callers must send `x-shop-secret`    |
| `MASTERS_DIR`   | `$DATA_DIR/masters`        | Fulfilment: Lightroom-exported edited masters (deliverable source) |
| `FULFIL_CACHE_DIR` | `$DATA_DIR/fulfil-cache` | Fulfilment: generated deliverables, by SKU  |
| `ORDERS_DIR`    | `$DATA_DIR/orders`         | Fulfilment: download grant records           |
| `SITE_URL`      | `https://gusmcewan.com`    | Public site, for the download link in emails |
| `LINK_TTL_DAYS` | `30`                       | Download-link validity                       |
| `SMTP_HOST`     | `smtp.mail.me.com`         | iCloud SMTP host                             |
| `SMTP_PORT`     | `587`                      | `465` switches to implicit TLS               |
| `SMTP_USER` / `SMTP_PASS` | —                | iCloud address + app-specific password       |
| `MAIL_FROM`     | `$SMTP_USER`               | iCloud address or Custom-Domain alias        |

## Deploy on TrueNAS Scale

1. Create a dataset, e.g. `pool/photography/shop-data`. The Lightroom plugin
   writes `catalog.json` + `previews/` into it. Adjust the volume path in
   [`docker-compose.yml`](./docker-compose.yml) to match your pool.
2. In the Cloudflare dashboard: **Zero Trust → Networks → Tunnels → Create**.
   Add a public hostname (`origin.gusmcewan.com`) routed to `http://origin:8787`.
   Copy the tunnel token.
3. Create a `.env` next to the compose file:
   ```
   CLOUDFLARED_TOKEN=eyJ...
   SHARED_SECRET=<long-random-string>
   ```
4. Install via **Apps → Discover → Custom App** (paste the compose YAML), or
   run `docker compose up -d` from the dataset.
5. Verify: `curl https://origin.gusmcewan.com/healthz` → `{"ok":true}`.

## Wire it to the shop

In the Cloudflare Pages/Workers project for the website, set:

```
SHOP_ORIGIN_URL = https://origin.gusmcewan.com
```

With that set, the shop loads the live catalog from the NAS. When it is unset
(local `next dev`), the shop falls back to a built-in mock catalog so the site
is fully browsable without the NAS running.

## Local test

```bash
npm install
DATA_DIR=. CATALOG_PATH=./catalog.sample.json PREVIEWS_DIR=./previews \
  PUBLIC_URL=http://localhost:8787 npm start
```
