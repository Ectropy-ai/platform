#!/bin/bash
set -e

echo "=================================================="
echo "📦 Installing MCP Server (Validation-Only Mode)"
echo "=================================================="

# Idempotency check - skip if already installed
if [ -f "/usr/local/bin/start-mcp" ]; then
  # Check if MCP workspace exists in either location
  if [ -d "/workspace/mcp/dist/apps/mcp-server/main.js" ] || [ -d "/tmp/mcp-workspace/dist/apps/mcp-server/main.js" ]; then
    echo "✅ MCP Server already installed"
    echo "   - start-mcp script exists"
    echo "   - MCP workspace exists"
    echo "   - MCP server build exists"
    echo ""
    echo "Skipping installation (already complete)"
    exit 0
  fi
fi

# CI environment detection
if [ -n "$CI" ]; then
  echo "🏗️  Running in CI environment"
  echo "   - CI mode detected"
  echo "   - Using REPO_DIR: ${REPO_DIR:-/workspace}"
fi

# Install pnpm globally
echo "📥 Installing pnpm..."
npm install -g pnpm@10.11.0
echo "✅ pnpm installed: $(pnpm --version)"

# Determine workspace directory based on environment
# In CI or when /workspace doesn't exist, use /tmp/mcp-workspace
if [ -w "/workspace" ] || [ -n "$CODESPACES" ]; then
  MCP_WORKSPACE="/workspace/mcp"
else
  # Use temp directory for CI/testing
  MCP_WORKSPACE="/tmp/mcp-workspace"
  echo "⚠️  /workspace not writable, using $MCP_WORKSPACE"
fi

# Create workspace directory
echo "📁 Creating MCP workspace at $MCP_WORKSPACE..."
mkdir -p "$MCP_WORKSPACE"

# Copy necessary files
echo "📋 Copying MCP server code..."
# Use flexible path handling for CI vs local
REPO_DIR="${REPO_DIR:-/repo}"
if [ ! -d "$REPO_DIR" ]; then
  echo "⚠️  REPO_DIR $REPO_DIR not found, trying /workspace"
  REPO_DIR="/workspace"
fi

if [ ! -d "$REPO_DIR" ]; then
  echo "❌ Repository directory not found: $REPO_DIR"
  exit 1
fi

cd "$REPO_DIR"
echo "   Using repository: $REPO_DIR"

# Copy entire repository structure (needed for nx build)
cp -r apps "$MCP_WORKSPACE"/
cp -r libs "$MCP_WORKSPACE"/ 2>/dev/null || true
cp package.json "$MCP_WORKSPACE"/
cp pnpm-lock.yaml "$MCP_WORKSPACE"/ 2>/dev/null || true
cp pnpm-workspace.yaml "$MCP_WORKSPACE"/ 2>/dev/null || true
cp nx.json "$MCP_WORKSPACE"/
cp tsconfig.base.json "$MCP_WORKSPACE"/

# Copy Prisma schema and migrations (required for prisma generate)
echo "📋 Copying Prisma files..."

