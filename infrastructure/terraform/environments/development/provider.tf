# ============================================================================
# Provider Configuration - Development Environment
# ============================================================================
# Purpose: Configure DigitalOcean and AWS (Spaces) providers for development
# Pattern: Multi-provider configuration for zero-SSH deployment
# Phase 2: Development environment Zero-SSH alignment with staging
# ============================================================================

# ============================================================================
# DigitalOcean Provider
# ============================================================================

provider "digitalocean" {
  # Credentials: DIGITALOCEAN_TOKEN environment variable
}

# ============================================================================
# AWS Provider (for DigitalOcean Spaces S3 API)
# ============================================================================
# Purpose: Upload config files to DigitalOcean Spaces (zero-SSH pattern)

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
  # Source: ~/.aws/credentials [default] profile or GitHub Actions secrets
}
