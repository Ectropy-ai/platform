# ============================================================================
# Dedicated Tenant Database Module - Variables
# ============================================================================
# Phase 7 - Enterprise Dedicated Database Provisioning
# ============================================================================

# Core tenant identification
variable "tenant_slug" {
  description = "Unique tenant identifier (slug) - used for database naming"
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.tenant_slug))
    error_message = "Tenant slug must be lowercase alphanumeric with hyphens only"
  }

  validation {
    condition     = length(var.tenant_slug) <= 40
    error_message = "Tenant slug must be 40 characters or less (DigitalOcean naming limit)"
  }
}

# Database sizing
variable "database_size" {
  description = "Database cluster size (DigitalOcean slug)"
  type        = string
  default     = "db-s-2vcpu-4gb"

  validation {
    condition = contains([
      "db-s-1vcpu-1gb",   # Development/testing
      "db-s-1vcpu-2gb",   # Small enterprise
      "db-s-2vcpu-4gb",   # Standard enterprise (default)
      "db-s-4vcpu-8gb",   # Medium enterprise
      "db-s-6vcpu-16gb",  # Large enterprise
      "db-s-8vcpu-32gb",  # Very large enterprise
      "db-s-16vcpu-64gb"  # Massive enterprise
    ], var.database_size)
    error_message = "Database size must be a valid DigitalOcean database slug"
  }
}

# Regional configuration
variable "region" {
  description = "DigitalOcean region for database cluster (for data residency compliance)"
  type        = string
  default     = "sfo3"

  validation {
    condition = contains([
      "nyc1",   # New York (US)
      "nyc3",   # New York (US)
      "sfo3",   # San Francisco (US)
      "ams3",   # Amsterdam (EU)
      "sgp1",   # Singapore (APAC)
      "lon1",   # London (UK)
      "fra1",   # Frankfurt (EU)
      "tor1",   # Toronto (Canada)
      "blr1",   # Bangalore (APAC)
      "syd1"    # Sydney (APAC)
    ], var.region)
    error_message = "Region must be a valid DigitalOcean region with database support"
  }
}

# PostgreSQL version
variable "postgres_version" {
  description = "PostgreSQL version (must match application requirements)"
  type        = string
  default     = "16"

  validation {
    condition     = contains(["15", "16", "17"], var.postgres_version)
    error_message = "PostgreSQL version must be 15, 16, or 17"
  }
}

# High availability
variable "node_count" {
  description = "Number of database nodes (1 for standard, 2+ for HA)"
  type        = number
  default     = 1

  validation {
    condition     = var.node_count >= 1 && var.node_count <= 3
    error_message = "Node count must be between 1 and 3"
  }
}

# Connection pooling
variable "enable_connection_pool" {
  description = "Enable PgBouncer connection pooling (recommended for production)"
  type        = bool
  default     = true
}

variable "connection_pool_size" {
  description = "Connection pool size (if enabled)"
  type        = number
  default     = 25

  validation {
    condition     = var.connection_pool_size >= 10 && var.connection_pool_size <= 100
    error_message = "Connection pool size must be between 10 and 100"
  }
}

# Firewall configuration
variable "firewall_allowed_ips" {
  description = "List of IP addresses allowed to connect to database (app servers)"
  type        = list(string)
  default     = []

  validation {
    condition = alltrue([
      for ip in var.firewall_allowed_ips :
      can(regex("^([0-9]{1,3}\\.){3}[0-9]{1,3}$", ip))
    ])
    error_message = "All firewall IPs must be valid IPv4 addresses"
  }
}

variable "firewall_allowed_tags" {
  description = "List of DigitalOcean droplet tags allowed to connect (e.g., 'ectropy-app-servers')"
  type        = list(string)
  default     = ["ectropy-app-servers"]
}

# Maintenance window
variable "maintenance_window_day" {
  description = "Day of week for maintenance (lowercase)"
  type        = string
  default     = "sunday"

  validation {
    condition = contains([
      "sunday", "monday", "tuesday", "wednesday",
      "thursday", "friday", "saturday"
    ], var.maintenance_window_day)
    error_message = "Maintenance day must be a valid day of the week"
  }
}

variable "maintenance_window_hour" {
  description = "Hour of day for maintenance (00:00:00 to 23:00:00 UTC)"
  type        = string
  default     = "04:00:00"

  validation {
    condition     = can(regex("^([0-1][0-9]|2[0-3]):00:00$", var.maintenance_window_hour))
    error_message = "Maintenance hour must be in format HH:00:00 (00:00:00 to 23:00:00)"
  }
}

# Backup configuration
variable "backup_retention_days" {
  description = "Number of days to retain database backups"
  type        = number
  default     = 7

  validation {
    condition     = var.backup_retention_days >= 1 && var.backup_retention_days <= 30
    error_message = "Backup retention must be between 1 and 30 days"
  }
}

# Tagging
variable "tags" {
  description = "Additional tags for database cluster (for organization/billing)"
  type        = list(string)
  default     = []
}
