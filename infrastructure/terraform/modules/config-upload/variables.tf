# terraform/modules/config-upload/variables.tf
# PHASE P3: Zero-SSH Config Upload Module - Input Variables
# Purpose: Define configuration parameters for Fortune 500 zero-SSH deployment

# ===========================
# REQUIRED VARIABLES (ROOT CAUSE #4 FIX)
# ===========================
# Pattern: Support both file paths and direct content
# Use Case 1: config_file_path → Pre-existing files in repo (e.g., docker-compose.yml)
# Use Case 2: config_content + config_filename → Terraform-generated files (e.g., local_file.staging_env.content)

variable "config_file_path" {
  description = "Absolute path to config file to upload (optional if config_content provided)"
  type        = string
  default     = null
}

variable "config_content" {
  description = "Direct content to upload (optional if config_file_path provided)"
  type        = string
  default     = null
  sensitive   = true  # May contain secrets (e.g., .env file content)
}

variable "config_filename" {
  description = "Filename for S3 object when using config_content (required if config_content provided)"
  type        = string
  default     = null
}

variable "config_type" {
  description = "Type of config file: 'compose' (docker-compose.yml), 'env' (.env), or 'script' (shell scripts)"
  type        = string

  validation {
    condition     = contains(["compose", "env", "script", "nginx"], var.config_type)
    error_message = "Config type must be one of: compose, env, script, nginx"
  }
}

variable "environment" {
  description = "Target environment (staging, production, dev)"
  type        = string

  validation {
    condition     = contains(["staging", "production", "dev", "development"], var.environment)
    error_message = "Environment must be one of: staging, production, dev, development"
  }
}

variable "spaces_bucket" {
  description = "DigitalOcean Spaces bucket name for config storage"
  type        = string

  validation {
    condition     = length(var.spaces_bucket) > 0 && length(var.spaces_bucket) <= 63
    error_message = "Spaces bucket name must be 1-63 characters"
  }
}

variable "spaces_region" {
  description = "DigitalOcean Spaces region (e.g., sfo3, nyc3, fra1)"
  type        = string
  default     = "sfo3"

  validation {
    condition     = contains(["nyc3", "sfo2", "sfo3", "ams3", "sgp1", "fra1"], var.spaces_region)
    error_message = "Spaces region must be a valid DigitalOcean region"
  }
}

# ===========================
# OPTIONAL VARIABLES
# ===========================

variable "deployment_id" {
  description = "Unique identifier for this deployment (e.g., git commit SHA, workflow run ID)"
  type        = string
  default     = ""
}

variable "create_backup" {
  description = "Create timestamped backup of config file before deployment"
  type        = bool
  default     = true
}

variable "enable_encryption" {
  description = "Enable server-side encryption (AES256) for config files (Fortune 500 compliance)"
  type        = bool
  default     = true
}

variable "max_file_size_kb" {
  description = "Maximum file size in KB (0 = no limit). Prevents accidental large file uploads"
  type        = number
  default     = 1024 # 1MB default limit

  validation {
    condition     = var.max_file_size_kb >= 0
    error_message = "Maximum file size must be non-negative"
  }
}

variable "object_key_override" {
  description = "Override the default {env}/{type}/{filename} S3 key. When set, writes directly to this key at bucket root."
  type        = string
  default     = null
}

variable "tags" {
  description = "Additional tags to apply to S3 objects (for cost tracking and compliance)"
  type        = map(string)
  default     = {}
}
