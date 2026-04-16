# ============================================================================
# Staging Environment Infrastructure - Isolated State
# ============================================================================
# Date: 2026-02-03 (Migrated from ../../staging.tf)
# Purpose: Production-like environment with full VPC isolation
# Pattern: Isolated state per environment (enterprise best practice)
# Resources: 6 (VPC + droplet + load balancer + 3 GitOps modules)
# Root Cause: #165 - Multi-environment single state migration
# ============================================================================

# ============================================================================
# Staging VPC Module (ROOT CAUSE #80 - Network Isolation)
# ============================================================================
# Purpose: Dedicated isolated VPC for staging environment
# CIDR: 10.20.0.0/20 (non-overlapping with production 10.10.0.0/20)
# Security: Zero cross-environment connectivity

module "staging_vpc" {
  source = "../../modules/vpc"

  project_name = var.project_name
  environment  = "staging"
  region       = var.production_region
  ip_range     = "10.20.0.0/20" # Matches existing VPC (imported from manual creation 2026-01-25)

  description = "Isolated VPC for Ectropy staging environment - SOC 2/ISO 27001/PCI DSS compliance"

  # VPC Peering: Disabled for maximum isolation
  enable_peering = false
  peering_vpc_id = ""

  # Timeout configuration
  delete_timeout = "5m"
}

# ============================================================================
# Staging Droplet (VPC-Isolated)
# ============================================================================

