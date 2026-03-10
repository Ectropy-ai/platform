# ============================================================================
# Provider Configuration - Staging Environment
# ============================================================================
# Purpose: Configure DigitalOcean and AWS (Spaces) providers for staging
# Pattern: Multi-provider configuration for zero-SSH deployment
# Phase P3: Fortune 500 compliance - Absolute zero-SSH architecture
# ============================================================================

# ============================================================================
# DigitalOcean Provider
# ============================================================================
# Purpose: Manage DigitalOcean infrastructure (droplets, load balancers, VPCs)

provider "digitalocean" {
  # Credentials: DIGITALOCEAN_TOKEN environment variable
  # Required for: droplet, load balancer, VPC management
}

# ============================================================================
# AWS Provider (for DigitalOcean Spaces S3 API)
# ============================================================================
# Purpose: Upload config files to DigitalOcean Spaces (zero-SSH pattern)
# Phase P3: Replace SSH provisioners with S3-compatible object storage
# Fortune 500 Compliance: Absolute zero-SSH requirement

provider "aws" {
  region = "us-east-1" # Required parameter (not used by Spaces)

  # DigitalOcean Spaces endpoint (S3-compatible API)
  endpoints {
    s3 = "https://sfo3.digitaloceanspaces.com"
  }

  # DigitalOcean Spaces specific settings
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
  skip_region_validation      = true

  # Credentials: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables
  # Same credentials used for Terraform backend state storage
  # Source: ~/.aws/credentials [default] profile or GitHub Actions secrets
}

# ============================================================================
# Credential Management (Phase P3 Zero-SSH Architecture)
# ============================================================================
# IMPORTANT: Both providers use environment variables for authentication
#
# DigitalOcean Provider:
#   - DIGITALOCEAN_TOKEN (for infrastructure management)
#   - Source: GitHub Actions secrets or local environment
#
# AWS Provider (DigitalOcean Spaces):
#   - AWS_ACCESS_KEY_ID (Spaces access key)
#   - AWS_SECRET_ACCESS_KEY (Spaces secret key)
#   - Source: ~/.aws/credentials [default] profile (canonical source of truth)
#
# Local Development:
#   export DIGITALOCEAN_TOKEN="<from-password-manager>"
#   export AWS_ACCESS_KEY_ID=$(grep aws_access_key_id ~/.aws/credentials | head -1 | cut -d'=' -f2 | xargs)
#   export AWS_SECRET_ACCESS_KEY=$(grep aws_secret_access_key ~/.aws/credentials | head -1 | cut -d'=' -f2 | xargs)
#
# GitHub Actions:
#   env:
#     DIGITALOCEAN_TOKEN: ${{ secrets.DIGITALOCEAN_TOKEN }}
#     AWS_ACCESS_KEY_ID: ${{ secrets.SPACES_ACCESS_KEY_ID }}
#     AWS_SECRET_ACCESS_KEY: ${{ secrets.SPACES_SECRET_ACCESS_KEY }}
# ============================================================================
