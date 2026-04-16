# ============================================================================
# Infrastructure Deployment Module - Input Variables
# ============================================================================
# Root Cause: #156 - Infrastructure config deployment via Terraform GitOps
# Pattern: Environment-agnostic module with runtime configuration
# ============================================================================

# ============================================================================
# Infrastructure Configuration
# ============================================================================

variable "droplet_id" {
  description = "DigitalOcean droplet ID for deployment tracking"
  type        = string
}

variable "droplet_ip" {
  description = "Droplet public IP address for SSH connection"
  type        = string
}

variable "ssh_private_key" {
  description = "SSH private key for droplet access (terraform_deploy_key)"
  type        = string
  sensitive   = true
}

variable "deployment_path" {
  description = "Base path for infrastructure deployment on droplet"
  type        = string
  default     = "/opt/ectropy"
}

variable "environment" {
  description = "Environment name (staging, production, development) with optional blue-green suffix"
  type        = string

  validation {
    condition     = can(regex("^(staging|production|development)(-blue|-green)?$", var.environment))
    error_message = "Environment must be one of: staging, production, development (with optional -blue or -green suffix)"
  }
}

# ============================================================================
# Nginx Configuration Files
# ============================================================================

variable "nginx_main_conf_path" {
  description = "Path to nginx main.conf file (relative to repo root)"
  type        = string
  default     = "infrastructure/nginx/main.conf"

  validation {
    condition     = fileexists(var.nginx_main_conf_path)
    error_message = "Nginx main.conf file not found at specified path"
  }
}

variable "nginx_site_conf_path" {
  description = "Path to nginx site-specific config file (ectropy-staging.conf, ectropy-production.conf, etc.)"
  type        = string

  validation {
    condition     = fileexists(var.nginx_site_conf_path)
    error_message = "Nginx site config file not found at specified path"
  }
}

# ============================================================================
# Deployment Control
# ============================================================================

variable "create_backup" {
  description = "Create backup of existing configs before deployment"
  type        = bool
  default     = true
}

variable "validate_deployment" {
  description = "Validate config files after deployment (line count, permissions)"
  type        = bool
  default     = true
}

# ============================================================================
# Service Management (ROOT CAUSE #162)
# ============================================================================
# Pattern: Follows compose-deployment (auto_start_services) and
#          env-deployment (auto_restart_services) module pattern
# Industry: Aligns with Ectropy's blue-green deployment runbooks
# ============================================================================

variable "auto_reload_nginx" {
  description = "Automatically reload nginx after config deployment (zero-downtime graceful reload)"
  type        = bool
  default     = true  # Enable by default for GitOps automation

  validation {
    condition     = var.auto_reload_nginx != null
    error_message = "auto_reload_nginx must be explicitly set (true/false)"
  }
}

variable "nginx_container_name" {
  description = "Docker container name for nginx (required for reload command)"
  type        = string
  default     = "ectropy-nginx"

  validation {
    condition     = length(var.nginx_container_name) > 0
    error_message = "nginx_container_name must not be empty"
  }
}
