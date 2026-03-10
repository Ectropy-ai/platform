# ============================================================================
# Database Module Variables
# ============================================================================

variable "name" {
  description = "Database cluster name (leave empty to auto-generate)"
  type        = string
  default     = ""
}

variable "project_name" {
  description = "Project name for naming convention"
  type        = string
  default     = "ectropy"
}

variable "environment" {
  description = "Environment (development, staging, production)"
  type        = string
}

variable "engine" {
  description = "Database engine (pg, mysql, redis, mongodb, kafka, opensearch)"
  type        = string
  default     = "pg"
  validation {
    condition     = contains(["pg", "mysql", "redis", "mongodb", "kafka", "opensearch"], var.engine)
    error_message = "Engine must be one of: pg, mysql, redis, mongodb, kafka, opensearch"
  }
}

variable "engine_version" {
  description = "Database engine version"
  type        = string
  default     = "16"
}

variable "size" {
  description = "Database cluster size slug"
  type        = string
  default     = "db-s-2vcpu-4gb"
  validation {
    condition     = can(regex("^db-s-[0-9]+vcpu-[0-9]+gb$", var.size))
    error_message = "Size must be a valid DigitalOcean database size slug"
  }
}

variable "region" {
  description = "DigitalOcean region"
  type        = string
  default     = "sfo3"
}

variable "node_count" {
  description = "Number of nodes in the cluster (1 for dev, 2+ for HA)"
  type        = number
  default     = 1
  validation {
    condition     = var.node_count >= 1 && var.node_count <= 3
    error_message = "Node count must be between 1 and 3"
  }
}

variable "vpc_uuid" {
  description = "VPC UUID for private networking"
  type        = string
  default     = ""
}

# ----------------------------------------------------------------------------
# Maintenance Window
# ----------------------------------------------------------------------------

variable "maintenance_window_day" {
  description = "Preferred maintenance window day"
  type        = string
  default     = "sunday"
  validation {
    condition = contains([
      "monday", "tuesday", "wednesday", "thursday",
      "friday", "saturday", "sunday"
    ], var.maintenance_window_day)
    error_message = "Must be a valid day of the week"
  }
}

variable "maintenance_window_hour" {
  description = "Preferred maintenance window hour (00:00-23:00 format)"
  type        = string
  default     = "02:00"
  validation {
    condition     = can(regex("^([01][0-9]|2[0-3]):[0-5][0-9]$", var.maintenance_window_hour))
    error_message = "Must be in HH:MM format (00:00-23:59)"
  }
}

# ----------------------------------------------------------------------------
# Backup Configuration
# ----------------------------------------------------------------------------

variable "backup_restore_enabled" {
  description = "Enable backup restore on creation"
  type        = bool
  default     = false
}

variable "backup_restore_database_name" {
  description = "Database name to restore from backup"
  type        = string
  default     = ""
}

variable "backup_restore_backup_created_at" {
  description = "Timestamp of backup to restore (ISO 8601 format)"
  type        = string
  default     = ""
}

# ----------------------------------------------------------------------------
# Databases (Schemas)
# ----------------------------------------------------------------------------

variable "databases" {
  description = "List of database names to create"
  type        = list(string)
  default     = []
}

# ----------------------------------------------------------------------------
# Users
# ----------------------------------------------------------------------------

variable "users" {
  description = "Map of database users to create"
  type = map(object({
    mysql_auth_plugin = optional(string)
  }))
  default = {}
}

# ----------------------------------------------------------------------------
# Connection Pools (PostgreSQL only)
# ----------------------------------------------------------------------------

variable "connection_pools" {
  description = "Map of connection pools to create (PostgreSQL only)"
  type = map(object({
    mode    = string
    size    = number
    db_name = string
    user    = string
  }))
  default = {}
}

# ----------------------------------------------------------------------------
# Read Replicas
# ----------------------------------------------------------------------------

variable "read_replicas" {
  description = "Map of read replicas to create"
  type = map(object({
    size     = optional(string)
    region   = optional(string)
    vpc_uuid = optional(string)
  }))
  default = {}
}

# ----------------------------------------------------------------------------
# Firewall Rules
# ----------------------------------------------------------------------------

variable "firewall_rules" {
  description = "Database firewall rules"
  type = list(object({
    type  = string # "ip_addr", "droplet", "k8s", "tag", "app"
    value = string
  }))
  default = []
}

# ----------------------------------------------------------------------------
# Project Assignment
# ----------------------------------------------------------------------------

variable "project_id" {
  description = "DigitalOcean project ID"
  type        = string
  default     = ""
}

# ----------------------------------------------------------------------------
# Tags
# ----------------------------------------------------------------------------

variable "tags" {
  description = "Additional tags for the database cluster"
  type        = list(string)
  default     = []
}

# ----------------------------------------------------------------------------
# Lifecycle Management
# ----------------------------------------------------------------------------

variable "prevent_destroy" {
  description = "Prevent database cluster destruction"
  type        = bool
  default     = true
}

variable "ignore_changes" {
  description = "List of attributes to ignore changes for"
  type        = list(string)
  default     = []
}
