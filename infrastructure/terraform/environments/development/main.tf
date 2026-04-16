# ============================================================================
# Development Environment Infrastructure
# ============================================================================
# Date: 2026-02-03 (Migrated from ../../../development.tf)
# Updated: 2026-02-20 (Phase 2 - Zero-SSH alignment with staging)
# Purpose: Development environment with Zero-SSH architecture
# Pattern: S3 config-sync replaces SSH-based GitOps modules
# Resources: 2 (droplet + firewall) + 4 S3 config uploads
# ============================================================================

# ============================================================================
# Development Droplet
# ============================================================================

resource "digitalocean_droplet" "development" {
  name       = "ectropy-development"
  size       = "s-2vcpu-4gb"
  image      = "ubuntu-22-04-x64"
  region     = var.region
  ssh_keys   = var.ssh_keys
  monitoring = true
  ipv6       = true

  tags = [
    "managed-by:terraform",
    "environment:development",
    "product:ectropy",
    "role:app"
  ]

  # Zero-SSH bootstrap: templatefile renders credentials before cloud-init execution
  user_data = templatefile("${path.module}/files/cloud-init-user-data.tftpl", {
    spaces_access_key          = var.spaces_access_key_id
    spaces_secret_key          = var.spaces_secret_access_key
    docr_config_json           = var.docr_config_json
    config_sync_script_base64  = base64encode(file("${path.module}/files/config-sync.sh"))
    config_sync_service_base64 = base64encode(file("${path.module}/files/config-sync.service"))
    config_sync_timer_base64   = base64encode(file("${path.module}/files/config-sync.timer"))
  })

  lifecycle {
    prevent_destroy = false
    ignore_changes = [
      ssh_keys,  # ForceNew attribute — ignore for imported droplets
      vpc_uuid   # Cannot change after creation
    ]
  }
}

# ============================================================================
# Development Firewall (HTTP-Only — Zero-SSH)
# ============================================================================
# Security: No SSH access from internet
# Access: HTTP/HTTPS for web traffic, DigitalOcean Console for emergency
# Note: Development has no load balancer, so HTTP is open to all (unlike staging)

