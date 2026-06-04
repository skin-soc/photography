# Gus McEwan Shop — Lightroom Classic plugin

A **publish service** for Lightroom Classic. It is the "which photos are for
sale" mechanism for the online shop: drag a photo into a Shop published
collection, hit **Publish**, and it appears in the shop.

## What it does

On Publish, Lightroom renders each photo in the collection (JPEG, sRGB, long
edge 800px — previews never exceed 800px). The plugin then:

1. Copies each rendered file to `<shop-data>/previews/<id>.jpg`.
2. Renders a full-resolution **edited master** to `<shop-data>/masters/<id>.jpg`
   (and a 16-bit TIFF `<id>.tif` for RAW shots). These are the fulfilment
   source — the origin makes the purchased download from them, so the delivered
   file matches the preview the customer saw.
3. Rebuilds `<shop-data>/catalog.json` from **every** Shop collection.

`<id>` is the original filename without its extension. Which **product types**
a photo is sold in is decided by which collections it lives in (see below).

The LAN origin app reads `catalog.json` + `previews/` and serves the shop. It
does the final downsizing and watermarking, so the previews written here stay
clean. The `masters/` are full-resolution and never served directly — only
generated, copyright-embedded derivatives leave the NAS, gated by a verified
payment.

## Install

1. In Lightroom Classic: **File → Plug-in Manager → Add**.
2. Select `GusMcEwanShop.lrplugin` (this folder's `.lrplugin` directory).
3. It now appears in the **Publish Services** panel (left side of the Library
   module) as **Gus McEwan Shop**.

## Set up

1. In the Publish Services panel, click **Set Up…** on Gus McEwan Shop.
2. Under **Gus McEwan Shop**, set the **Shop data folder** — point it at the
   `shop-data` folder the LAN origin app reads (e.g. the TrueNAS dataset
   mounted on this Mac). `catalog.json` and `previews/` are written there.
3. Save.

## Structure — folders, not one big pile

The shop is organised by **what a customer can buy**, not by subject. In
Lightroom you can't put folders *inside* a collection — but you can put
collections inside a **Collection Set**. Sets are the folders.

So the top level is three **published collection sets**, and inside each you
make as many **published collections** as you like to keep things tidy:

```
Gus McEwan Shop  (publish service)
├── Prints              (set — product type)
│   ├── Landscapes      (collection)
│   └── Portraits       (collection)
├── Fine Art            (set — product type)
│   └── Gallery edition (collection)
└── Digital Downloads   (set — product type)
    ├── Copenhagen      (collection)
    ├── Travel 2024     (collection)
    └── …               (as many as you want — this pool can be huge)
```

- Right-click the service → **Create Published Collection Set** for the three
  top-level buckets, then **Create Published Collection** inside each.
- The **top-level set name** decides the product type. Collections (and nested
  sets) inside it are purely your filing system — name them anything.
- A collection placed directly under the service (no set) is typed by its own
  name — handy for a quick start.

Set names are matched loosely: anything containing "digital"/"download" →
digital, "fine"/"frame" → fine art, "print" → prints (so "Fine Art Prints"
resolves to fine art).

**Sold every way?** A set named **"All Formats"** (or "Everything") grants all
three product types at once — so a photo offered as print, fine art *and*
digital lives in **one** collection, not three. Use it as a fourth top-level
bucket for your premium do-everything photographs.

## Day-to-day

1. Drag a photo into the collections it should be sold through. To sell it
   two ways, put it under two buckets; to sell it every way, drop it in a
   single collection under an **All Formats** bucket.
2. Right-click the service, a set, or a collection → **Publish**.
3. Removing a photo from a collection + re-publishing drops that offering.

Titles, captions and location come from each photo's IPTC metadata — editing
those in Lightroom marks the photo for republish automatically.

## Notes

- Pricing is **not** set in Lightroom. The LAN origin app applies a product
  /price template to every photo (see `lan-origin/`).
- Full-resolution originals never leave the LAN; this plugin only ever writes
  downsized previews.
