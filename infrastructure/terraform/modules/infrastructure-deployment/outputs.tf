# ============================================================================
# Infrastructure Deployment Module - Outputs
# ============================================================================
# Root Cause: #156 - Infrastructure config deployment via Terraform GitOps
# Pattern: Output hash and metadata for change tracking
# ============================================================================

output "config_hash" {
  description = "SHA256 hash of deployed infrastructure configs (for change detection)"
  value       = local.config_hash
}

output "deployment_timestamp" {
  description = "Timestamp of infrastructure config deployment"
  value       = local.deployment_timestamp
}

output "deployment_path" {
  description = "Path where infrastructure configs were deployed"
  value       = var.deployment_path
}

output "files_deployed" {
  description = "List of infrastructure config files deployed"
  value = [
    "${var.deployment_path}/infrastructure/nginx/main.conf",
    "${var.deployment_path}/infrastructure/nginx/${local.site_config_filename}"
  ]
}

output "environment" {
  description = "Environment these configs were deployed for"
  value       = var.environment
}