resource "digitalocean_firewall" "development" {
  name = "ectropy-development-firewall"

  droplet_ids = [digitalocean_droplet.development.id]

  # HTTP - Public web access
  inbound_rule {
    protocol         = "tcp"
    port_range       = "80"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  # HTTPS - Public web access
  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  # NO SSH — Zero-SSH compliance
  # Emergency access: DigitalOcean Console only

  # Allow all outbound traffic
  outbound_rule {
    protocol              = "tcp"
    port_range            = "all"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "udp"
    port_range            = "all"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "icmp"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}

# ============================================================================
# Docker Compose Upload to S3 (Zero-SSH Config Deployment)
# ============================================================================

module "development_compose_upload" {
  source = "../../modules/config-upload"

  config_file_path = "${path.module}/../../../../docker-compose.development.yml"
  config_type      = "compose"
  environment      = "development"

  spaces_bucket = var.spaces_bucket
  spaces_region = "sfo3"

  deployment_id     = "terraform-${plantimestamp()}"
  create_backup     = true
  enable_encryption = true
  max_file_size_kb  = 1024

  tags = {
    Project   = "ectropy"
    ManagedBy = "terraform"
    Purpose   = "zero-ssh-config-deployment"
  }

  depends_on = [digitalocean_droplet.development]
}

# ============================================================================
# Nginx Config Uploads to S3
# ============================================================================

module "development_nginx_main_upload" {
  source = "../../modules/config-upload"

  config_file_path = "${path.module}/../../../../infrastructure/nginx/main.conf"
  config_type      = "nginx"
  environment      = "development"

  spaces_bucket = var.spaces_bucket
  spaces_region = "sfo3"

  deployment_id     = "terraform-${plantimestamp()}"
  create_backup     = true
  enable_encryption = true
  max_file_size_kb  = 256

  tags = {
    Project   = "ectropy"
    ManagedBy = "terraform"
    Purpose   = "zero-ssh-nginx-deployment"
  }

  depends_on = [digitalocean_droplet.development]
}

module "development_nginx_site_upload" {
  source = "../../modules/config-upload"

  config_file_path = "${path.module}/../../../../infrastructure/nginx/development.conf"
  config_type      = "nginx"
  environment      = "development"

  spaces_bucket = var.spaces_bucket
  spaces_region = "sfo3"

  deployment_id     = "terraform-${plantimestamp()}"
  create_backup     = true
  enable_encryption = true
  max_file_size_kb  = 256

  tags = {
    Project   = "ectropy"
    ManagedBy = "terraform"
    Purpose   = "zero-ssh-nginx-deployment"
  }

  depends_on = [digitalocean_droplet.development]
}

# ============================================================================
# Environment Variables — Generate and Upload to S3
# ============================================================================

resource "local_file" "development_env" {
  filename = "${path.module}/.terraform-generated/.env.development"

  content = <<-ENV
NODE_ENV=development
VERSION=${var.app_version}

# Database Configuration (Managed PostgreSQL)
DATABASE_URL=postgresql://${var.database_user}:${urlencode(var.database_password)}@${var.database_host}:${var.database_port}/${var.database_name}?sslmode=require
DATABASE_HOST=${var.database_host}
DATABASE_PORT=${var.database_port}
DATABASE_NAME=${var.database_name}
DATABASE_USER=${var.database_user}
DATABASE_PASSWORD=${var.database_password}
DATABASE_SSL=true

# Authentication & Security
JWT_SECRET=${var.jwt_secret}
JWT_REFRESH_SECRET=${var.jwt_refresh_secret}
SESSION_SECRET=${var.session_secret}
GOOGLE_CLIENT_ID=${var.google_client_id}
GOOGLE_CLIENT_SECRET=${var.google_client_secret}

# Data Layer
REDIS_PASSWORD=${var.redis_password}
ENCRYPTION_KEY=${var.encryption_key}

# External APIs
MCP_API_KEY=${var.mcp_api_key}
OPENAI_API_KEY=${var.openai_api_key}

# Service URLs
API_URL=${var.api_url}
FRONTEND_URL=${var.frontend_url}

# Speckle BIM Integration
SPECKLE_SERVER_TOKEN=${var.speckle_server_token}
SPECKLE_ADMIN_PASSWORD=${var.speckle_admin_password}
SPECKLE_SESSION_SECRET=${var.speckle_session_secret}
MINIO_ACCESS_KEY=${var.minio_access_key}
MINIO_SECRET_KEY=${var.minio_secret_key}

# Infrastructure Services
RESEND_API_KEY=${var.resend_api_key}
WATCHTOWER_HTTP_API_TOKEN=${var.watchtower_http_api_token}

# Port Configuration
CONSOLE_PORT=3004
MCP_STDIO_PORT=3001

# Docker Registry Configuration
DOCR_CONFIG_JSON=${var.docr_config_json}
ENV

  file_permission = "0600"

  lifecycle {
    create_before_destroy = true
  }
}

module "development_env_upload" {
  source = "../../modules/config-upload"

  config_content  = local_file.development_env.content
  config_filename = ".env.development"
  config_type     = "env"
  environment     = "development"

  spaces_bucket = var.spaces_bucket
  spaces_region = "sfo3"

  deployment_id     = "terraform-${plantimestamp()}"
  create_backup     = true
  enable_encryption = true
  max_file_size_kb  = 100

  tags = {
    Project       = "ectropy"
    ManagedBy     = "terraform"
    Purpose       = "zero-ssh-env-deployment"
    SecurityLevel = "high"
  }

  depends_on = [
    local_file.development_env,
    digitalocean_droplet.development
  ]
}

# ============================================================================
# Outputs
# ============================================================================

output "droplet_ip" {
  description = "Development server public IP address"
  value       = digitalocean_droplet.development.ipv4_address
}

output "droplet_ipv6" {
  description = "Development server IPv6 address"
  value       = digitalocean_droplet.development.ipv6_address
}

output "droplet_id" {
  description = "Development server droplet ID"
  value       = digitalocean_droplet.development.id
}

output "firewall_id" {
  description = "Development firewall ID"
  value       = digitalocean_firewall.development.id
}

output "droplet_urn" {
  description = "Development droplet URN for DigitalOcean API"
  value       = digitalocean_droplet.development.urn
}
