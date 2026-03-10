# ============================================================================
# Production Environment Backend Configuration - Isolated State
# ============================================================================
# Date: 2026-02-04 (Phase 4: Production Environment Migration)
# Purpose: Remote state storage for production environment
# Pattern: Isolated state per environment (enterprise best practice)
# State Key: environments/production/terraform.tfstate
# Root Cause: #165 - Multi-environment single state migration
# ============================================================================

terraform {
  required_version = ">= 1.0"

  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0" # v4 stable — matches staging pattern
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }

  # =========================================================================
  # S3-Compatible Backend (DigitalOcean Spaces)
  # =========================================================================
  # Pattern: Same as staging/development for consistency
  # Credentials: AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY environment variables
  # State File: environments/production/terraform.tfstate (isolated from other envs)
  # =========================================================================
  backend "s3" {
    bucket = "ectropy-terraform-state"
    key    = "environments/production/terraform.tfstate"
    region = "us-east-1"

    # DigitalOcean Spaces endpoint
    endpoints = {
      s3 = "https://sfo3.digitaloceanspaces.com"
    }

    # Skip AWS-specific validations (not applicable to DigitalOcean Spaces)
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_requesting_account_id  = true
    skip_region_validation      = true

    # Encryption at rest
    encrypt = true
  }
}

# ============================================================================
# CREDENTIAL CONFIGURATION (ROOT CAUSE #166, #186)
# ============================================================================
# IMPORTANT: Credentials are sourced from environment variables in this order:
#
# 1. Environment variables (HIGHEST PRIORITY):
#    export AWS_ACCESS_KEY_ID="your-spaces-access-key"
#    export AWS_SECRET_ACCESS_KEY="your-spaces-secret-key"
#
# 2. AWS credentials file (~/.aws/credentials):
#    [default]
#    aws_access_key_id = your-spaces-access-key
#    aws_secret_access_key = your-spaces-secret-key
#
# 3. EC2 instance metadata (NOT applicable for DigitalOcean Spaces)
#
# ROOT CAUSE #186 (2026-02-04): S3 Backend Authentication Failure
# Issue: Invalid credentials in environment variables overrode valid credentials file
# Resolution: Established ~/.aws/credentials as canonical source of truth
# Prevention: Export correct credentials from credentials file to environment
#
# SINGLE SOURCE OF TRUTH (ESTABLISHED 2026-02-04):
#   - Canonical location: ~/.aws/credentials [default] profile
#   - Validation: All 3 environments (dev/staging/prod) tested successfully
#   - Key rotation process documented in ROOT CAUSE #186 evidence file
#
# ENTERPRISE PATTERN: Use environment variables in CI/CD pipelines
# LOCAL DEVELOPMENT: Export from ~/.aws/credentials to prevent credential drift
#   export AWS_ACCESS_KEY_ID=$(grep aws_access_key_id ~/.aws/credentials | head -1 | cut -d'=' -f2 | xargs)
#   export AWS_SECRET_ACCESS_KEY=$(grep aws_secret_access_key ~/.aws/credentials | head -1 | cut -d'=' -f2 | xargs)
#
# Verify credentials before running terraform commands:
#   aws s3 ls s3://ectropy-terraform-state --endpoint-url=https://sfo3.digitaloceanspaces.com
# ============================================================================

# ============================================================================
# STATE MIGRATION NOTES (Phase 4: Production Environment)
# ============================================================================
# FROM: infrastructure/terraform/terraform.tfstate (multi-environment, 18 resources)
#   - Production resources: 12 (4 droplets, 2 firewalls, 1 LB, 4 reserved IPs, 1 VPC)
#   - Staging resources: 6 (already migrated in Phase 3)
#   - Development resources: 2 (already migrated in Phase 2)
#
# TO: environments/production/terraform.tfstate (isolated, 12 resources)
#
# MIGRATION PROCEDURE:
#   1. Create this backend.tf file
#   2. Run: terraform init -reconfigure
#   3. Import existing production resources:
#      - 4 droplets (blue, green, blue_isolated, green_isolated)
#      - 2 firewalls (production, production_isolated)
#      - 1 load balancer (production)
#      - 4 reserved IPs
#      - 1 VPC module
#   4. Validate: terraform plan (should show no infrastructure changes)
#   5. Fix firewall CIDR (10.100.0.0/20 → 10.10.0.0/20)
#   6. Deploy application to isolated droplets (GitOps modules)
#   7. Blue-green cutover to isolated droplets
#   8. Cleanup old infrastructure after validation
#
# ROLLBACK CAPABILITY:
#   - Old state backed up: infrastructure/terraform/terraform.tfstate.backup
#   - Can restore by running terraform commands from old directory
#   - State files preserved for 30 days minimum
# ============================================================================

# ============================================================================
# VALIDATION CHECKLIST
# ============================================================================
# Before proceeding with migration, verify:
#   ✅ Credentials configured (AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY)
#   ✅ Backend bucket exists (ectropy-terraform-state)
#   ✅ Backend accessible (test with: aws s3 ls s3://ectropy-terraform-state --endpoint-url=https://sfo3.digitaloceanspaces.com)
#   ✅ DigitalOcean token set (DIGITALOCEAN_TOKEN environment variable)
#   ✅ Old state file backed up (infrastructure/terraform/terraform.tfstate.backup exists)
#
# After terraform init:
#   ✅ Backend initialized successfully
#   ✅ Providers downloaded (digitalocean ~> 2.0, null ~> 3.0)
#   ✅ State file created remotely (environments/production/terraform.tfstate)
# ============================================================================
