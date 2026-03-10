# ============================================================================
# Development Environment Variables - Isolated State
# ============================================================================
# Purpose: Variable declarations for development environment
# Pattern: Environment-specific variables (not shared across environments)
# Created: 2026-02-04 (GitOps refactor - enterprise pattern from staging)
# Updated: 2026-02-20 (Phase 2 - Zero-SSH alignment with staging)
# ============================================================================

# ============================================================================
# Infrastructure Variables
# ============================================================================

variable "region" {
  description = "DigitalOcean region for development resources"
  type        = string
  default     = "sfo3"

  validation {
    condition     = contains(["sfo3", "nyc3", "ams3", "sgp1", "lon1"], var.region)
    error_message = "Region must be a valid DigitalOcean region: sfo3, nyc3, ams3, sgp1, or lon1"
  }
}

variable "ssh_keys" {
  description = "SSH key fingerprints for server access (development + automation)"
  type        = list(string)

  # ROOT CAUSE #163 - SSH key drift fix
  # These keys must match the SSH keys attached to the existing droplet (548781470)
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

variable "development_ssh_private_key" {
  description = "SSH private key (deprecated — retained for backward compatibility during Zero-SSH migration)"
  type        = string
  sensitive   = true
  default     = ""
}

# ============================================================================
# S3 Config Bucket (Zero-SSH Pattern)
# ============================================================================

variable "spaces_bucket" {
  description = "DigitalOcean Spaces bucket for config-sync (Zero-SSH config deployment)"
  type        = string
  default     = "ectropy-development-configs"
}

# ============================================================================
# Application Configuration
# ============================================================================

variable "app_version" {
  description = "Application version (e.g., development, staging, v1.2.3)"
  type        = string
  default     = "development"
}

# ============================================================================
# Database Configuration (DigitalOcean Managed PostgreSQL)
# ============================================================================

variable "database_url" {
  description = "Full PostgreSQL connection URL with SSL"
  type        = string
  sensitive   = true
  default     = ""
}

variable "database_host" {
  description = "PostgreSQL host address"
  type        = string
  sensitive   = true
}

variable "database_port" {
  description = "PostgreSQL port (default: 25060 for DO managed)"
  type        = string
  default     = "25060"
}

variable "database_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "ectropy"
}

variable "database_user" {
  description = "PostgreSQL username"
  type        = string
  sensitive   = true
  default     = "doadmin"
}

variable "database_password" {
  description = "PostgreSQL password"
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
  description = "API base URL"
  type        = string
  default     = "http://localhost"
}

variable "frontend_url" {
  description = "Frontend base URL"
  type        = string
  default     = "http://localhost"
}

# ============================================================================
# Speckle BIM Integration (ROOT CAUSE #147)
# ============================================================================
# Aligned with staging: full Speckle stack for self-hosted deployment

variable "speckle_server_token" {
  description = "Speckle server authentication token"
  type        = string
  sensitive   = true
  default     = ""
}

variable "speckle_admin_password" {
  description = "Speckle admin account password"
  type        = string
  sensitive   = true
  default     = ""
}

variable "speckle_session_secret" {
  description = "Speckle session secret for cookie signing"
  type        = string
  sensitive   = true
  default     = ""
}

variable "minio_access_key" {
  description = "MinIO S3-compatible storage access key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "minio_secret_key" {
  description = "MinIO S3-compatible storage secret key"
  type        = string
  sensitive   = true
  default     = ""
}

# ============================================================================
# Infrastructure Services
# ============================================================================

variable "resend_api_key" {
  description = "Resend email service API key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "watchtower_http_api_token" {
  description = "Watchtower HTTP API token for container updates"
  type        = string
  sensitive   = true
  default     = ""
}

# ============================================================================
# DigitalOcean Spaces Credentials (Zero-SSH Config Sync)
# ============================================================================

variable "spaces_access_key_id" {
  description = "DigitalOcean Spaces access key ID (S3-compatible API)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "spaces_secret_access_key" {
  description = "DigitalOcean Spaces secret access key (S3-compatible API)"
  type        = string
  sensitive   = true
  default     = ""
}

# ============================================================================
# DigitalOcean Container Registry (DOCR) Authentication
# ============================================================================

variable "docr_config_json" {
  description = "Docker config JSON for DOCR authentication"
  type        = string
  sensitive   = true
  default     = ""
}
