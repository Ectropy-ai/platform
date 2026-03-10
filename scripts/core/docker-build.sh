#!/bin/bash
set -euo pipefail

# Enterprise Docker Build Script
echo "🚀 Enterprise Docker Build System"
echo "================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Change to repository root
cd "$(dirname "$0")/.."

# Function to check prerequisites
check_prerequisites() {
    echo "📋 Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker not found${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Docker: $(docker --version)${NC}"
    
    # Check Docker Compose
    if ! command -v docker &> /dev/null || ! docker compose version &> /dev/null; then
        echo -e "${RED}❌ Docker Compose not found${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Docker Compose: $(docker compose version)${NC}"
    
    # Check Node version in Dockerfile matches local
    DOCKERFILE_NODE=$(grep "FROM node:" Dockerfile | head -1 | cut -d: -f2 | cut -d- -f1)
    echo -e "${GREEN}✓ Node version in Docker: ${DOCKERFILE_NODE}${NC}"
}

# Function to fix Dockerfile issues
fix_dockerfiles() {
    echo "🔧 Fixing Dockerfile issues..."
    
    # Fix mcp-server missing scripts
    if ! grep -q "COPY scripts ./scripts" apps/mcp-server/Dockerfile.dev; then
        sed -i '/COPY nx.json tsconfig.base.json .\//a COPY scripts ./scripts' apps/mcp-server/Dockerfile.dev
        echo -e "${GREEN}✓ Fixed mcp-server scripts copy${NC}"
    fi
    
    # Ensure all Dockerfiles have pnpm
    for dockerfile in Dockerfile Dockerfile.* apps/*/Dockerfile*; do
        if [ -f "$dockerfile" ]; then
            if ! grep -q "npm install -g pnpm" "$dockerfile"; then
                echo -e "${YELLOW}⚠ Adding pnpm to $dockerfile${NC}"
                sed -i '/^WORKDIR \/app/a RUN npm install -g pnpm@10.14.0' "$dockerfile"
            fi
        fi
    done
}

# Function to build services
build_services() {
    echo "🏗️ Building Docker services..."
    
    # Build with proper error handling
    if docker compose -f docker-compose.development.yml build --parallel; then
        echo -e "${GREEN}✅ All services built successfully${NC}"
    else
        echo -e "${RED}❌ Build failed. Check logs above${NC}"
        exit 1
    fi
}

# Function to verify builds
verify_builds() {
    echo "🔍 Verifying Docker images..."
    
    # Check if images were created
    EXPECTED_IMAGES=("ectropy_api-gateway" "ectropy_mcp-server")
    
    for image in "${EXPECTED_IMAGES[@]}"; do
        if docker images | grep -q "$image"; then
            echo -e "${GREEN}✓ Image $image exists${NC}"
        else
            echo -e "${YELLOW}⚠ Image $image not found${NC}"
        fi
    done
}

# Main execution
main() {
    echo "Starting at $(date)"
    
    check_prerequisites
    fix_dockerfiles
    build_services
    verify_builds
    
    echo ""
    echo -e "${GREEN}🎉 Docker build complete!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Start services: docker compose -f docker-compose.development.yml up -d"
    echo "2. Check health: docker compose -f docker-compose.development.yml ps"
    echo "3. View logs: docker compose -f docker-compose.development.yml logs -f"
}

# Run main function
main "$@"
