#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

curl -sS -X POST "http://localhost:${PORT:-4317}/api/wiki/compile" \
  -H 'Content-Type: application/json' \
  -d '{}'
