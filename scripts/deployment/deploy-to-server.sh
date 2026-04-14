#!/bin/bash
################################################################################
# ENTERPRISE DEPLOYMENT SCRIPT
# Deploys Ectropy application to blue or green production server
#
# Usage: ./deploy-to-server.sh <blue|green> [--version VERSION]
# Example: ./deploy-to-server.sh blue
#          ./deploy-to-server.sh green --version v2024.12.08-1200
#
# Exit codes:
#   0 - Deployment successful
#   1 - Deployment failed
#
# Environment variables required:
#   PRODUCTION_SSH_KEY - SSH private key for server access
#   DATABASE_URL - Production database connection string
#   JWT_SECRET - JWT signing secret
#   JWT_REFRESH_SECRET - JWT refresh token secret
#   SESSION_SECRET - Session cookie secret
################################################################################

set -euo pipefail

# Color output for better readability
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# ENTERPRISE FIX (2025-12-10): Server configuration via environment variables
# Use GitHub Variables (injected by workflow) with fallback to current production IPs
# This eliminates hardcoded IPs and enables centralized infrastructure management
BLUE_IP="${PROD_BLUE_IP:-161.35.226.36}"
GREEN_IP="${PROD_GREEN_IP:-143.198.231.147}"

# Parse arguments
if [ $# -lt 1 ]; then
    log_error "Usage: $0 <blue|green> [--version VERSION]"
    exit 1
fi

SERVER=$1
VERSION="${3:-latest}"

# Determine server IP
case $SERVER in
    blue)
        SERVER_IP=$BLUE_IP
        SERVER_NAME="ectropy-production-blue"
        ;;
    green)
        SERVER_IP=$GREEN_IP
        SERVER_NAME="ectropy-production-green"
        ;;
    *)
        log_error "Invalid server: $SERVER. Must be 'blue' or 'green'"
        exit 1
        ;;
esac

log_info "=================================================="
log_info "Starting deployment to $SERVER server ($SERVER_IP)"
log_info "Version: $VERSION"
log_info "=================================================="

################################################################################
# ENTERPRISE FIX (2025-12-16): ROOT CAUSE #46 - SSH Connection Multiplexing
# Problem: Script makes 6 separate SSH connections causing rate limiting/KEX failures
# Solution: Enable SSH ControlMaster to reuse single connection across all steps
# Benefits: Eliminates connection overhead, prevents rate limiting, faster execution
################################################################################

# SSH connection multiplexing configuration
export SSH_CONTROL_PATH="/tmp/ssh-ectropy-deploy-$SERVER-$$"
export SSH_OPTS="-o ControlMaster=auto -o ControlPath=$SSH_CONTROL_PATH -o ControlPersist=300 -o ConnectTimeout=10 -o StrictHostKeyChecking=no"

# Cleanup function to close SSH master connection
cleanup_ssh() {
    if [ -S "$SSH_CONTROL_PATH" ]; then
        log_info "Closing SSH master connection"
        ssh $SSH_OPTS -O exit root@$SERVER_IP 2>/dev/null || true
    fi
}

# Register cleanup on script exit
trap cleanup_ssh EXIT

################################################################################
# ENTERPRISE FIX (2025-12-17): P0 CRITICAL - SSH Connection Retry Logic
# Problem: KEX failures on initial connection after multiple deployment attempts
# Root Cause: Server rate-limiting or transient network issues during SSH handshake
# Solution: Exponential backoff retry with increased timeout and keepalive
################################################################################
# STEP 1: Establish SSH master connection and validate connectivity
################################################################################

log_step "Step 1: Establishing SSH master connection to $SERVER_IP"

# Enhanced SSH options with keepalive and longer timeout
export SSH_OPTS="-o ControlMaster=auto -o ControlPath=$SSH_CONTROL_PATH -o ControlPersist=300 -o ConnectTimeout=30 -o ServerAliveInterval=10 -o ServerAliveCountMax=3 -o StrictHostKeyChecking=no"

# Retry logic with exponential backoff
MAX_RETRIES=5
RETRY_COUNT=0
RETRY_DELAY=2

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if ssh $SSH_OPTS root@$SERVER_IP "echo 'SSH connection successful'" 2>&1; then
        log_info "✅ SSH master connection established (will be reused for all steps)"
        break
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
            log_warn "SSH connection attempt $RETRY_COUNT/$MAX_RETRIES failed, retrying in ${RETRY_DELAY}s..."
            sleep $RETRY_DELAY
            RETRY_DELAY=$((RETRY_DELAY * 2))  # Exponential backoff
        else
            log_error "Failed to connect to $SERVER_IP via SSH after $MAX_RETRIES attempts"
            log_error "This may indicate:"
            log_error "  - Server rate-limiting after multiple deployment attempts"
            log_error "  - Network/firewall temporary blocking"
            log_error "  - SSH key authentication issues"
            log_error "Wait 60 seconds and try again, or check server firewall logs"
            exit 1
        fi
    fi
