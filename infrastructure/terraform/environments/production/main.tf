# ============================================================================
# Production Environment Infrastructure - Isolated State
# ============================================================================
# Date: 2026-02-04 (Migrated from ../../production-rebuild.tf + vpc-isolation-production.tf)
# Purpose: Production environment with full VPC isolation + blue-green deployment
# Pattern: Isolated state per environment (enterprise best practice)
# Resources: 12 (4 droplets, 2 firewalls, 1 LB, 4 reserved IPs, 1 VPC module)
# Root Cause: #165 - Multi-environment single state migration
# ============================================================================

# ============================================================================
# Production VPC Module (ROOT CAUSE #80 - Network Isolation)
# ============================================================================
# Purpose: Dedicated isolated VPC for production environment
# CIDR: 10.10.0.0/20 (non-overlapping with staging 10.20.0.0/20, dev 10.30.0.0/20)
# Security: Zero cross-environment connectivity, SOC 2/ISO 27001/PCI DSS compliance

module "production_vpc" {
  source = "../../../../terraform/modules/vpc"

  project_name = var.project_name
  environment  = "production"
  region       = var.production_region
  ip_range     = "10.10.0.0/20" # Matches existing VPC (imported from manual creation 2026-01-21)

  description = "Isolated VPC for Ectropy production environment - enterprise security boundary"

  # VPC Peering: Disabled for maximum isolation
  enable_peering = false
  peering_vpc_id = ""

  # Timeout configuration
  delete_timeout = "5m"
}

# ============================================================================
# OLD Production Droplets (Currently Active - Serving Traffic)
# ============================================================================
# Status: These droplets are CURRENTLY SERVING PRODUCTION TRAFFIC

# ============================================================================
# NEW VPC-Isolated Production Droplets (Migration Target)
# ============================================================================
# Status: Created but NOT YET SERVING TRAFFIC
# VPC: ectropy-production-vpc (10.10.0.0/20) - ISOLATED
# Strategy: Deploy application here, then switch load balancer
# Load Balancer: Will be added during Phase 4.5 (blue-green cutover)
# ============================================================================

# ----------------------------------------------------------------------------
# Blue Production Server (NEW - VPC Isolated)
# ----------------------------------------------------------------------------
resource "digitalocean_droplet" "production_blue_isolated" {
  name       = "ectropy-production-blue-isolated"
  size       = var.production_size # c2-4vcpu-8gb (Dedicated CPU)
  image      = "ubuntu-22-04-x64"
  region     = var.production_region
  ssh_keys   = var.ssh_keys
  monitoring = true
  ipv6       = true

  # CRITICAL: Assign to production VPC for network isolation
  vpc_uuid = module.production_vpc.id

  tags = [
    "managed-by:terraform",
    "environment:production",
    "product:ectropy",
    "role:app",
    "blue-green",
    "blue",
    "vpc-isolated",
    "dedicated-cpu"
  ]

  # ============================================================================
  # ENTERPRISE PATTERN: Terraform templatefile() for guaranteed variable substitution
  # ============================================================================
  # ROOT CAUSE FIX: Inline heredoc cloud-init never executed on production droplets
  # (created 2026-02-02). Replaced with templatefile() + .tftpl to match staging.
  # Pattern: Terraform renders template with actual values BEFORE cloud-init execution
  # Includes: Docker, Docker Compose, awscli, config-sync systemd service, DOCR auth
  # Reference: FIVE_WHY_DEPLOY_WORKFLOW_ARCHITECTURE_FIX_2026-03-05.json (F8-F11)
  # ============================================================================
  user_data = templatefile("${path.module}/files/cloud-init-user-data.tftpl", {
    spaces_access_key          = var.spaces_access_key_id
    spaces_secret_key          = var.spaces_secret_access_key
    docr_config_json           = var.docr_config_json
    config_sync_script_base64  = base64encode(file("${path.module}/files/config-sync.sh"))
    config_sync_service_base64 = base64encode(file("${path.module}/files/config-sync.service"))
    config_sync_timer_base64   = base64encode(file("${path.module}/files/config-sync.timer"))
  })

  lifecycle {
    create_before_destroy = true
    prevent_destroy       = false # Will be set to true after cutover
    ignore_changes = [
      user_data, # Ignore user_data changes after initial creation
      ssh_keys,  # ROOT CAUSE #163: ForceNew attribute, API doesn't return
      vpc_uuid   # VPC assignment cannot be changed after creation
    ]
  }
}

