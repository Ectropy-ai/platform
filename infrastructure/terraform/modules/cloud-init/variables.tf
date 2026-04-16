# ============================================================================
# Cloud-Init Module Variables
# ============================================================================

variable "environment" {
  description = "Environment name (staging, production, development)"
  type        = string
}

variable "hostname" {
  description = "Server hostname"
  type        = string
}

variable "domain" {
  description = "Domain name for nginx configuration"
  type        = string
}

variable "ssh_public_keys" {
  description = "List of SSH public keys to add to authorized_keys"
  type        = list(string)
}

variable "docker_registry" {
  description = "Docker registry URL (e.g., registry.digitalocean.com/ectropy-registry)"
  type        = string
}

variable "database_url" {
  description = "PostgreSQL database connection URL"
  type        = string
  sensitive   = true
}

variable "redis_url" {
  description = "Redis connection URL"
  type        = string
  sensitive   = true
}

variable "api_url" {
  description = "API URL for services"
  type        = string
}

variable "frontend_url" {
  description = "Frontend URL for CORS"
  type        = string
}

variable "docr_token" {
  description = "DigitalOcean Container Registry token"
  type        = string
  sensitive   = true
  default     = ""
}

variable "watchtower_token" {
  description = "Watchtower HTTP API token"
  type        = string
  sensitive   = true
  default     = "changeme"
}

variable "google_client_id" {
  description = "Google OAuth 2.0 Client ID for authentication"
  type        = string
  sensitive   = true
}

variable "google_client_secret" {
  description = "Google OAuth 2.0 Client Secret for authentication"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT signing secret (64+ characters)"
  type        = string
  sensitive   = true
}

variable "jwt_refresh_secret" {
  description = "JWT refresh token secret (64+ characters)"
  type        = string
  sensitive   = true
}

variable "session_secret" {
  description = "Session secret for Express session management (32+ characters)"
  type        = string
  sensitive   = true
}
