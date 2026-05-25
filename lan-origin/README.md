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
| `GET /preview/:id`  | The preview, downsized + watermarked — generated once, then cached |

Cloudflare edge-caches `/preview/:id` (immutable, 1-year), so each preview
crosses your home upload link **once**, not once per visitor.

Serving full-resolution originals is **deliberately not implemented yet** — it
belongs to the fulfilment phase, gated behind a verified Stripe payment.

## Where the catalog comes from

The catalog and the clean preview JPEGs are produced by the **Lightroom Classic
publish-service plugin** in [`../lightroom-plugin`](../lightroom-plugin). When
you Publish a Shop collection, the plugin writes into the shop-data folder:

- `catalog.json` — which photos are for sale + metadata
  (see [`catalog.sample.json`](./catalog.sample.json) for the format)
- `previews/<id>.jpg` — a Lightroom-rendered preview (sRGB, ~2560px, clean)

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