# ----------------------------------------------------------------------------
# Green Production Server (NEW - VPC Isolated)
# ----------------------------------------------------------------------------
resource "digitalocean_droplet" "production_green_isolated" {
  name       = "ectropy-production-green-isolated"
  size       = var.production_size # c2-4vcpu-8gb (Dedicated CPU)
  image      = "ubuntu-22-04-x64"
  region     = var.production_region
  ssh_keys   = var.ssh_keys
  monitoring = true
  ipv6       = true

  # CRITICAL: Assign to production VPC for network isolation
  vpc_uuid = module.production_vpc.id

  tags = [
    "managed-by:terraform",
    "environment:production",
    "product:ectropy",
    "role:app",
    "blue-green",
    "green",
    "vpc-isolated",
    "dedicated-cpu"
  ]

  # Same templatefile() pattern as blue droplet
  user_data = templatefile("${path.module}/files/cloud-init-user-data.tftpl", {
    spaces_access_key          = var.spaces_access_key_id
    spaces_secret_key          = var.spaces_secret_access_key
    docr_config_json           = var.docr_config_json
    config_sync_script_base64  = base64encode(file("${path.module}/files/config-sync.sh"))
    config_sync_service_base64 = base64encode(file("${path.module}/files/config-sync.service"))
    config_sync_timer_base64   = base64encode(file("${path.module}/files/config-sync.timer"))
  })

  lifecycle {
    create_before_destroy = true
    prevent_destroy       = false # Will be set to true after cutover
    ignore_changes = [
      user_data, # Ignore user_data changes after initial creation
      ssh_keys,  # ROOT CAUSE #163: ForceNew attribute, API doesn't return
      vpc_uuid   # VPC assignment cannot be changed after creation
    ]
  }
}

# ============================================================================
# SSL Certificate Management — Cloudflare Origin Certificate
# ============================================================================
# ENTERPRISE ARCHITECTURE: Cloudflare Full (Strict) + Origin Certificate
#
#   Client → Cloudflare HTTPS (Universal SSL) → HTTPS:443 → LB (Origin Cert) → HTTP:80 → nginx
#
# Origin Certificate:
#   - Issued by Cloudflare Origin CA (15-year validity, wildcard)
#   - Covers: *.ectropy.ai + ectropy.ai
#   - Stored in GitHub Secrets: CF_ORIGIN_KEY + CF_ORIGIN_CERT
#   - Passed to Terraform via TF_VAR_ssl_cert_private_key + TF_VAR_ssl_cert_leaf
#   - Uploaded to DigitalOcean as custom certificate → LB HTTPS termination
#
# SSL Mode: Full (Strict)
#   - Cloudflare validates Origin CA cert on the LB (end-to-end encryption)
#   - SOC 2 / PCI DSS / HIPAA compliant (no unencrypted origin traffic)
#
# Root Cause: ectropy-prod-cert (Let's Encrypt) expired 2026-02-17
#   LE cannot auto-renew on Cloudflare-proxied domains (HTTP-01 challenge fails)
#   Replaced with Origin Certificate pattern (same as staging, validated 2026-02-19)
#
# Fallback: If cert data not provided → LB runs HTTP-only, HTTPS forwarding
#   rule is skipped. Set ssl_certificate_name for existing DO cert by name.
#
# Evidence: FIVE_WHY_PRODUCTION_521_CLOUDFLARE_ORIGIN_2026-03-07.json
# ============================================================================

locals {
  # ENTERPRISE FIX: Explicit cert name takes priority over PEM upload
  # The Cloudflare Origin Certificate is account-level in DO — same wildcard cert
  # (*.ectropy.ai) may already exist from another environment. When ssl_certificate_name
  # is set, reference the existing cert instead of creating a duplicate (DO 422 error).
  use_existing_cert = var.ssl_certificate_name != ""
  has_custom_cert   = !local.use_existing_cert && var.ssl_cert_private_key != "" && var.ssl_cert_leaf != ""
  has_any_cert      = local.has_custom_cert || local.use_existing_cert

  # null when no cert available — HTTPS forwarding rule is skipped
  active_cert_name = (
    local.use_existing_cert ? var.ssl_certificate_name :
    local.has_custom_cert ? digitalocean_certificate.production_origin[0].name :
    null
  )
}

