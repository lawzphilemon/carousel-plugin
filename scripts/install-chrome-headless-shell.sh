#!/usr/bin/env bash
# Install Chrome for Testing's headless shell — one binary, no apt/snap, no extra shared libs.
# Used by the carousel-plugin engine (and any HTML -> PNG/PDF screenshot work).
#
#   bash install-chrome-headless-shell.sh [target_dir]
#   export CHROME_PATH=<target_dir>/chrome-headless-shell
set -euo pipefail

TARGET="${1:-$HOME/.hermes/tools/chrome-headless-shell}"
VERSION="${CHROME_VERSION:-$(curl -fsSL https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json \
  | sed -n 's/.*"Stable":{[^}]*"version":"\([0-9.]*\)".*/\1/p')}"
[ -n "$VERSION" ] || { echo "could not resolve a Chrome-for-Testing version" >&2; exit 1; }

ZIP="chrome-headless-shell-linux64.zip"
URL="https://storage.googleapis.com/chrome-for-testing-public/${VERSION}/linux64/${ZIP}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "downloading chrome-headless-shell ${VERSION}" >&2
curl -fsSL -o "$TMP/$ZIP" "$URL"
mkdir -p "$TARGET"
unzip -oq "$TMP/$ZIP" -d "$TMP/x"
cp -a "$TMP/x/chrome-headless-shell-linux64/." "$TARGET/"

"$TARGET/chrome-headless-shell" --version
echo "set CHROME_PATH=$TARGET/chrome-headless-shell" >&2
