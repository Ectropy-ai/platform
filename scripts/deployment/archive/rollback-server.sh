#!/bin/bash
################################################################################
# ENTERPRISE ROLLBACK SCRIPT
# Rollback failed deployment on blue or green server
#
# Usage: ./rollback-server.sh <blue|green> [--strategy <traffic|code|database>]
# Example: ./rollback-server.sh blue
#          ./rollback-server.sh green --strategy traffic
#
# Exit codes:
#   0 - Rollback successful
#   1 - Rollback failed
#
# Rollback Strategies:
#   traffic  - Remove failing server from load balancer (fastest, 0 downtime)
#   code     - Redeploy previous Docker image version (2-5 min, 30-60s downtime)
#   database - Restore database backup (DANGEROUS, 15-30 min downtime, requires approval)
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
# Use GitHub Variables (injected by workflow) with fallback to current values
BLUE_IP="${PROD_BLUE_IP:-161.35.226.36}"
BLUE_DROPLET_ID="${PROD_BLUE_DROPLET_ID:-534912631}"
GREEN_IP="${PROD_GREEN_IP:-143.198.231.147}"
GREEN_DROPLET_ID="${PROD_GREEN_DROPLET_ID:-534912633}"
LOAD_BALANCER_ID="${PROD_LB_ID:-f773103b-d40c-43c9-ad8a-fc2cd63f82f1}"

# Parse arguments
if [ $# -lt 1 ]; then
    log_error "Usage: $0 <blue|green> [--strategy <traffic|code|database>]"
    exit 1
fi

SERVER=$1
STRATEGY="${3:-traffic}"  # Default to traffic rollback

# Determine server details
case $SERVER in
    blue)
        SERVER_IP=$BLUE_IP
        DROPLET_ID=$BLUE_DROPLET_ID
        SERVER_NAME="ectropy-production-blue"
        ;;
    green)
        SERVER_IP=$GREEN_IP
        DROPLET_ID=$GREEN_DROPLET_ID
        SERVER_NAME="ectropy-production-green"
        ;;
    *)
        log_error "Invalid server: $SERVER. Must be 'blue' or 'green'"
        exit 1
        ;;
esac

log_error "=================================================="
log_error "🚨 INITIATING ROLLBACK PROCEDURE"
log_error "Server: $SERVER ($SERVER_IP)"
log_error "Strategy: $STRATEGY"
log_error "=================================================="

################################################################################
# STRATEGY 1: Traffic Rollback (0 downtime)
################################################################################

rollback_traffic() {
    log_step "Executing traffic rollback..."

    # Step 1: Remove failing server from load balancer
    log_info "Removing $SERVER from load balancer..."

    # ENTERPRISE FIX (2026-01-22): ROOT CAUSE #105 - Tag-Based Load Balancer Compatibility
    # Issue: Production LB uses tag-based targeting (tag: blue-green) not droplet IDs
    # API Error: "only one target identifier (e.g. tag, droplets) can be specified" (HTTP 422)
    # Solution: Skip droplet removal - tag-based LB manages droplets automatically via health checks
    # Health checks detect unhealthy droplets and stop routing traffic (0 downtime)
    # Related: ROOT CAUSE #80 (VPC Migration), ROOT CAUSE #99 (Tag-Based LB)
    LB_CONFIG=$(doctl compute load-balancer get "$LOAD_BALANCER_ID" --format Tag,DropletIDs --no-header 2>/dev/null || echo "")

    if echo "$LB_CONFIG" | grep -q "blue-green"; then
        log_warn "⚠️  Tag-based load balancer detected (tag: blue-green)"
        log_info "ℹ️  Load balancer will automatically stop routing to unhealthy droplet via health checks"
        log_info "ℹ️  Skipping manual droplet removal (API does not support droplet operations on tag-based LBs)"
        log_info "✅ Traffic rollback initiated (health checks will handle traffic routing)"
    else
        if doctl compute load-balancer remove-droplets "$LOAD_BALANCER_ID" --droplet-ids "$DROPLET_ID"; then
            log_info "✅ Server removed from load balancer"
        else
            log_error "❌ Failed to remove server from load balancer"
            return 1
        fi
    fi

    # Step 2: Verify traffic is no longer routed to this server
    log_info "Verifying traffic routing..."
    sleep 10

    # Check that the other server is handling traffic
    # ENTERPRISE FIX (2025-12-10): Use doctl to get LB IP or use domain
    LOAD_BALANCER_IP=$(doctl compute load-balancer get $LOAD_BALANCER_ID --format IP --no-header 2>/dev/null || echo "ectropy.ai")
    if curl -f -s "http://$LOAD_BALANCER_IP/health" > /dev/null || curl -f -s "https://ectropy.ai/health" > /dev/null; then
        log_info "✅ Load balancer is healthy (traffic on other server)"
    else
        log_error "❌ Load balancer health check failed"
        return 1
    fi

    log_info "✅ Traffic rollback complete"
    log_info "Next steps:"
    log_info "  1. Investigate failure on $SERVER"
    log_info "  2. Fix issues and redeploy"
    log_info "  3. Re-add to load balancer when healthy"
}