# Cloudflare Origin Certificate uploaded to DigitalOcean
# Created when GitHub Secrets CF_ORIGIN_KEY + CF_ORIGIN_CERT are configured
resource "digitalocean_certificate" "production_origin" {
  count = local.has_custom_cert ? 1 : 0

  name              = "ectropy-production-origin-${substr(sha256(var.ssl_cert_leaf), 0, 8)}"
  type              = "custom"
  private_key       = var.ssl_cert_private_key
  leaf_certificate  = var.ssl_cert_leaf
  certificate_chain = var.ssl_cert_chain != "" ? var.ssl_cert_chain : null

  lifecycle {
    create_before_destroy = true
  }
}

# ============================================================================
# Production Load Balancer
# ============================================================================
# Current State: Points to VPC-isolated droplets (blue-green)
# Phase 4.5: Cutover complete — routing to VPC-isolated droplets

resource "digitalocean_loadbalancer" "production" {
  name     = "ectropy-production-lb-v2"
  region   = var.production_region
  vpc_uuid = module.production_vpc.id # ROOT CAUSE #183: LB must be in NEW VPC

  # HTTPS forwarding (active when Origin Certificate is configured)
  # Cloudflare Full (Strict) sends HTTPS to origin — LB terminates TLS with Origin Cert
  dynamic "forwarding_rule" {
    for_each = local.has_any_cert ? [1] : []
    content {
      entry_protocol   = "https"
      entry_port       = 443
      target_protocol  = "http"
      target_port      = 80
      certificate_name = local.active_cert_name
    }
  }

  # HTTP forwarding
  forwarding_rule {
    entry_protocol  = "http"
    entry_port      = 80
    target_protocol = "http"
    target_port     = 80
  }

  # Health check configuration
  healthcheck {
    protocol                 = "http"
    port                     = 80
    path                     = "/lb-health"
    check_interval_seconds   = 10
    response_timeout_seconds = 5
    unhealthy_threshold      = 3
    healthy_threshold        = 2
  }

  # PHASE 4.5 CUTOVER: Tag-based targeting — LB auto-discovers droplets
  droplet_tag = "environment:production"

  # Match staging: 300s idle timeout for long-running API operations
  http_idle_timeout_seconds = 300

  # Sticky sessions for consistent user experience
  sticky_sessions {
    type               = "cookies"
    cookie_name        = "lb_session"
    cookie_ttl_seconds = 3600
  }
}

# ============================================================================
# Firewall for OLD Production Servers
# ============================================================================
# Status: Active firewall for currently serving droplets
# Will be decommissioned after Phase 4.6 (cleanup old infrastructure)

