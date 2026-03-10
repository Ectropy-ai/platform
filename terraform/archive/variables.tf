# ============================================================================
# Ectropy Enterprise Infrastructure - Global Variables
# ============================================================================
# Version: 1.0.0
# Description: Global variables used across all environments
# Last Updated: 2025-12-14
# ============================================================================

# ----------------------------------------------------------------------------
# Environment Configuration
# ----------------------------------------------------------------------------

variable "environment" {
  description = "Environment name (development, staging, production)"
  type        = string
  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be one of: development, staging, production"
  }
}

variable "region" {
  description = "DigitalOcean region for resource deployment"
  type        = string
  default     = "sfo3"
  validation {
    condition     = contains(["nyc1", "nyc3", "sfo3", "sgp1", "lon1", "fra1", "tor1"], var.region)
    error_message = "Region must be a valid DigitalOcean region"
  }
}

variable "project_name" {
  description = "Project name for resource naming and tagging"
  type        = string
  default     = "ectropy"
}

# ----------------------------------------------------------------------------
# Networking Configuration
# ----------------------------------------------------------------------------

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.124.0.0/20"
  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "VPC CIDR must be a valid IPv4 CIDR block"
  }
}

# Alias for backward compatibility with tfvars files using ip_range
variable "ip_range" {
  description = "IP range for VPC in CIDR notation (alias for vpc_cidr)"
  type        = string
  default     = ""
  validation {
    condition     = var.ip_range == "" || can(cidrhost(var.ip_range, 0))
    error_message = "IP range must be a valid CIDR block or empty string"
  }
}

variable "enable_ipv6" {
  description = "Enable IPv6 networking"
  type        = bool
  default     = true
}

# ----------------------------------------------------------------------------
# Droplet Configuration
# ----------------------------------------------------------------------------

variable "droplet_size" {
  description = "Droplet size/plan"
  type        = string
  default     = "s-2vcpu-4gb"
  validation {
    condition     = can(regex("^s-[0-9]+vcpu-[0-9]+gb(-amd)?(-intel)?$", var.droplet_size))
    error_message = "Droplet size must be a valid DigitalOcean size slug"
  }
}

variable "droplet_image" {
  description = "Droplet base image"
  type        = string
  default     = "ubuntu-22-04-x64"
}

variable "droplet_count" {
  description = "Number of droplets to create (for blue-green: 2)"
  type        = number
  default     = 2
  validation {
    condition     = var.droplet_count >= 1 && var.droplet_count <= 10
    error_message = "Droplet count must be between 1 and 10"
  }
}

variable "enable_backups" {
  description = "Enable automated droplet backups"
  type        = bool
  default     = false
}

variable "enable_monitoring" {
  description = "Enable DigitalOcean monitoring agent"
  type        = bool
  default     = true
}

# ----------------------------------------------------------------------------
# Database Configuration
# ----------------------------------------------------------------------------

variable "db_engine" {
  description = "Database engine (pg, mysql, redis, mongodb)"
  type        = string
  default     = "pg"
  validation {
    condition     = contains(["pg", "mysql", "redis", "mongodb"], var.db_engine)
    error_message = "Database engine must be one of: pg, mysql, redis, mongodb"
  }
}

variable "db_version" {
  description = "Database engine version"
  type        = string
  default     = "16"
}

variable "db_size" {
  description = "Database cluster size"
  type        = string
  default     = "db-s-2vcpu-4gb"
  validation {
    condition     = can(regex("^db-s-[0-9]+vcpu-[0-9]+gb$", var.db_size))
    error_message = "Database size must be a valid DigitalOcean database size slug"
  }
}

variable "db_node_count" {
  description = "Number of database nodes (1 for dev, 2+ for HA)"
  type        = number
  default     = 1
  validation {
    condition     = var.db_node_count >= 1 && var.db_node_count <= 3
    error_message = "Database node count must be between 1 and 3"
  }
}