resource "digitalocean_droplet" "staging" {
  name       = "ectropy-staging"
  size       = "s-4vcpu-8gb" # Upgraded: 4 vCPU, 8GB RAM — matches production envelope for 16 services
  image      = "ubuntu-22-04-x64"
  region     = var.production_region
  ssh_keys   = var.ssh_keys
  monitoring = true
  ipv6       = true

  # CRITICAL: Assign to staging VPC for network isolation
  vpc_uuid = module.staging_vpc.id

  tags = [
    "managed-by:terraform",
    "environment:staging",
    "product:ectropy",
    "role:app",
    "vpc-isolated"
  ]

  # ============================================================================
  # ENTERPRISE PATTERN: Terraform templatefile() for guaranteed variable substitution
  # ============================================================================
  # ROOT CAUSE FIX (Option B): Eliminates bash heredoc variable interpolation issues
  # Pattern: Terraform renders template with actual values BEFORE cloud-init execution
  # Reference: C:\tmp\PHASE_P3_ZERO_SSH_ROOT_CAUSE_FIX_2026-02-17.md
  # Confidence: 100% (industry-standard Terraform pattern)
  # Fortune 500 Compliance: Zero-SSH bootstrap with guaranteed credential deployment
  # ============================================================================
  user_data = templatefile("${path.module}/files/cloud-init-user-data.tftpl", {
    spaces_access_key          = var.spaces_access_key_id
    spaces_secret_key          = var.spaces_secret_access_key
    docr_config_json           = var.docr_config_json
    config_sync_script_base64  = base64encode(file("${path.module}/files/config-sync.sh"))
    config_sync_service_base64 = base64encode(file("${path.module}/files/config-sync.service"))
    config_sync_timer_base64   = base64encode(file("${path.module}/files/config-sync.timer"))
  })

  # Lifecycle: Prevent unwanted changes for imported resources
  # ROOT CAUSE #163 fix: ssh_keys is ForceNew and not returned by API
  # ROOT CAUSE Phase P3 Bootstrap: Removed user_data from ignore_changes
  #   to allow cloud-init updates with correct Spaces credentials
  lifecycle {
    prevent_destroy = false # Staging can be recreated for testing
    ignore_changes = [
      # user_data removed - must allow cloud-init changes for Phase P3 Zero-SSH
      ssh_keys,  # Ignore ssh_keys for imported droplets (ForceNew attribute)
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
# Fallback: If cert data not provided → LB runs HTTP-only, HTTPS forwarding
#   rule is skipped. Set ssl_certificate_name for existing DO cert by name.
#
# Eliminated: certbot, Let's Encrypt, rate limits, cert renewal automation
# ============================================================================

locals {
  has_custom_cert   = var.ssl_cert_private_key != "" && var.ssl_cert_leaf != ""
  use_existing_cert = !local.has_custom_cert && var.ssl_certificate_name != ""
  has_any_cert      = local.has_custom_cert || local.use_existing_cert

  # null when no cert available — HTTPS forwarding rule is skipped
  active_cert_name = (
    local.has_custom_cert ? digitalocean_certificate.staging_origin[0].name :
    local.use_existing_cert ? var.ssl_certificate_name :
    null
  )
}

# Cloudflare Origin Certificate uploaded to DigitalOcean
# Created when GitHub Secrets CF_ORIGIN_KEY + CF_ORIGIN_CERT are configured
resource "digitalocean_certificate" "staging_origin" {
  count = local.has_custom_cert ? 1 : 0

  name              = "ectropy-staging-origin-${substr(sha256(var.ssl_cert_leaf), 0, 8)}"
  type              = "custom"
  private_key       = var.ssl_cert_private_key
  leaf_certificate  = var.ssl_cert_leaf
  certificate_chain = var.ssl_cert_chain != "" ? var.ssl_cert_chain : null

  lifecycle {
    create_before_destroy = true
  }
}

# ============================================================================
# Staging Load Balancer
# ============================================================================

resource "digitalocean_loadbalancer" "staging" {
  name     = "ectropy-staging-lb"
  region   = var.production_region
  vpc_uuid = module.staging_vpc.id # CRITICAL: Assign LB to staging VPC

  # HTTPS forwarding (active when Origin Certificate is configured)
  # Cloudflare Full (Strict) sends HTTPS to origin — LB terminates TLS with Origin Cert
  # Required for: staging.ectropy.ai (proxied) + *.ectropy.ai (multi-tenant)
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

  # HTTP forwarding (health checks + internal VPC traffic)
  forwarding_rule {
    entry_protocol  = "http"
    entry_port      = 80
    target_protocol = "http"
    target_port     = 80
  }

  # Health check configuration — INDEPENDENT static check (Five Why 2026-02-20)
  # ROOT CAUSE FIX: Changed from /api/health to /lb-health
  #
  # BEFORE: /api/health (dependent — requires nginx + api-gateway + database + redis)
  #   → Single service failure cascades to ALL traffic blocked (LB returns 503 for everything)
  #   → nginx conf line 203 literally says "NOT used by: DigitalOcean Load Balancer"
  #
  # AFTER: /lb-health (independent — static 200 from nginx, no backend dependencies)
  #   → LB verifies REACHABILITY (nginx alive), not application health
  #   → Individual service failures return nginx 502 for that specific route
  #   → Other services remain accessible during partial outages
  #   → Application health checked at monitoring layer (workflow validation, smoke tests)
  #
  # Industry Pattern: LB health = "can this server accept traffic?" (Layer 4/7 reachability)
  #                   App health = "is this service ready?" (Layer 7 readiness probe)
  # Reference: ectropy-staging.conf:192-196 (static /lb-health endpoint)
  healthcheck {
    protocol                 = "http"
    port                     = 80
    path                     = "/lb-health"
    check_interval_seconds   = 10
    response_timeout_seconds = 5
    unhealthy_threshold      = 3
    healthy_threshold        = 2
  }

  droplet_tag = "environment:staging"

  # ENTERPRISE FIX (2026-03-07): Increase idle timeout for Speckle file uploads
  # ROOT CAUSE: Default 60s idle timeout kills Speckle file upload connections
  # during seed-staging-database workflow (IFC upload → fileimport processing)
  # Evidence: Run 22800720361 — jq parse error after exactly 60s
  http_idle_timeout_seconds = 300

  # Sticky sessions for consistent testing
  sticky_sessions {
    type               = "cookies"
    cookie_name        = "lb_session_staging"
    cookie_ttl_seconds = 3600
  }
}

# ============================================================================
# Staging Firewall — Tag-Based (DEC-028)
# ============================================================================
# ARCHITECTURE FIX: Replaced droplet_ids with tags for self-healing
# on droplet replacement. Adds SSH (admin break-glass), VPC internal,
# and ICMP — aligning with production firewall pattern.
#
# Root cause: Zero-SSH with DO Console as sole break-glass failed when
# Console stuck on "connecting". Staging was unreachable for diagnostics.
#
# Migration: droplet_ids → tags (environment:staging)
# DO applies firewall to any droplet carrying the tag — automatic,
# no Terraform dependency propagation needed on replacement.
# ============================================================================

resource "digitalocean_firewall" "staging" {
  name = "ectropy-staging-firewall"

  # TAG-BASED: Self-healing on droplet replacement (DEC-028)
  tags = ["environment:staging"]

  # SSH: Admin break-glass access from approved CIDRs
  # Parameterized — empty default = no SSH unless explicitly set
  dynamic "inbound_rule" {
    for_each = length(var.admin_ssh_cidrs) > 0 ? [1] : []
    content {
      protocol         = "tcp"
      port_range       = "22"
      source_addresses = var.admin_ssh_cidrs
    }
  }

  # HTTP from load balancer (health checks + traffic forwarding)
  inbound_rule {
    protocol                  = "tcp"
    port_range                = "80"
    source_load_balancer_uids = [digitalocean_loadbalancer.staging.id]
  }

  # Application port from load balancer (production parity)
  inbound_rule {
    protocol                  = "tcp"
    port_range                = "3000"
    source_load_balancer_uids = [digitalocean_loadbalancer.staging.id]
  }

  # VPC internal traffic (staging CIDR: 10.20.0.0/20)
  inbound_rule {
    protocol         = "tcp"
    port_range       = "1-65535"
    source_addresses = ["10.20.0.0/20"]
  }

  inbound_rule {
    protocol         = "udp"
    port_range       = "1-65535"
    source_addresses = ["10.20.0.0/20"]
  }

  # ICMP for monitoring and diagnostics
  inbound_rule {
    protocol         = "icmp"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  # Allow all outbound (package updates, external APIs, DOCR pulls)
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
# Docker Compose Upload to S3 (PHASE P3: Fortune 500 Zero-SSH)
# ============================================================================
# PHASE P3.5: S3-based config deployment (Zero-SSH pattern)
# Pattern: Upload to S3, config-sync systemd service pulls to droplet

module "staging_compose_upload" {
  source = "../../modules/config-upload"

  # Config file to upload
  config_file_path = "${path.module}/../../../../docker-compose.staging.yml"
  config_type      = "compose"
  environment      = "staging"

  # DigitalOcean Spaces bucket (created in Phase P3.1)
  spaces_bucket = var.spaces_bucket
  spaces_region = "sfo3"

  # GitOps metadata
  deployment_id = "terraform-${plantimestamp()}"

  # Fortune 500 compliance features
  create_backup     = true  # Backup before deployment
  enable_encryption = true  # AES256 encryption at rest

  # File validation
  max_file_size_kb = 1024  # 1MB limit for compose files

  # Cost tracking and compliance tags
  tags = {
    Project        = "ectropy"
    ManagedBy      = "terraform"
    Purpose        = "zero-ssh-config-deployment"
    Phase          = "p3-migration"
    ComplianceRole = "fortune-500-zero-ssh"
  }

  # Dependency: Upload after droplet created (infrastructure module removed in Phase P3)
  depends_on = [digitalocean_droplet.staging]
}

# ============================================================================
# Nginx Config Upload to S3 (PHASE P3: Zero-SSH)
# ============================================================================
# Nginx configs uploaded to S3, config-sync pulls them to droplet
# docker-compose.staging.yml mounts these at ./infrastructure/nginx/ (relative to /opt/ectropy/)

module "staging_nginx_main_upload" {
  source = "../../modules/config-upload"

  config_file_path = "${path.module}/../../../../infrastructure/nginx/main.conf"
  config_type      = "nginx"
  environment      = "staging"

  spaces_bucket = var.spaces_bucket
  spaces_region = "sfo3"

  deployment_id     = "terraform-${plantimestamp()}"
  create_backup     = true
  enable_encryption = true
  max_file_size_kb  = 256

  tags = {
    Project        = "ectropy"
    ManagedBy      = "terraform"
    Purpose        = "zero-ssh-nginx-deployment"
    Phase          = "p3-migration"
    ComplianceRole = "fortune-500-zero-ssh"
  }

  depends_on = [digitalocean_droplet.staging]
}

module "staging_nginx_site_upload" {
  source = "../../modules/config-upload"

  config_file_path = "${path.module}/../../../../infrastructure/nginx/ectropy-staging.conf"
  config_type      = "nginx"
  environment      = "staging"

  spaces_bucket = var.spaces_bucket
  spaces_region = "sfo3"

  deployment_id     = "terraform-${plantimestamp()}"
  create_backup     = true
  enable_encryption = true
  max_file_size_kb  = 256

  tags = {
    Project        = "ectropy"
    ManagedBy      = "terraform"
    Purpose        = "zero-ssh-nginx-deployment"
    Phase          = "p3-migration"
    ComplianceRole = "fortune-500-zero-ssh"
  }

  depends_on = [digitalocean_droplet.staging]
}

# ============================================================================
# Environment Variables Upload to S3 (PHASE P3: Fortune 500 Zero-SSH)
# ============================================================================
# PHASE P3.6: S3-based .env deployment (Zero-SSH pattern)
# Pattern: Generate .env locally → Upload to S3 → config-sync pulls to droplet

# Generate .env file locally (same content as env-deployment module creates)
# This ensures consistency between SSH and S3 deployment methods during migration
resource "local_file" "staging_env" {
  filename = "${path.module}/.terraform-generated/.env.staging"

  # Generate .env content matching env-deployment module format (29 variables)
  # ROOT CAUSE #208: Managed PostgreSQL with SSL enabled
  # ROOT CAUSE #199: Added CONSOLE_PORT and MCP_STDIO_PORT
  # ROOT CAUSE #232: Added SPECKLE_PUBLIC_URL for path-based routing
  content = <<-ENV
NODE_ENV=staging
VERSION=${var.app_version}

# Database Configuration (Managed PostgreSQL - ROOT CAUSE #208)
DATABASE_URL=postgresql://doadmin:${urlencode(var.database_password)}@${var.database_host}:${var.database_port}/ectropy?sslmode=require
DATABASE_HOST=${var.database_host}
DATABASE_PORT=${var.database_port}
DATABASE_NAME=ectropy
DATABASE_USER=doadmin
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

# Speckle BIM Integration (ROOT CAUSE #147)
SPECKLE_SERVER_TOKEN=${var.speckle_server_token}
SPECKLE_ADMIN_PASSWORD=${var.speckle_admin_password}
SPECKLE_SESSION_SECRET=${var.speckle_session_secret}
SPECKLE_PUBLIC_URL=https://staging.ectropy.ai/speckle
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

# Port Configuration (ROOT CAUSE #199)
CONSOLE_PORT=3004
MCP_STDIO_PORT=3001

# Docker Registry Configuration (ROOT CAUSE #2 - DOCR Authentication)
DOCR_CONFIG_JSON=${var.docr_config_json}

# Multi-Database Architecture (Phase 1-3 Implementation)
# ROOT CAUSE FIX: FIVE_WHY_API_ERRORS_STAGING_2026-02-12.json
# @ectropy/database package requires these for DatabaseManager
PLATFORM_DATABASE_URL=${var.platform_database_url}
SHARED_DATABASE_URL=${var.shared_database_url}

# AI Services
ANTHROPIC_API_KEY=${var.anthropic_api_key}

# Authentication (DEC-015 VST pattern)
VIEWER_TOKEN_SECRET=${var.viewer_token_secret}

# Server Configuration
PORT=${var.port}
ENV

  # Protect sensitive content
  file_permission = "0600"

  # Lifecycle: Regenerate on variable changes only
  lifecycle {
    create_before_destroy = true

    precondition {
      condition     = var.jwt_secret != var.jwt_refresh_secret
      error_message = "JWT_SECRET and JWT_REFRESH_SECRET must be different values. Using the same value for both is a security vulnerability."
    }
  }
}

# Upload .env file to DigitalOcean Spaces (zero-SSH pattern)
module "staging_env_upload" {
  source = "../../modules/config-upload"

  # Config content to upload (Terraform-generated .env) - ROOT CAUSE #4 FIX
  # Use config_content instead of config_file_path because local_file.staging_env creates
  # the file during APPLY phase, but module locals evaluate during PLAN phase
  config_content  = local_file.staging_env.content  # Content available during planning
  config_filename = ".env.staging"                  # S3 object naming
  config_type     = "env"
  environment     = "staging"

  # DigitalOcean Spaces bucket (created in Phase P3.1)
  spaces_bucket = var.spaces_bucket
  spaces_region = "sfo3"

  # GitOps metadata
  deployment_id = "terraform-${plantimestamp()}"

  # Fortune 500 compliance features (CRITICAL for secrets)
  create_backup     = true  # Backup before deployment
  enable_encryption = true  # AES256 encryption at rest (REQUIRED for .env)

  # File validation (environment files should be small)
  max_file_size_kb = 100  # .env files typically < 10KB

  # Cost tracking and compliance tags
  tags = {
    Project        = "ectropy"
    ManagedBy      = "terraform"
    Purpose        = "zero-ssh-env-deployment"
    Phase          = "p3-migration"
    ComplianceRole = "fortune-500-zero-ssh"
    SecurityLevel  = "high" # Contains secrets
  }

  # Dependency: Upload after local .env file created (infrastructure module removed in Phase P3)
  depends_on = [
    local_file.staging_env,
    digitalocean_droplet.staging
  ]
}

# ============================================================================
# Outputs
# ============================================================================

# Infrastructure Outputs
output "staging_ip" {
  description = "Staging server public IP address"
  value       = digitalocean_droplet.staging.ipv4_address
}

output "staging_ipv6" {
  description = "Staging server IPv6 address"
  value       = digitalocean_droplet.staging.ipv6_address
}

output "staging_id" {
  description = "Staging server droplet ID"
  value       = digitalocean_droplet.staging.id
}

output "staging_lb_ip" {
  description = "Staging load balancer IP address"
  value       = digitalocean_loadbalancer.staging.ip
}

output "staging_lb_id" {
  description = "Staging load balancer ID"
  value       = digitalocean_loadbalancer.staging.id
}

output "staging_certificate_name" {
  description = "Staging SSL certificate name (null if no cert, Cloudflare edge SSL handles HTTPS)"
  value       = local.active_cert_name
  sensitive   = true
}

output "staging_certificate_strategy" {
  description = "Which SSL cert strategy is active"
  value       = local.has_custom_cert ? "cloudflare-origin-cert" : local.use_existing_cert ? "existing-${var.ssl_certificate_name}" : "no-cert-http-only"
  sensitive   = true
}

# VPC Isolation Outputs (ROOT CAUSE #80/#126)
output "staging_vpc_id" {
  description = "Staging VPC ID for network isolation"
  value       = module.staging_vpc.id
}

output "staging_vpc_name" {
  description = "Staging VPC name"
  value       = module.staging_vpc.name
}

output "staging_vpc_ip_range" {
  description = "Staging VPC CIDR block (10.20.0.0/20)"
  value       = module.staging_vpc.ip_range
}

output "staging_vpc_region" {
  description = "Staging VPC region"
  value       = module.staging_vpc.region
}

output "staging_private_ip" {
  description = "Staging droplet private IP (within VPC)"
  value       = digitalocean_droplet.staging.ipv4_address_private
}

