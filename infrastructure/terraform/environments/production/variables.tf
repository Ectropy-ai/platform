# ============================================================================
# Production Environment Variables - Isolated State
# ============================================================================
# Purpose: Variable declarations for production environment
# Pattern: Environment-specific variables (not shared across environments)
# Created: 2026-02-20 (aligned with staging variables.tf)
# Total Variables: 30 (5 infrastructure + 25 application/services)
# ============================================================================

# ============================================================================
# Infrastructure Variables
# ============================================================================

variable "production_region" {
  description = "DigitalOcean region for production resources"
  type        = string
  default     = "sfo3"

  validation {
    condition     = contains(["sfo3", "nyc3", "ams3", "sgp1", "lon1"], var.production_region)
    error_message = "Region must be a valid DigitalOcean region: sfo3, nyc3, ams3, sgp1, or lon1"
  }
}

variable "production_size" {
  description = "DigitalOcean droplet size for production servers (Dedicated CPU)"
  type        = string
  default     = "c2-4vcpu-8gb"
}

variable "ssh_keys" {
  description = "SSH key fingerprints for server access (production + automation)"
  type        = list(string)
  default = [
    "0a:b2:48:6d:1e:dc:95:e2:6e:96:ff:e8:fe:a8:35:42", # ectropy-production
    "72:7e:a1:f9:8d:74:b5:0d:25:4c:04:97:40:cd:39:8e", # terraform-deploy-key (GitOps automation)
  ]

  validation {
    condition     = length(var.ssh_keys) >= 1
    error_message = "At least one SSH key must be provided"
  }
}

variable "project_name" {
  description = "Project name for resource naming and tagging"
  type        = string
  default     = "ectropy"
}

variable "production_ssh_private_key" {
  description = "SSH private key for Terraform GitOps deployments (terraform_deploy_key)"
  type        = string
  sensitive   = true
  default     = ""
}

# ============================================================================
# Application Configuration
# ============================================================================

variable "app_version" {
  description = "Application version (e.g., production, v1.2.3)"
  type        = string
}

# ============================================================================
# Database Configuration (Managed PostgreSQL)
# ============================================================================

variable "database_url" {
  description = "Full PostgreSQL connection URL (postgresql://user:pass@host:port/db?sslmode=require)"
  type        = string
  sensitive   = true
}

variable "database_host" {
  description = "PostgreSQL host (managed database hostname)"
  type        = string
}

variable "database_port" {
  description = "PostgreSQL port (default: 25060 for managed databases)"
  type        = string
  default     = "25060"
}

variable "database_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "ectropy"
}

variable "database_user" {
  description = "PostgreSQL database user"
  type        = string
  default     = "doadmin"
}

variable "database_password" {
  description = "PostgreSQL admin password for managed database"
  type        = string
  sensitive   = true
}

# ============================================================================
# Authentication & Security
# ============================================================================

variable "jwt_secret" {
  description = "JWT signing secret (256-bit minimum)"
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.jwt_secret) >= 64
    error_message = "JWT_SECRET must be at least 64 characters (current: ${length(var.jwt_secret)}). Generate with: python3 -c 'import secrets; print(secrets.token_hex(32))'"
  }
}

variable "jwt_refresh_secret" {
  description = "JWT refresh token secret (256-bit minimum)"
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.jwt_refresh_secret) >= 64
    error_message = "JWT_REFRESH_SECRET must be at least 64 characters (current: ${length(var.jwt_refresh_secret)}). Generate with: python3 -c 'import secrets; print(secrets.token_hex(32))'"
  }
}

variable "session_secret" {
  description = "Session cookie signing secret"
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.session_secret) >= 32
    error_message = "SESSION_SECRET must be at least 32 characters (current: ${length(var.session_secret)}). Generate with: python3 -c 'import secrets; print(secrets.token_hex(32))'"
  }
}

variable "google_client_id" {
  description = "Google OAuth 2.0 client ID (production)"
  type        = string
}

variable "google_client_secret" {
  description = "Google OAuth 2.0 client secret (production)"
  type        = string
  sensitive   = true
}

# ============================================================================
# Data Layer
# ============================================================================

variable "redis_password" {
  description = "Redis authentication password"
  type        = string
  sensitive   = true
}

variable "encryption_key" {
  description = "General purpose encryption key (AES-256)"
  type        = string
  sensitive   = true
}

# ============================================================================
# External APIs
# ============================================================================

variable "mcp_api_key" {
  description = "MCP service API key"
  type        = string
  sensitive   = true
}

variable "openai_api_key" {
  description = "OpenAI/Anthropic API key"
  type        = string
  sensitive   = true
}

# ============================================================================
# Service URLs
# ============================================================================

variable "api_url" {
  description = "API base URL (e.g., https://ectropy.ai)"
  type        = string
}

variable "frontend_url" {
  description = "Frontend base URL (e.g., https://ectropy.ai)"
  type        = string
}

# ============================================================================
# Speckle BIM Integration
# ============================================================================

variable "speckle_server_token" {
  description = "Speckle server authentication token (hexadecimal)"
  type        = string
  sensitive   = true
}

variable "speckle_admin_password" {
  description = "Speckle admin account password"
  type        = string
  sensitive   = true
}

variable "speckle_session_secret" {
  description = "Speckle session secret for cookie signing"
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.speckle_session_secret) >= 32
    error_message = "SPECKLE_SESSION_SECRET must be at least 32 characters (current: ${length(var.speckle_session_secret)}). Generate with: python3 -c 'import secrets; print(secrets.token_hex(32))'"
  }
}

variable "minio_access_key" {
  description = "MinIO S3-compatible storage access key"
  type        = string
  sensitive   = true
}

