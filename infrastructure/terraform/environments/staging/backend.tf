# ============================================================================
# Terraform Backend Configuration - Staging Environment
# ============================================================================
# Purpose: Isolated remote state storage for staging environment
# Pattern: Separate state per environment (industry best practice)
# Created: 2026-02-03
# Migration: Phase 3 - Staging environment isolation
# ============================================================================

# ARCHITECTURE CONTEXT:
# This backend configuration provides isolated state management for the
# staging environment, eliminating the multi-environment single-state
# anti-pattern identified in ROOT CAUSE #165.
#
# State Separation Strategy:
#   - environments/development/terraform.tfstate (2 resources)
#   - environments/staging/terraform.tfstate (6 resources)
#   - environments/production/terraform.tfstate (10 resources)
#
# Benefits:
#   - Minimum blast radius (staging changes don't affect dev/prod)
#   - Separate credentials per environment
#   - Independent deployments
#   - No -target or -refresh=false patches needed
#   - Correct exit codes (plan returns 0/1/2)
#
# ============================================================================

terraform {
  required_version = ">= 1.5" # import blocks require Terraform 1.5+

  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0" # v4 stable — migrate to v5 after March 2026 migration tool
    }
  }

  backend "s3" {
    # DigitalOcean Spaces Configuration (S3-compatible API)
    bucket = "ectropy-terraform-state"
    key    = "environments/staging/terraform.tfstate"
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
    # ⚠️  IMPORTANT: Credential Precedence (ROOT CAUSE #166, #186)
    # Terraform AWS SDK uses this precedence order:
    #   1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
    #   2. Credentials file (~/.aws/credentials)
    #   3. EC2 instance metadata
    #
    # ROOT CAUSE #186 (2026-02-04): S3 Backend Authentication Failure
    # Issue: Invalid credentials in environment variables overrode valid credentials file
    # Resolution: Established ~/.aws/credentials as canonical source of truth
    # Prevention: Export correct credentials from credentials file to environment
    #
    # Single Source of Truth (ESTABLISHED 2026-02-04):
    #   - Canonical location: ~/.aws/credentials [default] profile
    #   - Validation: All 3 environments (dev/staging/prod) tested successfully
    #
    # Local Development (RECOMMENDED):
    #   Use environment variables exported from ~/.aws/credentials:
    #     export AWS_ACCESS_KEY_ID=$(grep aws_access_key_id ~/.aws/credentials | head -1 | cut -d'=' -f2 | xargs)
    #     export AWS_SECRET_ACCESS_KEY=$(grep aws_secret_access_key ~/.aws/credentials | head -1 | cut -d'=' -f2 | xargs)
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
#   - Staging environment has controlled access
#   - Team coordination via communication channels
#   - Future: Consider Terraform Cloud for enterprise state locking
#
# IMPORTANT: Never run concurrent terraform apply operations
# ============================================================================

# ============================================================================
# Migration Notes - Phase 3
# ============================================================================
# Migration from: infrastructure/terraform/terraform.tfstate (multi-env)
# Migration to: environments/staging/terraform.tfstate (isolated)
#
# Resources migrated (6 total):
#   1. digitalocean_droplet.staging (ID: 548984053)
#   2. digitalocean_loadbalancer.staging (ID: 03bd5a15-120b-488d-aea9-a8288262473b)
#   3. module.staging_vpc.digitalocean_vpc.main (ID: 09dc5c34-e460-40b7-bce9-80cc03cfaf39)
#   4. module.staging_compose_deployment.null_resource.compose_deployment
#   5. module.staging_env_deployment.null_resource.env_deployment
#   6. module.staging_infrastructure_deployment.null_resource.infrastructure_deployment
#
# Migration procedure:
#   1. terraform init (create new state)
#   2. terraform import digitalocean_droplet.staging 548984053
#   3. terraform import digitalocean_loadbalancer.staging 03bd5a15-120b-488d-aea9-a8288262473b
#   4. terraform import module.staging_vpc.digitalocean_vpc.main 09dc5c34-e460-40b7-bce9-80cc03cfaf39
#   5. terraform import module.staging_compose_deployment.null_resource.compose_deployment <id>
#   6. terraform import module.staging_env_deployment.null_resource.env_deployment <id>
#   7. terraform import module.staging_infrastructure_deployment.null_resource.infrastructure_deployment <id>
#   8. terraform plan (validate no changes)
#   9. terraform state rm from old state
#
# Rollback procedure (if migration fails):
#   1. Resources remain in old state (no changes applied)
#   2. Delete environments/staging/ directory
#   3. Continue using old multi-env state
# ============================================================================