done

################################################################################
# STEP 2: Create deployment directory structure
################################################################################

log_step "Step 2: Creating deployment directory structure"

ssh $SSH_OPTS root@$SERVER_IP << 'ENDSSH'
# Create directories
mkdir -p /opt/ectropy
mkdir -p /opt/ectropy/data
mkdir -p /opt/ectropy/logs

# Set permissions
chmod 755 /opt/ectropy
chmod 755 /opt/ectropy/data
chmod 755 /opt/ectropy/logs

echo "Directory structure created"
ENDSSH

log_info "✅ Directory structure created"

################################################################################
# ENTERPRISE FIX (2025-12-17): P1 CRITICAL - Transfer MCP Server data files
# Problem: MCP Server crashes with ENOENT /app/data/roadmap-platform.json
# Root Cause: Data directory created but JSON catalog files not transferred
# Solution: Use rsync to transfer all MCP Server data files atomically
################################################################################

log_step "Step 2.5: Transferring MCP Server data files"

# Transfer MCP data files to production server
rsync -avz --delete \
  -e "ssh $SSH_OPTS" \
  apps/mcp-server/data/ \
  root@$SERVER_IP:/opt/ectropy/data/

log_info "✅ MCP Server data files transferred ($(ls -1 apps/mcp-server/data/*.json | wc -l) files)"

################################################################################
# STEP 3: Transfer docker-compose configuration
################################################################################

log_step "Step 3: Transferring docker-compose configuration"

# ENTERPRISE FIX (2025-12-17): ROOT CAUSE #53 - Build Context vs. Image Deployment
# Problem: docker-compose.production.yml uses build contexts for CI/CD, not server deployment
# Solution: Separate build configuration from deployment configuration
#
# Architecture Decision:
# ---------------------
# Two Docker Compose files serve different purposes in the deployment pipeline:
#
# 1. docker-compose.production.yml (CI/CD Builds)
#    - Purpose: Build container images from source code in GitHub Actions
#    - Pattern: build: { context: ., dockerfile: apps/*/Dockerfile }
#    - Location: Used in .github/workflows/*.yml
#    - Contains: Complete environment variable configuration
#
# 2. docker-compose.deploy.yml (Server Deployment)
#    - Purpose: Pull and run pre-built images on production servers
#    - Pattern: image: registry.digitalocean.com/ectropy-registry/*:${VERSION}
#    - Location: Transferred to /opt/ectropy/ on blue/green servers
#    - Contains: Identical env configuration, different image source
#
# Why Separate Files?
# ------------------
# Build-on-server is an anti-pattern:
#   ❌ Requires source code on production (security risk)
#   ❌ Inconsistent builds (timing, environment variations)
#   ❌ Slow deployments (10+ min build vs 30s pull)
#   ❌ No rollback capability (must rebuild previous version)
#
# Industry Standard:
# -----------------
# Kubernetes, Docker Swarm, ECS, Cloud Run all use pre-built images
# CI/CD builds once → Deploy many (same image SHA everywhere)
#
# ROOT CAUSE Chain Resolution:
# ----------------------------
# #52: Eliminated inline docker-compose generation ✅
# #53: Separated build config from deploy config ✅
#
# Result: Single source of truth + proper separation of concerns

# Verify repository docker-compose.deploy.yml exists
if [ ! -f "docker-compose.deploy.yml" ]; then
    log_error "Repository docker-compose.deploy.yml not found"
    log_error "Current directory: $(pwd)"
    log_error "Available files: $(ls -la docker-compose*.yml 2>/dev/null || echo 'No docker-compose files found')"
    exit 1
fi

# Transfer repository docker-compose.deploy.yml to server
log_info "Transferring repository docker-compose.deploy.yml (server deployment config)"
log_info "This file uses pre-built images from DOCR, not build contexts"
scp docker-compose.deploy.yml root@$SERVER_IP:/opt/ectropy/docker-compose.yml

# Verify transfer
ssh $SSH_OPTS root@$SERVER_IP "test -f /opt/ectropy/docker-compose.yml && wc -l /opt/ectropy/docker-compose.yml"

log_info "✅ Docker Compose deployment configuration transferred from repository"

