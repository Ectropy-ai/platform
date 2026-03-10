#!/bin/bash
# Enterprise Build Script for Ectropy Platform
# Handles staging and production builds with environment-specific configurations

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')] $1${NC}"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

# Configuration
ENVIRONMENT="${1:-staging}"
BUILD_CONFIG="${2:-default}"

log "🏗️  Enterprise Build Script"
log "Environment: $ENVIRONMENT"
log "Build Config: $BUILD_CONFIG"

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(staging|production|development)$ ]]; then
    error "Invalid environment. Use: staging, production, or development"
    exit 1
fi

# Set TypeScript configuration based on environment
case "$ENVIRONMENT" in
    "staging")
        TSCONFIG="tsconfig.staging.json"
        log "Using staging TypeScript configuration"
        ;;
    "production")
        TSCONFIG="tsconfig.enterprise-standard.json"
        log "Using production TypeScript configuration"
        ;;
    "development")
        TSCONFIG="tsconfig.json"
        log "Using development TypeScript configuration"
        ;;
esac

# Validate TypeScript configuration exists
if [ ! -f "$TSCONFIG" ]; then
    error "TypeScript configuration file $TSCONFIG not found"
    exit 1
fi

# Clean previous build
log "🧹 Cleaning previous build artifacts..."
rm -rf dist/
success "Build artifacts cleaned"

# Install dependencies if needed
if [ ! -d "node_modules" ] || [ "$BUILD_CONFIG" = "clean" ]; then
    log "📦 Installing dependencies..."
    npm install
    success "Dependencies installed"
fi

# Type checking
log "🔍 Running TypeScript type checking..."
if npx tsc --project "$TSCONFIG" --noEmit --skipLibCheck; then
    success "Type checking passed"
else
    error "Type checking failed"
    exit 1
fi

# Build projects sequentially to avoid memory issues
log "🔨 Building projects..."

# Build shared libraries first
log "Building shared libraries..."
npx nx build shared --configuration=$ENVIRONMENT || {
    warning "Shared library build failed, attempting fallback build"
    npx tsc --project libs/shared/tsconfig.json --skipLibCheck
}

# Build auth library
log "Building auth library..."
npx nx build auth --configuration=$ENVIRONMENT || {
    warning "Auth library build failed, attempting fallback build"
    npx tsc --project libs/auth/tsconfig.json --skipLibCheck
}

# Build API Gateway
log "Building API Gateway..."
npx nx build api-gateway --configuration=$ENVIRONMENT || {
    warning "API Gateway build failed, attempting fallback build"
    npx tsc --project apps/api-gateway/tsconfig.app.json --skipLibCheck
}

# Build Web Dashboard
log "Building Web Dashboard..."
npx nx build web-dashboard --configuration=$ENVIRONMENT || {
    warning "Web Dashboard build failed, attempting fallback build"
    cd apps/web-dashboard && npm run build && cd ../..
}

# Build MCP Server
log "Building MCP Server..."
npm run build:mcp-server:ci || {
    warning "MCP Server build failed, attempting direct build"
    npx nx build mcp-server --skip-nx-cache || {
        error "MCP Server build failed completely"
        exit 1
    }
}

success "🎉 Enterprise build completed successfully!"

# Build validation
log "🔍 Validating build outputs..."

REQUIRED_OUTPUTS=(
    "dist/apps/api-gateway"
    "dist/apps/web-dashboard"
    "dist/apps/mcp-server"
    "dist/libs/shared"
    "dist/libs/auth"
)

BUILD_SUCCESS=true
for output in "${REQUIRED_OUTPUTS[@]}"; do
    if [ -d "$output" ]; then
        success "Build output exists: $output"
    else
        error "Missing build output: $output"
        BUILD_SUCCESS=false
    fi
done

if [ "$BUILD_SUCCESS" = true ]; then
    success "🚀 All build outputs validated successfully"
    
    # Generate build manifest
    cat > dist/build-manifest.json << EOF
{
  "environment": "$ENVIRONMENT",
  "buildConfig": "$BUILD_CONFIG",
  "tsconfig": "$TSCONFIG",
  "buildTime": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "nodeVersion": "$(node --version)",
  "npmVersion": "$(npm --version)"
}
EOF
    
    success "Build manifest created: dist/build-manifest.json"
    log "Enterprise build completed successfully for $ENVIRONMENT environment"
else
    error "Build validation failed"
    exit 1
fi