# ============================================================================
# Config Upload Module - Outputs
# ============================================================================
# Purpose: Expose deployment metadata for monitoring and integration
# ============================================================================

output "compose_file_etag" {
  description = "ETag (SHA256 hash) of the uploaded docker-compose.yml file"
  value       = aws_s3_object.compose_file.etag
}

output "env_file_etag" {
  description = "ETag (SHA256 hash) of the uploaded .env file"
  value       = aws_s3_object.env_file.etag
  sensitive   = true
}

output "deployment_hash" {
  description = "Combined hash of both configuration files for change detection"
  value       = local.deployment_hash
}

output "compose_s3_key" {
  description = "S3 object key for docker-compose.yml (used by config-sync.sh)"
  value       = aws_s3_object.compose_file.key
}

output "env_s3_key" {
  description = "S3 object key for .env file (used by config-sync.sh)"
  value       = aws_s3_object.env_file.key
}

output "compose_s3_uri" {
  description = "Full S3 URI for docker-compose.yml"
  value       = "s3://${var.bucket_name}/${aws_s3_object.compose_file.key}"
}

output "env_s3_uri" {
  description = "Full S3 URI for .env file"
  value       = "s3://${var.bucket_name}/${aws_s3_object.env_file.key}"
  sensitive   = true
}

output "deployment_lock_created" {
  description = "Whether deployment lock was created (prevents config-sync during Terraform apply)"
  value       = var.create_deployment_lock
}

output "deployment_metadata" {
  description = "Comprehensive deployment metadata for monitoring"
  value = {
    environment       = var.environment
    compose_hash      = local.compose_hash
    env_hash          = local.env_hash
    deployment_hash   = local.deployment_hash
    compose_s3_key    = aws_s3_object.compose_file.key
    env_s3_key        = aws_s3_object.env_file.key
    bucket_name       = var.bucket_name
    deployment_locked = var.create_deployment_lock
  }
  sensitive = true
}
