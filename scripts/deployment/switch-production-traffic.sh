#!/bin/bash
# ============================================================================
# Ectropy Production Traffic Switching Script
# Switch DigitalOcean Load Balancer traffic between Blue and Green servers
# Architecture: Load-balancer-first blue-green deployment
# Created: 2025-12-05
# ============================================================================

set -euo pipefail

# ==========================================================================
# Configuration
# ==========================================================================

# ENTERPRISE FIX (2025-12-10): Production infrastructure via environment variables
# Use GitHub Variables (injected by workflow) with fallback to current values
LB_ID="${PROD_LB_ID:-f773103b-d40c-43c9-ad8a-fc2cd63f82f1}"
BLUE_SERVER_IP="${PROD_BLUE_IP:-161.35.226.36}"
BLUE_SERVER_ID="${PROD_BLUE_DROPLET_ID:-534912631}"
GREEN_SERVER_IP="${PROD_GREEN_IP:-143.198.231.147}"
GREEN_SERVER_ID="${PROD_GREEN_DROPLET_ID:-534912633}"

# ==========================================================================
# Usage
# ==========================================================================

usage() {
    cat << EOF
Usage: $0 <color>

Switch production load balancer traffic to specified color.

Arguments:
    color           Target color: blue or green

Process:
    1. Verify target server health
    2. Add target server to load balancer
    3. Wait for load balancer health checks to pass
    4. Remove other server from load balancer
    5. Verify traffic routing

Examples:
    $0 green        # Switch traffic to Green server
    $0 blue         # Switch traffic to Blue server

Safety:
    - Both servers will briefly be in load balancer (no downtime)
    - Health checks must pass before old server is removed
    - Automatic rollback if target server fails health checks

EOF
    exit 1
}

# Parse arguments
TARGET_COLOR="${1:-}"

if [ -z "$TARGET_COLOR" ]; then
    echo "❌ Error: Target color not specified"
    usage
fi

if [ "$TARGET_COLOR" != "blue" ] && [ "$TARGET_COLOR" != "green" ]; then
    echo "❌ Error: Invalid color '$TARGET_COLOR'. Must be 'blue' or 'green'"
    usage
fi

# Determine target and source servers
if [ "$TARGET_COLOR" == "blue" ]; then
    TARGET_SERVER_IP="$BLUE_SERVER_IP"
    TARGET_SERVER_ID="$BLUE_SERVER_ID"
    SOURCE_COLOR="green"
    SOURCE_SERVER_IP="$GREEN_SERVER_IP"
    SOURCE_SERVER_ID="$GREEN_SERVER_ID"
else
    TARGET_SERVER_IP="$GREEN_SERVER_IP"
    TARGET_SERVER_ID="$GREEN_SERVER_ID"
    SOURCE_COLOR="blue"
    SOURCE_SERVER_IP="$BLUE_SERVER_IP"
    SOURCE_SERVER_ID="$BLUE_SERVER_ID"
fi

# ==========================================================================
# Helper Functions
# ==========================================================================

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

log_section() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "$1"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
}

# ==========================================================================
# Traffic Switch Process
# ==========================================================================

log_section "PRODUCTION TRAFFIC SWITCH INITIATED"
log "Current Active: ${SOURCE_COLOR^^}"
log "Switching To: ${TARGET_COLOR^^}"
log "Load Balancer: $LB_ID"
echo ""

# ==========================================================================
# Step 1: Verify Target Server Health
# ==========================================================================

log_section "Step 1: Verifying Target Server Health"

log "Testing health endpoint on ${TARGET_COLOR^^} server..."
HEALTH_CHECK_URL="http://${TARGET_SERVER_IP}:3000/health"

if curl -f -s -o /dev/null "$HEALTH_CHECK_URL"; then
    log "✅ ${TARGET_COLOR^^} server health check passed"
else
    log "❌ ${TARGET_COLOR^^} server health check failed"
    log "   URL: $HEALTH_CHECK_URL"
    log ""
    log "Aborting traffic switch. Target server is not healthy."
    exit 1
fi

# ==========================================================================
# Step 2: Check Current Load Balancer State
# ==========================================================================

log_section "Step 2: Checking Current Load Balancer State"

log "Fetching current load balancer configuration..."
CURRENT_DROPLETS=$(doctl compute load-balancer get "$LB_ID" --format DropletIDs --no-header)
log "Current droplets in load balancer: $CURRENT_DROPLETS"

# Check if target is already in load balancer
if echo "$CURRENT_DROPLETS" | grep -q "$TARGET_SERVER_ID"; then
    log "⚠️  ${TARGET_COLOR^^} server is already in load balancer"
    TARGET_ALREADY_ADDED=true
else
    TARGET_ALREADY_ADDED=false
fi

# Check if source is in load balancer
if echo "$CURRENT_DROPLETS" | grep -q "$SOURCE_SERVER_ID"; then
    SOURCE_IN_LB=true
    log "📊 ${SOURCE_COLOR^^} server currently serving traffic"
else
    SOURCE_IN_LB=false
    log "📊 ${SOURCE_COLOR^^} server not in load balancer"
fi

# ==========================================================================
# Step 3: Add Target Server to Load Balancer
# ==========================================================================

