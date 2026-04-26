#!/usr/bin/env bash
# Load .env into the environment, then run eas-cli (so EXPO_TOKEN & optional Apple ASC vars apply).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi
exec npx --yes eas-cli@latest "$@"