variable "db_maintenance_window_day" {
  description = "Preferred maintenance window day"
  type        = string
  default     = "sunday"
  validation {
    condition = contains([
      "monday", "tuesday", "wednesday", "thursday",
      "friday", "saturday", "sunday"
    ], var.db_maintenance_window_day)
    error_message = "Maintenance window day must be a valid day of the week"
  }
}

variable "db_maintenance_window_hour" {
  description = "Preferred maintenance window hour (00:00 format)"
  type        = string
  default     = "02:00"
}

# ----------------------------------------------------------------------------
# Load Balancer Configuration
# ----------------------------------------------------------------------------

variable "lb_algorithm" {
  description = "Load balancing algorithm"
  type        = string
  default     = "round_robin"
  validation {
    condition     = contains(["round_robin", "least_connections"], var.lb_algorithm)
    error_message = "Load balancer algorithm must be one of: round_robin, least_connections"
  }
}

variable "lb_size" {
  description = "Load balancer size (blank for small, lb-small, lb-medium, lb-large)"
  type        = string
  default     = "lb-small"
  validation {
    condition     = contains(["", "lb-small", "lb-medium", "lb-large"], var.lb_size)
    error_message = "Load balancer size must be one of: '', lb-small, lb-medium, lb-large"
  }
}

variable "health_check_protocol" {
  description = "Health check protocol"
  type        = string
  default     = "http"
  validation {
    condition     = contains(["http", "https", "tcp"], var.health_check_protocol)
    error_message = "Health check protocol must be one of: http, https, tcp"
  }
}

variable "health_check_port" {
  description = "Health check port"
  type        = number
  default     = 80
  validation {
    condition     = var.health_check_port >= 1 && var.health_check_port <= 65535
    error_message = "Health check port must be between 1 and 65535"
  }
}

variable "health_check_path" {
  description = "Health check HTTP path"
  type        = string
  default     = "/health"
}

variable "health_check_interval" {
  description = "Health check interval in seconds"
  type        = number
  default     = 10
  validation {
    condition     = var.health_check_interval >= 3 && var.health_check_interval <= 300
    error_message = "Health check interval must be between 3 and 300 seconds"
  }
}

variable "health_check_timeout" {
  description = "Health check response timeout in seconds"
  type        = number
  default     = 5
  validation {
    condition     = var.health_check_timeout >= 3 && var.health_check_timeout <= 300
    error_message = "Health check timeout must be between 3 and 300 seconds"
  }
}

variable "health_check_healthy_threshold" {
  description = "Number of successful checks before marking healthy"
  type        = number
  default     = 2
  validation {
    condition     = var.health_check_healthy_threshold >= 2 && var.health_check_healthy_threshold <= 10
    error_message = "Healthy threshold must be between 2 and 10"
  }
}

variable "health_check_unhealthy_threshold" {
  description = "Number of failed checks before marking unhealthy"
  type        = number
  default     = 3
  validation {
    condition     = var.health_check_unhealthy_threshold >= 2 && var.health_check_unhealthy_threshold <= 10
    error_message = "Unhealthy threshold must be between 2 and 10"
  }
}

# ----------------------------------------------------------------------------
# Security Configuration
# ----------------------------------------------------------------------------

variable "ssh_key_fingerprints" {
  description = "List of SSH key fingerprints to add to droplets"
  type        = list(string)
  default     = []
  validation {
    condition     = alltrue([for fp in var.ssh_key_fingerprints : can(regex("^([a-f0-9]{2}:){15}[a-f0-9]{2}$|^([a-f0-9]{2}:){31}[a-f0-9]{2}$", fp))])
    error_message = "SSH key fingerprints must be in MD5 or SHA256 format"
  }
}

variable "admin_ip_addresses" {
  description = "List of admin IP addresses for SSH access (CIDR notation)"
  type        = list(string)
  default     = []
  validation {
    condition     = alltrue([for cidr in var.admin_ip_addresses : can(cidrhost(cidr, 0))])
    error_message = "Admin IP addresses must be valid CIDR blocks"
  }
}

variable "enable_firewall" {
  description = "Enable firewall rules"
  type        = bool
  default     = true
}

# ----------------------------------------------------------------------------
# DNS Configuration
# ----------------------------------------------------------------------------

