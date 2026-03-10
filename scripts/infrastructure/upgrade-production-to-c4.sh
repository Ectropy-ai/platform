#!/bin/bash
# Enterprise Production Upgrade: s-4vcpu-8gb → c-4 (Dedicated CPU)
# Date: 2025-12-05
# Purpose: Production-ready infrastructure for demo and deployment
# Expected improvement: Consistent performance, zero CPU contention

set -euo pipefail

BLUE_DROPLET_ID="532797375"
GREEN_DROPLET_ID="532801089"
BLUE_DROPLET_NAME="ectropy-production (Blue - 143.198.66.231)"
GREEN_DROPLET_NAME="ectropy-production (Green - 144.126.213.68)"
CURRENT_SIZE="s-4vcpu-8gb"
TARGET_SIZE="c-4"
TIMESTAMP=$(date +%Y-%m-%d-%H%M)

echo "═══════════════════════════════════════════════════════════"
echo "ENTERPRISE PRODUCTION UPGRADE: Shared CPU → Dedicated CPU"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Blue Droplet ID: ${BLUE_DROPLET_ID}"
echo "Green Droplet ID: ${GREEN_DROPLET_ID}"
echo "Current Size: ${CURRENT_SIZE} (4 shared vCPUs, 8GB RAM, \$48/mo each)"
echo "Target Size: ${TARGET_SIZE} (4 dedicated vCPUs, 8GB RAM, \$84/mo each)"
echo "Cost Increase: +\$72/month total (+75%)"
echo "Performance Gain: Dedicated CPU cores, zero contention"
echo ""
echo "Note: Alpha infrastructure - no running services to preserve"
echo ""

# Verify current state
echo "━━━ Step 1: Verifying Current Infrastructure State ━━━"
echo "Blue Server:"
doctl compute droplet get ${BLUE_DROPLET_ID} --format ID,Name,Memory,VCPUs,Disk,Status
echo ""
echo "Green Server:"
doctl compute droplet get ${GREEN_DROPLET_ID} --format ID,Name,Memory,VCPUs,Disk,Status
echo ""

read -p "Continue with production upgrade? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "❌ Upgrade cancelled by user"
    exit 0
fi

# Function to upgrade a single droplet
upgrade_droplet() {
    local DROPLET_ID=$1
    local DROPLET_NAME=$2
    local SNAPSHOT_NAME="$3-pre-c4-upgrade-${TIMESTAMP}"

    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "UPGRADING: ${DROPLET_NAME}"
    echo "═══════════════════════════════════════════════════════════"
    echo ""

    # Step 1: Create safety snapshot
    echo "━━━ Creating Safety Snapshot ━━━"
    echo "Snapshot: ${SNAPSHOT_NAME}"
    echo "⏳ This will take 5-10 minutes..."
    doctl compute droplet-action snapshot ${DROPLET_ID} \
        --snapshot-name "${SNAPSHOT_NAME}" \
        --wait

    if [ $? -eq 0 ]; then
        echo "✅ Snapshot created successfully"
    else
        echo "❌ Snapshot failed - aborting upgrade for this droplet"
        return 1
    fi

    # Step 2: Power off droplet
    echo ""
    echo "━━━ Powering Off Droplet ━━━"
    echo "⏳ Gracefully shutting down..."
    doctl compute droplet-action power-off ${DROPLET_ID} --wait

    if [ $? -eq 0 ]; then
        echo "✅ Droplet powered off"
    else
        echo "❌ Power off failed - aborting upgrade"
        return 1
    fi

    # Step 3: Resize to c-4 (dedicated CPU)
    echo ""
    echo "━━━ Resizing to c-4 (Dedicated CPU) ━━━"
    echo "⏳ Upgrading to dedicated CPU infrastructure..."
    doctl compute droplet-action resize ${DROPLET_ID} \
        --size ${TARGET_SIZE} \
        --wait

    if [ $? -eq 0 ]; then
        echo "✅ Resize to c-4 completed successfully"
    else
        echo "❌ Resize failed"
        echo "⚠️  Droplet is powered off but not resized"
        echo "Manual recovery: doctl compute droplet-action power-on ${DROPLET_ID}"
        return 1
    fi

    # Step 4: Power on droplet
    echo ""
    echo "━━━ Powering On Upgraded Droplet ━━━"
    doctl compute droplet-action power-on ${DROPLET_ID} --wait

    if [ $? -eq 0 ]; then
        echo "✅ Droplet powered on"
    else
        echo "❌ Power on failed - manual intervention required"
        return 1
    fi

    echo ""
    echo "✅ ${DROPLET_NAME} upgrade complete"
    echo ""

    return 0
}

# Upgrade Blue server first
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "PHASE 1: UPGRADING BLUE SERVER"
echo "═══════════════════════════════════════════════════════════"
upgrade_droplet ${BLUE_DROPLET_ID} "${BLUE_DROPLET_NAME}" "ectropy-production-blue"

if [ $? -ne 0 ]; then
    echo "❌ Blue server upgrade failed - stopping here"
    exit 1
fi

# Wait between upgrades
echo ""
echo "⏳ Waiting 30 seconds before upgrading Green server..."
sleep 30

# Upgrade Green server
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "PHASE 2: UPGRADING GREEN SERVER"
echo "═══════════════════════════════════════════════════════════"
upgrade_droplet ${GREEN_DROPLET_ID} "${GREEN_DROPLET_NAME}" "ectropy-production-green"

if [ $? -ne 0 ]; then
    echo "❌ Green server upgrade failed"
    echo "⚠️  Blue server was upgraded successfully"
    exit 1
fi

# Verification
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "UPGRADE VERIFICATION"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Blue Server (Post-Upgrade):"
doctl compute droplet get ${BLUE_DROPLET_ID} --format ID,Name,Memory,VCPUs,Disk,Status
echo ""
echo "Green Server (Post-Upgrade):"
doctl compute droplet get ${GREEN_DROPLET_ID} --format ID,Name,Memory,VCPUs,Disk,Status
echo ""

# Check snapshots
echo "━━━ Created Snapshots ━━━"
doctl compute snapshot list --resource droplet --format ID,Name,Size | grep "pre-c4-upgrade-${TIMESTAMP}"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "✅ PRODUCTION UPGRADE COMPLETE"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Summary:"
echo "  ✓ Blue server upgraded to c-4 (dedicated CPU)"
echo "  ✓ Green server upgraded to c-4 (dedicated CPU)"
echo "  ✓ Safety snapshots created for both servers"
echo "  ✓ Both servers powered on and ready"
echo ""
echo "Infrastructure Status:"
echo "  - CPU: 4 dedicated vCPUs each (no contention)"
echo "  - Memory: 8GB each"
echo "  - Cost: \$84/month each (\$168/month total)"
echo "  - Performance: Production-ready with consistent response times"
echo ""
echo "Next Steps:"
echo "  1. Configure monitoring alerts for both servers"
echo "  2. Set up automated snapshot schedule"
echo "  3. Implement automated service recovery (Docker restart policies)"
echo "  4. Prepare for first production deployment"
echo ""
echo "Rollback Instructions (if needed):"
echo "  doctl compute droplet-action restore ${BLUE_DROPLET_ID} \\\\"
echo "    --snapshot-name ectropy-production-blue-pre-c4-upgrade-${TIMESTAMP}"
echo "  doctl compute droplet-action restore ${GREEN_DROPLET_ID} \\\\"
echo "    --snapshot-name ectropy-production-green-pre-c4-upgrade-${TIMESTAMP}"
echo ""