resource "digitalocean_firewall" "production" {
  name = "ectropy-production-firewall-v2"

  droplet_ids = [
    digitalocean_droplet.production_blue_isolated.id,
    digitalocean_droplet.production_green_isolated.id
  ]

  # ENTERPRISE SECURITY: SSH restricted to deployment infrastructure only
  inbound_rule {
    protocol   = "tcp"
    port_range = "22"
    source_addresses = [
      "143.198.154.94/32",  # Staging server (for deployment scripts)
      "165.232.132.224/32", # Self-hosted runner (GitHub Actions deployments)
    ]
  }

  # Allow HTTP from load balancer
  inbound_rule {
    protocol                  = "tcp"
    port_range                = "3000"
    source_load_balancer_uids = [digitalocean_loadbalancer.production.id]
  }

  # Allow all outbound traffic
  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "udp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "icmp"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}

# ============================================================================
# Firewall for VPC-Isolated Production Servers
# ============================================================================
# Status: Active firewall for isolated droplets
# CRITICAL FIX: Corrected VPC CIDR from 10.100.0.0/20 to 10.10.0.0/20

resource "digitalocean_firewall" "production_isolated" {
  name = "ectropy-production-firewall-vpc-isolated"

  droplet_ids = [
    digitalocean_droplet.production_blue_isolated.id,
    digitalocean_droplet.production_green_isolated.id
  ]

  # ENTERPRISE SECURITY: SSH restricted to deployment infrastructure only
  inbound_rule {
    protocol   = "tcp"
    port_range = "22"
    source_addresses = [
      "165.232.132.224/32", # Self-hosted runner (GitHub Actions deployments)
    ]
  }

  # HTTP from load balancer
  inbound_rule {
    protocol                  = "tcp"
    port_range                = "80"
    source_load_balancer_uids = [digitalocean_loadbalancer.production.id]
  }

  # Application port from load balancer
  inbound_rule {
    protocol                  = "tcp"
    port_range                = "3000"
    source_load_balancer_uids = [digitalocean_loadbalancer.production.id]
  }

  # CRITICAL FIX: Corrected CIDR from 10.100.0.0/20 to 10.10.0.0/20
  # Allow traffic within production VPC only (10.10.0.0/20)
  inbound_rule {
    protocol         = "tcp"
    port_range       = "1-65535"
    source_addresses = ["10.10.0.0/20"] # FIXED: was 10.100.0.0/20
  }

  inbound_rule {
    protocol         = "udp"
    port_range       = "1-65535"
    source_addresses = ["10.10.0.0/20"] # FIXED: was 10.100.0.0/20
  }

  # Allow all outbound traffic (for external APIs, package updates, etc.)
  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "udp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "icmp"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}


# ============================================================================
# Reserved IPs for VPC-Isolated Production Servers
# ============================================================================
# Status: Active reserved IPs for isolated droplets

resource "digitalocean_reserved_ip" "production_blue_isolated" {
  region     = var.production_region
  droplet_id = digitalocean_droplet.production_blue_isolated.id
}

resource "digitalocean_reserved_ip" "production_green_isolated" {
  region     = var.production_region
  droplet_id = digitalocean_droplet.production_green_isolated.id
}

# ============================================================================
# Zero-SSH Config Upload Modules (Replaces SSH-based GitOps)
# ============================================================================
# ARCHITECTURE FIX: Replaced 6 SSH-based deployment modules with 4 S3 uploads
# Pattern: Upload to S3, config-sync systemd service pulls to droplet
# Reference: FIVE_WHY_DEPLOY_WORKFLOW_ARCHITECTURE_FIX_2026-03-05.json (F8-F11)
# Parity: Matches staging config-upload pattern (established 2026-02-16)
# ============================================================================

# ============================================================================
# Docker Compose Upload to S3
# ============================================================================

module "production_compose_upload" {
  source = "../../../../terraform/modules/config-upload"

  config_file_path = "${path.module}/../../../../docker-compose.deploy.yml"
  config_type      = "compose"
  environment      = "production"

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

  depends_on = [
    digitalocean_droplet.production_blue_isolated,
    digitalocean_droplet.production_green_isolated
  ]
}

# ============================================================================
# Nginx Config Upload to S3
# ============================================================================

module "production_nginx_main_upload" {
  source = "../../../../terraform/modules/config-upload"

  config_file_path = "${path.module}/../../../../infrastructure/nginx/main.conf"
  config_type      = "nginx"
  environment      = "production"

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

  depends_on = [
    digitalocean_droplet.production_blue_isolated,
    digitalocean_droplet.production_green_isolated
  ]
}

module "production_nginx_site_upload" {
  source = "../../../../terraform/modules/config-upload"

  config_file_path = "${path.module}/../../../../infrastructure/nginx/ectropy-production.conf"
  config_type      = "nginx"
  environment      = "production"

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

  depends_on = [
    digitalocean_droplet.production_blue_isolated,
    digitalocean_droplet.production_green_isolated
  ]
}

# ============================================================================
# Environment Variables Generation + Upload to S3
# ============================================================================
# Pattern: Generate .env locally → Upload to S3 → config-sync pulls to droplet

resource "local_file" "production_env" {
  filename = "${path.module}/.terraform-generated/.env.production"

  content = <<-ENV
NODE_ENV=production
VERSION=${var.app_version}

# Database Configuration (Managed PostgreSQL)
DATABASE_URL=postgresql://doadmin:${urlencode(var.database_password)}@${var.database_host}:${var.database_port}/${var.database_name}?sslmode=require
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
SPECKLE_PUBLIC_URL=https://ectropy.ai/speckle
MINIO_ACCESS_KEY=${var.minio_access_key}
MINIO_SECRET_KEY=${var.minio_secret_key}

# Speckle PostgreSQL — Managed DO Database (DEC-019)
# All Speckle services connect to managed cluster with SSL
# Eliminates local Docker postgres — survives droplet replacement
POSTGRES_URL=${var.database_host}:${var.database_port}
POSTGRES_USER=doadmin
POSTGRES_PASSWORD=${var.database_password}
POSTGRES_DB=speckle
POSTGRES_PORT=${var.database_port}
PGSSLMODE=require
PG_CONNECTION_STRING=postgres://doadmin:${urlencode(var.database_password)}@${var.database_host}:${var.database_port}/speckle?sslmode=require
FILEIMPORT_QUEUE_POSTGRES_URL=postgres://doadmin:${urlencode(var.database_password)}@${var.database_host}:${var.database_port}/speckle?sslmode=require

# Infrastructure Services
RESEND_API_KEY=${var.resend_api_key}
WATCHTOWER_HTTP_API_TOKEN=${var.watchtower_http_api_token}

# Port Configuration
CONSOLE_PORT=3004
MCP_STDIO_PORT=3001

# Docker Registry Configuration (DOCR Authentication)
DOCR_CONFIG_JSON=${var.docr_config_json}

# Multi-Database Architecture (DatabaseManager)
PLATFORM_DATABASE_URL=${var.platform_database_url}
SHARED_DATABASE_URL=${var.shared_database_url}

# CRM Integration (Twenty CRM at crm.luh.tech)
CRM_ENABLED=${var.crm_enabled}
CRM_API_URL=${var.crm_api_url}
CRM_API_KEY=${var.crm_api_key}
CRM_WEBHOOK_SECRET=${var.crm_webhook_secret}
ENV

  file_permission = "0600"

  lifecycle {
    create_before_destroy = true

    precondition {
      condition     = var.jwt_secret != var.jwt_refresh_secret
      error_message = "JWT_SECRET and JWT_REFRESH_SECRET must be different values. Using the same value for both is a security vulnerability."
    }
  }
}

# Upload .env file to DigitalOcean Spaces (zero-SSH pattern)
module "production_env_upload" {
  source = "../../../../terraform/modules/config-upload"

  config_content  = local_file.production_env.content
  config_filename = ".env.production"
  config_type     = "env"
  environment     = "production"

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
    local_file.production_env,
    digitalocean_droplet.production_blue_isolated,
    digitalocean_droplet.production_green_isolated
  ]
}
# ============================================================================
# Outputs
# ============================================================================


output "production_blue_id" {
  description = "Blue server droplet ID (OLD - currently active)"
  value       = digitalocean_droplet.production_blue_isolated.id
}

output "production_green_id" {
  description = "Green server droplet ID (OLD - currently active)"
  value       = digitalocean_droplet.production_green_isolated.id
}

# VPC-Isolated Droplet Outputs
output "production_blue_isolated_ip" {
  description = "Blue isolated server public IP address"
  value       = digitalocean_droplet.production_blue_isolated.ipv4_address
}

output "production_blue_isolated_private_ip" {
  description = "Blue isolated server private IP (VPC)"
  value       = digitalocean_droplet.production_blue_isolated.ipv4_address_private
}

output "production_green_isolated_ip" {
  description = "Green isolated server public IP address"
  value       = digitalocean_droplet.production_green_isolated.ipv4_address
}

output "production_green_isolated_private_ip" {
  description = "Green isolated server private IP (VPC)"
  value       = digitalocean_droplet.production_green_isolated.ipv4_address_private
}

# Load Balancer Outputs
output "load_balancer_ip" {
  description = "Load balancer IP address"
  value       = digitalocean_loadbalancer.production.ip
}

output "load_balancer_id" {
  description = "Load balancer ID"
  value       = digitalocean_loadbalancer.production.id
}

output "production_certificate_name" {
  description = "Production SSL certificate name (null if no cert configured)"
  value       = local.active_cert_name
  sensitive   = true
}

output "production_certificate_strategy" {
  description = "Which SSL cert strategy is active"
  value       = local.has_custom_cert ? "cloudflare-origin-cert" : local.use_existing_cert ? "existing-${var.ssl_certificate_name}" : "no-cert-http-only"
  sensitive   = true
}

# VPC Outputs
output "production_vpc_id" {
  description = "Production VPC ID for network isolation"
  value       = module.production_vpc.id
}

output "production_vpc_name" {
  description = "Production VPC name"
  value       = module.production_vpc.name
}

output "production_vpc_ip_range" {
  description = "Production VPC CIDR block (10.10.0.0/20)"
  value       = module.production_vpc.ip_range
}

output "production_vpc_region" {
  description = "Production VPC region"
  value       = module.production_vpc.region
}


output "production_blue_isolated_reserved_ip" {
  description = "Blue isolated server reserved IP"
  value       = digitalocean_reserved_ip.production_blue_isolated.ip_address
}

output "production_green_isolated_reserved_ip" {
  description = "Green isolated server reserved IP"
  value       = digitalocean_reserved_ip.production_green_isolated.ip_address
}
