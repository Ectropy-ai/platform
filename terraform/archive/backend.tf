# Terraform Backend Configuration - DigitalOcean Spaces (S3-Compatible)
#
# CURRENT STATE (P0-INFRA Phase 0):
# This configuration uses DigitalOcean Spaces for remote state storage with:
# - Remote state storage in DigitalOcean Spaces (S3-compatible API)
# - Encryption at rest
# - Versioning enabled
# - CI/CD integration via GitHub Actions
#
# CRITICAL LIMITATION:
# - NO STATE LOCKING - Risk of state corruption from concurrent operations
# - Resolved in P0-INFRA Phase 2 (migration to Terraform Cloud)
#
# DigitalOcean Resources:
# - Spaces Bucket: ectropy-terraform-state (SFO3 region)
# - Spaces API Keys: Managed in DigitalOcean Control Panel
#
# Credentials Management:
# - Local Development:
#   - Environment variables: AWS_ACCESS_KEY_ID (Spaces Access Key), AWS_SECRET_ACCESS_KEY (Spaces Secret Key)
#   - Retrieve from: https://cloud.digitalocean.com/account/api/spaces
# - CI/CD:
#   - GitHub Secrets: SPACES_ACCESS_KEY_ID, SPACES_SECRET_ACCESS_KEY
#   - Mapped to: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY in workflow
#
# Usage:
#   # Configure credentials first (PowerShell):
#   $env:AWS_ACCESS_KEY_ID = "YOUR_SPACES_ACCESS_KEY"
#   $env:AWS_SECRET_ACCESS_KEY = "YOUR_SPACES_SECRET_KEY"
#
#   terraform init    # Initialize backend and download state
#   terraform plan    # Preview changes (WARNING: No state locking)
#   terraform apply   # Apply changes (WARNING: Avoid concurrent operations)
#
# Migration Plan:
# - Phase 2 of P0-INFRA deployment migrates to Terraform Cloud
# - Benefits: Built-in state locking, versioning, team collaboration, audit logs

terraform {
  backend "s3" {
    # DigitalOcean Spaces Configuration (S3-compatible)
    bucket = "ectropy-terraform-state"
    key    = "terraform-aws/terraform.tfstate"
    region = "us-east-1" # Required parameter but not used by Spaces

    # Modern endpoint configuration (replaces deprecated 'endpoint' parameter)
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
    # DigitalOcean Spaces credentials are provided via:
    # 1. Environment variables: AWS_ACCESS_KEY_ID (Spaces Access Key), AWS_SECRET_ACCESS_KEY (Spaces Secret Key)
    # 2. GitHub Actions secrets: SPACES_ACCESS_KEY_ID, SPACES_SECRET_ACCESS_KEY (mapped to AWS_* in workflows)
  }
}
