#!/bin/bash
# ============================================================================
# Enterprise Terraform Validation and Production Provisioning Script
# ============================================================================
# Purpose: Validate all prerequisites and provision production infrastructure
# Usage: bash scripts/terraform/validate-and-provision-production.sh
# ============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TERRAFORM_DIR="$REPO_ROOT/infrastructure/terraform"

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}🏗️  ENTERPRISE TERRAFORM PRODUCTION PROVISIONING${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""

# ============================================================================
# PHASE 1: Validate Prerequisites
# ============================================================================

echo -e "${BLUE}📋 PHASE 1: Validating Prerequisites...${NC}"
echo ""

MISSING_SECRETS=()
MISSING_VARIABLES=()

# Check Terraform installation
echo -n "🔧 Checking Terraform installation... "
if command -v terraform &> /dev/null; then
    TF_VERSION=$(terraform version -json | jq -r '.terraform_version')
    echo -e "${GREEN}✓ Found Terraform $TF_VERSION${NC}"
else
    echo -e "${RED}✗ Terraform not installed${NC}"
    echo "   Install: https://developer.hashicorp.com/terraform/downloads"
    exit 1
fi

# Check required environment variables for Terraform backend (DigitalOcean Spaces)
echo ""
echo -e "${BLUE}🔐 Checking Terraform Backend Credentials (DigitalOcean Spaces)...${NC}"

if [ -z "${SPACES_ACCESS_KEY_ID:-}" ]; then
    echo -e "${YELLOW}  ⚠️  SPACES_ACCESS_KEY_ID not set${NC}"
    MISSING_SECRETS+=("SPACES_ACCESS_KEY_ID")
else
    echo -e "${GREEN}  ✓ SPACES_ACCESS_KEY_ID configured${NC}"
fi

if [ -z "${SPACES_SECRET_ACCESS_KEY:-}" ]; then
    echo -e "${YELLOW}  ⚠️  SPACES_SECRET_ACCESS_KEY not set${NC}"
    MISSING_SECRETS+=("SPACES_SECRET_ACCESS_KEY")
else
    echo -e "${GREEN}  ✓ SPACES_SECRET_ACCESS_KEY configured${NC}"
fi

# Check DigitalOcean API token
echo ""
echo -e "${BLUE}🔐 Checking DigitalOcean API Credentials...${NC}"

if [ -z "${DIGITALOCEAN_ACCESS_TOKEN:-}" ]; then
    echo -e "${YELLOW}  ⚠️  DIGITALOCEAN_ACCESS_TOKEN not set${NC}"
    MISSING_SECRETS+=("DIGITALOCEAN_ACCESS_TOKEN")
else
    echo -e "${GREEN}  ✓ DIGITALOCEAN_ACCESS_TOKEN configured${NC}"
fi

# Check Terraform variables
echo ""
echo -e "${BLUE}📝 Checking Terraform Variables...${NC}"

if [ -z "${TF_VAR_ssh_key_fingerprint:-}" ]; then
    echo -e "${YELLOW}  ⚠️  TF_VAR_ssh_key_fingerprint not set${NC}"
    MISSING_VARIABLES+=("TF_VAR_ssh_key_fingerprint")
else
    echo -e "${GREEN}  ✓ TF_VAR_ssh_key_fingerprint configured${NC}"
fi

if [ -z "${TF_VAR_admin_ip:-}" ]; then
    echo -e "${YELLOW}  ⚠️  TF_VAR_admin_ip not set${NC}"
    MISSING_VARIABLES+=("TF_VAR_admin_ip")
else
    echo -e "${GREEN}  ✓ TF_VAR_admin_ip configured${NC}"
fi

# Optional variables with defaults
TF_VAR_ssl_certificate_name="${TF_VAR_ssl_certificate_name:-ectropy-production-cert}"
TF_VAR_alert_email="${TF_VAR_alert_email:-alerts@ectropy.ai}"

echo -e "${GREEN}  ✓ TF_VAR_ssl_certificate_name: $TF_VAR_ssl_certificate_name${NC}"
echo -e "${GREEN}  ✓ TF_VAR_alert_email: $TF_VAR_alert_email${NC}"

# ============================================================================
# PHASE 2: Report Missing Prerequisites
# ============================================================================

echo ""
if [ ${#MISSING_SECRETS[@]} -gt 0 ] || [ ${#MISSING_VARIABLES[@]} -gt 0 ]; then
    echo -e "${RED}============================================================================${NC}"
    echo -e "${RED}❌ MISSING PREREQUISITES${NC}"
    echo -e "${RED}============================================================================${NC}"
    echo ""

    if [ ${#MISSING_SECRETS[@]} -gt 0 ]; then
        echo -e "${YELLOW}Missing GitHub Secrets:${NC}"
        for secret in "${MISSING_SECRETS[@]}"; do
            echo "  - $secret"
        done
        echo ""
        echo -e "${BLUE}Configure via GitHub:${NC}"
        echo "  Settings → Secrets and variables → Actions → production environment"
        echo ""
        echo -e "${BLUE}How to get these values:${NC}"
        echo "  SPACES_ACCESS_KEY_ID:       DigitalOcean → Spaces → Settings → Spaces Keys"
        echo "  SPACES_SECRET_ACCESS_KEY:   DigitalOcean → Spaces → Settings → Spaces Keys"
        echo "  DIGITALOCEAN_ACCESS_TOKEN:  DigitalOcean → API → Tokens/Keys → Generate New Token"
        echo ""
    fi

    if [ ${#MISSING_VARIABLES[@]} -gt 0 ]; then
        echo -e "${YELLOW}Missing GitHub Variables:${NC}"
        for var in "${MISSING_VARIABLES[@]}"; do
            echo "  - $var"
        done
        echo ""
        echo -e "${BLUE}Configure via GitHub:${NC}"
        echo "  Settings → Secrets and variables → Actions → Variables → production environment"
        echo ""
        echo -e "${BLUE}How to get these values:${NC}"
        echo "  TF_VAR_ssh_key_fingerprint: DigitalOcean → Security → SSH Keys → (copy fingerprint)"
        echo "  TF_VAR_admin_ip:           Your current IP address (curl ifconfig.me)"
        echo ""
    fi

    echo -e "${YELLOW}After configuring, re-run this script or trigger via GitHub Actions:${NC}"
    echo "  gh workflow run terraform-plan-apply.yml --field action=plan"
    echo ""
    exit 1
fi

echo -e "${GREEN}============================================================================${NC}"
echo -e "${GREEN}✅ ALL PREREQUISITES VALIDATED${NC}"
echo -e "${GREEN}============================================================================${NC}"
echo ""

# ============================================================================
# PHASE 3: Terraform Initialization
# ============================================================================

echo -e "${BLUE}📦 PHASE 2: Terraform Initialization...${NC}"
echo ""

cd "$TERRAFORM_DIR"

# Set AWS credentials for DigitalOcean Spaces (S3-compatible)
export AWS_ACCESS_KEY_ID="$SPACES_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$SPACES_SECRET_ACCESS_KEY"
export TF_VAR_do_token="$DIGITALOCEAN_ACCESS_TOKEN"

echo "🔧 Initializing Terraform with DigitalOcean Spaces backend..."
if terraform init -upgrade; then
    echo -e "${GREEN}✓ Terraform initialized successfully${NC}"
else
    echo -e "${RED}✗ Terraform initialization failed${NC}"
    exit 1
fi

# ============================================================================
# PHASE 4: Terraform Validation
# ============================================================================

echo ""
echo -e "${BLUE}📝 PHASE 3: Terraform Validation...${NC}"
echo ""

echo "🔍 Validating Terraform configuration..."
if terraform validate; then
    echo -e "${GREEN}✓ Terraform configuration is valid${NC}"
else
    echo -e "${RED}✗ Terraform configuration is invalid${NC}"
    exit 1
fi

# ============================================================================
# PHASE 5: Terraform Format Check
# ============================================================================

echo ""
echo -e "${BLUE}📐 PHASE 4: Terraform Format Check...${NC}"
echo ""

echo "📋 Checking Terraform formatting..."
if terraform fmt -check -recursive; then
    echo -e "${GREEN}✓ All Terraform files are properly formatted${NC}"
else
    echo -e "${YELLOW}⚠️  Some files need formatting. Running terraform fmt...${NC}"
    terraform fmt -recursive
    echo -e "${GREEN}✓ Files formatted${NC}"
fi

# ============================================================================
# PHASE 6: Terraform Plan
# ============================================================================

echo ""
echo -e "${BLUE}📊 PHASE 5: Terraform Plan...${NC}"
echo ""

echo "📋 Generating Terraform plan..."
if terraform plan -out=tfplan -var="do_token=$DIGITALOCEAN_ACCESS_TOKEN" \
    -var="ssh_key_fingerprint=$TF_VAR_ssh_key_fingerprint" \
    -var="admin_ip=$TF_VAR_admin_ip" \
    -var="ssl_certificate_name=$TF_VAR_ssl_certificate_name" \
    -var="alert_email=$TF_VAR_alert_email"; then
    echo ""
    echo -e "${GREEN}✓ Terraform plan generated successfully${NC}"
else
    echo -e "${RED}✗ Terraform plan failed${NC}"
    exit 1
fi

# ============================================================================
# PHASE 7: Review and Apply Prompt
# ============================================================================

echo ""
echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}📋 TERRAFORM PLAN SUMMARY${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""

# Extract resource changes from plan
terraform show -json tfplan | jq -r '.resource_changes[] |
    select(.change.actions != ["no-op"]) |
    "\(.change.actions | join(",")) \t\(.type).\(.name)"' || true

echo ""
echo -e "${YELLOW}⚠️  PRODUCTION INFRASTRUCTURE PROVISIONING${NC}"
echo ""
echo "The following resources will be created:"
echo "  • DigitalOcean Droplet (s-4vcpu-8gb, Ubuntu 22.04)"
echo "  • Managed PostgreSQL Database (db-s-2vcpu-4gb, PostgreSQL 15)"
echo "  • Load Balancer (HTTPS SSL termination)"
echo "  • Firewall (SSH from admin IP only)"
echo "  • DNS Domain (ectropy.ai)"
echo ""
echo -e "${BLUE}Estimated monthly cost: ~\$80-100${NC}"
echo ""
echo -e "${YELLOW}Do you want to apply this plan and provision production infrastructure?${NC}"
echo "  This will create REAL resources in DigitalOcean"
echo ""
read -p "Type 'yes' to apply, anything else to exit: " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo ""
    echo -e "${YELLOW}⏸️  Terraform apply cancelled${NC}"
    echo ""
    echo "Plan saved to: $TERRAFORM_DIR/tfplan"
    echo "To apply later: cd $TERRAFORM_DIR && terraform apply tfplan"
    echo ""
    exit 0
fi

# ============================================================================
# PHASE 8: Terraform Apply
# ============================================================================

echo ""
echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}🚀 PHASE 6: Terraform Apply - PROVISIONING PRODUCTION${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""

if terraform apply tfplan; then
    echo ""
    echo -e "${GREEN}============================================================================${NC}"
    echo -e "${GREEN}✅ PRODUCTION INFRASTRUCTURE PROVISIONED SUCCESSFULLY${NC}"
    echo -e "${GREEN}============================================================================${NC}"
    echo ""
else
    echo -e "${RED}✗ Terraform apply failed${NC}"
    exit 1
fi

# ============================================================================
# PHASE 9: Extract Outputs
# ============================================================================

echo -e "${BLUE}📊 Extracting Terraform Outputs...${NC}"
echo ""

PRODUCTION_IP=$(terraform output -raw production_ip 2>/dev/null || echo "not-available")
LOADBALANCER_IP=$(terraform output -raw loadbalancer_ip 2>/dev/null || echo "not-available")
LOADBALANCER_STATUS=$(terraform output -raw loadbalancer_status 2>/dev/null || echo "unknown")
DATABASE_HOST=$(terraform output -raw database_host 2>/dev/null || echo "not-available")
DATABASE_PORT=$(terraform output -raw database_port 2>/dev/null || echo "not-available")

echo "🖥️  Production Server (Backend):"
echo "   IP Address: $PRODUCTION_IP"
echo ""
echo "⚖️  Load Balancer (Public):"
echo "   IP Address: $LOADBALANCER_IP"
echo "   Status: $LOADBALANCER_STATUS"
echo ""
echo "🗄️  Database (Managed PostgreSQL):"
echo "   Host: $DATABASE_HOST"
echo "   Port: $DATABASE_PORT"
echo ""

# ============================================================================
# PHASE 10: Next Steps
# ============================================================================

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}📋 NEXT STEPS FOR PRODUCTION DEPLOYMENT${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""

echo "1️⃣  Configure GitHub Secrets with Terraform outputs:"
echo ""
echo "   gh secret set PROD_HOST --body \"$PRODUCTION_IP\" --env production"
echo "   gh secret set PROD_USER --body \"root\" --env production"
echo "   # PROD_SSH_KEY: Use your DigitalOcean SSH private key"
echo ""

echo "2️⃣  Update DNS (if not using DigitalOcean DNS):"
echo ""
echo "   ectropy.ai     A     $LOADBALANCER_IP"
echo "   www.ectropy.ai CNAME ectropy.ai"
echo "   api.ectropy.ai CNAME ectropy.ai"
echo ""

echo "3️⃣  Verify infrastructure:"
echo ""
echo "   ssh root@$PRODUCTION_IP"
echo "   curl http://$LOADBALANCER_IP/health"
echo ""

echo "4️⃣  Deploy application:"
echo ""
echo "   gh workflow run deploy-production.yml \\"
echo "     --field deployment_color=green \\"
echo "     --field skip_approval=false"
echo ""

echo -e "${GREEN}✅ Production infrastructure is ready for deployment!${NC}"
echo ""
