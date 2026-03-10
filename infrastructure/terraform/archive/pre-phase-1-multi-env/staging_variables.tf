# ============================================================================
# Staging Environment Variables - Terraform Declarations
# ============================================================================
# ROOT CAUSE #153: Variable declarations for env-deployment module integration
# Pattern: Variables declared here, values provided via staging_env.tfvars
# Security: All sensitive variables marked with sensitive = true
# ============================================================================

# ============================================================================
# Application Configuration
# ============================================================================

variable "app_version" {
  description = "Application version (e.g., staging, production, v1.2.3)"
  type        = string
}

# ============================================================================
# Database Configuration (DigitalOcean Managed PostgreSQL)
# ============================================================================

variable "database_url" {
  description = "Full PostgreSQL connection URL with SSL"
  type        = string
  sensitive   = true
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
}

variable "database_user" {
  description = "PostgreSQL username"
  type        = string
  sensitive   = true
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
# VARIABLE DECLARATION SUMMARY
# ============================================================================
# Total variables: 25
# Sensitive variables: 19 (all secrets marked)
# Public variables: 6 (URLs, IDs, version)
#
# Pattern: Variables declared with types and sensitivity
# Security: All secrets marked sensitive = true (hidden in Terraform output)
# Usage: Values provided via staging_env.tfvars (gitignored)
# ============================================================================
