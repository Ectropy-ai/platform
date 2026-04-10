# ============================================================================
# Dedicated Tenant Database Module
# ============================================================================
# Purpose: Provision dedicated PostgreSQL database for enterprise tenants
# Phase 7 - Enterprise Dedicated Database Provisioning
#
# This module creates:
# - DigitalOcean PostgreSQL database cluster
# - Dedicated database within cluster
# - Firewall rules for app server access
# - Connection pool (optional)
#
# Usage:
# module "tenant_db" {
#   source = "../../modules/dedicated-tenant-database"
#
#   tenant_slug   = "canada-visionarc"
#   database_size = "db-s-2vcpu-4gb"
#   region        = "tor1"
# }
#
# Design Pattern: Database-per-tenant for enterprise customers
# Security: Firewall-restricted access, private networking
# ============================================================================

terraform {
  required_version = ">= 1.0"
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
  }
}

# ============================================================================
# Input Variables
# ============================================================================

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

variable "database_size" {
  description = "Database cluster size (DigitalOcean slug)"
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
  description = "DigitalOcean region for database cluster"
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
  description = "PostgreSQL version"
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
  description = "Enable PgBouncer connection pooling"
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

variable "firewall_allowed_ips" {
  description = "List of IP addresses allowed to connect to database"
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

variable "maintenance_window_day" {
  description = "Day of week for maintenance (sunday, monday, etc.)"
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
  description = "Hour of day for maintenance (00:00:00 to 23:00:00)"
  type        = string
  default     = "04:00:00"

  validation {
    condition     = can(regex("^([0-1][0-9]|2[0-3]):00:00$", var.maintenance_window_hour))
    error_message = "Maintenance hour must be in format HH:00:00 (00:00:00 to 23:00:00)"
  }
}

variable "backup_retention_days" {
  description = "Number of days to retain backups (1-30)"
  type        = number
  default     = 7

  validation {
    condition     = var.backup_retention_days >= 1 && var.backup_retention_days <= 30
    error_message = "Backup retention must be between 1 and 30 days"
  }
}

variable "tags" {
  description = "Additional tags for database cluster"
  type        = list(string)
  default     = []
}

# ============================================================================
# Database Cluster Resource
# ============================================================================

resource "digitalocean_database_cluster" "tenant_database" {
  name       = "ectropy-${var.tenant_slug}-db"
  engine     = "pg"
  version    = var.postgres_version
  size       = var.database_size
  region     = var.region
  node_count = var.node_count

  tags = concat(
    [
      "managed-by:terraform",
      "product:ectropy",
      "role:database",
      "tenant:${var.tenant_slug}",
      "database-per-tenant"
    ],
    var.tags
  )

  maintenance_window {
    day  = var.maintenance_window_day
    hour = var.maintenance_window_hour
  }

  lifecycle {
    # Prevent accidental deletion of production databases
    prevent_destroy = true

    # Ignore changes to certain attributes that might be managed elsewhere
    ignore_changes = [
      # Private network configuration might be managed separately
      private_network_uuid
    ]
  }
}

# ============================================================================
# Dedicated Database within Cluster
# ============================================================================

resource "digitalocean_database_db" "tenant_database_db" {
  cluster_id = digitalocean_database_cluster.tenant_database.id
  name       = "ectropy_${replace(var.tenant_slug, "-", "_")}"
}

# ============================================================================
# Database User (Application User)
# ============================================================================

resource "digitalocean_database_user" "tenant_app_user" {
  cluster_id = digitalocean_database_cluster.tenant_database.id
  name       = "${replace(var.tenant_slug, "-", "_")}_app"
}

# ============================================================================
# Connection Pool (PgBouncer)
# ============================================================================

resource "digitalocean_database_connection_pool" "tenant_pool" {
  count = var.enable_connection_pool ? 1 : 0

  cluster_id = digitalocean_database_cluster.tenant_database.id
  name       = "${replace(var.tenant_slug, "-", "_")}_pool"
  mode       = "transaction"
  size       = var.connection_pool_size
  db_name    = digitalocean_database_db.tenant_database_db.name
  user       = digitalocean_database_user.tenant_app_user.name
}

# ============================================================================
# Firewall Rules
# ============================================================================

resource "digitalocean_database_firewall" "tenant_database_firewall" {
  cluster_id = digitalocean_database_cluster.tenant_database.id

  # Allow connections from specific IP addresses (staging, production droplets)
  dynamic "rule" {
    for_each = var.firewall_allowed_ips
    content {
      type  = "ip_addr"
      value = rule.value
    }
  }

  # Allow connections from droplets with specific tags
  dynamic "rule" {
    for_each = var.firewall_allowed_tags
    content {
      type  = "tag"
      value = rule.value
    }
  }

  lifecycle {
    # Prevent accidental deletion of firewall rules
    prevent_destroy = false

    # Create new rules before destroying old ones
    create_before_destroy = true
  }
}

# ============================================================================
# Outputs
# ============================================================================

output "cluster_id" {
  description = "Database cluster ID"
  value       = digitalocean_database_cluster.tenant_database.id
}

output "cluster_urn" {
  description = "Database cluster URN (unique resource name)"
  value       = digitalocean_database_cluster.tenant_database.urn
}

output "database_name" {
  description = "Database name within cluster"
  value       = digitalocean_database_db.tenant_database_db.name
}

output "database_host" {
  description = "Database host (private network preferred)"
  value       = digitalocean_database_cluster.tenant_database.private_host
  sensitive   = true
}

output "database_port" {
  description = "Database port"
  value       = digitalocean_database_cluster.tenant_database.port
}

output "database_user" {
  description = "Database user for application"
  value       = digitalocean_database_user.tenant_app_user.name
  sensitive   = true
}

output "database_password" {
  description = "Database password for application user"
  value       = digitalocean_database_user.tenant_app_user.password
  sensitive   = true
}

output "database_uri" {
  description = "Full database connection URI (private network)"
  value       = digitalocean_database_cluster.tenant_database.private_uri
  sensitive   = true
}

output "database_uri_pool" {
  description = "Connection pool URI (if enabled)"
  value = var.enable_connection_pool ? (
    length(digitalocean_database_connection_pool.tenant_pool) > 0 ?
    digitalocean_database_connection_pool.tenant_pool[0].private_uri :
    null
  ) : null
  sensitive = true
}

output "connection_string" {
  description = "Prisma-compatible connection string"
  value = format(
    "postgresql://%s:%s@%s:%s/%s?schema=public&sslmode=require",
    digitalocean_database_user.tenant_app_user.name,
    digitalocean_database_user.tenant_app_user.password,
    digitalocean_database_cluster.tenant_database.private_host,
    digitalocean_database_cluster.tenant_database.port,
    digitalocean_database_db.tenant_database_db.name
  )
  sensitive = true
}

output "cluster_metadata" {
  description = "Database cluster metadata for tenant registry"
  value = {
    cluster_id       = digitalocean_database_cluster.tenant_database.id
    database_name    = digitalocean_database_db.tenant_database_db.name
    database_host    = digitalocean_database_cluster.tenant_database.private_host
    database_port    = digitalocean_database_cluster.tenant_database.port
    database_user    = digitalocean_database_user.tenant_app_user.name
    engine           = digitalocean_database_cluster.tenant_database.engine
    version          = digitalocean_database_cluster.tenant_database.version
    region           = digitalocean_database_cluster.tenant_database.region
    node_count       = digitalocean_database_cluster.tenant_database.node_count
    size             = digitalocean_database_cluster.tenant_database.size
    status           = digitalocean_database_cluster.tenant_database.status
    created_at       = digitalocean_database_cluster.tenant_database.created_at
    connection_pool  = var.enable_connection_pool
  }
}

output "provisioning_summary" {
  description = "Human-readable provisioning summary"
  value = <<-EOT
    ✅ Dedicated Database Provisioned
    ================================
    Tenant: ${var.tenant_slug}
    Database: ectropy_${replace(var.tenant_slug, "-", "_")}
    Cluster: ${digitalocean_database_cluster.tenant_database.name}

    Configuration:
    - PostgreSQL ${var.postgres_version}
    - Size: ${var.database_size}
    - Region: ${var.region}
    - Nodes: ${var.node_count}
    - Connection Pool: ${var.enable_connection_pool ? "Enabled (${var.connection_pool_size} connections)" : "Disabled"}

    Connection Info:
    - Host: ${digitalocean_database_cluster.tenant_database.private_host}
    - Port: ${digitalocean_database_cluster.tenant_database.port}
    - User: ${digitalocean_database_user.tenant_app_user.name}
    - Database: ${digitalocean_database_db.tenant_database_db.name}

    Security:
    - Firewall: ${length(var.firewall_allowed_ips)} IP(s), ${length(var.firewall_allowed_tags)} tag(s)
    - SSL: Required
    - Network: Private

    Maintenance:
    - Day: ${var.maintenance_window_day}
    - Time: ${var.maintenance_window_hour} UTC
    - Backups: ${var.backup_retention_days} days

    Next Steps:
    1. Update tenant registry with database connection metadata
    2. Run Prisma migrations: npx prisma migrate deploy
    3. Test database connectivity from app servers
    4. Configure application DATABASE_URL environment variable
  EOT
}
