#!/bin/bash
# Enterprise Terraform Drift Detection Script
# Purpose: Compare Terraform state with actual DigitalOcean deployment
# Date: 2025-12-23
# No shortcuts to enterprise excellence!

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TERRAFORM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVIDENCE_DIR="../../apps/mcp-server/data/terraform-drift-evidence"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
DRIFT_REPORT="${EVIDENCE_DIR}/drift-report-${TIMESTAMP}.json"

echo -e "${BLUE}🔍 Enterprise Terraform Drift Detection${NC}"
echo -e "${BLUE}======================================${NC}\n"

# Check prerequisites
if ! command -v terraform &> /dev/null; then
    echo -e "${RED}❌ Terraform not installed${NC}"
    exit 1
fi

if ! command -v doctl &> /dev/null; then
    echo -e "${RED}❌ doctl CLI not installed${NC}"
    exit 1
fi

# Check if doctl is authenticated (either via token or native auth)
if ! doctl auth list &> /dev/null; then
    echo -e "${RED}❌ doctl not authenticated. Run: doctl auth init${NC}"
    exit 1
fi

# Create evidence directory
mkdir -p "${EVIDENCE_DIR}"

echo -e "${BLUE}📋 Step 1: Fetching actual deployment configuration...${NC}"

# Fetch production load balancer configuration
echo -e "  ${YELLOW}→ Production Load Balancer (f773103b-d40c-43c9-ad8a-fc2cd63f82f1)${NC}"
LB_CONFIG=$(doctl compute load-balancer get f773103b-d40c-43c9-ad8a-fc2cd63f82f1 --output json)

# Extract key configuration values
LB_HEALTH_PORT=$(echo "$LB_CONFIG" | jq -r '.[0].health_check.port')
LB_HEALTH_PATH=$(echo "$LB_CONFIG" | jq -r '.[0].health_check.path')
LB_FWD_HTTPS_TARGET=$(echo "$LB_CONFIG" | jq -r '.[0].forwarding_rules[] | select(.entry_port == 443) | .target_port')
LB_FWD_HTTP_TARGET=$(echo "$LB_CONFIG" | jq -r '.[0].forwarding_rules[] | select(.entry_port == 80) | .target_port')

echo -e "  ${GREEN}✓ Actual Health Check: port=$LB_HEALTH_PORT, path=$LB_HEALTH_PATH${NC}"
echo -e "  ${GREEN}✓ Actual Forwarding: HTTPS→$LB_FWD_HTTPS_TARGET, HTTP→$LB_FWD_HTTP_TARGET${NC}\n"

# Fetch droplet configuration
echo -e "  ${YELLOW}→ Production Droplets (Blue/Green)${NC}"
DROPLET_BLUE=$(doctl compute droplet get 534912631 --output json)
DROPLET_GREEN=$(doctl compute droplet get 534912633 --output json)

DROPLET_BLUE_NAME=$(echo "$DROPLET_BLUE" | jq -r '.[0].name')
DROPLET_GREEN_NAME=$(echo "$DROPLET_GREEN" | jq -r '.[0].name')
DROPLET_BLUE_SIZE=$(echo "$DROPLET_BLUE" | jq -r '.[0].size.slug')
DROPLET_GREEN_SIZE=$(echo "$DROPLET_GREEN" | jq -r '.[0].size.slug')

echo -e "  ${GREEN}✓ Blue: $DROPLET_BLUE_NAME ($DROPLET_BLUE_SIZE)${NC}"
echo -e "  ${GREEN}✓ Green: $DROPLET_GREEN_NAME ($DROPLET_GREEN_SIZE)${NC}\n"

echo -e "${BLUE}📋 Step 2: Reading Terraform configuration...${NC}"

# Parse Terraform file for expected values
cd "${TERRAFORM_DIR}"

TF_HEALTH_PORT=$(grep -A 10 "healthcheck {" production-rebuild.tf | grep "port" | grep -oP '\d+' | head -1)
TF_HEALTH_PATH=$(grep -A 10 "healthcheck {" production-rebuild.tf | grep "path" | grep -oP '"/[^"]*"' | tr -d '"' | head -1)
TF_FWD_HTTPS_TARGET=$(grep -A 5 "entry_port.*443" production-rebuild.tf | grep "target_port" | grep -oP '\d+' | head -1)
TF_FWD_HTTP_TARGET=$(grep -A 5 "entry_port.*80" production-rebuild.tf | grep "target_port" | grep -oP '\d+' | head -1 | tail -1)

echo -e "  ${YELLOW}→ Terraform Health Check: port=$TF_HEALTH_PORT, path=$TF_HEALTH_PATH${NC}"
echo -e "  ${YELLOW}→ Terraform Forwarding: HTTPS→$TF_FWD_HTTPS_TARGET, HTTP→$TF_FWD_HTTP_TARGET${NC}\n"

echo -e "${BLUE}📋 Step 3: Comparing Terraform vs Actual Deployment...${NC}"

DRIFT_DETECTED=false

# Compare health check configuration
if [ "$LB_HEALTH_PORT" != "$TF_HEALTH_PORT" ]; then
    echo -e "  ${RED}❌ DRIFT: Health check port mismatch (actual: $LB_HEALTH_PORT, terraform: $TF_HEALTH_PORT)${NC}"
    DRIFT_DETECTED=true
