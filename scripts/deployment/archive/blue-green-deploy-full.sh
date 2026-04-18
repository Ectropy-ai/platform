#!/bin/bash
set -euo pipefail

# Blue-Green Deployment Script - Enterprise Grade
# Deploys new version to standby environment, validates, then switches traffic
# Enhanced with comprehensive service management and defensive gates

COLOR_TO_DEPLOY=${1:-green}  # Default to green
HEALTH_CHECK_URL=${2:-https://ectropy.ai/api/health}
MAX_HEALTH_RETRIES=30
HEALTH_CHECK_INTERVAL=10

echo "========================================="
echo "🚀 Enterprise Blue-Green Deployment"
echo "========================================="
echo "Timestamp: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "Hostname: $(hostname)"
echo "Target Color: ${COLOR_TO_DEPLOY}"
echo "========================================="
echo ""

# Determine active and standby colors
if [ "$COLOR_TO_DEPLOY" = "blue" ]; then
    ACTIVE_COLOR="green"
    STANDBY_COLOR="blue"
    STANDBY_PORT_API="4000"
    STANDBY_PORT_WEB="3000"
    ACTIVE_PORT_API="4001"
    ACTIVE_PORT_WEB="3001"
else
    ACTIVE_COLOR="blue"
    STANDBY_COLOR="green"
    STANDBY_PORT_API="4001"
    STANDBY_PORT_WEB="3001"
    ACTIVE_PORT_API="4000"
    ACTIVE_PORT_WEB="3000"
fi

echo "📊 Current state: ${ACTIVE_COLOR} is active (API:${ACTIVE_PORT_API}, Web:${ACTIVE_PORT_WEB})"
echo "📊 Deploying to: ${STANDBY_COLOR} (API:${STANDBY_PORT_API}, Web:${STANDBY_PORT_WEB})"
echo ""

# ============================================================================
# ENTERPRISE SERVICE MANAGEMENT - Pre-Deployment
# ============================================================================
echo "========================================="
echo "🔍 PHASE 0: PRE-DEPLOYMENT SERVICE MANAGEMENT"
echo "========================================="

# Step 0.1: Service Discovery (Informational)
echo ""
echo "Step 0.1/3: Discovering existing services..."
if [ -f scripts/deployment/discover-services.sh ]; then
  bash scripts/deployment/discover-services.sh || echo "⚠️  Discovery completed with warnings"
else
  echo "ℹ️  Discovery script not found (skipping)"
fi

# Step 0.2: Backup Database
echo ""
echo "Step 0.2/3: Backing up production database..."
if systemctl is-active --quiet postgresql 2>/dev/null; then
  echo "💾 Backing up native PostgreSQL database..."
  BACKUP_FILE="/tmp/ectropy_production_backup_$(date +%Y%m%d_%H%M%S).sql"
  sudo -u postgres pg_dump ectropy_production > "$BACKUP_FILE" 2>/dev/null || echo "ℹ️  No existing database to backup"
  if [ -f "$BACKUP_FILE" ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "✅ Database backup created: $BACKUP_FILE (${BACKUP_SIZE})"
  fi
else
  echo "ℹ️  PostgreSQL running in Docker (backup handled by Docker)"
fi

# Step 0.3: Cleanup Conflicting Services
echo ""
echo "Step 0.3/3: Checking for conflicting native services..."
if [ -f scripts/deployment/cleanup-all-services.sh ]; then
  # Note: We don't run full cleanup in production - only check for native conflicts
  # Docker containers are managed separately for blue-green deployment
  echo "ℹ️  Checking for native services that might conflict with Docker..."

  # Check for native services on standby ports
  CONFLICTS_FOUND=false
  for port in $STANDBY_PORT_API $STANDBY_PORT_WEB; do
    if lsof -Pi:$port -sTCP:LISTEN -t >/dev/null 2>&1; then
      echo "⚠️  WARNING: Port $port is in use by native service"
      lsof -i:$port
      CONFLICTS_FOUND=true
    fi
  done

  if [ "$CONFLICTS_FOUND" = "true" ]; then
    echo "❌ ERROR: Native services detected on standby ports"
    echo "Run: bash scripts/deployment/cleanup-all-services.sh --force"
    exit 1
  fi

  echo "✅ No native service conflicts detected"
else
  echo "⚠️  Cleanup script not found - manual verification required"
fi

# Defensive Gate: Verify standby ports are free
echo ""
echo "========================================="
echo "🔒 DEFENSIVE GATE: PORT VERIFICATION"
echo "========================================="
echo "Verifying standby ports are available for deployment..."

VERIFICATION_FAILED=false
for port in $STANDBY_PORT_API $STANDBY_PORT_WEB; do
  echo "Checking port $port..."
  if lsof -Pi:$port -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "❌ ERROR: Port $port is IN USE!"
    lsof -i:$port
    VERIFICATION_FAILED=true
  else
    echo "✅ Port $port is FREE"
  fi
done

if [ "$VERIFICATION_FAILED" = "true" ]; then
  echo ""
  echo "🛑 DEPLOYMENT BLOCKED - Port conflicts detected"
  echo "Standby ports must be free for blue-green deployment"
  exit 1
fi

echo "✅ All standby ports verified FREE"
echo ""

echo "========================================="
echo "✅ PRE-DEPLOYMENT CHECKS PASSED"
echo "========================================="
echo "Proceeding with blue-green deployment..."
echo ""

# ============================================================================
# PHASE 1: DEPLOY TO STANDBY
# ============================================================================
echo "========================================="
echo "🏗️  PHASE 1: DEPLOY TO STANDBY ENVIRONMENT"
echo "========================================="
echo "Deploying to ${STANDBY_COLOR} (API:${STANDBY_PORT_API}, Web:${STANDBY_PORT_WEB})..."
docker-compose -f docker-compose.production.yml up -d \
    api-gateway-${STANDBY_COLOR} \
    web-dashboard-${STANDBY_COLOR}

echo "✅ Containers started"
echo ""

# ============================================================================
# PHASE 2: HEALTH VERIFICATION
# ============================================================================
echo "========================================="
echo "🏥 PHASE 2: STANDBY ENVIRONMENT HEALTH CHECKS"
echo "========================================="
echo "Waiting for ${STANDBY_COLOR} to become healthy..."
echo "Max wait: $((MAX_HEALTH_RETRIES * HEALTH_CHECK_INTERVAL))s ($MAX_HEALTH_RETRIES attempts)"
echo ""
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_HEALTH_RETRIES ]; do
    # Check API Gateway health
    API_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' ectropy-api-${STANDBY_COLOR} 2>/dev/null || echo "unknown")
    # Check Web Dashboard health
    WEB_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' ectropy-web-${STANDBY_COLOR} 2>/dev/null || echo "unknown")
    
    if [ "$API_HEALTH" = "healthy" ] && [ "$WEB_HEALTH" = "healthy" ]; then
        echo "✅ ${STANDBY_COLOR} environment is healthy"
        break
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "⏳ Attempt $RETRY_COUNT/$MAX_HEALTH_RETRIES: API=$API_HEALTH, WEB=$WEB_HEALTH (waiting ${HEALTH_CHECK_INTERVAL}s...)"
    sleep $HEALTH_CHECK_INTERVAL
done

if [ $RETRY_COUNT -eq $MAX_HEALTH_RETRIES ]; then
    echo ""
    echo "❌ ERROR: ${STANDBY_COLOR} environment failed to become healthy"
    echo "🔄 Rolling back deployment..."
    docker-compose -f docker-compose.production.yml down api-gateway-${STANDBY_COLOR} web-dashboard-${STANDBY_COLOR}
    echo "✅ Rollback complete - ${ACTIVE_COLOR} remains active"
    exit 1
fi

echo "✅ ${STANDBY_COLOR} environment is healthy"
echo ""

# ============================================================================
# PHASE 3: SMOKE TESTS
# ============================================================================
echo "========================================="
echo "🧪 PHASE 3: SMOKE TESTS ON STANDBY"
echo "========================================="
echo "Testing ${STANDBY_COLOR} endpoints before traffic switch..."

# Test API health
echo "Testing API at http://localhost:${STANDBY_PORT_API}/health..."
if ! curl --fail --silent "http://localhost:${STANDBY_PORT_API}/health" > /dev/null; then
    echo "❌ ERROR: API health check failed on ${STANDBY_COLOR}"
    echo "🔄 Rolling back..."
    docker-compose -f docker-compose.production.yml down api-gateway-${STANDBY_COLOR} web-dashboard-${STANDBY_COLOR}
    exit 1
fi
echo "✅ API smoke test passed"

# Test Web health
echo "Testing Web at http://localhost:${STANDBY_PORT_WEB}..."
if ! curl --fail --silent "http://localhost:${STANDBY_PORT_WEB}" > /dev/null; then
    echo "❌ ERROR: Web health check failed on ${STANDBY_COLOR}"
    echo "🔄 Rolling back..."
    docker-compose -f docker-compose.production.yml down api-gateway-${STANDBY_COLOR} web-dashboard-${STANDBY_COLOR}
    exit 1
fi
echo "✅ Web smoke test passed"
echo ""

# ============================================================================
# PHASE 4: TRAFFIC CUTOVER
# ============================================================================
echo "========================================="
echo "🔄 PHASE 4: TRAFFIC CUTOVER"
echo "========================================="
echo "Switching traffic from ${ACTIVE_COLOR} to ${STANDBY_COLOR}..."

# Update nginx config to route to new color
sed -i "s/server api-gateway-${ACTIVE_COLOR}:.*; *# Active/server api-gateway-${STANDBY_COLOR}:${STANDBY_PORT_API};  # Active/" \
    infrastructure/nginx/ectropy-production.conf
sed -i "s/server web-dashboard-${ACTIVE_COLOR}:.*; *# Active/server web-dashboard-${STANDBY_COLOR}:${STANDBY_PORT_WEB};  # Active/" \
    infrastructure/nginx/ectropy-production.conf

# Reload nginx (graceful, zero downtime)
echo "Reloading Nginx configuration..."
docker exec ectropy-nginx nginx -s reload

echo "✅ Traffic switched to ${STANDBY_COLOR}"
echo ""

# ============================================================================
# PHASE 5: POST-CUTOVER VERIFICATION
# ============================================================================
echo "========================================="
echo "🏥 PHASE 5: POST-CUTOVER VERIFICATION"
echo "========================================="
echo "Verifying production health after traffic switch..."
echo "Waiting 5s for traffic to settle..."
sleep 5

echo "Testing production URL: $HEALTH_CHECK_URL..."
if ! curl --fail --silent "$HEALTH_CHECK_URL" > /dev/null; then
    echo ""
    echo "❌ CRITICAL: Production health check FAILED after cutover"
    echo "🔄 Initiating automatic rollback to ${ACTIVE_COLOR}..."
    echo ""

    # Revert nginx config
    sed -i "s/server api-gateway-${STANDBY_COLOR}:.*; *# Active/server api-gateway-${ACTIVE_COLOR}:${ACTIVE_PORT_API};  # Active/" \
        infrastructure/nginx/ectropy-production.conf
    sed -i "s/server web-dashboard-${STANDBY_COLOR}:.*; *# Active/server web-dashboard-${ACTIVE_COLOR}:${ACTIVE_PORT_WEB};  # Active/" \
        infrastructure/nginx/ectropy-production.conf

    docker exec ectropy-nginx nginx -s reload
    echo "✅ Traffic rolled back to ${ACTIVE_COLOR}"

    # Stop failed standby environment
    docker-compose -f docker-compose.production.yml down api-gateway-${STANDBY_COLOR} web-dashboard-${STANDBY_COLOR}
    echo "✅ Failed ${STANDBY_COLOR} environment stopped"

    exit 1
fi

echo "✅ Production health verified - deployment successful!"
echo ""

# ============================================================================
# PHASE 6: POST-DEPLOYMENT OPTIONS
# ============================================================================
echo "========================================="
echo "🧹 PHASE 6: POST-DEPLOYMENT CLEANUP OPTIONS"
echo "========================================="
echo ""
echo "Current state:"
echo "  ✅ Active:  ${STANDBY_COLOR} (serving traffic)"
echo "  ⏸️  Standby: ${ACTIVE_COLOR} (available for instant rollback)"
echo ""
echo "Cleanup options:"
echo "  1. Keep ${ACTIVE_COLOR} running for instant rollback (recommended)"
echo "  2. Stop ${ACTIVE_COLOR} to free resources:"
echo "     docker-compose -f docker-compose.production.yml stop \\"
echo "       api-gateway-${ACTIVE_COLOR} web-dashboard-${ACTIVE_COLOR}"
echo ""
echo "========================================="
echo "🎉 DEPLOYMENT COMPLETE"
echo "========================================="
echo "Timestamp: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "Active Environment: ${STANDBY_COLOR}"
echo "Standby Environment: ${ACTIVE_COLOR}"
echo ""
echo "📊 Rollback command (if needed):"
echo "   cd /opt/ectropy && bash scripts/deployment/blue-green-deploy-full.sh ${ACTIVE_COLOR}"
echo ""
echo "🔍 Monitor deployment:"
echo "   docker-compose -f docker-compose.production.yml ps"
echo "   docker-compose -f docker-compose.production.yml logs -f --tail=50 api-gateway-${STANDBY_COLOR}"
echo "========================================="
