#!/bin/bash

set -e

BINARY_NAME="mind-flayer-sidecar"
BINARIES_DIR="../src-tauri/binaries"

resolve_target_triple() {
  if [[ -n "${SIDECAR_TARGET_TRIPLE:-}" ]]; then
    printf '%s' "$SIDECAR_TARGET_TRIPLE"
    return
  fi

  local system
  local machine
  system="$(uname -s)"
  machine="$(uname -m)"

  case "$system:$machine" in
    Darwin:arm64)
      printf '%s' "aarch64-apple-darwin"
      ;;
    Darwin:x86_64)
      printf '%s' "x86_64-apple-darwin"
      ;;
    Linux:x86_64)
      printf '%s' "x86_64-unknown-linux-gnu"
      ;;
    *)
      echo "Unsupported development platform: $system $machine" >&2
      exit 1
      ;;
  esac
}

TARGET_TRIPLE="$(resolve_target_triple)"

echo "📦 Preparing development sidecar for $TARGET_TRIPLE..."
npx rimraf "$BINARIES_DIR"
mkdir -p "$BINARIES_DIR"

cp "scripts/$BINARY_NAME" "$BINARIES_DIR/$BINARY_NAME"
chmod +x "$BINARIES_DIR/$BINARY_NAME"
ln -sf "$BINARY_NAME" "$BINARIES_DIR/$BINARY_NAME-$TARGET_TRIPLE"

echo "✅ Sidecar build complete!"
echo "📍 Binary location: $BINARIES_DIR/$BINARY_NAME-$TARGET_TRIPLE"
