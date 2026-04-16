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

  validation {
    condition     = can(regex("^postgresql://", var.database_url))
    error_message = "database_url must start with postgresql://"
  }
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

  validation {
    condition     = length(var.database_password) >= 16 && can(regex("[A-Z]", var.database_password)) && can(regex("[0-9]", var.database_password))
    error_message = "database_password must be at least 16 chars with uppercase and digit"
  }
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

  validation {
    condition     = can(regex("\\.apps\\.googleusercontent\\.com$", var.google_client_id))
    error_message = "google_client_id must end with .apps.googleusercontent.com"
  }
}

variable "google_client_secret" {
  description = "Google OAuth 2.0 client secret (production)"
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.google_client_secret) >= 24
    error_message = "google_client_secret must be at least 24 characters"
  }
}

# ============================================================================
# Data Layer
# ============================================================================

variable "redis_password" {
  description = "Redis authentication password"
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.redis_password) >= 16
    error_message = "redis_password must be at least 16 characters"
  }
}

variable "encryption_key" {
  description = "General purpose encryption key (AES-256)"
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.encryption_key) >= 32
    error_message = "encryption_key must be at least 32 characters"
  }
}

# ============================================================================
# External APIs
# ============================================================================

variable "mcp_api_key" {
  description = "MCP service API key"
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.mcp_api_key) >= 32
    error_message = "mcp_api_key must be at least 32 characters"
  }
}

variable "openai_api_key" {
  description = "OpenAI API key"
  type        = string
  sensitive   = true

  validation {
    condition     = can(regex("^sk-", var.openai_api_key))
    error_message = "openai_api_key must start with 'sk-'"
  }
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

  validation {
    condition     = length(var.speckle_server_token) >= 40
    error_message = "speckle_server_token must be at least 40 characters"
  }
}

variable "speckle_admin_password" {
  description = "Speckle admin account password"
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.speckle_admin_password) >= 16 && can(regex("[A-Z]", var.speckle_admin_password)) && can(regex("[0-9]", var.speckle_admin_password))
    error_message = "speckle_admin_password must be at least 16 chars with uppercase and digit"
  }
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

  validation {
    condition     = length(var.minio_access_key) >= 16
    error_message = "minio_access_key must be at least 16 characters"
  }
}

variable "minio_secret_key" {
  description = "MinIO S3-compatible storage secret key"
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.minio_secret_key) >= 32
    error_message = "minio_secret_key must be at least 32 characters"
  }
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
# Docker Registry (DOCR Authentication — used by cloud-init, not .env)
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

# ============================================================================
# External AI APIs (DEC-032 Stream 1)
# ============================================================================

variable "anthropic_api_key" {
  description = "Anthropic Claude API key for SEPPA AI assistant"
  type        = string
  sensitive   = true

  validation {
    condition     = can(regex("^sk-ant-", var.anthropic_api_key))
    error_message = "anthropic_api_key must start with 'sk-ant-'"
  }
}

variable "qdrant_api_key" {
  description = "Qdrant vector database API key"
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.qdrant_api_key) >= 32
    error_message = "qdrant_api_key must be at least 32 characters"
  }
}

# ============================================================================
# Database Admin (DEC-032 Stream 1)
# ============================================================================

variable "db_admin_password" {
  description = "PostgreSQL doadmin password for Speckle DB init and migrations"
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.db_admin_password) >= 16 && can(regex("[A-Z]", var.db_admin_password)) && can(regex("[0-9]", var.db_admin_password))
    error_message = "db_admin_password must be at least 16 chars with uppercase and digit"
  }
}

# ============================================================================
# Speckle Extended Config (DEC-032 Stream 1)
# ============================================================================

variable "speckle_admin_email" {
  description = "Speckle admin user email address"
  type        = string
  default     = "speckle-admin@ectropy.ai"

  validation {
    condition     = can(regex("^[^@]+@[^@]+\\.[^@]+$", var.speckle_admin_email))
    error_message = "speckle_admin_email must be a valid email address"
  }
}

variable "speckle_server_url" {
  description = "Speckle server internal URL (container-to-container)"
  type        = string
  default     = "http://ectropy-speckle-server:3000"

  validation {
    condition     = can(regex("^https?://", var.speckle_server_url))
    error_message = "speckle_server_url must start with http:// or https://"
  }
}

variable "minio_public_url" {
  description = "MinIO public URL for S3-compatible storage access"
  type        = string
  default     = "https://ectropy.ai/minio"

  validation {
    condition     = can(regex("^https://", var.minio_public_url))
    error_message = "minio_public_url must start with https://"
  }
}

variable "resend_from_email" {
  description = "Sender email address for Resend email service"
  type        = string
  default     = "noreply@ectropy.ai"

  validation {
    condition     = can(regex("^[^@]+@[^@]+\\.[^@]+$", var.resend_from_email))
    error_message = "resend_from_email must be a valid email address"
  }
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
