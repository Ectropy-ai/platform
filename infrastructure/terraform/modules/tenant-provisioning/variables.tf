# ============================================================================
# Tenant Provisioning Module - Variables
# ============================================================================
# Phase 7 - Enterprise Dedicated Database Provisioning
# ============================================================================

# ============================================================================
# Core Tenant Configuration
# ============================================================================

variable "tenant_name" {
  description = "Human-readable tenant name (for display in UI)"
  type        = string

  validation {
    condition     = length(var.tenant_name) >= 2 && length(var.tenant_name) <= 100
    error_message = "Tenant name must be between 2 and 100 characters"
  }
}

variable "tenant_slug" {
  description = "Unique tenant identifier (lowercase, alphanumeric, hyphens)"
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.tenant_slug))
    error_message = "Tenant slug must be lowercase alphanumeric with hyphens only"
  }

  validation {
    condition     = length(var.tenant_slug) >= 3 && length(var.tenant_slug) <= 40
    error_message = "Tenant slug must be between 3 and 40 characters"
  }
}

variable "tier" {
  description = "Tenant subscription tier (FREE, BASIC, PROFESSIONAL, ENTERPRISE)"
  type        = string
  default     = "ENTERPRISE"

  validation {
    condition     = contains(["FREE", "BASIC", "PROFESSIONAL", "ENTERPRISE"], var.tier)
    error_message = "Tier must be: FREE, BASIC, PROFESSIONAL, or ENTERPRISE"
  }
}

variable "status" {
  description = "Initial tenant status (TRIAL, ACTIVE, SUSPENDED, ARCHIVED)"
  type        = string
  default     = "ACTIVE"

  validation {
    condition     = contains(["TRIAL", "ACTIVE", "SUSPENDED", "ARCHIVED"], var.status)
    error_message = "Status must be: TRIAL, ACTIVE, SUSPENDED, or ARCHIVED"
  }
}

# ============================================================================
# Database Configuration
# ============================================================================

variable "database_type" {
  description = "Database isolation type (shared_trials, shared_paid, dedicated)"
  type        = string
  default     = "dedicated"

  validation {
    condition     = contains(["shared_trials", "shared_paid", "dedicated"], var.database_type)
    error_message = "Database type must be: shared_trials, shared_paid, or dedicated"
  }
}

variable "database_size" {
  description = "Database cluster size (DigitalOcean slug, only for dedicated databases)"
  type        = string
  default     = "db-s-2vcpu-4gb"

  validation {
    condition = contains([
      "db-s-1vcpu-1gb",
      "db-s-1vcpu-2gb",
      "db-s-2vcpu-4gb",
      "db-s-4vcpu-8gb",
      "db-s-6vcpu-16gb",
      "db-s-8vcpu-32gb",
      "db-s-16vcpu-64gb"
    ], var.database_size)
    error_message = "Database size must be a valid DigitalOcean database slug"
  }
}

variable "region" {
  description = "DigitalOcean region (for data residency compliance)"
  type        = string
  default     = "sfo3"

  validation {
    condition = contains([
      "nyc1", "nyc3", "sfo3", "ams3", "sgp1", "lon1",
      "fra1", "tor1", "blr1", "syd1"
    ], var.region)
    error_message = "Region must be a valid DigitalOcean region with database support"
  }
}

variable "postgres_version" {
  description = "PostgreSQL version (must match application requirements)"
  type        = string
  default     = "16"

  validation {
    condition     = contains(["15", "16", "17"], var.postgres_version)
    error_message = "PostgreSQL version must be 15, 16, or 17"
  }
}

variable "node_count" {
  description = "Number of database nodes (1 for standard, 2+ for HA)"
  type        = number
  default     = 1

  validation {
    condition     = var.node_count >= 1 && var.node_count <= 3
    error_message = "Node count must be between 1 and 3"
  }
}

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

# ============================================================================
# Firewall Configuration
# ============================================================================

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
  description = "List of DigitalOcean droplet tags allowed to connect"
  type        = list(string)
  default     = ["ectropy-app-servers"]
}

# ============================================================================
# Platform Database Connection
# ============================================================================

variable "platform_db_url" {
  description = "Platform database URL (for tenant registry and metadata updates)"
  type        = string
  sensitive   = true

  validation {
    condition     = can(regex("^postgresql://", var.platform_db_url))
    error_message = "Platform DB URL must be a valid PostgreSQL connection string"
  }
}

# ============================================================================
# Prisma Configuration
# ============================================================================

variable "prisma_schema_path" {
  description = "Path to Prisma schema file for migrations (relative or absolute)"
  type        = string
  default     = "./prisma/schema.dedicated.prisma"
}

variable "run_migrations" {
  description = "Automatically run Prisma migrations on new database"
  type        = bool
  default     = true
}

variable "seed_model_catalog" {
  description = "Seed model catalog data after migrations (for demo/testing)"
  type        = bool
  default     = false
}

# ============================================================================
# Tagging
# ============================================================================

variable "tags" {
  description = "Additional tags for resources (for organization/billing)"
  type        = list(string)
  default     = []
}
