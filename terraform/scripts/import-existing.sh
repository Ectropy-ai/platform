#!/bin/bash
# ============================================================================
# Terraform Import Script - Import Existing Ectropy Infrastructure
# ============================================================================
# Version: 1.0.0
# Description: Imports all existing DigitalOcean resources into Terraform state
# Last Updated: 2025-12-14
# ============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TERRAFORM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_FILE="terraform.tfstate"

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}Ectropy Infrastructure Import - Operation Alpha${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""

# ----------------------------------------------------------------------------
# Pre-flight Checks
# ----------------------------------------------------------------------------

echo -e "${YELLOW}>>> Running pre-flight checks...${NC}"

# Check if terraform is installed
if ! command -v terraform &> /dev/null; then
    echo -e "${RED}ERROR: Terraform is not installed${NC}"
    echo -e "Please install Terraform: https://www.terraform.io/downloads"
    exit 1
fi

# Check if doctl is installed
if ! command -v doctl &> /dev/null; then
    echo -e "${RED}ERROR: doctl is not installed${NC}"
    echo -e "Please install doctl: https://docs.digitalocean.com/reference/doctl/"
    exit 1
fi

# Check if Digital Ocean token is set
if [[ -z "${DIGITALOCEAN_TOKEN:-}" ]]; then
    echo -e "${RED}ERROR: DIGITALOCEAN_TOKEN environment variable is not set${NC}"
    echo -e "Please run: export DIGITALOCEAN_TOKEN=\"your_token_here\""
    exit 1
fi

echo -e "${GREEN}✓ All prerequisites met${NC}"
echo ""

# ----------------------------------------------------------------------------
# Initialize Terraform
# ----------------------------------------------------------------------------

echo -e "${YELLOW}>>> Initializing Terraform...${NC}"
cd "$TERRAFORM_DIR"

terraform init
terraform workspace select production || terraform workspace new production

echo -e "${GREEN}✓ Terraform initialized${NC}"
echo ""

# ----------------------------------------------------------------------------
# Discover Existing Resources
# ----------------------------------------------------------------------------

echo -e "${YELLOW}>>> Discovering existing DigitalOcean resources...${NC}"
echo ""

# Get VPC
echo -e "${BLUE}Fetching VPCs...${NC}"
VPC_ID=$(doctl compute vpc list --format ID --no-header | head -1)
if [[ -n "$VPC_ID" ]]; then
    echo -e "  Found VPC: ${GREEN}$VPC_ID${NC}"
else
    echo -e "  ${YELLOW}No VPC found${NC}"
fi

# Get Droplets
echo -e "${BLUE}Fetching Droplets...${NC}"
doctl compute droplet list --format ID,Name,Status | while read -r id name status; do
    echo -e "  Droplet: ${GREEN}$name${NC} (ID: $id, Status: $status)"
done

# Get Load Balancers
echo -e "${BLUE}Fetching Load Balancers...${NC}"
doctl compute load-balancer list --format ID,Name,Status | while read -r id name status; do
    echo -e "  Load Balancer: ${GREEN}$name${NC} (ID: $id, Status: $status)"
done

# Get Databases
echo -e "${BLUE}Fetching Databases...${NC}"
doctl databases list --format ID,Name,Engine,Status | while read -r id name engine status; do
    echo -e "  Database: ${GREEN}$name${NC} (ID: $id, Engine: $engine, Status: $status)"
done

# Get Firewalls
echo -e "${BLUE}Fetching Firewalls...${NC}"
doctl compute firewall list --format ID,Name | while read -r id name; do
    echo -e "  Firewall: ${GREEN}$name${NC} (ID: $id)"
done

echo ""

# ----------------------------------------------------------------------------
# Import Resources
# ----------------------------------------------------------------------------

echo -e "${YELLOW}>>> Starting import process...${NC}"
echo -e "${YELLOW}NOTE: You will be prompted to confirm each import${NC}"
echo ""

# Function to import resource
import_resource() {
    local resource_type=$1
    local resource_id=$2
    local terraform_address=$3
    local resource_name=$4

    echo -e "${BLUE}Importing: ${resource_name}${NC}"
    echo -e "  Resource Type: $resource_type"
    echo -e "  Resource ID: $resource_id"
    echo -e "  Terraform Address: $terraform_address"

    if terraform import "$terraform_address" "$resource_id"; then
        echo -e "  ${GREEN}✓ Successfully imported${NC}"
        return 0
    else
        echo -e "  ${RED}✗ Import failed${NC}"
        return 1
    fi
}

# ----------------------------------------------------------------------------
# Import VPC
# ----------------------------------------------------------------------------

if [[ -n "$VPC_ID" ]]; then
    echo -e "${YELLOW}>>> Importing VPC...${NC}"
    import_resource "digitalocean_vpc" "$VPC_ID" "module.vpc.digitalocean_vpc.main" "Ectropy VPC"
    echo ""
fi

# ----------------------------------------------------------------------------
# Import Droplets
# ----------------------------------------------------------------------------

echo -e "${YELLOW}>>> Importing Droplets...${NC}"

# Production Green Droplet
DROPLET_GREEN_ID=$(doctl compute droplet list --format ID,Name --no-header | grep "ectropy-production-green" | awk '{print $1}')
if [[ -n "$DROPLET_GREEN_ID" ]]; then
    import_resource "digitalocean_droplet" "$DROPLET_GREEN_ID" "module.production_green.digitalocean_droplet.main" "Production Green"
    echo ""
fi

# Production Blue Droplet
DROPLET_BLUE_ID=$(doctl compute droplet list --format ID,Name --no-header | grep "ectropy-production-blue" | awk '{print $1}')
if [[ -n "$DROPLET_BLUE_ID" ]]; then
    import_resource "digitalocean_droplet" "$DROPLET_BLUE_ID" "module.production_blue.digitalocean_droplet.main" "Production Blue"
    echo ""
fi

# Staging Droplet
DROPLET_STAGING_ID=$(doctl compute droplet list --format ID,Name --no-header | grep "ubuntu-s-2vcpu-4gb-sfo3-01" | awk '{print $1}')
if [[ -n "$DROPLET_STAGING_ID" ]]; then
    import_resource "digitalocean_droplet" "$DROPLET_STAGING_ID" "module.staging.digitalocean_droplet.main" "Staging"
    echo ""
fi

# ----------------------------------------------------------------------------
# Import Load Balancers
# ----------------------------------------------------------------------------

echo -e "${YELLOW}>>> Importing Load Balancers...${NC}"

# Production Load Balancer v2
LB_PROD_V2_ID=$(doctl compute load-balancer list --format ID,Name --no-header | grep "ectropy-production-lb-v2" | awk '{print $1}')
if [[ -n "$LB_PROD_V2_ID" ]]; then
    import_resource "digitalocean_loadbalancer" "$LB_PROD_V2_ID" "module.production_lb.digitalocean_loadbalancer.main" "Production LB v2"
    echo ""
fi

# Staging Load Balancer
LB_STAGING_ID=$(doctl compute load-balancer list --format ID,Name --no-header | grep "ectropy-staging-lb" | awk '{print $1}')
if [[ -n "$LB_STAGING_ID" ]]; then
    import_resource "digitalocean_loadbalancer" "$LB_STAGING_ID" "module.staging_lb.digitalocean_loadbalancer.main" "Staging LB"
    echo ""
fi

# ----------------------------------------------------------------------------
# Import Database
# ----------------------------------------------------------------------------

echo -e "${YELLOW}>>> Importing Managed Database...${NC}"

DB_ID=$(doctl databases list --format ID,Name --no-header | grep "ectropy-production-db" | awk '{print $1}')
if [[ -n "$DB_ID" ]]; then
    import_resource "digitalocean_database_cluster" "$DB_ID" "module.production_db.digitalocean_database_cluster.main" "Production Database"
    echo ""
fi

# ----------------------------------------------------------------------------
# Import Firewalls
# ----------------------------------------------------------------------------

echo -e "${YELLOW}>>> Importing Firewalls...${NC}"

FIREWALL_ID=$(doctl compute firewall list --format ID,Name --no-header | head -1 | awk '{print $1}')
if [[ -n "$FIREWALL_ID" ]]; then
    import_resource "digitalocean_firewall" "$FIREWALL_ID" "module.firewall.digitalocean_firewall.main" "Main Firewall"
    echo ""
fi

# ----------------------------------------------------------------------------
# Validation
# ----------------------------------------------------------------------------

echo -e "${YELLOW}>>> Validating imported state...${NC}"

terraform plan -var-file="environments/production/terraform.tfvars" > /tmp/terraform-import-plan.txt

if grep -q "No changes" /tmp/terraform-import-plan.txt; then
    echo -e "${GREEN}✓ Import successful! Infrastructure matches code.${NC}"
else
    echo -e "${YELLOW}⚠ Import complete, but there are differences between state and code${NC}"
    echo -e "Review the plan output to see what needs to be adjusted:"
    echo -e "  cat /tmp/terraform-import-plan.txt"
fi

echo ""

# ----------------------------------------------------------------------------
# Summary
# ----------------------------------------------------------------------------

echo -e "${BLUE}============================================================================${NC}"
echo -e "${GREEN}Import Operation Complete!${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""
echo -e "Next steps:"
echo -e "  1. Review Terraform state: ${BLUE}terraform show${NC}"
echo -e "  2. Review plan output: ${BLUE}cat /tmp/terraform-import-plan.txt${NC}"
echo -e "  3. Adjust Terraform code if needed to match existing infrastructure"
echo -e "  4. Run terraform plan to verify no unexpected changes"
echo -e "  5. Commit Terraform state to version control (if using git-based state)"
echo ""
echo -e "${YELLOW}IMPORTANT: Backup your state file before making any changes!${NC}"
echo -e "  cp terraform.tfstate terraform.tfstate.backup.$(date +%Y%m%d-%H%M%S)"
echo ""

# ----------------------------------------------------------------------------
# Generate Import Report
# ----------------------------------------------------------------------------

REPORT_FILE="terraform-import-report-$(date +%Y%m%d-%H%M%S).txt"
cat > "$REPORT_FILE" <<EOF
================================================================================
Ectropy Infrastructure Import Report
================================================================================
Date: $(date)
Terraform Version: $(terraform version | head -1)
Workspace: $(terraform workspace show)

Resources Imported:
$(terraform state list)

Resource Count: $(terraform state list | wc -l)

Next Steps:
1. Review this report and the Terraform plan output
2. Adjust Terraform code if needed
3. Test deployments in staging before production
4. Document any infrastructure drift found

Generated by: terraform/scripts/import-existing.sh
================================================================================
EOF

echo -e "${GREEN}Import report saved to: $REPORT_FILE${NC}"
echo ""

exit 0
