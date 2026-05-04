#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${1:-}" == "--demo" ]]; then
  export TOPIC_PLANNER_VAULT_ROOT="$ROOT_DIR/examples/sample-vault"
  export TOPIC_PLANNER_CONFIG="$ROOT_DIR/examples/sample-vault/topic-planner.config.json"
fi

cd "$ROOT_DIR"
exec node server.mjs
