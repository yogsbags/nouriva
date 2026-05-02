#!/usr/bin/env bash
# npm has shipped some Expo packages with a duplicated `android/bin` tree (mirror of `src`).
# expo-modules-autolinking scans both and emits duplicate *Package entries in ExpoModulesPackageList,
# which runs DevLauncher initialization twice and crashes with:
#   DevelopmentClientController was initialized.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
for relpath in \
  node_modules/expo/android/bin \
  node_modules/expo-dev-launcher/android/bin \
  node_modules/expo-dev-menu/android/bin \
  node_modules/expo-modules-core/android/bin
do
  d="$ROOT/$relpath"
  if [[ -d "$d" ]]; then
    rm -rf "$d"
  fi
done
