#!/bin/bash
# Enterprise Production Monitoring Configuration
# Date: 2025-12-05
# Purpose: Configure comprehensive monitoring alerts for production infrastructure

set -euo pipefail

BLUE_DROPLET_ID="532797375"
GREEN_DROPLET_ID="532801089"
PROD_LOAD_BALANCER_ID="e37f30b0-f14a-4abe-b7a7-88d8b6b6ec40"
ALERT_EMAIL="${ALERT_EMAIL:-luhtech@example.com}"

echo "═══════════════════════════════════════════════════════════"
echo "ENTERPRISE PRODUCTION MONITORING CONFIGURATION"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Infrastructure:"
echo "  - Blue Server: ${BLUE_DROPLET_ID}"
echo "  - Green Server: ${GREEN_DROPLET_ID}"
echo "  - Load Balancer: ${PROD_LOAD_BALANCER_ID}"
echo ""
echo "Alert Destination: ${ALERT_EMAIL}"
echo ""

# Function to create monitoring alert
create_alert() {
    local ALERT_TYPE=$1
    local RESOURCE_TYPE=$2
    local RESOURCE_ID=$3
    local THRESHOLD=$4
    local WINDOW=$5
    local ALERT_NAME=$6
    local COMPARISON=$7

    echo "━━━ Creating Alert: ${ALERT_NAME} ━━━"
    echo "Type: ${ALERT_TYPE}"
    echo "Threshold: ${COMPARISON} ${THRESHOLD}%"
    echo "Window: ${WINDOW} minutes"
    echo ""

    # DigitalOcean monitoring alerts via API
    # Note: This requires jq for JSON processing
    ALERT_JSON=$(cat <<EOF
{
  "type": "${ALERT_TYPE}",
  "description": "${ALERT_NAME}",
  "compare": "${COMPARISON}",
  "value": ${THRESHOLD},
  "window": "${WINDOW}m",
  "entities": ["${RESOURCE_ID}"],
  "tags": ["production", "ectropy"],
  "alerts": {
    "email": ["${ALERT_EMAIL}"]
  }
}
EOF
)

    echo "${ALERT_JSON}" | doctl monitoring alert create \
        --type "${ALERT_TYPE}" \
        --description "${ALERT_NAME}" \
        --compare "${COMPARISON}" \
        --value "${THRESHOLD}" \
        --window "${WINDOW}m" \
        --entities "${RESOURCE_ID}" \
        --emails "${ALERT_EMAIL}"

    if [ $? -eq 0 ]; then
        echo "✅ Alert created successfully"
    else
        echo "⚠️  Alert creation may have failed (check doctl monitoring alert list)"
    fi
    echo ""
}

# Verify monitoring is enabled
echo "━━━ Step 1: Verifying Monitoring Status ━━━"
echo ""
echo "Blue Server Monitoring:"
doctl monitoring uptime check list --format ID,Name,Type,Target,Enabled 2>/dev/null | grep -i blue || echo "No uptime checks configured yet"
echo ""
echo "Green Server Monitoring:"
doctl monitoring uptime check list --format ID,Name,Type,Target,Enabled 2>/dev/null | grep -i green || echo "No uptime checks configured yet"
echo ""

read -p "Continue with alert configuration? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "❌ Configuration cancelled by user"
    exit 0
fi

echo ""
echo "━━━ Step 2: Creating Blue Server Monitoring Alerts ━━━"
echo ""

# Blue Server - CPU Alert (>80% for 5 minutes)
create_alert \
    "v1/insights/droplet/cpu" \
    "droplet" \
    "${BLUE_DROPLET_ID}" \
    "80" \
    "5" \
    "Production Blue - High CPU Usage (>80%)" \
    "GreaterThan"

# Blue Server - Memory Alert (>85% for 5 minutes)
create_alert \
    "v1/insights/droplet/memory_utilization_percent" \
    "droplet" \
    "${BLUE_DROPLET_ID}" \
    "85" \
    "5" \
    "Production Blue - High Memory Usage (>85%)" \
    "GreaterThan"

# Blue Server - Disk Alert (>80% for 10 minutes)
create_alert \
    "v1/insights/droplet/disk_utilization_percent" \
    "droplet" \
    "${BLUE_DROPLET_ID}" \
    "80" \
    "10" \
    "Production Blue - High Disk Usage (>80%)" \
    "GreaterThan"

# Blue Server - Load Average Alert (>6.0 for 5 minutes - c-4 has 4 cores)
create_alert \
    "v1/insights/droplet/load_5" \
    "droplet" \
    "${BLUE_DROPLET_ID}" \
    "6" \
    "5" \
    "Production Blue - High Load Average (>6.0)" \
    "GreaterThan"

