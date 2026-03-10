# terraform/modules/config-upload/main.tf
# PHASE P3: Zero-SSH Config Upload Module
# Purpose: Upload config files to DigitalOcean Spaces instead of SSH deployment
# Fortune 500 Compliance: Absolute zero-SSH architecture

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Local variables for metadata and validation (ROOT CAUSE #4 FIX)
locals {
  # Determine if using file path or direct content
  using_file_path = var.config_file_path != null
  using_content   = var.config_content != null

  # Get content from either source
  file_content = local.using_content ? var.config_content : (
    local.using_file_path ? try(file(var.config_file_path), null) : null
  )
  file_exists = local.file_content != null

  # SHA256 hash of file content for change detection (GitOps trigger)
  content_hash = local.file_exists ? sha256(local.file_content) : ""

  # S3 object key with environment prefix for multi-environment support
  # Use config_filename if using direct content, otherwise extract from file path
  object_key = "${var.environment}/${var.config_type}/${
    local.using_content ? var.config_filename : basename(var.config_file_path)
  }"

  # Metadata for audit trail and troubleshooting
  metadata = {
    environment    = var.environment
    config_type    = var.config_type
    content_hash   = local.content_hash
    uploaded_by    = "terraform"
    deployment_id  = var.deployment_id
    terraform_run  = timestamp()
    input_method   = local.using_content ? "direct_content" : "file_path"
  }
}

# Validation: Ensure either config_file_path OR config_content provided (ROOT CAUSE #4 FIX)
resource "null_resource" "validate_input" {
  lifecycle {
    precondition {
      condition     = (local.using_file_path && !local.using_content) || (!local.using_file_path && local.using_content)
      error_message = "Must provide exactly ONE of: config_file_path OR (config_content + config_filename). Got: config_file_path=${var.config_file_path != null}, config_content=${nonsensitive(var.config_content != null)}"
    }

    precondition {
      condition     = !local.using_content || var.config_filename != null
      error_message = "config_filename is required when using config_content (config_content provided=${nonsensitive(var.config_content != null)})"
    }

    precondition {
      condition     = local.file_exists
      error_message = local.using_file_path ? "Config file does not exist: ${var.config_file_path}" : "Config content is empty or null (content provided=${nonsensitive(var.config_content != null)})"
    }
  }
}

# Upload config file to DigitalOcean Spaces (S3-compatible)
# Replaces: provisioner "file" { source = "..." destination = "..." }
# Zero-SSH: Droplet pulls from Spaces via systemd service
resource "aws_s3_object" "config_file" {
  depends_on = [null_resource.validate_input]

  bucket  = var.spaces_bucket
  key     = local.object_key
  content = local.file_content

  # Content type based on config type
  content_type = var.config_type == "env" ? "text/plain" : (
    var.config_type == "compose" ? "application/x-yaml" : "application/octet-stream"
  )

  # ETag for change detection (S3 native)
  etag = md5(local.file_content)

  # Metadata for audit trail (visible in S3 console and API)
  metadata = local.metadata

  # Server-side encryption (Fortune 500 compliance requirement)
  server_side_encryption = var.enable_encryption ? "AES256" : null

  # Tags for cost tracking and compliance
  tags = merge(
    var.tags,
    {
      Name           = "${var.environment}-${var.config_type}"
      Environment    = var.environment
      ConfigType     = var.config_type
      ContentHash    = local.content_hash
      ManagedBy      = "terraform"
      ComplianceRole = "zero-ssh-config-deployment"
    }
  )

  lifecycle {
    # REMOVED create_before_destroy (ROOT CAUSE: S3 key collision)
    # With same S3 key, create_before_destroy causes:
    #   1. Create new object at staging/nginx/foo.conf
    #   2. Old object becomes "deposed" with same key
    #   3. Destroy deposed object → DELETES the new object too!
    # S3 objects are atomic, so destroy-then-create is safe.
    # Backup is already created separately via config_backup resource.

    # Ignore metadata changes from external sources
    ignore_changes = [
      metadata["terraform_run"]
    ]

    # Trigger replacement on content hash change (GitOps pattern)
    replace_triggered_by = [
      null_resource.content_hash_trigger
    ]
  }
}

# Content hash trigger for GitOps change detection
# Ensures Terraform detects config changes even if file timestamp unchanged
resource "null_resource" "content_hash_trigger" {
  triggers = {
    content_hash  = local.content_hash
    config_type   = var.config_type
    environment   = var.environment
  }
}

# Optional: Create backup of previous version before deployment (ROOT CAUSE #4 FIX)
# Uses S3 versioning + explicit backup for compliance audit trail
resource "aws_s3_object" "config_backup" {
  count = var.create_backup ? 1 : 0

  depends_on = [aws_s3_object.config_file]

  bucket = var.spaces_bucket
  # Use config_filename if using direct content, otherwise extract from file path
  key = "${var.environment}/backups/${var.config_type}/${
    local.using_content ? var.config_filename : basename(var.config_file_path)
  }.${formatdate("YYYYMMDD-HHmmss", timestamp())}"
  content = local.file_content

  content_type = aws_s3_object.config_file.content_type
  etag         = aws_s3_object.config_file.etag

  metadata = merge(
    local.metadata,
    {
      backup_reason = "pre-deployment-backup"
      original_key  = local.object_key
    }
  )

  server_side_encryption = var.enable_encryption ? "AES256" : null

  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-${var.config_type}-backup"
      Environment = var.environment
      ConfigType  = var.config_type
      BackupDate  = formatdate("YYYY-MM-DD", timestamp())
      ManagedBy   = "terraform"
    }
  )

  lifecycle {
    ignore_changes = [
      content,
      etag,
      metadata
    ]
  }
}

# Validation: Check file size constraints (prevent accidental large file uploads)
resource "null_resource" "validate_file_size" {
  count = var.max_file_size_kb > 0 ? 1 : 0

  depends_on = [aws_s3_object.config_file]

  triggers = {
    file_size = length(local.file_content)
  }

  lifecycle {
    precondition {
      condition     = length(local.file_content) <= var.max_file_size_kb * 1024
      error_message = "Config file exceeds maximum size: ${length(local.file_content)} bytes > ${var.max_file_size_kb}KB"
    }
  }
}

# Output S3 object URL for droplet config-sync service
# Droplet systemd service will pull from this URL periodically
output "s3_object_url" {
  description = "Full S3 URL for config file (used by droplet config-sync service)"
  value       = "s3://${var.spaces_bucket}/${local.object_key}"
}

output "https_url" {
  description = "HTTPS URL for config file (DO Spaces CDN endpoint)"
  value       = "https://${var.spaces_bucket}.${var.spaces_region}.digitaloceanspaces.com/${local.object_key}"
}

output "content_hash" {
  description = "SHA256 hash of config file content (GitOps change detection)"
  value       = local.content_hash
}

output "deployment_timestamp" {
  description = "Timestamp of config file deployment"
  value       = timestamp()
}

output "backup_created" {
  description = "Whether backup was created before deployment"
  value       = var.create_backup
}

output "backup_key" {
  description = "S3 key of backup file (if created)"
  value       = var.create_backup ? aws_s3_object.config_backup[0].key : null
}