if [ "$TARGET_ALREADY_ADDED" = false ]; then
    log_section "Step 3: Adding ${TARGET_COLOR^^} Server to Load Balancer"

    log "Adding droplet $TARGET_SERVER_ID to load balancer..."
    doctl compute load-balancer add-droplets "$LB_ID" --droplet-ids "$TARGET_SERVER_ID"
    log "✅ ${TARGET_COLOR^^} server added to load balancer"
else
    log_section "Step 3: Target Server Already in Load Balancer"
    log "✅ Skipping add operation"
fi

# ==========================================================================
# Step 4: Wait for Target Server Health Checks
# ==========================================================================

log_section "Step 4: Waiting for Load Balancer Health Checks"

log "Waiting for ${TARGET_COLOR^^} server to pass LB health checks..."
log "Health check configuration:"
log "  - Protocol: HTTP"
log "  - Port: 3000"
log "  - Path: /health"
log "  - Interval: 10 seconds"
log "  - Healthy threshold: 2 successes"
echo ""

# Wait at least 30 seconds for health checks to stabilize
log "Waiting 30 seconds for health checks to stabilize..."
sleep 30

# Verify target is passing health checks by testing endpoint multiple times
log "Verifying target server stability..."
STABLE_CHECKS=0
REQUIRED_STABLE_CHECKS=5

for i in $(seq 1 $REQUIRED_STABLE_CHECKS); do
    if curl -f -s -o /dev/null "$HEALTH_CHECK_URL"; then
        STABLE_CHECKS=$((STABLE_CHECKS + 1))
        log "✅ Health check $i/$REQUIRED_STABLE_CHECKS passed"
    else
        log "❌ Health check $i/$REQUIRED_STABLE_CHECKS failed"
        log ""
        log "Target server became unhealthy during stabilization period."
        log "Rolling back load balancer configuration..."

        # Rollback: remove target from LB
        if [ "$TARGET_ALREADY_ADDED" = false ]; then
            doctl compute load-balancer remove-droplets "$LB_ID" --droplet-ids "$TARGET_SERVER_ID"
            log "✅ ${TARGET_COLOR^^} server removed from load balancer"
        fi

        log "❌ Traffic switch aborted"
        exit 1
    fi
    sleep 2
done

log "✅ ${TARGET_COLOR^^} server is stable and healthy"

# ==========================================================================
# Step 5: Remove Source Server from Load Balancer
# ==========================================================================

if [ "$SOURCE_IN_LB" = true ]; then
    log_section "Step 5: Removing ${SOURCE_COLOR^^} Server from Load Balancer"

    log "Removing droplet $SOURCE_SERVER_ID from load balancer..."
    doctl compute load-balancer remove-droplets "$LB_ID" --droplet-ids "$SOURCE_SERVER_ID"
    log "✅ ${SOURCE_COLOR^^} server removed from load balancer"
else
    log_section "Step 5: Source Server Not in Load Balancer"
    log "✅ Skipping remove operation"
fi

# ==========================================================================
# Step 6: Verify Final Load Balancer State
# ==========================================================================

log_section "Step 6: Verifying Final Configuration"

log "Fetching final load balancer configuration..."
FINAL_DROPLETS=$(doctl compute load-balancer get "$LB_ID" --format DropletIDs --no-header)
log "Final droplets in load balancer: $FINAL_DROPLETS"

# Verify only target is in load balancer
if [ "$FINAL_DROPLETS" = "$TARGET_SERVER_ID" ]; then
    log "✅ Load balancer configuration verified"
    log "   Only ${TARGET_COLOR^^} server is serving traffic"
elif echo "$FINAL_DROPLETS" | grep -q "$TARGET_SERVER_ID"; then
    log "⚠️  ${TARGET_COLOR^^} server is in load balancer (expected)"
    if echo "$FINAL_DROPLETS" | grep -q "$SOURCE_SERVER_ID"; then
        log "⚠️  ${SOURCE_COLOR^^} server is also in load balancer (unexpected)"
        log "   Both servers are serving traffic - this may be intentional"
    fi
else
    log "❌ Unexpected load balancer state"
    log "   ${TARGET_COLOR^^} server not found in load balancer"
    exit 1
fi

# ==========================================================================
# Step 7: Traffic Switch Summary
# ==========================================================================

log_section "TRAFFIC SWITCH COMPLETE"

echo ""
log "✅ Production traffic successfully switched to ${TARGET_COLOR^^}"
echo ""
log "Current Configuration:"
log "  Active Server: ${TARGET_COLOR^^} (${TARGET_SERVER_IP})"
log "  Standby Server: ${SOURCE_COLOR^^} (${SOURCE_SERVER_IP})"
log "  Load Balancer: $LB_ID"
echo ""
log "Monitoring:"
log "  - Monitor application logs for errors"
log "  - Check Nginx access logs for traffic patterns"
log "  - Verify database connection pool usage"
log "  - Monitor CPU/memory on ${TARGET_COLOR^^} server"
echo ""
log "Rollback (if needed):"
log "  bash scripts/deployment/rollback-production.sh"
log "  This will switch traffic back to ${SOURCE_COLOR^^}"
echo ""

log "═══════════════════════════════════════════════════════════"
log "✅ TRAFFIC NOW SERVING FROM ${TARGET_COLOR^^} SERVER"
log "═══════════════════════════════════════════════════════════"
