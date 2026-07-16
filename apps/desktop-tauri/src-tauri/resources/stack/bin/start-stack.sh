#!/usr/bin/env bash
set -euo pipefail

STACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$STACK_DIR/logs"

cd "$STACK_DIR"
# Pull when GHCR has the image; ignore failure so a locally built tag still works.
if ! docker compose pull api; then
  echo "Warning: could not pull api image from registry; using local image if present." >&2
fi
docker compose up -d
docker compose ps > "$STACK_DIR/logs/compose-ps.log"