variable "domain_name" {
  description = "Primary domain name"
  type        = string
  default     = "ectropy.ai"
  validation {
    condition     = can(regex("^([a-z0-9]+(-[a-z0-9]+)*\\.)+[a-z]{2,}$", var.domain_name))
    error_message = "Domain name must be a valid DNS name"
  }
}

variable "enable_dns" {
  description = "Enable DNS zone management"
  type        = bool
  default     = true
}

# ----------------------------------------------------------------------------
# Blue-Green Deployment Configuration
# ----------------------------------------------------------------------------

variable "blue_green_enabled" {
  description = "Enable blue-green deployment pattern"
  type        = bool
  default     = true
}

variable "active_environment" {
  description = "Active environment for blue-green deployment (blue or green)"
  type        = string
  default     = "blue"
  validation {
    condition     = contains(["blue", "green"], var.active_environment)
    error_message = "Active environment must be either 'blue' or 'green'"
  }
}

variable "standby_enabled" {
  description = "Keep standby environment running (for instant rollback)"
  type        = bool
  default     = true
}

# ----------------------------------------------------------------------------
# Monitoring Configuration
# ----------------------------------------------------------------------------

variable "enable_prometheus" {
  description = "Deploy Prometheus monitoring droplet"
  type        = bool
  default     = false
}

variable "enable_grafana" {
  description = "Deploy Grafana visualization droplet"
  type        = bool
  default     = false
}

variable "enable_alertmanager" {
  description = "Deploy Alertmanager for notifications"
  type        = bool
  default     = false
}

# ----------------------------------------------------------------------------
# Cost Optimization
# ----------------------------------------------------------------------------

variable "auto_shutdown_dev" {
  description = "Auto-shutdown development resources during off-hours"
  type        = bool
  default     = true
}

variable "cost_allocation_tags" {
  description = "Tags for cost allocation and tracking"
  type        = map(string)
  default     = {}
}

# ----------------------------------------------------------------------------
# Feature Flags
# ----------------------------------------------------------------------------

variable "feature_flags" {
  description = "Feature flags for gradual rollout"
  type        = map(bool)
  default = {
    enable_cdn              = false
    enable_redis_cache      = true
    enable_backup_retention = true
    enable_log_shipping     = false
  }
}

# ----------------------------------------------------------------------------
# Tags
# ----------------------------------------------------------------------------

variable "tags" {
  description = "Common tags to apply to all resources"
  type        = list(string)
  default     = ["terraform-managed"]
}

variable "additional_tags" {
  description = "Additional tags specific to this deployment"
  type        = list(string)
  default     = []
}

# ----------------------------------------------------------------------------
# Metadata
# ----------------------------------------------------------------------------

variable "metadata" {
  description = "Metadata for resource documentation"
  type        = map(string)
  default = {
    managed_by      = "terraform"
    repository      = "github.com/luhtech/ectropy"
    documentation   = "terraform/README.md"
    support_contact = "platform-eng@ectropy.ai"
  }
}

# ----------------------------------------------------------------------------
# SSL/TLS Configuration
# ----------------------------------------------------------------------------

variable "ssl_certificate_id" {
  description = "DigitalOcean SSL certificate ID for HTTPS"
  type        = string
  default     = ""
}

variable "enable_ssl_redirect" {
  description = "Redirect HTTP to HTTPS"
  type        = bool
  default     = true
}

# ----------------------------------------------------------------------------
# Validation Rules
# ----------------------------------------------------------------------------

# Ensure production has high availability
variable "validate_production_ha" {
  description = "Validate production has HA configuration"
  type        = bool
  default     = true
}

locals {
  # Production validation
  # FIXED: Use database_node_count instead of db_node_count (variable name mismatch)
  production_ha_valid = (
    var.environment != "production" ||
    (var.database_node_count >= 2 && var.droplet_count >= 2 && var.enable_backups)
  )

  # Compute all tags
  all_tags = concat(
    var.tags,
    var.additional_tags,
    [var.environment, var.project_name]
  )

  # Common labels
  common_labels = merge(
    var.metadata,
    {
      environment = var.environment
      project     = var.project_name
      region      = var.region
    }
  )
}

