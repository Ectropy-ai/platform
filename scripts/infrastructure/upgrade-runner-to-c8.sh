#!/bin/bash
# Enterprise Runner Upgrade: s-8vcpu-16gb → c-8 (Dedicated CPU)
# Date: 2025-12-05
# Expected downtime: 5-10 minutes
# Expected improvement: 50-65% build time reduction

set -euo pipefail

RUNNER_DROPLET_ID="521673004"
RUNNER_DROPLET_NAME="ectropy-runner"
CURRENT_SIZE="s-8vcpu-16gb"
TARGET_SIZE="c-8"
SNAPSHOT_NAME="ectropy-runner-pre-c8-upgrade-$(date +%Y-%m-%d-%H%M)"

echo "═══════════════════════════════════════════════════════════"
echo "ENTERPRISE RUNNER UPGRADE: Shared CPU → Dedicated CPU"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Droplet ID: ${RUNNER_DROPLET_ID}"
echo "Current Size: ${CURRENT_SIZE} (8 shared vCPUs, 16GB RAM, \$96/mo)"
echo "Target Size: ${TARGET_SIZE} (8 dedicated vCPUs, 16GB RAM, \$168/mo)"
echo "Cost Increase: +\$72/month (+75%)"
echo "Performance Gain: 50-65% build time reduction"
echo ""

# Step 1: Verify current droplet status
echo "━━━ Step 1: Verifying Current Droplet Status ━━━"
doctl compute droplet get ${RUNNER_DROPLET_ID} --format ID,Name,Memory,VCPUs,Disk,Status,Size
echo ""

read -p "Continue with upgrade? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "❌ Upgrade cancelled by user"
    exit 0
fi

# Step 2: Create safety snapshot
echo ""
echo "━━━ Step 2: Creating Safety Snapshot ━━━"
echo "Snapshot: ${SNAPSHOT_NAME}"
echo "⏳ This may take 5-10 minutes..."
doctl compute droplet-action snapshot ${RUNNER_DROPLET_ID} \
    --snapshot-name "${SNAPSHOT_NAME}" \
    --wait

if [ $? -eq 0 ]; then
    echo "✅ Snapshot created successfully"
else
    echo "❌ Snapshot failed - aborting upgrade"
    exit 1
fi

# Step 3: Power off droplet
echo ""
echo "━━━ Step 3: Powering Off Droplet ━━━"
echo "⏳ Gracefully shutting down runner..."
doctl compute droplet-action power-off ${RUNNER_DROPLET_ID} --wait

if [ $? -eq 0 ]; then
    echo "✅ Droplet powered off"
else
    echo "❌ Power off failed - aborting upgrade"
    exit 1
fi

# Step 4: Resize to c-8 (dedicated CPU)
echo ""
echo "━━━ Step 4: Resizing to c-8 (Dedicated CPU) ━━━"
echo "⏳ Upgrading to dedicated CPU infrastructure..."
echo "Note: This resize includes disk expansion and may take 3-5 minutes"
doctl compute droplet-action resize ${RUNNER_DROPLET_ID} \
    --size ${TARGET_SIZE} \
    --wait

if [ $? -eq 0 ]; then
    echo "✅ Resize to c-8 completed successfully"
else
    echo "❌ Resize failed"
    echo "⚠️  Droplet is powered off but not resized"
    echo "Manual recovery: doctl compute droplet-action power-on ${RUNNER_DROPLET_ID}"
    exit 1
fi

# Step 5: Power on droplet
echo ""
echo "━━━ Step 5: Powering On Upgraded Droplet ━━━"
doctl compute droplet-action power-on ${RUNNER_DROPLET_ID} --wait

if [ $? -eq 0 ]; then
    echo "✅ Droplet powered on"
else
    echo "❌ Power on failed - manual intervention required"
    exit 1
fi

# Step 6: Wait for SSH availability
echo ""
echo "━━━ Step 6: Waiting for SSH Availability ━━━"
RUNNER_IP="165.232.132.224"
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if ssh -i ~/.ssh/ectropy_runner -o ConnectTimeout=5 -o StrictHostKeyChecking=no root@${RUNNER_IP} "echo 'SSH connected'" 2>/dev/null; then
        echo "✅ SSH connection established"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "⏳ Waiting for SSH (attempt ${RETRY_COUNT}/${MAX_RETRIES})..."
    sleep 10
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "❌ SSH connection timeout - manual verification required"
    exit 1
fi

# Step 7: Verify runner services
echo ""
echo "━━━ Step 7: Verifying GitHub Actions Runner Services ━━━"
ssh -i ~/.ssh/ectropy_runner root@${RUNNER_IP} "
    echo '📊 Checking runner services...'
    echo ''
    systemctl status actions.runner.*.service | grep -E 'Loaded|Active' | head -8
    echo ''
    echo '📊 System resources after upgrade:'
    echo ''
    nproc --all
    free -h | head -2
    df -h / | tail -1
"

# Step 8: Verify droplet size
echo ""
echo "━━━ Step 8: Verifying Upgrade Completion ━━━"
doctl compute droplet get ${RUNNER_DROPLET_ID} --format ID,Name,Memory,VCPUs,Disk,Status,Size
echo ""

# Step 9: Final verification
echo "━━━ Step 9: Final Verification Checklist ━━━"
echo ""
echo "Please verify:"
echo "  1. ✓ Size shows: c-8"
echo "  2. ✓ VCPUs shows: 8"
echo "  3. ✓ Memory shows: 16384 MB"
echo "  4. ✓ All 4 runner services are active"
echo ""

# Check GitHub Actions runners
echo "━━━ Step 10: Verifying GitHub Actions Runners ━━━"
gh api repos/luhtech/Ectropy/actions/runners --jq '.runners[] | {name: .name, status: .status, busy: .busy}' 2>/dev/null || echo "⚠️  Use GitHub web UI to verify runners"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "✅ UPGRADE COMPLETE"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Next Steps:"
echo "  1. Test production build with new infrastructure"
echo "  2. Monitor build times (expect 30-40 min vs previous 90+ min)"
echo "  3. Verify no CPU contention (load average should stay <6.0)"
echo "  4. If successful, proceed to Phase 3 (matrix workflow)"
echo ""
echo "Rollback Instructions (if needed):"
echo "  doctl compute droplet-action restore ${RUNNER_DROPLET_ID} \\"
echo "    --snapshot-name ${SNAPSHOT_NAME}"
echo ""
echo "Cost Impact:"
echo "  Monthly: +\$72 (\$96 → \$168)"
echo "  Annual: +\$864"
echo "  3-Year TCO: +\$2,592"
echo "  Expected ROI: 1,187% over 3 years"
echo ""
