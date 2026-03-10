# ============================================================================
# Config Upload Module - Variables
# ============================================================================
# Purpose: Input variables for Zero-SSH configuration deployment
# ============================================================================

variable "bucket_name" {
  description = "DigitalOcean Spaces bucket name for config storage"
  type        = string

  validation {
    condition     = length(var.bucket_name) > 0
    error_message = "Bucket name cannot be empty"
  }
}

variable "environment" {
  description = "Environment name (staging, production, etc.)"
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be 'staging' or 'production'"
  }
}

variable "compose_filename" {
  description = "Docker Compose filename in S3 (e.g., docker-compose.staging.yml)"
  type        = string
  default     = "docker-compose.staging.yml"

  validation {
    condition     = can(regex("^docker-compose.*\\.yml$", var.compose_filename))
    error_message = "Compose filename must match pattern: docker-compose*.yml"
  }
}

variable "env_filename" {
  description = "Environment file filename in S3 (e.g., .env.staging)"
  type        = string
  default     = ".env.staging"

  validation {
    condition     = can(regex("^\\.env", var.env_filename))
    error_message = "Environment filename must start with .env"
  }
}

variable "compose_content" {
  description = "Docker Compose file content (YAML)"
  type        = string

  validation {
    condition     = length(var.compose_content) > 0
    error_message = "Compose content cannot be empty"
  }

  validation {
    condition     = can(regex("(?s)services:", var.compose_content))
    error_message = "Compose content must be valid docker-compose.yml with 'services:' key"
  }
}

variable "env_content" {
  description = "Environment variables file content (.env format)"
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.env_content) > 0
    error_message = "Environment content cannot be empty"
  }
}

variable "create_deployment_lock" {
  description = "Create deployment lock file to prevent config-sync during Terraform apply"
  type        = bool
  default     = true
}

variable "wait_for_sync" {
  description = "Create null_resource trigger to track config-sync polling"
  type        = bool
  default     = false
}

variable "tags" {
  description = "Additional tags for S3 objects"
  type        = map(string)
  default     = {}
}
