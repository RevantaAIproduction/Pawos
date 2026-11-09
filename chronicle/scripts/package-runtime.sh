#!/usr/bin/env bash
set -euo pipefail

# Build the deployable application payload using Git Bash tar. The release
# pipeline must publish the emitted SHA-256 beside immutable versioned files.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
VERSION="${1:-}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]] || { echo "Usage: scripts/package-runtime.sh VERSION" >&2; exit 2; }
OUT="$ROOT/dist/release"
mkdir -p "$OUT"
ARCHIVE="$OUT/chronicle-$VERSION.tar.gz"
tar -czf "$ARCHIVE" -C "$ROOT" src
sha256sum "$ARCHIVE" | tee "$ARCHIVE.sha256"
APP_SHA256="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
node "$ROOT/scripts/render-launcher.mjs" "$VERSION" "$APP_SHA256" "$OUT/run"
PUBLIC_DIR="${2:-$ROOT/../pawos-web/public/chronicle}"
VERSION_DIR="$PUBLIC_DIR/releases/v$VERSION"
mkdir -p "$VERSION_DIR"
cp "$ARCHIVE" "$VERSION_DIR/chronicle-$VERSION.tar.gz"
cp "$ARCHIVE.sha256" "$VERSION_DIR/chronicle-$VERSION.tar.gz.sha256"
node "$ROOT/scripts/render-launcher.mjs" "$VERSION" "$APP_SHA256" "$PUBLIC_DIR/run"
echo "Built the release bundle and staged immutable web assets: $VERSION_DIR and $PUBLIC_DIR/run"
echo "The public launcher is usable only after this PawOS Web build is deployed and the exact URL is verified."
