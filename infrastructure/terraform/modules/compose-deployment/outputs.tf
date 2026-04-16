# ============================================================================
# Docker Compose Deployment Module - Outputs
# ============================================================================

output "compose_hash" {
  description = "SHA256 hash of deployed compose file (triggers on change)"
  value       = local.compose_file_hash
}

output "deployment_timestamp" {
  description = "Timestamp of last deployment"
  value       = timestamp()
}

output "deployment_path" {
  description = "Path where compose file was deployed on server"
  value       = var.deployment_path
}

output "compose_file" {
  description = "Source compose file path that was deployed"
  value       = var.compose_file_path
}

output "validation_config" {
  description = "Validation thresholds used for deployment verification"
  value = {
    expected_lines        = var.expected_line_count
    min_lines            = var.min_line_count
    require_speckle      = var.require_speckle
    expected_speckle     = var.expected_speckle_refs
    min_speckle          = var.min_speckle_refs
  }
}