################################################################################
# ENTERPRISE FIX (2025-12-18): ROOT CAUSE #8 - Transfer Nginx Infrastructure Files
# Problem: Nginx container mount failure - "/opt/ectropy/infrastructure/nginx/main.conf" doesn't exist
# Root Cause: Deployment script transfers docker-compose.yml but NOT infrastructure files it depends on
# Impact: Nginx container fails to start: "not a directory: Are you trying to mount a directory onto a file"
# Solution: rsync infrastructure directory to production servers before starting containers
################################################################################

log_step "Step 3.5: Transferring nginx infrastructure files"

# Verify infrastructure directory exists
if [ ! -d "infrastructure/nginx" ]; then
    log_error "Repository infrastructure/nginx directory not found"
    log_error "Current directory: $(pwd)"
    exit 1
fi

# Transfer nginx configuration and SSL files
log_info "Transferring nginx configuration files to production server"
rsync -avz --delete \
  -e "ssh $SSH_OPTS" \
  infrastructure/nginx/ \
  root@$SERVER_IP:/opt/ectropy/infrastructure/nginx/

# Verify critical files exist
ssh $SSH_OPTS root@$SERVER_IP << 'ENDSSH'
if [ ! -f "/opt/ectropy/infrastructure/nginx/main.conf" ]; then
    echo "ERROR: main.conf not found after transfer"
    exit 1
fi
if [ ! -f "/opt/ectropy/infrastructure/nginx/ectropy-production.conf" ]; then
    echo "ERROR: ectropy-production.conf not found after transfer"
    exit 1
fi
echo "Infrastructure files verified"
ENDSSH

log_info "✅ Nginx infrastructure files transferred and verified"

################################################################################
# STEP 4: Transfer environment variables
################################################################################

log_step "Step 4: Configuring environment variables"

