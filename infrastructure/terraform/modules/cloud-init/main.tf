# ============================================================================
# Cloud-Init Module
# ============================================================================
# Generates cloud-init user-data for automated server provisioning
# ============================================================================

terraform {
  required_version = ">= 1.0"
}

# ============================================================================
# Render cloud-init template
# ============================================================================

data "template_file" "user_data" {
  template = file("${path.module}/user-data.yaml.tpl")

  vars = {
    environment          = var.environment
    hostname             = var.hostname
    domain               = var.domain
    ssh_keys             = jsonencode(var.ssh_public_keys)
    registry             = var.docker_registry
    database_url         = var.database_url
    redis_url            = var.redis_url
    api_url              = var.api_url
    frontend_url         = var.frontend_url
    docr_token           = var.docr_token
    watchtower_token     = var.watchtower_token
    google_client_id     = var.google_client_id
    google_client_secret = var.google_client_secret
    jwt_secret           = var.jwt_secret
    jwt_refresh_secret   = var.jwt_refresh_secret
    session_secret       = var.session_secret
  }
}

# ============================================================================
# Outputs
# ============================================================================

output "user_data" {
  description = "Rendered cloud-init user-data script"
  value       = data.template_file.user_data.rendered
}

output "user_data_base64" {
  description = "Base64-encoded user-data for droplet creation"
  value       = base64encode(data.template_file.user_data.rendered)
}