################################################################################
# STRATEGY 2: Code Rollback (30-60s downtime)
################################################################################

rollback_code() {
    log_step "Executing code rollback..."

    # Step 1: Identify previous version
    log_info "Identifying previous deployment version..."

    PREVIOUS_TAG=$(git tag --sort=-creatordate | head -2 | tail -1)

    if [ -z "$PREVIOUS_TAG" ]; then
        log_error "❌ No previous deployment tag found"
        return 1
    fi

    log_info "Previous version: $PREVIOUS_TAG"

    # Step 2: Remove from load balancer
    log_info "Removing $SERVER from load balancer..."

    # ENTERPRISE FIX (2026-01-22): ROOT CAUSE #105 - Tag-Based Load Balancer Compatibility
    LB_CONFIG=$(doctl compute load-balancer get "$LOAD_BALANCER_ID" --format Tag,DropletIDs --no-header 2>/dev/null || echo "")

    if echo "$LB_CONFIG" | grep -q "blue-green"; then
        log_warn "⚠️  Tag-based load balancer detected - skipping droplet removal"
        log_info "ℹ️  Health checks will automatically stop routing traffic during redeployment"
    else
        doctl compute load-balancer remove-droplets "$LOAD_BALANCER_ID" --droplet-ids "$DROPLET_ID"
    fi

    # Step 3: Deploy previous version
    log_info "Deploying previous version: $PREVIOUS_TAG"

    if ./scripts/deployment/deploy-to-server.sh "$SERVER" --version "$PREVIOUS_TAG"; then
        log_info "✅ Previous version deployed"
    else
        log_error "❌ Failed to deploy previous version"
        return 1
    fi

    # Step 4: Validate health
    log_info "Validating health of rolled-back deployment..."

    if ./scripts/deployment/validate-health.sh "$SERVER"; then
        log_info "✅ Health checks passed"
    else
        log_error "❌ Health checks failed on previous version"
        return 1
    fi

    # Step 5: Re-add to load balancer
    log_info "Adding $SERVER back to load balancer..."

    # ENTERPRISE FIX (2026-01-22): ROOT CAUSE #105 - Tag-Based Load Balancer Compatibility
    LB_CONFIG=$(doctl compute load-balancer get "$LOAD_BALANCER_ID" --format Tag,DropletIDs --no-header 2>/dev/null || echo "")

    if echo "$LB_CONFIG" | grep -q "blue-green"; then
        log_info "ℹ️  Tag-based load balancer will automatically discover healthy droplet via health checks"
        log_info "ℹ️  No manual droplet addition required"
    else
        doctl compute load-balancer add-droplets "$LOAD_BALANCER_ID" --droplet-ids "$DROPLET_ID"
    fi

    log_info "✅ Code rollback complete"
}

################################################################################
# STRATEGY 3: Database Rollback (15-30 min downtime, DANGEROUS)
################################################################################

