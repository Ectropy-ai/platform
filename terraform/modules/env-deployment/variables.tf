# ============================================================================
# Environment File Deployment Module - Variables
# ============================================================================

# ============================================================================
# Required Variables - Infrastructure
# ============================================================================

variable "droplet_id" {
  description = "DigitalOcean droplet ID for deployment"
  type        = string
}

variable "droplet_ip" {
  description = "Public IP address of target droplet"
  type        = string

  validation {
    condition     = can(regex("^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$", var.droplet_ip))
    error_message = "Droplet IP must be a valid IPv4 address"
  }
}

variable "ssh_private_key" {
  description = "SSH private key for server authentication"
  type        = string
  sensitive   = true
}

# ============================================================================
# Required Variables - Environment Configuration
# ============================================================================

variable "app_version" {
  description = "Application version (e.g., staging, production, v1.2.3)"
  type        = string
}

variable "database_url" {
  description = "Full database connection URL"
  type        = string
  sensitive   = true
}

variable "database_host" {
  description = "Database host"
  type        = string
  sensitive   = true
}

variable "database_port" {
  description = "Database port"
  type        = string
  default     = "5432"
}

variable "database_name" {
  description = "Database name"
  type        = string
}

variable "database_user" {
  description = "Database username"
  type        = string
  sensitive   = true
}

variable "database_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}

variable "database_ssl" {
  description = "Enable SSL for database connections (true/false)"
  type        = string
  default     = "true" # DigitalOcean managed databases require SSL
}

variable "jwt_secret" {
  description = "JWT signing secret"
  type        = string
  sensitive   = true
}

variable "jwt_refresh_secret" {
  description = "JWT refresh token secret"
  type        = string
  sensitive   = true
}

variable "session_secret" {
  description = "Session secret for cookie signing"
  type        = string
  sensitive   = true
}

variable "google_client_id" {
  description = "Google OAuth client ID"
  type        = string
}

variable "google_client_secret" {
  description = "Google OAuth client secret"
  type        = string
  sensitive   = true
}

variable "redis_password" {
  description = "Redis password"
  type        = string
  sensitive   = true
}

variable "encryption_key" {
  description = "General encryption key"
  type        = string
  sensitive   = true
}

variable "mcp_api_key" {
  description = "MCP API key"
  type        = string
  sensitive   = true
}

variable "openai_api_key" {
  description = "OpenAI API key"
  type        = string
  sensitive   = true
}

variable "api_url" {
  description = "API base URL (e.g., https://staging.ectropy.ai)"
  type        = string
}

variable "frontend_url" {
  description = "Frontend base URL (e.g., https://staging.ectropy.ai)"
  type        = string
}

variable "speckle_server_token" {
  description = "Speckle server authentication token"
  type        = string
  sensitive   = true
}

variable "speckle_admin_password" {
  description = "Speckle admin password"
  type        = string
  sensitive   = true
}

variable "speckle_session_secret" {
  description = "Speckle session secret"
  type        = string
  sensitive   = true
}

variable "speckle_public_url" {
  description = "Speckle public URL (ROOT CAUSE #232: path-based vs subdomain routing)"
  type        = string
  default     = "https://staging.ectropy.ai/speckle"
}

variable "minio_access_key" {
  description = "MinIO access key (S3-compatible storage)"
  type        = string
  sensitive   = true
}

variable "minio_secret_key" {
  description = "MinIO secret key"
  type        = string
  sensitive   = true
}

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
# Port Configuration (ROOT CAUSE #199)
# ============================================================================

variable "console_port" {
  description = "Ectropy Console service host port (avoids conflict with MCP)"
  type        = string
  default     = "3004"  # Non-conflicting port (MCP uses 3001)
}

variable "mcp_stdio_port" {
  description = "MCP Server stdio/health endpoint host port"
  type        = string
  default     = "3001"  # Keep existing MCP port
}

# ============================================================================
# Optional Variables (with defaults)
# ============================================================================

variable "ssh_user" {
  description = "SSH username for server connection"
  type        = string
  default     = "root"
}

variable "deployment_path" {
  description = "Path on server where .env file will be deployed"
  type        = string
  default     = "/opt/ectropy"
}

variable "auto_restart_services" {
  description = "Automatically restart services after environment deployment (docker-compose down && up -d)"
  type        = bool
  default     = false  # Default to false to avoid accidental service interruption
}

# ============================================================================
# Service Management (ROOT CAUSE #225)
# ============================================================================

variable "nginx_container_name" {
  description = "Name of nginx container to reload after service restart (ROOT CAUSE #225)"
  type        = string
  default     = "ectropy-nginx"  # Match docker-compose.yml nginx service name
}

# ============================================================================
# Validation Variables
# ============================================================================

variable "expected_line_count" {
  description = "Expected number of lines in .env file (for verification)"
  type        = number
  default     = 25  # Current staging .env file size
}

variable "min_line_count" {
  description = "Minimum acceptable line count (fails deployment if smaller)"
  type        = number
  default     = 20  # Safety threshold
}
