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

  if [[ "${OS:-}" == "Windows_NT" ]]; then
    system="Windows_NT"
  fi

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
    MINGW*:x86_64 | MSYS*:x86_64 | CYGWIN*:x86_64 | Windows_NT:x86_64 | Windows_NT:AMD64)
      printf '%s' "x86_64-pc-windows-msvc"
      ;;
    MINGW*:arm64 | MINGW*:aarch64 | MSYS*:arm64 | MSYS*:aarch64 | CYGWIN*:arm64 | CYGWIN*:aarch64 | Windows_NT:arm64 | Windows_NT:ARM64)
      printf '%s' "aarch64-pc-windows-msvc"
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

if [[ "$TARGET_TRIPLE" == *"windows"* ]]; then
  cp "$BINARIES_DIR/$BINARY_NAME" "$BINARIES_DIR/$BINARY_NAME-$TARGET_TRIPLE.exe"
else
  ln -sf "$BINARY_NAME" "$BINARIES_DIR/$BINARY_NAME-$TARGET_TRIPLE"
fi

echo "✅ Sidecar build complete!"
if [[ "$TARGET_TRIPLE" == *"windows"* ]]; then
  echo "📍 Binary location: $BINARIES_DIR/$BINARY_NAME-$TARGET_TRIPLE.exe"
else
  echo "📍 Binary location: $BINARIES_DIR/$BINARY_NAME-$TARGET_TRIPLE"
fi