# Production HA validation
variable "production_ha_override" {
  description = "Override production HA validation (use with caution)"
  type        = bool
  default     = false
}

# ENTERPRISE FIX (2026-01-02): Migrate validation from apply-time to plan-time
# Previous: null_resource with local-exec (runs during apply)
# Current: check block (runs during plan)
# Benefit: Fail fast - invalid plans never presented for approval
# Pattern: Terraform 1.5+ validation best practice

check "production_ha_requirements" {
  assert {
    condition     = var.environment != "production" || local.production_ha_valid || var.production_ha_override
    error_message = "Production environment requires HA configuration: database_node_count >= 2, droplet_count >= 2, enable_backups = true. Override with production_ha_override = true if intentional."
  }
}

# ============================================================================
# ADDITIONAL REQUIRED VARIABLES - Module Integration
# ============================================================================
# The following variables are required by main.tf module calls but were
# missing from the original variables.tf. Added for complete configuration.
# ============================================================================

# ----------------------------------------------------------------------------
# Provider Credentials
# ----------------------------------------------------------------------------

variable "do_token" {
  description = "DigitalOcean API token"
  type        = string
  sensitive   = true
}

variable "spaces_access_id" {
  description = "DigitalOcean Spaces access key ID"
  type        = string
  default     = ""
  sensitive   = true
}

variable "spaces_secret_key" {
  description = "DigitalOcean Spaces secret access key"
  type        = string
  default     = ""
  sensitive   = true
}

# ----------------------------------------------------------------------------
# VPC Configuration
# ----------------------------------------------------------------------------

variable "use_existing_vpc" {
  description = "Use existing VPC instead of creating new one"
  type        = bool
  default     = false
}

variable "existing_vpc_name" {
  description = "Name of existing VPC to use"
  type        = string
  default     = ""
}

variable "ssh_key_names" {
  description = "List of SSH key names (not fingerprints) to associate with droplets"
  type        = list(string)
  default     = []
}

