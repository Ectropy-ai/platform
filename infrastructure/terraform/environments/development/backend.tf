# ============================================================================
# Terraform Backend Configuration - Development Environment
# ============================================================================
# Purpose: Isolated remote state storage for development environment
# Pattern: Separate state per environment (industry best practice)
# ============================================================================

terraform {
  required_version = ">= 1.5"

  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket = "ectropy-terraform-state"
    key    = "environments/development/terraform.tfstate"
    region = "us-east-1"

    endpoints = {
      s3 = "https://sfo3.digitaloceanspaces.com"
    }

    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_requesting_account_id  = true
    skip_region_validation      = true

    encrypt = true

    # Credentials: AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY env vars
    # Source: ~/.aws/credentials [default] profile or GitHub Actions secrets
  }
}

# Note: No state locking — DigitalOcean Spaces doesn't support it.
# CI/CD runs sequentially. Never run concurrent terraform apply operations.
