# ============================================================================
# Ectropy Database Module
# ============================================================================
# Description: Creates DigitalOcean Managed Database Clusters
# Version: 1.0.0
# Last Updated: 2025-12-14
# ============================================================================

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.34"
    }
  }
}

# ----------------------------------------------------------------------------
# Local Variables
# ----------------------------------------------------------------------------

locals {
  # Construct database cluster name
  cluster_name = var.name != "" ? var.name : "${var.project_name}-${var.environment}-db"

  # All tags
  all_tags = concat(
    var.tags,
    [
      var.environment,
      "database",
      var.engine,
      "terraform-managed"
    ]
  )
}

# ----------------------------------------------------------------------------
# Database Cluster Resource
# ----------------------------------------------------------------------------

resource "digitalocean_database_cluster" "main" {
  name       = local.cluster_name
  engine     = var.engine
  version    = var.engine_version
  size       = var.size
  region     = var.region
  node_count = var.node_count

  # VPC assignment (recommended for security)
  private_network_uuid = var.vpc_uuid

  # Maintenance window
  maintenance_window {
    day  = var.maintenance_window_day
    hour = var.maintenance_window_hour
  }

  # Backup configuration
  dynamic "backup_restore" {
    for_each = var.backup_restore_enabled ? [1] : []
    content {
      database_name     = var.backup_restore_database_name
      backup_created_at = var.backup_restore_backup_created_at
    }
  }

  # Tags
  tags = local.all_tags

  # Project assignment
  project_id = var.project_id

  # Lifecycle: Enterprise pattern - databases are stateful and critical
  # NOTE: Use Terraform Cloud approval workflows and database backups for production protection
  lifecycle {
    create_before_destroy = false # Databases cannot be destroyed and recreated
  }
}

# ----------------------------------------------------------------------------
# Database (Schema) Resources
# ----------------------------------------------------------------------------

resource "digitalocean_database_db" "databases" {
  for_each = toset(var.databases)

  cluster_id = digitalocean_database_cluster.main.id
  name       = each.value
}

# ----------------------------------------------------------------------------
# Database User Resources
# ----------------------------------------------------------------------------

resource "digitalocean_database_user" "users" {
  for_each = var.users

  cluster_id = digitalocean_database_cluster.main.id
  name       = each.key

  # MySQL-specific settings
  # NOTE: mysql_auth_plugin configuration moved to provider version 2.34+
  # dynamic "settings" {
  #   for_each = var.engine == "mysql" && lookup(each.value, "mysql_auth_plugin", null) != null ? [1] : []
  #   content {
  #     mysql_auth_plugin = lookup(each.value, "mysql_auth_plugin", "caching_sha2_password")
  #   }
  # }
}

# ----------------------------------------------------------------------------
# Connection Pool Resources (PostgreSQL only)
# ----------------------------------------------------------------------------

resource "digitalocean_database_connection_pool" "pools" {
  for_each = var.engine == "pg" ? var.connection_pools : {}

  cluster_id = digitalocean_database_cluster.main.id
  name       = each.key
  mode       = each.value.mode
  size       = each.value.size
  db_name    = each.value.db_name
  user       = each.value.user
}

# ----------------------------------------------------------------------------
# Read-Only Replica Resources
# ----------------------------------------------------------------------------

resource "digitalocean_database_replica" "replicas" {
  for_each = var.read_replicas

  cluster_id = digitalocean_database_cluster.main.id
  name       = each.key
  size       = lookup(each.value, "size", var.size)
  region     = lookup(each.value, "region", var.region)

  # VPC assignment
  private_network_uuid = lookup(each.value, "vpc_uuid", var.vpc_uuid)

  tags = local.all_tags
}

# ----------------------------------------------------------------------------
# Firewall Rules
# ----------------------------------------------------------------------------

resource "digitalocean_database_firewall" "firewall" {
  count = length(var.firewall_rules) > 0 ? 1 : 0

  cluster_id = digitalocean_database_cluster.main.id

  dynamic "rule" {
    for_each = var.firewall_rules
    content {
      type  = rule.value.type
      value = rule.value.value
    }
  }
}

# ----------------------------------------------------------------------------
# Project Assignment
# ----------------------------------------------------------------------------

resource "digitalocean_project_resources" "database" {
  count = var.project_id != "" ? 1 : 0

  project = var.project_id
  resources = [
    digitalocean_database_cluster.main.urn
  ]
}