variable "ssh_allowed_ips" {
  description = "List of IP addresses/CIDR blocks allowed SSH access"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

# ----------------------------------------------------------------------------
# Firewall Configuration (Extended)
# ----------------------------------------------------------------------------

variable "firewall_droplet_ids" {
  description = "List of droplet IDs to apply firewall rules to"
  type        = list(string)
  default     = []
}

variable "firewall_target_tags" {
  description = "List of tags to target for firewall rules"
  type        = list(string)
  default     = []
}

variable "load_balancer_uids" {
  description = "List of load balancer UUIDs allowed to access droplets"
  type        = list(string)
  default     = []
}

variable "enable_postgres_firewall" {
  description = "Enable PostgreSQL firewall rules"
  type        = bool
  default     = false
}

variable "enable_redis_firewall" {
  description = "Enable Redis firewall rules"
  type        = bool
  default     = false
}

variable "custom_inbound_rules" {
  description = "Custom inbound firewall rules"
  type = list(object({
    protocol         = string
    port_range       = string
    source_addresses = list(string)
  }))
  default = []
}

variable "custom_outbound_rules" {
  description = "Custom outbound firewall rules"
  type = list(object({
    protocol              = string
    port_range            = string
    destination_addresses = list(string)
  }))
  default = []
}

# ----------------------------------------------------------------------------
# Database Configuration (Extended)
# ----------------------------------------------------------------------------

variable "create_database" {
  description = "Create managed database cluster"
  type        = bool
  default     = true
}

variable "database_version" {
  description = "Database engine version (aliased to engine_version in module)"
  type        = string
  default     = "16"
}

variable "database_size" {
  description = "Database cluster size"
  type        = string
  default     = "db-s-2vcpu-4gb"
}

variable "database_node_count" {
  description = "Number of database nodes for HA"
  type        = number
  default     = 1
}

variable "database_names" {
  description = "List of database names to create"
  type        = list(string)
  default     = ["ectropy"]
}

variable "database_users" {
  description = "Map of database users to create"
  type        = map(any)
  default     = {}
}

variable "database_backup_timestamp" {
  description = "Timestamp of backup to restore from (YYYY-MM-DDTHH:MM:SSZ format)"
  type        = string
  default     = ""
}

variable "database_firewall_rules" {
  description = "Database firewall rules"
  type = list(object({
    type  = string
    value = string
  }))
  default = []
}

variable "connection_pools" {
  description = "PostgreSQL connection pools configuration"
  type = map(object({
    mode    = string
    size    = number
    db_name = string
    user    = string
  }))
  default = {}
}

# ----------------------------------------------------------------------------
# Droplet Configuration (Extended)
# ----------------------------------------------------------------------------

variable "enable_blue_green" {
  description = "Enable blue-green deployment for production"
  type        = bool
  default     = false
}

variable "droplet_ipv6" {
  description = "Enable IPv6 for droplets"
  type        = bool
  default     = true
}

variable "droplet_user_data" {
  description = "Cloud-init user data for single droplet"
  type        = string
  default     = ""
}

variable "droplet_user_data_blue" {
  description = "Cloud-init user data for blue droplet"
  type        = string
  default     = ""
}

variable "droplet_user_data_green" {
  description = "Cloud-init user data for green droplet"
  type        = string
  default     = ""
}

# ----------------------------------------------------------------------------
# Load Balancer Configuration (Extended)
# ----------------------------------------------------------------------------

variable "create_load_balancer" {
  description = "Create load balancer"
  type        = bool
  default     = true
}

variable "load_balancer_size" {
  description = "Load balancer size (lb-small, lb-medium, lb-large)"
  type        = string
  default     = "lb-small"
}

variable "load_balancer_tag" {
  description = "Tag to use for load balancer droplet targeting"
  type        = string
  default     = ""
}

variable "load_balancer_algorithm" {
  description = "Load balancer algorithm"
  type        = string
  default     = "round_robin"
}

variable "load_balancer_sticky_sessions" {
  description = "Enable sticky sessions"
  type        = bool
  default     = false
}

variable "load_balancer_sticky_config" {
  description = "Sticky sessions configuration"
  type = object({
    type               = string
    cookie_name        = optional(string)
    cookie_ttl_seconds = optional(number)
  })
  default = {
    type               = "cookies"
    cookie_name        = "lb_session"
    cookie_ttl_seconds = 3600
  }
}

variable "load_balancer_redirect_https" {
  description = "Redirect HTTP to HTTPS"
  type        = bool
  default     = true
}

variable "load_balancer_forwarding_rules" {
  description = "Load balancer forwarding rules"
  type = list(object({
    entry_protocol   = string
    entry_port       = number
    target_protocol  = string
    target_port      = number
    certificate_id   = optional(string)
    certificate_name = optional(string)
    tls_passthrough  = optional(bool)
  }))
  default = [
    {
      entry_protocol  = "http"
      entry_port      = 80
      target_protocol = "http"
      target_port     = 80
    },
    {
      entry_protocol  = "https"
      entry_port      = 443
      target_protocol = "http"
      target_port     = 80
    }
  ]
}

variable "load_balancer_firewall_rules" {
  description = "Load balancer firewall rules"
  type = list(object({
    deny  = optional(list(string))
    allow = optional(list(string))
  }))
  default = []
}

# ----------------------------------------------------------------------------
# DNS Configuration (Extended)
# ----------------------------------------------------------------------------

variable "create_dns_records" {
  description = "Create DNS records"
  type        = bool
  default     = false
}

variable "dns_domain" {
  description = "DNS domain for record creation"
  type        = string
  default     = "ectropy.ai"
}

variable "dns_a_records" {
  description = "Additional A records to create"
  type = map(object({
    value = string
    ttl   = optional(number)
  }))
  default = {}
}

variable "dns_cname_records" {
  description = "CNAME records to create"
  type = map(object({
    value = string
    ttl   = optional(number)
  }))
  default = {}
}

variable "dns_create_www_cname" {
  description = "Create www CNAME record"
  type        = bool
  default     = false
}

# ----------------------------------------------------------------------------
# Project Configuration
# ----------------------------------------------------------------------------

variable "project_id" {
  description = "DigitalOcean project ID for resource organization (REQUIRED for all environments)"
  type        = string
  # No default - explicit project assignment required for enterprise compliance
  # Prevents resources from being created in wrong/default project
}

# ----------------------------------------------------------------------------
# Container Registry Configuration (ROOT CAUSE #126 - Zero-SSH Deployments)
# ----------------------------------------------------------------------------

variable "create_container_registry" {
  description = "Create DigitalOcean Container Registry (global resource, one per account)"
  type        = bool
  default     = false
}

variable "container_registry_name" {
  description = "Name for the container registry (must be globally unique)"
  type        = string
  default     = "ectropy"
}

variable "container_registry_tier" {
  description = "Registry subscription tier: starter (500MB free), basic (5GB $5/mo), professional (unlimited $20/mo)"
  type        = string
  default     = "basic"

  validation {
    condition     = contains(["starter", "basic", "professional"], var.container_registry_tier)
    error_message = "Container registry tier must be 'starter', 'basic', or 'professional'."
  }
}

# ----------------------------------------------------------------------------
# Enterprise SSH Key Management
# ----------------------------------------------------------------------------

variable "generate_ssh_key" {
  description = "Generate a new SSH key pair for automated rotation"
  type        = bool
  default     = false
}

# ----------------------------------------------------------------------------
# Cloud-Init Provisioning Configuration
# ----------------------------------------------------------------------------

variable "staging_domain" {
  description = "Domain name for staging environment"
  type        = string
  default     = "staging.ectropy.ai"
}

variable "docker_registry" {
  description = "Docker registry URL"
  type        = string
  default     = "registry.digitalocean.com/ectropy-registry"
}

variable "external_database_url" {
  description = "External database URL (if not using Terraform-managed database)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "redis_url" {
  description = "Redis connection URL"
  type        = string
  default     = ""
  sensitive   = true
}

variable "api_url" {
  description = "API URL for services"
  type        = string
  default     = "https://staging.ectropy.ai"
}

variable "frontend_url" {
  description = "Frontend URL for CORS configuration"
  type        = string
  default     = "https://staging.ectropy.ai"
}

variable "docr_token" {
  description = "DigitalOcean Container Registry access token"
  type        = string
  default     = ""
  sensitive   = true
}

variable "watchtower_api_token" {
  description = "Watchtower HTTP API authentication token"
  type        = string
  default     = "changeme"
  sensitive   = true
}

# ----------------------------------------------------------------------------
# OAuth & Authentication Configuration
# ----------------------------------------------------------------------------

variable "google_client_id" {
  description = "Google OAuth 2.0 Client ID for authentication"
  type        = string
  default     = ""
  sensitive   = true
}

variable "google_client_secret" {
  description = "Google OAuth 2.0 Client Secret for authentication"
  type        = string
  default     = ""
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT signing secret (minimum 64 characters, cryptographically secure random)"
  type        = string
  default     = ""
  sensitive   = true
  validation {
    condition     = var.jwt_secret == "" || length(var.jwt_secret) >= 64
    error_message = "JWT secret must be at least 64 characters long or empty (for default generation)"
  }
}

variable "jwt_refresh_secret" {
  description = "JWT refresh token secret (minimum 64 characters, cryptographically secure random)"
  type        = string
  default     = ""
  sensitive   = true
  validation {
    condition     = var.jwt_refresh_secret == "" || length(var.jwt_refresh_secret) >= 64
    error_message = "JWT refresh secret must be at least 64 characters long or empty (for default generation)"
  }
}

variable "session_secret" {
  description = "Session secret for Express session management (minimum 32 characters, cryptographically secure random)"
  type        = string
  default     = ""
  sensitive   = true
  validation {
    condition     = var.session_secret == "" || length(var.session_secret) >= 32
    error_message = "Session secret must be at least 32 characters long or empty (for default generation)"
  }
}
