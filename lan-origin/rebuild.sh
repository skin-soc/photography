#!/usr/bin/env bash
set -euo pipefail

CONTAINER="ix-photography-shop-origin-1"
IMAGE="ix-photography-shop-origin:latest"
SOURCE="/mnt/chicago/photography/Shop/shop-origin"
COMPOSE_PROJECT="ix-photography-shop"

echo "==> Building $IMAGE from $SOURCE"
sudo docker build --no-cache -t "$IMAGE" "$SOURCE"

echo "==> Stopping and removing $CONTAINER"
sudo docker stop "$CONTAINER" && sudo docker rm "$CONTAINER"

echo "==> Starting new container"
sudo docker compose -p "$COMPOSE_PROJECT" -f "$SOURCE/docker-compose.yml" up -d --no-build

echo "==> Done"
