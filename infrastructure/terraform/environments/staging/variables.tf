# ============================================================================
# Staging Environment Variables - Isolated State
# ============================================================================
# Purpose: Variable declarations for staging environment
# Pattern: Environment-specific variables (not shared across environments)
# Created: 2026-02-03 (migrated from ../../staging_variables.tf)
# Migration: Phase 3 - Staging environment isolation
# Total Variables: 29 (4 infrastructure + 25 application/services)
# ============================================================================

# ============================================================================
# Infrastructure Variables
# ============================================================================

variable "production_region" {
  description = "DigitalOcean region for staging resources (shared variable name for compatibility)"
  type        = string
  default     = "sfo3" # San Francisco - same region as production

  validation {
    condition     = contains(["sfo3", "nyc3", "ams3", "sgp1", "lon1"], var.production_region)
    error_message = "Region must be a valid DigitalOcean region: sfo3, nyc3, ams3, sgp1, or lon1"
  }
}

variable "ssh_keys" {
  description = "SSH key fingerprints for server access (staging + automation)"
  type        = list(string)

  # ROOT CAUSE #163 - SSH key drift fix
  # These keys must match the SSH keys attached to the existing droplet
  # Changing these values will trigger droplet recreation (not desired for import)
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

variable "staging_ssh_private_key" {
  description = "SSH private key for Terraform GitOps deployments (terraform_deploy_key)"
  type        = string
  sensitive   = true
  default     = ""
}

# ============================================================================
# Database Host (Managed PostgreSQL)
# ============================================================================

variable "database_host" {
  description = "DigitalOcean managed PostgreSQL hostname for staging"
  type        = string
  default     = "ectropy-staging-db-do-user-10389677-0.k.db.ondigitalocean.com"
}

variable "database_port" {
  description = "Managed PostgreSQL port"
  type        = string
  default     = "25060"
}

# ============================================================================
# S3 Config Bucket
# ============================================================================

variable "spaces_bucket" {
  description = "DigitalOcean Spaces bucket for config-sync (Zero-SSH config deployment)"
  type        = string
  default     = "ectropy-staging-configs"
}

# ============================================================================
# Application Configuration
# ============================================================================

variable "app_version" {
  description = "Application version (e.g., staging, production, v1.2.3)"
  type        = string
}

# ============================================================================
# Database Configuration (Managed PostgreSQL for Staging)
# ============================================================================
# ROOT CAUSE #208 FIX: Staging uses managed PostgreSQL (ectropy-staging-db)
# Pattern: Same zero-SSH architecture as production
# Database: ectropy (same as seed workflow uses)
# User: doadmin (managed database admin)
# Created: 2026-01-27, Multi-tenant migrations deployed 2026-01-29
# ============================================================================

variable "database_password" {
  description = "PostgreSQL admin password for managed database (ectropy-staging-db)"
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
}

variable "jwt_refresh_secret" {
  description = "JWT refresh token secret (256-bit minimum)"
  type        = string
  sensitive   = true
}

variable "session_secret" {
  description = "Session cookie signing secret"
  type        = string
  sensitive   = true
}

variable "google_client_id" {
  description = "Google OAuth 2.0 client ID"
  type        = string
}

variable "google_client_secret" {
  description = "Google OAuth 2.0 client secret"
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
  description = "API base URL (e.g., https://staging.ectropy.ai)"
  type        = string
}

variable "frontend_url" {
  description = "Frontend base URL (e.g., https://staging.ectropy.ai)"
  type        = string
}

# ============================================================================
# Speckle BIM Integration (ROOT CAUSE #147)
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
# Phase P3.8: DigitalOcean Spaces Credentials (Zero-SSH Config Sync)
# ============================================================================
# Purpose: Credentials for config-sync.service to pull configs from S3
# Pattern: Same credentials used by Terraform config-upload modules
# Security: Read-only access to ectropy-staging-configs bucket

variable "spaces_access_key_id" {
  description = "DigitalOcean Spaces access key ID (S3-compatible API)"
  type        = string
  sensitive   = true
}

variable "spaces_secret_access_key" {
  description = "DigitalOcean Spaces secret access key (S3-compatible API)"
  type        = string
  sensitive   = true
}

# ============================================================================
# DigitalOcean Container Registry (DOCR) Authentication (ROOT CAUSE #2 Fix)
# ============================================================================
# Purpose: Docker config JSON for pulling images from registry.digitalocean.com
# Pattern: Deployed to /opt/ectropy/.docker/config.json by config-sync service
# NOTE: /root/ is inaccessible (systemd ProtectHome=yes)
# Security: Contains base64-encoded authentication credentials
# Created: 2026-02-18 (Phase P3 DOCR authentication fix)
# Format: Standard Docker config.json with auths field

variable "docr_config_json" {
  description = "Docker config JSON for DOCR authentication (deployed to /opt/ectropy/.docker/config.json)"
  type        = string
  sensitive   = true
}

# ============================================================================
# SSL Certificate Configuration — Cloudflare Origin Certificate
# ============================================================================
# ENTERPRISE ARCHITECTURE: Cloudflare Full (Strict) + Origin Certificate
#
# Origin Certificate (15-year, wildcard):
#   - Generated in Cloudflare Dashboard → SSL/TLS → Origin Server
#   - Covers: *.ectropy.ai + ectropy.ai
#   - Stored in GitHub Secrets: CF_ORIGIN_KEY, CF_ORIGIN_CERT
#   - Passed via: TF_VAR_ssl_cert_private_key, TF_VAR_ssl_cert_leaf
#
# Strategy (priority):
#   1. Origin Certificate from secrets (ssl_cert_private_key + ssl_cert_leaf)
#   2. Existing cert by name (ssl_certificate_name)
#   If neither → LB is HTTP-only (HTTPS forwarding rule skipped)
#
# Eliminated: certbot, Let's Encrypt, rate limits, cert renewal automation
# Eliminated: DO managed LE — fails with 422 (Cloudflare nameservers, not DO)

variable "ssl_certificate_name" {
  description = "Name of existing DO certificate for LB HTTPS. Only used when cert data is not provided."
  type        = string
  default     = "" # Empty = no existing cert, LB is HTTP-only (Cloudflare handles HTTPS)
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
# Purpose: Terraform-managed DNS to prevent manual drift (ROOT CAUSE: 2026-02-19 outage)
# Pattern: Optional provider — resources skipped when credentials not configured
# Activation: Set CLOUDFLARE_API_TOKEN secret + CLOUDFLARE_ZONE_ID variable in GitHub

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
# Multi-Database Architecture (Phase 1-3 Implementation)
# ============================================================================
# ROOT CAUSE FIX: FIVE_WHY_API_ERRORS_STAGING_2026-02-12.json
# Problem: Code updated to use @ectropy/database package (DatabaseManager)
#          but environment variables never added to staging .env
# Fix: Add PLATFORM_DATABASE_URL and SHARED_DATABASE_URL to Terraform
# ============================================================================

variable "platform_database_url" {
  description = "Platform database connection string (ectropy_platform - global metadata)"
  type        = string
  sensitive   = true
}

variable "shared_database_url" {
  description = "Shared trials database connection string (ectropy_shared_trials - tenant-scoped RLS)"
  type        = string
  sensitive   = true
}

# ============================================================================
# VARIABLE SUMMARY
# ============================================================================
# Infrastructure Variables: 4
#   - region (default: sfo3)
#   - ssh_keys (2 keys)
#   - project_name (default: ectropy)
#   - staging_ssh_private_key (sensitive)
#
# Application/Service Variables: 27 (was 25, +2 for multi-database)
#   - Sensitive variables: 21 (all secrets marked)
#   - Public variables: 6 (URLs, IDs, version)
#
# Cloudflare DNS Variables: 2
#   - cloudflare_api_token (sensitive, optional)
#   - cloudflare_zone_id (optional)
#
# Total Variables: 33 (was 31)
#
# Pattern: Variables declared with types and sensitivity
# Security: All secrets marked sensitive = true (hidden in Terraform output)
# Usage: Values provided via terraform.tfvars or environment variables
# ============================================================================