variable "minio_secret_key" {
  description = "MinIO S3-compatible storage secret key"
  type        = string
  sensitive   = true
}

# ============================================================================
# Zero-SSH Config Deployment (S3/Spaces)
# ============================================================================

variable "spaces_bucket" {
  description = "DigitalOcean Spaces bucket for config-sync (zero-SSH deployment)"
  type        = string
  default     = "ectropy-production-configs"
}

variable "spaces_access_key_id" {
  description = "DigitalOcean Spaces access key ID (S3-compatible API)"
  type        = string
  sensitive   = true
}

variable "spaces_secret_access_key" {
  description = "DigitalOcean Spaces secret access key"
  type        = string
  sensitive   = true
}

# ============================================================================
# Docker Registry (DOCR Authentication)
# ============================================================================

variable "docr_config_json" {
  description = "Docker config JSON for DOCR authentication (registry.digitalocean.com)"
  type        = string
  sensitive   = true
}

# ============================================================================
# Multi-Database Architecture
# ============================================================================

variable "platform_database_url" {
  description = "Platform database connection string (DatabaseManager)"
  type        = string
  sensitive   = true
}

variable "shared_database_url" {
  description = "Shared trials database connection string (DatabaseManager)"
  type        = string
  sensitive   = true
}

# ============================================================================
# CRM Integration (Twenty CRM)
# ============================================================================

variable "crm_enabled" {
  description = "Enable CRM integration with Twenty CRM"
  type        = string
  default     = "false"
}

variable "crm_api_url" {
  description = "Twenty CRM REST API base URL"
  type        = string
  default     = "https://crm.luh.tech/rest"
}

variable "crm_api_key" {
  description = "Twenty CRM API key (Bearer token)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "crm_webhook_secret" {
  description = "HMAC-SHA256 secret for CRM webhook validation"
  type        = string
  sensitive   = true
  default     = ""
}

# ============================================================================
# SSL Certificate Management (Cloudflare Origin Certificate)
# ============================================================================
# Pattern: Same as staging — Cloudflare Origin Certificate uploaded to DO LB
# Architecture: Cloudflare Full (Strict) → LB (Origin Cert) → nginx (HTTP:80)
# Evidence: FIVE_WHY_PRODUCTION_521_CLOUDFLARE_ORIGIN_2026-03-07.json
# Root Cause: ectropy-prod-cert (Let's Encrypt) expired 2026-02-17
#   LE cannot auto-renew on Cloudflare-proxied domains (HTTP-01 challenge fails)
#   Replaced with 15-year Cloudflare Origin Certificate (same as staging)

variable "ssl_certificate_name" {
  description = "Name of existing DO certificate for LB HTTPS. Only used when cert data is not provided."
  type        = string
  default     = "" # Empty = no existing cert fallback
}

variable "ssl_cert_private_key" {
  description = "PEM-encoded private key for Cloudflare Origin Certificate (GitHub Secret: CF_ORIGIN_KEY)"
  type        = string
  sensitive   = true
  default     = "" # Empty = no cert, LB HTTPS forwarding rule skipped
}

variable "ssl_cert_leaf" {
  description = "PEM-encoded Cloudflare Origin Certificate (GitHub Secret: CF_ORIGIN_CERT)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "ssl_cert_chain" {
  description = "PEM-encoded certificate chain (optional — Cloudflare Origin CA root, not required for Full Strict)"
  type        = string
  sensitive   = true
  default     = ""
}

# ============================================================================
# Cloudflare DNS Management (Zero DNS Drift)
# ============================================================================
# Pattern: Optional provider — skipped when credentials not configured
# Activation: Set CLOUDFLARE_API_TOKEN secret + CLOUDFLARE_ZONE_ID variable in GitHub
# Evidence: FIVE_WHY_PRODUCTION_521_CLOUDFLARE_ORIGIN_2026-03-07.json

variable "cloudflare_api_token" {
  description = "Cloudflare API token with Zone:Read + DNS:Edit permissions for ectropy.ai"
  type        = string
  sensitive   = true
  default     = "" # Empty = Cloudflare resources skipped (count = 0)
}

variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID for ectropy.ai (from Cloudflare dashboard Overview page)"
  type        = string
  default     = "" # Empty = Cloudflare resources skipped (count = 0)
}

# ============================================================================
# Infrastructure Services
# ============================================================================

variable "resend_api_key" {
  description = "Resend email service API key"
  type        = string
  sensitive   = true
}

variable "watchtower_http_api_token" {
  description = "Watchtower HTTP API token for container updates"
  type        = string
  sensitive   = true
}

# ============================================================================
# VARIABLE SUMMARY
# ============================================================================
# Infrastructure Variables: 5
#   - production_region (default: sfo3)
#   - production_size (default: c2-4vcpu-8gb)
#   - ssh_keys (2 keys)
#   - project_name (default: ectropy)
#   - production_ssh_private_key (sensitive)
#
# Zero-SSH Config Deployment: 4
#   - spaces_bucket (default: ectropy-production-configs)
#   - spaces_access_key_id (sensitive)
#   - spaces_secret_access_key (sensitive)
#   - docr_config_json (sensitive)
#
# Multi-Database: 2
#   - platform_database_url (sensitive)
#   - shared_database_url (sensitive)
#
# Application/Service Variables: 25
#   - Sensitive variables: 17 (all secrets marked)
#   - Public variables: 8 (URLs, IDs, version, host, port, name, user)
#
# Total Variables: 36 (was 30, added 6 for zero-SSH parity with staging)
#
# Pattern: Variables declared with types and sensitivity
# Security: All secrets marked sensitive = true (hidden in Terraform output)
# Usage: Values provided via terraform.tfvars or environment variables
# ============================================================================
