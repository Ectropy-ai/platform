# ============================================================================
# Docker Compose Deployment Module - Variables
# ============================================================================

# ============================================================================
# Required Variables
# ============================================================================

variable "compose_file_path" {
  description = "Path to docker-compose file in repository (relative to terraform root)"
  type        = string

  validation {
    condition     = can(regex("\\.(yml|yaml)$", var.compose_file_path))
    error_message = "Compose file must have .yml or .yaml extension"
  }
}

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
# Optional Variables (with defaults)
# ============================================================================

variable "ssh_user" {
  description = "SSH username for server connection"
  type        = string
  default     = "root"
}

variable "deployment_path" {
  description = "Path on server where compose file will be deployed"
  type        = string
  default     = "/opt/ectropy"
}

variable "auto_start_services" {
  description = "Automatically start services after deployment (docker-compose up -d)"
  type        = bool
  default     = true
}

# ============================================================================
# Validation Variables
# ============================================================================

variable "expected_line_count" {
  description = "Expected number of lines in compose file (for verification)"
  type        = number
  default     = 723  # docker-compose.staging.yml current size
}

variable "min_line_count" {
  description = "Minimum acceptable line count (fails deployment if smaller)"
  type        = number
  default     = 700  # Safety threshold
}

variable "require_speckle" {
  description = "Require Speckle services in compose file"
  type        = bool
  default     = true  # Required for staging/production
}

variable "expected_speckle_refs" {
  description = "Expected number of Speckle references in compose file"
  type        = number
  default     = 49  # Current count in docker-compose.staging.yml
}

variable "min_speckle_refs" {
  description = "Minimum Speckle references required (if require_speckle=true)"
  type        = number
  default     = 40  # Safety threshold
}
