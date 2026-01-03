#!/bin/bash

# Mind Flayer - Build Sidecar Script
# Build Node sidecar and copy to Tauri binaries directory

set -e

echo "🔨 Building Mind Flayer Sidecar..."

# Enter sidecar directory
cd sidecar

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Build
echo "🏗️  Building TypeScript..."
pnpm build

# Ensure binaries directory exists
echo "📁 Creating binaries directory..."
mkdir -p ../src-tauri/binaries

# Use Node.js SEA (Single Executable Application) or package as executable
# Here we create a launch script
echo "📝 Creating launch script..."

# Create launch script (macOS)
cat > ../src-tauri/binaries/mind-flayer-sidecar << 'EOF'
#!/bin/bash
# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Calculate project root directory
# If in src-tauri/binaries, root is ../../
# If in src-tauri/target/debug, root is ../../../
if [[ "$SCRIPT_DIR" == */target/debug ]]; then
    PROJECT_ROOT="$SCRIPT_DIR/../../.."
else
    PROJECT_ROOT="$SCRIPT_DIR/../.."
fi

NODE_BIN="${NODE_BIN:-$(which node)}"
exec "$NODE_BIN" "$PROJECT_ROOT/sidecar/dist/index.js"
EOF

chmod +x ../src-tauri/binaries/mind-flayer-sidecar

# Create platform-specific symlinks (for development environment)
echo "🔗 Creating platform-specific symlinks..."
# macOS ARM64
ln -sf mind-flayer-sidecar ../src-tauri/binaries/mind-flayer-sidecar-aarch64-apple-darwin
# macOS x64
ln -sf mind-flayer-sidecar ../src-tauri/binaries/mind-flayer-sidecar-x86_64-apple-darwin
# Linux x64
ln -sf mind-flayer-sidecar ../src-tauri/binaries/mind-flayer-sidecar-x86_64-unknown-linux-gnu
# Windows x64
ln -sf mind-flayer-sidecar ../src-tauri/binaries/mind-flayer-sidecar-x86_64-pc-windows-msvc.exe

echo "✅ Sidecar build complete!"
echo "📍 Binary location: src-tauri/binaries/mind-flayer-sidecar"
