#!/usr/bin/env bash
# Rebuild and redeploy the local 9Router Docker Compose service.
# Usage: ./deploy.sh
# Optional: DEPLOY_TIMEOUT=180 ./deploy.sh

set -Eeuo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$SCRIPT_DIR/compose.yaml}"
SERVICE="${SERVICE:-9router}"
DEPLOY_TIMEOUT="${DEPLOY_TIMEOUT:-120}"

log() {
  printf '\n[deploy] %s\n' "$*"
}

fail() {
  printf '\n[deploy] ERROR: %s\n' "$*" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || fail "Docker is not installed or is not on PATH."
docker info >/dev/null 2>&1 || fail "Docker is not running or cannot be accessed by the current user."
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required (docker compose)."
[ -f "$COMPOSE_FILE" ] || fail "Compose file not found: $COMPOSE_FILE"
[ -f "$SCRIPT_DIR/.env" ] || fail "Missing $SCRIPT_DIR/.env. Restore it from a secure backup or create it from .env.example before deploying."
case "$DEPLOY_TIMEOUT" in
  ''|*[!0-9]*) fail "DEPLOY_TIMEOUT must be a positive integer (seconds)." ;;
esac
[ "$DEPLOY_TIMEOUT" -gt 0 ] || fail "DEPLOY_TIMEOUT must be greater than zero."

compose=(docker compose --project-directory "$SCRIPT_DIR" -f "$COMPOSE_FILE")

log "Validating Compose configuration"
"${compose[@]}" config --quiet

if git -C "$SCRIPT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  log "Deploying commit $(git -C "$SCRIPT_DIR" rev-parse --short HEAD)"
fi

log "Building the $SERVICE image from local source"
"${compose[@]}" build --pull "$SERVICE"

log "Recreating $SERVICE (persistent Docker volumes are preserved)"
"${compose[@]}" up -d --no-deps --force-recreate "$SERVICE"

container_id="$("${compose[@]}" ps -q "$SERVICE")"
[ -n "$container_id" ] || fail "The $SERVICE container was not created."

log "Waiting up to ${DEPLOY_TIMEOUT}s for the container to become healthy"
deadline=$((SECONDS + DEPLOY_TIMEOUT))
while :; do
  state="$(docker inspect --format '{{.State.Status}}' "$container_id")"
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id")"

  case "$health:$state" in
    healthy:running|none:running)
      log "Deployment succeeded"
      "${compose[@]}" ps "$SERVICE"
      exit 0
      ;;
    unhealthy:*|*:exited|*:dead)
      "${compose[@]}" ps "$SERVICE" || true
      docker logs --tail 100 "$container_id" || true
      fail "The $SERVICE container did not start successfully (state: $state, health: $health)."
      ;;
  esac

  if [ "$SECONDS" -ge "$deadline" ]; then
    "${compose[@]}" ps "$SERVICE" || true
    docker logs --tail 100 "$container_id" || true
    fail "Timed out waiting for $SERVICE (state: $state, health: $health)."
  fi

  sleep 2
done
