#!/usr/bin/env bash
set -euo pipefail

# Rebuilds the shop LAN origin and recreates its container, then VERIFIES the
# running container is actually serving the new code. Run on the NAS.

CONTAINER="ix-photography-shop-origin-1"
IMAGE="ix-photography-shop-origin:latest"
SOURCE="/mnt/chicago/photography/Shop/shop-origin"
COMPOSE_PROJECT="ix-photography-shop"
COMPOSE="$SOURCE/docker-compose.yml"
MARKER="app.post('/orders'"   # a route only the NEW server.js contains

# 0. Guard — the most common failure is a stale source: if the synced files
#    don't contain the new routes, building would just reproduce the old image.
if [ ! -f "$SOURCE/server.js" ]; then
  echo "ERROR: $SOURCE/server.js not found — has lan-origin/ been synced to $SOURCE?"
  exit 1
fi
if ! grep -q "$MARKER" "$SOURCE/server.js"; then
  echo "ERROR: $SOURCE/server.js is STALE (no /orders routes)."
  echo "       Re-sync your updated lan-origin/ to $SOURCE, then re-run."
  exit 1
fi
if ! grep -q '"nodemailer"' "$SOURCE/package.json"; then
  echo "WARNING: $SOURCE/package.json looks stale (no nodemailer) — re-sync it too."
fi
# server.js imports ./invoice.js (PDF invoices) — a missing file or a Dockerfile
# that doesn't COPY it makes the container crash on startup. Fail early & clearly.
if ! [ -f "$SOURCE/invoice.js" ]; then
  echo "ERROR: $SOURCE/invoice.js missing — re-sync the FULL lan-origin/ dir, then re-run."
  exit 1
fi
if ! grep -q 'invoice.js' "$SOURCE/Dockerfile"; then
  echo "ERROR: $SOURCE/Dockerfile does not COPY invoice.js — re-sync the updated Dockerfile."
  exit 1
fi
if ! grep -q '"pdfkit"' "$SOURCE/package.json"; then
  echo "ERROR: $SOURCE/package.json missing pdfkit — re-sync it, then re-run (npm install adds it)."
  exit 1
fi
if ! grep -q '"adm-zip"' "$SOURCE/package.json"; then
  echo "ERROR: $SOURCE/package.json missing adm-zip — re-sync it, then re-run (npm install adds it)."
  exit 1
fi
# The receipt/terms invoice needs the Noto font (Cyrillic terms) installed via
# apt in the Dockerfile, and the new invoice.js with the PAID-IN-FULL receipt.
if ! grep -q 'fonts-noto-core' "$SOURCE/Dockerfile" || ! grep -q 'fonts-noto-cjk' "$SOURCE/Dockerfile"; then
  echo "ERROR: $SOURCE/Dockerfile must install fonts-noto-core AND fonts-noto-cjk — re-sync the updated Dockerfile."
  exit 1
fi
if ! grep -q 'PAID IN FULL' "$SOURCE/invoice.js"; then
  echo "ERROR: $SOURCE/invoice.js is STALE (no receipt/terms code) — re-sync the updated invoice.js."
  exit 1
fi
# Poster master compositor (poster.js): needs the fonts/ subdir, the @resvg/resvg-js
# dep, and a Dockerfile that COPYies both. New SUBDIRECTORIES are the easy thing to
# miss when syncing, so guard each explicitly.
if ! [ -f "$SOURCE/poster.js" ]; then
  echo "ERROR: $SOURCE/poster.js missing — re-sync the FULL lan-origin/ dir, then re-run."
  exit 1
fi
if ! [ -d "$SOURCE/fonts" ] || ! [ -f "$SOURCE/fonts/IBMPlexMono-Light.ttf" ]; then
  echo "ERROR: $SOURCE/fonts/ missing (poster compositor fonts) — re-sync the FULL lan-origin/ dir INCLUDING the fonts/ subdir, then re-run."
  exit 1
fi
if ! grep -q '@resvg/resvg-js' "$SOURCE/package.json"; then
  echo "ERROR: $SOURCE/package.json missing @resvg/resvg-js — re-sync the updated package.json, then re-run (npm install adds it)."
  exit 1
fi
if ! grep -q 'poster.js' "$SOURCE/Dockerfile" || ! grep -q 'COPY fonts' "$SOURCE/Dockerfile"; then
  echo "ERROR: $SOURCE/Dockerfile must COPY poster.js AND the fonts/ dir — re-sync the updated Dockerfile."
  exit 1
fi
echo "==> Source check OK ($SOURCE has the new code)"

# 1. Build the image. Cached by DEFAULT — the Dockerfile copies app code LAST, so
#    a server.js change only rebuilds that final COPY layer; the slow font-apt and
#    npm-install layers are reused (seconds, not minutes). Pass --no-cache only
#    when you actually need a clean rebuild (Dockerfile/base image changed, or a
#    suspected stale layer):  ./rebuild.sh --no-cache
NOCACHE=""
if [ "${1:-}" = "--no-cache" ]; then NOCACHE="--no-cache"; fi
echo "==> Building $IMAGE from $SOURCE ${NOCACHE:+(no cache)}"
sudo docker build $NOCACHE -t "$IMAGE" "$SOURCE"

# 2. Remove the old container (don't abort if it's missing / differently named).
echo "==> Removing old container (if any)"
sudo docker rm -f "$CONTAINER" 2>/dev/null || true

# 3. Recreate it from the freshly built image.
echo "==> Recreating container"
sudo docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE" up -d --force-recreate --no-build

# 4. Verify the RUNNING container has the new code — fail loudly if not.
echo "==> Verifying"
sleep 2
CID="$(sudo docker ps -q -f "name=$CONTAINER" | head -1)"
if [ -n "$CID" ] && sudo docker exec "$CID" grep -q "$MARKER" server.js; then
  echo "==> PASS — the new origin is live."
  echo "    Quick external check:"
  echo "    curl -s -H 'x-shop-secret: <SECRET>' https://valhalla.gusmcewan.com/orders/x/meta"
  echo "    (should return {\"error\":\"not found\"}, NOT an HTML 'Cannot GET')"
else
  echo "==> FAIL — the container is NOT running the new server.js."
  echo "    If this origin is a TrueNAS Scale app, the Apps system may be reconciling"
  echo "    the container back to its stored (old) image. In the TrueNAS UI: stop the"
  echo "    app (or edit + redeploy it with the updated compose), then re-run this script."
  exit 1
fi
echo "==> Done"