echo ""
echo "━━━ Step 3: Creating Green Server Monitoring Alerts ━━━"
echo ""

# Green Server - CPU Alert (>80% for 5 minutes)
create_alert \
    "v1/insights/droplet/cpu" \
    "droplet" \
    "${GREEN_DROPLET_ID}" \
    "80" \
    "5" \
    "Production Green - High CPU Usage (>80%)" \
    "GreaterThan"

# Green Server - Memory Alert (>85% for 5 minutes)
create_alert \
    "v1/insights/droplet/memory_utilization_percent" \
    "droplet" \
    "${GREEN_DROPLET_ID}" \
    "85" \
    "5" \
    "Production Green - High Memory Usage (>85%)" \
    "GreaterThan"

# Green Server - Disk Alert (>80% for 10 minutes)
create_alert \
    "v1/insights/droplet/disk_utilization_percent" \
    "droplet" \
    "${GREEN_DROPLET_ID}" \
    "80" \
    "10" \
    "Production Green - High Disk Usage (>80%)" \
    "GreaterThan"

# Green Server - Load Average Alert (>6.0 for 5 minutes)
create_alert \
    "v1/insights/droplet/load_5" \
    "droplet" \
    "${GREEN_DROPLET_ID}" \
    "6" \
    "5" \
    "Production Green - High Load Average (>6.0)" \
    "GreaterThan"

echo ""
echo "━━━ Step 4: Creating Load Balancer Health Alerts ━━━"
echo ""

# Load Balancer - Unhealthy Backend Alert
echo "Creating Load Balancer health check alert..."
echo "Note: Load balancer alerts configured via DigitalOcean dashboard"
echo "  - Navigate to: Networking > Load Balancers > ${PROD_LOAD_BALANCER_ID}"
echo "  - Configure: Alert when any backend becomes unhealthy"
echo "  - Email: ${ALERT_EMAIL}"
echo ""

echo ""
echo "━━━ Step 5: Creating Uptime Checks ━━━"
echo ""

# Create uptime checks for both production IPs
echo "Creating uptime check for Blue server (143.198.66.231)..."
doctl monitoring uptime create \
    --name "Production Blue - HTTP Health Check" \
    --type "https" \
    --target "https://143.198.66.231/health" \
    --regions "us_east" \
    --emails "${ALERT_EMAIL}" || echo "⚠️  Uptime check creation may require dashboard access"

echo ""
echo "Creating uptime check for Green server (144.126.213.68)..."
doctl monitoring uptime create \
    --name "Production Green - HTTP Health Check" \
    --type "https" \
    --target "https://144.126.213.68/health" \
    --regions "us_east" \
    --emails "${ALERT_EMAIL}" || echo "⚠️  Uptime check creation may require dashboard access"

echo ""
echo "Creating uptime check for Production Load Balancer..."
doctl monitoring uptime create \
    --name "Production Load Balancer - HTTPS Health" \
    --type "https" \
    --target "https://production.ectropy.ai/health" \
    --regions "us_east,us_west,eu" \
    --emails "${ALERT_EMAIL}" || echo "⚠️  Uptime check creation may require dashboard access"

echo ""
echo "━━━ Step 6: Verification ━━━"
echo ""

echo "Configured Monitoring Alerts:"
doctl monitoring alert list --format ID,UUID,Type,Description,Enabled 2>/dev/null || echo "Use 'doctl monitoring alert list' to view alerts"

echo ""
echo "Uptime Checks:"
doctl monitoring uptime check list --format ID,Name,Type,Target,Enabled 2>/dev/null || echo "Use 'doctl monitoring uptime check list' to view uptime checks"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ PRODUCTION MONITORING CONFIGURATION COMPLETE"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Configured Alerts:"
echo "  ✓ CPU usage >80% (both servers)"
echo "  ✓ Memory usage >85% (both servers)"
echo "  ✓ Disk usage >80% (both servers)"
echo "  ✓ Load average >6.0 (both servers)"
echo "  ✓ Uptime checks (HTTPS health endpoints)"
echo ""
echo "Alert Destination: ${ALERT_EMAIL}"
echo ""
echo "Next Steps:"
echo "  1. Verify alerts are receiving data (wait 5-10 minutes)"
echo "  2. Test alert triggers with simulated load"
echo "  3. Configure PagerDuty/Slack integration (optional)"
echo "  4. Document alert response procedures"
echo ""
echo "Manual Configuration Required:"
echo "  - Load Balancer health alerts (via DigitalOcean dashboard)"
echo "  - SMS alert notifications (if desired)"
echo "  - Integration with external monitoring (DataDog, New Relic, etc.)"
echo ""
echo "View Monitoring Dashboard:"
echo "  https://cloud.digitalocean.com/monitoring"
echo ""
