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

# Set JAVA_HOME and ANDROID_HOME for Android builds
if [ -d "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home" ]; then
  export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
  export PATH="$JAVA_HOME/bin:$PATH"
  export GRADLE_OPTS="-Xmx16384m -XX:MaxMetaspaceSize=2048m"
fi

if [ -d "$HOME/Library/Android/sdk" ]; then
  export ANDROID_HOME="$HOME/Library/Android/sdk"
  export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools:$PATH"
fi
exec npx --yes eas-cli@latest "$@"
