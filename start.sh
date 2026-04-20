#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
STACK_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

echo "[9router] Rebuilding nine-router service from $STACK_DIR"
docker compose -f "$STACK_DIR/compose.yaml" build nine-router

echo "[9router] Restarting nine-router container"
docker compose -f "$STACK_DIR/compose.yaml" up -d --no-deps nine-router

echo "[9router] Current status"
docker compose -f "$STACK_DIR/compose.yaml" ps nine-router
