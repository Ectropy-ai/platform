# ============================================================================
# Terraform Backend Configuration - Infrastructure Layer
# ============================================================================
# Purpose: Remote state storage for application-layer infrastructure
# Pattern: GitOps - State in DigitalOcean Spaces enables CI/CD automation
# Created: 2026-02-02
# Root Cause: Full GitOps implementation for infrastructure/terraform
# ============================================================================

# ARCHITECTURE CONTEXT:
# This backend configuration enables automated Terraform deployments from
# GitHub Actions by storing state remotely in DigitalOcean Spaces.
#
# State Separation:
#   - terraform/: Core infrastructure state (terraform-aws/terraform.tfstate)
#   - infrastructure/terraform/: Application layer state (infrastructure-staging/terraform.tfstate)
#
# Migration:
#   This file enables migration from local state to remote state.
#   After creating this file, run:
#     terraform init -migrate-state
#   Terraform will prompt to migrate existing local state to remote backend.
#
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
      version = "~> 4.0"
    }
  }

  backend "s3" {
    # DigitalOcean Spaces Configuration (S3-compatible API)
    bucket = "ectropy-terraform-state"
    key    = "infrastructure-staging/terraform.tfstate"
    region = "us-east-1" # Required parameter but not used by Spaces

    # Modern endpoint configuration (Terraform 1.6+)
    endpoints = {
      s3 = "https://sfo3.digitaloceanspaces.com"
    }

    # DigitalOcean Spaces specific settings
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_requesting_account_id  = true
    skip_region_validation      = true

    # Security
    encrypt = true

    # Credentials:
    #
    # ⚠️  IMPORTANT: Credential Precedence
    # Terraform AWS SDK uses this precedence order:
    #   1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
    #   2. Credentials file (~/.aws/credentials)
    #   3. EC2 instance metadata
    #
    # Local Development (RECOMMENDED):
    #   Use ~/.aws/credentials with DigitalOcean Spaces keys
    #   DO NOT set AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY environment variables
    #   Setting wrong credentials in environment variables causes 403 errors (ROOT CAUSE #166)
    #
    # GitHub Actions:
    #   env:
    #     AWS_ACCESS_KEY_ID: ${{ secrets.SPACES_ACCESS_KEY_ID }}
    #     AWS_SECRET_ACCESS_KEY: ${{ secrets.SPACES_SECRET_ACCESS_KEY }}
  }
}

# ============================================================================
# State Locking
# ============================================================================
# CURRENT LIMITATION: No state locking
# DigitalOcean Spaces does not support DynamoDB-style state locking.
#
# Mitigation:
#   - CI/CD runs sequentially (one job at a time)
#   - Local development coordination via team communication
#   - Future: Consider Terraform Cloud for enterprise state locking
#
# IMPORTANT: Never run concurrent terraform apply operations
# ============================================================================

# ============================================================================
# Migration Notes
# ============================================================================
# Pre-migration state:
#   - Location: ./terraform.tfstate (local file, 44KB)
#   - Resources: 20 (6 droplets, 2 VPCs, 2 LBs, 3 firewalls, 4 reserved IPs, 3 deployment modules)
#   - Last modified: 2026-02-02 12:58 (from manual terraform apply)
#
# Post-migration validation:
#   1. terraform state list (should show same 20 resources)
#   2. terraform plan (should show "No changes")
#   3. Verify remote state: infrastructure-staging/terraform.tfstate exists in Spaces
#   4. Backup local state: Keep terraform.tfstate.backup for safety
#
# Rollback procedure (if migration fails):
#   1. Remove this backend.tf file
#   2. terraform init -reconfigure (switch back to local)
#   3. Restore from terraform.tfstate.backup if needed
# ============================================================================