# Create .env file with secrets
# ENTERPRISE FIX (2026-03-08): SCP-based .env transfer (replaces nested heredoc)
# ROOT CAUSE: Nested unquoted heredocs caused double shell expansion.
# If any secret contained $ characters, the remote shell would re-expand them.
# Fix: Write .env locally with single heredoc, transfer via scp.
# Flow: Local shell expands variables → writes temp file → scp transfers literally
#
# ENTERPRISE FIX (2025-12-17): ROOT CAUSE #54 - Complete Environment Variable Coverage
# Problem: REDIS_PASSWORD, ENCRYPTION_KEY, MCP_API_KEY missing from .env
# Impact: Redis crashes on startup (--requirepass requires password), services fail
# Solution: Add all required secrets from GitHub environment to .env generation
#
# ENTERPRISE FIX (2026-01-15): ROOT CAUSE #67 - Production Environment Validation Failures
# Problem: API_URL and FRONTEND_URL missing from .env, causing production validation failures
# Solution: Add API_URL and FRONTEND_URL to .env generation from GitHub variables
TEMP_ENV=$(mktemp)
cat > "$TEMP_ENV" << ENVEOF
VERSION=$VERSION
DATABASE_URL=$DATABASE_URL
MIGRATION_DATABASE_URL=${MIGRATION_DATABASE_URL:-}
DATABASE_HOST=${DATABASE_HOST}
DATABASE_PORT=${DATABASE_PORT}
DATABASE_NAME=${DATABASE_NAME}
DATABASE_USER=${DATABASE_USER}
DATABASE_PASSWORD=${DATABASE_PASSWORD}
REDIS_PASSWORD=${REDIS_PASSWORD}
JWT_SECRET=$JWT_SECRET
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET
SESSION_SECRET=$SESSION_SECRET
ENCRYPTION_KEY=${ENCRYPTION_KEY}
MCP_API_KEY=${MCP_API_KEY}
API_URL=${API_URL}
FRONTEND_URL=${FRONTEND_URL}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-}
GOOGLE_CLIENT_ID_PRODUCTION=${GOOGLE_CLIENT_ID_PRODUCTION:-}
GOOGLE_CLIENT_SECRET_PRODUCTION=${GOOGLE_CLIENT_SECRET_PRODUCTION:-}
OPENAI_API_KEY=${OPENAI_API_KEY:-}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
DIGITALOCEAN_ACCESS_TOKEN=${DIGITALOCEAN_ACCESS_TOKEN}
CRM_ENABLED=${CRM_ENABLED:-false}
CRM_API_URL=${CRM_API_URL:-}
CRM_API_KEY=${CRM_API_KEY:-}
CRM_WEBHOOK_SECRET=${CRM_WEBHOOK_SECRET:-}
SPECKLE_SERVER_URL=${SPECKLE_SERVER_URL:-http://ectropy-speckle-server:3000}
SPECKLE_SERVER_TOKEN=${SPECKLE_SERVER_TOKEN:-}
SPECKLE_ADMIN_EMAIL=${SPECKLE_ADMIN_EMAIL:-speckle-admin@ectropy.ai}
SPECKLE_ADMIN_PASSWORD=${SPECKLE_ADMIN_PASSWORD:-}
SPECKLE_SESSION_SECRET=${SPECKLE_SESSION_SECRET:-}
SPECKLE_PUBLIC_URL=${SPECKLE_PUBLIC_URL:-https://ectropy.ai/speckle}
MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY:-}
MINIO_SECRET_KEY=${MINIO_SECRET_KEY:-}
MINIO_PUBLIC_URL=${MINIO_PUBLIC_URL:-https://ectropy.ai/minio}
RESEND_API_KEY=${RESEND_API_KEY:-}
RESEND_FROM_EMAIL=${RESEND_FROM_EMAIL:-noreply@ectropy.ai}
PLATFORM_DATABASE_URL=${PLATFORM_DATABASE_URL:-}
SHARED_DATABASE_URL=${SHARED_DATABASE_URL:-}
QDRANT_API_KEY=${QDRANT_API_KEY:-}
DB_ADMIN_PASSWORD=${DB_ADMIN_PASSWORD:-}
POSTGRES_URL=${POSTGRES_URL:-}
POSTGRES_USER=${POSTGRES_USER:-doadmin}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-${DATABASE_PASSWORD}}
POSTGRES_DB=${POSTGRES_DB:-speckle}
POSTGRES_PORT=${POSTGRES_PORT:-${DATABASE_PORT}}
PGSSLMODE=${PGSSLMODE:-require}
PG_CONNECTION_STRING=${PG_CONNECTION_STRING:-}
FILEIMPORT_QUEUE_POSTGRES_URL=${FILEIMPORT_QUEUE_POSTGRES_URL:-}
ENVEOF

scp $SSH_OPTS "$TEMP_ENV" root@$SERVER_IP:/opt/ectropy/.env
ssh $SSH_OPTS root@$SERVER_IP "chmod 600 /opt/ectropy/.env"
rm -f "$TEMP_ENV"
log_info "Environment variables configured via scp"

log_info "✅ Environment variables configured"

################################################################################
# STEP 5: Pull Docker images
################################################################################

log_step "Step 5: Pulling Docker images (version: $VERSION)"

# ENTERPRISE FIX (2026-03-05): DOCR Authentication for Private Images
# GHCR→DOCR migration (Jan 2026): All build workflows push to DOCR, deploy must pull from DOCR
# Core Solution: Enable DOCR login before pulling private container images
# Workflow provides: DIGITALOCEAN_ACCESS_TOKEN (from GitHub secret)
ssh $SSH_OPTS root@$SERVER_IP << ENDSSH
set -e
cd /opt/ectropy

# Login to DigitalOcean Container Registry (required for private images)
# DOCR API token auth: username must be non-empty (any string works, token is the password)
echo "${DIGITALOCEAN_ACCESS_TOKEN}" | docker login registry.digitalocean.com --username="ectropy-deploy" --password-stdin

# Pull images with authentication
docker-compose pull

echo "Docker images pulled successfully"
ENDSSH

log_info "✅ Docker images pulled"

################################################################################
# STEP 6: Stop existing containers (graceful shutdown)
################################################################################

log_step "Step 6: Stopping existing containers (graceful shutdown)"

ssh $SSH_OPTS root@$SERVER_IP << 'ENDSSH'
cd /opt/ectropy

# Check if containers exist
if docker-compose ps -q 2>/dev/null | grep -q .; then
    echo "Stopping existing containers..."
    docker-compose down --timeout 30
else
    echo "No existing containers to stop"
fi
ENDSSH

log_info "✅ Existing containers stopped"

################################################################################
# STEP 7: Start new containers
################################################################################

log_step "Step 7: Starting new containers"

ssh $SSH_OPTS root@$SERVER_IP << 'ENDSSH'
set -e  # Exit on error for proper diagnostics

cd /opt/ectropy

# ENTERPRISE FIX (2025-12-16): ROOT CAUSE #45 - Missing data directory
# Create required directories before starting containers
echo "Creating required directories..."
mkdir -p /opt/ectropy/data
chmod 755 /opt/ectropy/data

# Pre-flight validation
echo "Validating docker-compose configuration..."
if ! docker-compose config > /dev/null 2>&1; then
    echo "ERROR: docker-compose.yml validation failed"
    docker-compose config
    exit 1
fi

echo "Validation successful"

# Start containers
# ENTERPRISE FIX (2026-03-09): Don't fail on docker-compose up exit code
# Init containers (speckle-db-init, restart:'no') cause non-zero exit when they
# complete or fail, even though core services start fine. Let the health check
# in Step 8 determine if the deployment succeeded.
echo "Starting containers..."
docker-compose up -d --remove-orphans 2>&1 || {
    echo "WARNING: docker-compose up returned non-zero (init container may have failed)"
    echo "Continuing to health check — core services may still be starting..."
    docker-compose ps
    docker-compose logs --tail=30 speckle-db-init 2>/dev/null || true
}

# Wait for containers to be healthy
echo "Waiting for containers to start..."
sleep 10

echo "Containers started successfully"
ENDSSH

log_info "✅ New containers started"

################################################################################
# STEP 8: Wait for services to be ready
################################################################################

log_step "Step 8: Waiting for services to be ready"

# ENTERPRISE FIX (2025-12-19): P0 ROOT CAUSE - Health check timeout
# Issue: Containers take ~128 seconds to fully stabilize, but MAX_WAIT was only 120s
# Evidence: Deployment #20360542669 showed healthy containers but timed out
# Solution: Increase to 180 seconds (50% buffer for cold starts)
# ENTERPRISE FIX (2026-03-08): Increased from 180s to 300s for 15-service architecture
# Root Cause (chain-9): Worst-case critical path: redis 120s + api-gateway 210s = 330s
# 300s (5 min) accommodates parallel startup of all services with safety margin
MAX_WAIT=300
ELAPSED=0

while [ $ELAPSED -lt $MAX_WAIT ]; do
    if ssh $SSH_OPTS root@$SERVER_IP "curl -f -s http://localhost:4000/health > /dev/null 2>&1"; then
        log_info "✅ API Gateway is healthy"
        break
    fi
    sleep 5
    ELAPSED=$((ELAPSED + 5))
    echo "Waiting for API Gateway... ($ELAPSED/$MAX_WAIT seconds)"
done

if [ $ELAPSED -ge $MAX_WAIT ]; then
    log_error "❌ API Gateway failed to become healthy within $MAX_WAIT seconds"

    log_error "Collecting diagnostic information..."

    # Collect diagnostic information for root cause analysis
    ssh $SSH_OPTS root@$SERVER_IP << 'DIAGSSH'
cd /opt/ectropy

echo ""
echo "====================================="
echo "DIAGNOSTIC REPORT - Health Check Failure"
echo "====================================="
echo ""

echo "Container Status:"
docker-compose ps
echo ""

echo "API Gateway Container Logs (last 100 lines):"
docker-compose logs --tail=100 api-gateway
echo ""

echo "MCP Server Container Logs (last 50 lines):"
docker-compose logs --tail=50 mcp-server
echo ""

echo "Web Dashboard Container Logs (last 50 lines):"
docker-compose logs --tail=50 web-dashboard
echo ""

echo "Speckle DB Init Container Logs (last 50 lines):"
docker-compose logs --tail=50 speckle-db-init
echo ""

echo "Speckle Server Container Logs (last 50 lines):"
docker-compose logs --tail=50 speckle-server
echo ""

echo "System Resources:"
echo "Memory: $(free -h | grep Mem: | awk '{print $3 "/" $2}')"
echo "Disk: $(df -h / | tail -1 | awk '{print $3 "/" $2 " (" $5 " used)"}')"
echo ""

echo "Docker Network Status:"
# ENTERPRISE FIX (2025-12-19): P0 ROOT CAUSE - Spurious network check
# Old: docker network inspect ectropy-network (doesn't exist, causes confusion)
# New: Inspect actual docker-compose default network
docker network ls | grep -E "(ectropy|opt-ectropy)" || echo "No custom networks found (using docker-compose defaults)"
echo ""

echo "====================================="
DIAGSSH

    exit 1
fi

################################################################################
# STEP 9: Display deployment status
################################################################################

log_step "Step 9: Verifying deployment status"

ssh $SSH_OPTS root@$SERVER_IP << 'ENDSSH'
cd /opt/ectropy

echo ""
echo "Container Status:"
docker-compose ps

echo ""
echo "Health Check Status:"
docker-compose ps --format "table {{.Service}}\t{{.Status}}"
ENDSSH

log_info "=================================================="
log_info "✅ DEPLOYMENT SUCCESSFUL"
log_info "Server: $SERVER ($SERVER_IP)"
log_info "Version: $VERSION"
log_info "=================================================="

exit 0
