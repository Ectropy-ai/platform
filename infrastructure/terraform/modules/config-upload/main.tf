# ============================================================================
# Config Upload Module - Zero-SSH Configuration Deployment
# ============================================================================
# Purpose: Upload docker-compose.yml and .env to DigitalOcean Spaces S3
# Pattern: Droplet pulls configs via config-sync.service (no SSH required)
# Phase: P3 Zero-SSH Terraform Strategy (Fortune 500 compliance)
# ============================================================================

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# ============================================================================
# Local Variables
# ============================================================================

locals {
  # S3 object keys (must match config-sync.sh expectations)
  compose_key = "${var.environment}/compose/${var.compose_filename}"
  env_key     = "${var.environment}/env/${var.env_filename}"

  # Content hashes for change detection
  compose_hash = sha256(var.compose_content)
  env_hash     = sha256(var.env_content)

  # Combined hash for deployment tracking
  deployment_hash = sha256("${local.compose_hash}-${local.env_hash}")
}

# ============================================================================
# Upload docker-compose.yml to S3
# ============================================================================

resource "aws_s3_object" "compose_file" {
  bucket = var.bucket_name
  key    = local.compose_key

  # Content and metadata
  content      = var.compose_content
  content_type = "application/x-yaml"
  etag         = local.compose_hash

  # Metadata for tracking
  metadata = {
    "deployment-hash" = local.deployment_hash
    "uploaded-at"     = timestamp()
    "environment"     = var.environment
    "terraform"       = "true"
  }

  # Lifecycle management
  lifecycle {
    create_before_destroy = true
  }
}

# ============================================================================
# Upload .env file to S3
# ============================================================================

resource "aws_s3_object" "env_file" {
  bucket = var.bucket_name
  key    = local.env_key

  # Content and metadata
  content      = var.env_content
  content_type = "text/plain"
  etag         = local.env_hash

  # Metadata for tracking
  metadata = {
    "deployment-hash" = local.deployment_hash
    "uploaded-at"     = timestamp()
    "environment"     = var.environment
    "terraform"       = "true"
    "sensitive"       = "true"
  }

  # Security: Server-side encryption
  server_side_encryption = "AES256"

  # Lifecycle management
  lifecycle {
    create_before_destroy = true
  }
}

# ============================================================================
# Deployment Lock File (prevents config-sync during CI/CD deployment)
# ============================================================================

resource "aws_s3_object" "deployment_lock" {
  count = var.create_deployment_lock ? 1 : 0

  bucket = var.bucket_name
  key    = "${var.environment}/.deployment.lock"

  # Lock content with metadata
  content      = jsonencode({
    locked_at        = timestamp()
    deployment_hash  = local.deployment_hash
    terraform        = true
    reason           = "Terraform deployment in progress"
  })
  content_type = "application/json"

  # Metadata
  metadata = {
    "lock-type"  = "deployment"
    "created-by" = "terraform"
  }

  # Lifecycle: Always recreate on apply
  lifecycle {
    create_before_destroy = true
  }
}

# ============================================================================
# Wait for config-sync to pull (optional trigger)
# ============================================================================

# Null resource to trigger config-sync poll detection
resource "null_resource" "config_sync_trigger" {
  count = var.wait_for_sync ? 1 : 0

  # Triggers on content changes
  triggers = {
    compose_hash    = local.compose_hash
    env_hash        = local.env_hash
    deployment_hash = local.deployment_hash
  }

  # Optional: Could add a provisioner to remove deployment lock after delay
  # This allows config-sync.timer (60s poll) to detect changes

  depends_on = [
    aws_s3_object.compose_file,
    aws_s3_object.env_file,
    aws_s3_object.deployment_lock
  ]
}