else
    echo -e "  ${GREEN}✓ Health check port aligned: $LB_HEALTH_PORT${NC}"
fi

if [ "$LB_HEALTH_PATH" != "$TF_HEALTH_PATH" ]; then
    echo -e "  ${RED}❌ DRIFT: Health check path mismatch (actual: $LB_HEALTH_PATH, terraform: $TF_HEALTH_PATH)${NC}"
    DRIFT_DETECTED=true
else
    echo -e "  ${GREEN}✓ Health check path aligned: $LB_HEALTH_PATH${NC}"
fi

# Compare forwarding rules
if [ "$LB_FWD_HTTPS_TARGET" != "$TF_FWD_HTTPS_TARGET" ]; then
    echo -e "  ${RED}❌ DRIFT: HTTPS forwarding target mismatch (actual: $LB_FWD_HTTPS_TARGET, terraform: $TF_FWD_HTTPS_TARGET)${NC}"
    DRIFT_DETECTED=true
else
    echo -e "  ${GREEN}✓ HTTPS forwarding aligned: $LB_FWD_HTTPS_TARGET${NC}"
fi

if [ "$LB_FWD_HTTP_TARGET" != "$TF_FWD_HTTP_TARGET" ]; then
    echo -e "  ${RED}❌ DRIFT: HTTP forwarding target mismatch (actual: $LB_FWD_HTTP_TARGET, terraform: $TF_FWD_HTTP_TARGET)${NC}"
    DRIFT_DETECTED=true
else
    echo -e "  ${GREEN}✓ HTTP forwarding aligned: $LB_FWD_HTTP_TARGET${NC}"
fi

echo ""

# Generate drift report
echo -e "${BLUE}📋 Step 4: Generating drift report...${NC}"

cat > "${DRIFT_REPORT}" <<EOF
{
  "drift_detection_id": "terraform-drift-${TIMESTAMP}",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "drift_detected": $([ "$DRIFT_DETECTED" = true ] && echo "true" || echo "false"),

  "load_balancer": {
    "id": "f773103b-d40c-43c9-ad8a-fc2cd63f82f1",
    "name": "ectropy-production-lb-v2",

    "health_check": {
      "port": {
        "actual": $LB_HEALTH_PORT,
        "terraform": $TF_HEALTH_PORT,
        "aligned": $([ "$LB_HEALTH_PORT" = "$TF_HEALTH_PORT" ] && echo "true" || echo "false")
      },
      "path": {
        "actual": "$LB_HEALTH_PATH",
        "terraform": "$TF_HEALTH_PATH",
        "aligned": $([ "$LB_HEALTH_PATH" = "$TF_HEALTH_PATH" ] && echo "true" || echo "false")
      }
    },

    "forwarding_rules": {
      "https_target_port": {
        "actual": $LB_FWD_HTTPS_TARGET,
        "terraform": $TF_FWD_HTTPS_TARGET,
        "aligned": $([ "$LB_FWD_HTTPS_TARGET" = "$TF_FWD_HTTPS_TARGET" ] && echo "true" || echo "false")
      },
      "http_target_port": {
        "actual": $LB_FWD_HTTP_TARGET,
        "terraform": $TF_FWD_HTTP_TARGET,
        "aligned": $([ "$LB_FWD_HTTP_TARGET" = "$TF_FWD_HTTP_TARGET" ] && echo "true" || echo "false")
      }
    }
  },

  "droplets": {
    "blue": {
      "id": "534912631",
      "name": "$DROPLET_BLUE_NAME",
      "size": "$DROPLET_BLUE_SIZE"
    },
    "green": {
      "id": "534912633",
      "name": "$DROPLET_GREEN_NAME",
      "size": "$DROPLET_GREEN_SIZE"
    }
  },

  "terraform_file": "infrastructure/terraform/production-rebuild.tf",
  "terraform_last_updated": "2025-12-22 (commit 1c6ef6cf)",

  "enterprise_compliance": {
    "single_source_of_truth": $([ "$DRIFT_DETECTED" = false ] && echo "true" || echo "false"),
    "disaster_recovery_ready": $([ "$DRIFT_DETECTED" = false ] && echo "true" || echo "false"),
    "infrastructure_as_code_principle": $([ "$DRIFT_DETECTED" = false ] && echo "\"maintained\"" || echo "\"violated\"")
  }
}
EOF

echo -e "  ${GREEN}✓ Drift report generated: ${DRIFT_REPORT}${NC}\n"

# Final summary
echo -e "${BLUE}======================================${NC}"
if [ "$DRIFT_DETECTED" = false ]; then
    echo -e "${GREEN}✅ NO DRIFT DETECTED - Terraform aligned with production${NC}"
    echo -e "${GREEN}✅ Single source of truth maintained${NC}"
    echo -e "${GREEN}✅ Disaster recovery ready${NC}"
    exit 0
else
    echo -e "${RED}⚠️  DRIFT DETECTED - Terraform state misaligned${NC}"
    echo -e "${RED}⚠️  Manual infrastructure changes detected${NC}"
    echo -e "${YELLOW}→ Action required: Update Terraform or revert manual changes${NC}"
    echo -e "${YELLOW}→ Evidence: ${DRIFT_REPORT}${NC}"
    exit 1
fi
