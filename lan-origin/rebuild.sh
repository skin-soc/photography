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
echo "==> Source check OK ($SOURCE has the new code)"

# 1. Build the image from scratch.
echo "==> Building $IMAGE from $SOURCE (no cache)"
sudo docker build --no-cache -t "$IMAGE" "$SOURCE"

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