# Check app-specific location first
if [ -d "${REPO_DIR}/apps/mcp-server/prisma" ]; then
  echo "Found Prisma directory in mcp-server app"
  mkdir -p "$MCP_WORKSPACE"/apps/mcp-server/prisma
  cp -r "${REPO_DIR}/apps/mcp-server/prisma"/* "$MCP_WORKSPACE"/apps/mcp-server/prisma/ 2>/dev/null || {
    echo "⚠️  Warning: Could not copy Prisma files from app"
  }
  echo "✅ Prisma files copied from app"
# Check root location as fallback
elif [ -d "${REPO_DIR}/prisma" ]; then
  echo "Found Prisma directory in repo root"
  mkdir -p "$MCP_WORKSPACE"/prisma
  cp -r "${REPO_DIR}/prisma"/* "$MCP_WORKSPACE"/prisma/ 2>/dev/null || {
    echo "⚠️  Warning: Could not copy Prisma files from root"
  }
  echo "✅ Prisma files copied from root"
else
  echo "⚠️  Warning: No Prisma directory found"
  echo "   Checked: ${REPO_DIR}/apps/mcp-server/prisma"
  echo "   Checked: ${REPO_DIR}/prisma"
  echo "   If build uses Prisma, it will fail"
fi

# Verify schema.prisma exists after copy
if [ -f "$MCP_WORKSPACE/prisma/schema.prisma" ]; then
  echo "✅ Verified: schema.prisma is in place"
  ls -lh "$MCP_WORKSPACE"/prisma/schema.prisma
elif [ -f "$MCP_WORKSPACE/apps/mcp-server/prisma/schema.prisma" ]; then
  echo "✅ Verified: schema.prisma is in place (app-specific)"
  ls -lh "$MCP_WORKSPACE"/apps/mcp-server/prisma/schema.prisma
else
  echo "⚠️  schema.prisma not found after copy attempt"
fi

# Install ALL dependencies (including devDependencies needed for build)
cd "$MCP_WORKSPACE"
echo "📦 Installing dependencies (including dev dependencies for build)..."
pnpm install --frozen-lockfile || {
  echo "⚠️  Frozen lockfile failed, trying without..."
  pnpm install
}

# Verify critical dependencies installed
echo "🔍 Verifying build dependencies..."
if ! command -v prisma >/dev/null 2>&1; then
  echo "⚠️  Prisma not in PATH, checking node_modules..."
  if [ ! -f "node_modules/.bin/prisma" ]; then
    echo "❌ Prisma not found - check package.json"
    exit 1
  fi
  # Add node_modules/.bin to PATH
  export PATH="$PWD/node_modules/.bin:$PATH"
  echo "✅ Added node_modules/.bin to PATH"
fi

# Verify NX is available
if ! command -v nx >/dev/null 2>&1; then
  echo "⚠️  NX not in PATH, checking node_modules..."
  if [ ! -f "node_modules/.bin/nx" ]; then
    echo "❌ NX not found - check package.json"
    exit 1
  fi
  # Add node_modules/.bin to PATH if not already done
  export PATH="$PWD/node_modules/.bin:$PATH"
  echo "✅ NX found in node_modules"
fi

# Build MCP server
echo "🔨 Building MCP server..."
pnpm nx build mcp-server || {
  echo "❌ Build failed"
  echo "Checking for build output..."
  ls -la dist/ 2>/dev/null || echo "No dist/ directory created"
  exit 1
}

# Verify build output
if [ ! -f "dist/apps/mcp-server/main.js" ]; then
  echo "❌ Build succeeded but dist/apps/mcp-server/main.js not found"
  echo "   Current directory: $(pwd)"
  echo "   Build output:"
  find dist -type f 2>/dev/null || echo "   No dist directory"
  exit 1
fi
echo "✅ Build successful: dist/apps/mcp-server/main.js created"

# Create startup wrapper script
echo "📝 Creating start-mcp script..."
cat > /usr/local/bin/start-mcp << SCRIPT_EOF
#!/bin/bash
set -e

# Determine MCP workspace location
if [ -d "/workspace/mcp" ]; then
  MCP_WORKSPACE="/workspace/mcp"
elif [ -d "/tmp/mcp-workspace" ]; then
  MCP_WORKSPACE="/tmp/mcp-workspace"
else
  echo "❌ MCP workspace not found"
  exit 1
fi

echo "🚀 Starting MCP Server (Validation-Only Mode)..."
echo "   Workspace: \$MCP_WORKSPACE"
cd "\$MCP_WORKSPACE"

# Start MCP in background
VALIDATION_ONLY=true PORT=3001 node dist/apps/mcp-server/main.js > /tmp/mcp.log 2>&1 &
MCP_PID=\$!
echo \$MCP_PID > /tmp/mcp.pid

echo "   PID: \$MCP_PID"
echo "   Log: /tmp/mcp.log"

# Wait for MCP to be ready (30 second timeout)
echo "⏳ Waiting for MCP server to be ready..."
for i in {1..30}; do
  if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
    echo ""
    echo "✅ MCP Server ready at http://localhost:3001"
    echo ""
    echo "📋 Available endpoints:"
    echo "   • GET  /health"
    echo "   • POST /api/mcp/get-guidance"
    echo "   • POST /api/mcp/validate-work-plan"
    echo "   • POST /api/mcp/check-strategy"
    echo "   • GET  /api/mcp/roadmap/current"
    echo ""
    exit 0
  fi
  printf "."
  sleep 1
done

echo ""
echo "❌ MCP Server failed to start within 30 seconds"
echo ""
echo "Last 50 lines of log:"
tail -50 /tmp/mcp.log
exit 1
SCRIPT_EOF

chmod +x /usr/local/bin/start-mcp
echo "✅ start-mcp script created"

# Skip local testing in CI - CI will test separately
if [ -z "$CI" ]; then
  echo ""
  echo "💡 Local installation complete"
  echo "   To test: start-mcp"
fi

echo ""
echo "=================================================="
echo "✅ MCP Server Installation Complete"
echo "=================================================="
echo ""
echo "Installation details:"
echo "  - Binary: /usr/local/bin/start-mcp"
echo "  - Workspace: $MCP_WORKSPACE"
echo "  - Server: $MCP_WORKSPACE/dist/apps/mcp-server/main.js"
echo ""
echo "Usage in workflows:"
echo "  start-mcp"
echo "  curl http://localhost:3001/health"
echo ""
