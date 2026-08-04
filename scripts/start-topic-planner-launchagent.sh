#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
ROOT_DIR="${SCRIPT_DIR:h}"
LOG_DIR="$HOME/Library/Logs/Afu"

mkdir -p "$LOG_DIR"

export PATH="$HOME/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export PORT="${PORT:-4317}"
unset MEM0_API_KEY OPENAI_API_KEY ANTHROPIC_API_KEY

cd "$ROOT_DIR"
exec node server.mjs >>"$LOG_DIR/server.log" 2>>"$LOG_DIR/server.error.log"
