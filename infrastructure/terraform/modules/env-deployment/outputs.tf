# ============================================================================
# Environment File Deployment Module - Outputs
# ============================================================================

output "env_hash" {
  description = "SHA256 hash of deployed environment variables (triggers on change)"
  value       = local.env_content_hash
}

output "deployment_timestamp" {
  description = "Timestamp of last deployment"
  value       = timestamp()
}

output "deployment_path" {
  description = "Path where .env file was deployed on server"
  value       = var.deployment_path
}

output "environment_variables_count" {
  description = "Number of environment variables deployed"
  value       = 25  # Current count of environment variables
}

output "validation_config" {
  description = "Validation thresholds used for deployment verification"
  value = {
    expected_lines = var.expected_line_count
    min_lines      = var.min_line_count
  }
}