rollback_database() {
    log_error "⚠️  DATABASE ROLLBACK REQUESTED - THIS IS DANGEROUS"
    log_error "⚠️  This will cause 15-30 minutes of downtime"
    log_error "⚠️  All data since last backup will be LOST"

    # Require explicit confirmation
    read -p "Type 'ROLLBACK DATABASE' to confirm: " CONFIRMATION

    if [ "$CONFIRMATION" != "ROLLBACK DATABASE" ]; then
        log_error "Database rollback cancelled"
        return 1
    fi

    log_step "Executing database rollback..."

    # Step 1: Identify backup to restore
    log_info "Identifying most recent backup..."

    # ENTERPRISE PATTERN (2025-12-15): Use DATABASE_CLUSTER_ID from environment (GitHub Variable)
    # Fallback to production database for local development/testing
    # Benefits: Disaster recovery flexibility, consistent with workflow pattern
    # Variable: DATABASE_CLUSTER_ID = ce5b4aa1-c4ae-4d00-ba7d-2d7c71e6312c (ectropy-production-db, VPC-isolated)
    # Updated: 2026-01-21 (VPC Migration - ROOT CAUSE #80)
    DATABASE_CLUSTER_ID="${DATABASE_CLUSTER_ID:-ce5b4aa1-c4ae-4d00-ba7d-2d7c71e6312c}"
    BACKUP_ID=$(doctl databases backups "$DATABASE_CLUSTER_ID" --format ID --no-header | head -1)

    if [ -z "$BACKUP_ID" ]; then
        log_error "❌ No backup found"
        return 1
    fi

    log_info "Backup ID: $BACKUP_ID"

    # Step 2: Stop all application servers
    log_error "🛑 Stopping all application servers..."

    # ENTERPRISE FIX (2026-01-22): ROOT CAUSE #105 - Tag-Based Load Balancer Compatibility
    LB_CONFIG=$(doctl compute load-balancer get "$LOAD_BALANCER_ID" --format Tag,DropletIDs --no-header 2>/dev/null || echo "")

    if echo "$LB_CONFIG" | grep -q "blue-green"; then
        log_warn "⚠️  Tag-based load balancer detected - skipping droplet removal"
        log_info "ℹ️  Stopping containers will cause health checks to fail, removing droplets from rotation"
    else
        doctl compute load-balancer remove-droplets "$LOAD_BALANCER_ID" --droplet-ids "$BLUE_DROPLET_ID,$GREEN_DROPLET_ID"
    fi

    ssh root@$BLUE_IP "cd /opt/ectropy && docker-compose down"
    ssh root@$GREEN_IP "cd /opt/ectropy && docker-compose down"

    # Step 3: Restore database
    log_error "🔄 Restoring database backup (this may take 30+ minutes)..."

    doctl databases backups restore "$DATABASE_CLUSTER_ID" "$BACKUP_ID"

    # Step 4: Wait for restore to complete
    log_info "Waiting for database restore to complete..."

    # Poll database status until online
    while true; do
        STATUS=$(doctl databases get "$DATABASE_CLUSTER_ID" --format Status --no-header)
        if [ "$STATUS" = "online" ]; then
            log_info "✅ Database restored and online"
            break
        fi
        log_info "Database status: $STATUS (waiting...)"
        sleep 30
    done

    # Step 5: Restart applications with previous version
    PREVIOUS_TAG=$(git tag --sort=-creatordate | head -2 | tail -1)

    log_info "Restarting applications with version: $PREVIOUS_TAG"

    ./scripts/deployment/deploy-to-server.sh blue --version "$PREVIOUS_TAG"
    ./scripts/deployment/deploy-to-server.sh green --version "$PREVIOUS_TAG"

    # Step 6: Add back to load balancer
    log_info "Adding servers back to load balancer..."

    # ENTERPRISE FIX (2026-01-22): ROOT CAUSE #105 - Tag-Based Load Balancer Compatibility
    LB_CONFIG=$(doctl compute load-balancer get "$LOAD_BALANCER_ID" --format Tag,DropletIDs --no-header 2>/dev/null || echo "")

    if echo "$LB_CONFIG" | grep -q "blue-green"; then
        log_info "ℹ️  Tag-based load balancer will automatically discover healthy droplets via health checks"
        log_info "ℹ️  No manual droplet addition required"
    else
        doctl compute load-balancer add-droplets "$LOAD_BALANCER_ID" --droplet-ids "$BLUE_DROPLET_ID,$GREEN_DROPLET_ID"
    fi

    log_info "✅ Database rollback complete"
}

################################################################################
# Main execution
################################################################################

# Document rollback in logs
ROLLBACK_LOG="/tmp/rollback-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$ROLLBACK_LOG") 2>&1

log_info "Rollback log: $ROLLBACK_LOG"

# Execute selected strategy
case $STRATEGY in
    traffic)
        rollback_traffic
        ;;
    code)
        rollback_code
        ;;
    database)
        rollback_database
        ;;
    *)
        log_error "Invalid strategy: $STRATEGY. Must be 'traffic', 'code', or 'database'"
        exit 1
        ;;
esac

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    log_info "=================================================="
    log_info "✅ ROLLBACK SUCCESSFUL"
    log_info "Strategy: $STRATEGY"
    log_info "Server: $SERVER"
    log_info "Log: $ROLLBACK_LOG"
    log_info "=================================================="
else
    log_error "=================================================="
    log_error "❌ ROLLBACK FAILED"
    log_error "Strategy: $STRATEGY"
    log_error "Server: $SERVER"
    log_error "Log: $ROLLBACK_LOG"
    log_error "=================================================="
fi

exit $EXIT_CODE
