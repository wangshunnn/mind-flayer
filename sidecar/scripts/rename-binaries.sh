#!/bin/bash

# Copy and rename pkg-generated binaries to Tauri format

set -e

# Configuration
BINARY_NAME="mind-flayer-sidecar"
BINARIES_DIR="../src-tauri/binaries"

echo "📦 Copying binaries to Tauri..."

# Clean and ensure binaries directory exists
echo "📁 Cleaning and creating binaries directory..."
npx rimraf "$BINARIES_DIR"
mkdir -p "$BINARIES_DIR"

cp "scripts/$BINARY_NAME" "$BINARIES_DIR/$BINARY_NAME"
chmod +x "$BINARIES_DIR/$BINARY_NAME"

# Create platform-specific symlinks (for development environment)
echo "🔗 Creating platform-specific symlinks..."

# macOS ARM64
ln -sf "$BINARY_NAME" "$BINARIES_DIR/$BINARY_NAME-aarch64-apple-darwin"
# macOS x64
ln -sf "$BINARY_NAME" "$BINARIES_DIR/$BINARY_NAME-x86_64-apple-darwin"
# Windows x64
ln -sf "$BINARY_NAME" "$BINARIES_DIR/$BINARY_NAME-x86_64-pc-windows-msvc.exe"

echo "✅ Sidecar build complete!"
echo "📍 Binary location: src-tauri/binaries/mind-flayer-sidecar"
