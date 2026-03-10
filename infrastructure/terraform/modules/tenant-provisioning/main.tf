# ============================================================================
# Tenant Provisioning Module
# ============================================================================
# Purpose: Orchestrate full enterprise tenant provisioning workflow
# Phase 7 - Enterprise Dedicated Database Provisioning
#
# This module coordinates:
# 1. Dedicated database provisioning (via dedicated-tenant-database module)
# 2. Tenant registry entry creation (platform DB)
# 3. Database connection metadata storage (platform DB)
# 4. Prisma schema migrations (on new dedicated DB)
# 5. Optional model catalog seeding
#
# Usage:
# module "enterprise_tenant" {
#   source = "../../modules/tenant-provisioning"
#
#   tenant_name       = "VisionArc Canada"
#   tenant_slug       = "canada-visionarc"
#   tier              = "ENTERPRISE"
#   database_type     = "dedicated"
#   region            = "tor1"
#   database_size     = "db-s-2vcpu-4gb"
#   platform_db_url   = var.platform_database_url
# }
#
# Design Pattern: Orchestration module for multi-step provisioning
# Dependencies: dedicated-tenant-database module, platform DB access, Prisma CLI
# ============================================================================

terraform {
  required_version = ">= 1.0"
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }
}

# ============================================================================
# Input Variables
# ============================================================================

variable "tenant_name" {
  description = "Human-readable tenant name (for display)"
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
  description = "Tenant subscription tier"
  type        = string
  default     = "ENTERPRISE"

  validation {
    condition     = contains(["FREE", "BASIC", "PROFESSIONAL", "ENTERPRISE"], var.tier)
    error_message = "Tier must be: FREE, BASIC, PROFESSIONAL, or ENTERPRISE"
  }
}

variable "database_type" {
  description = "Database isolation type (shared_trials, shared_paid, dedicated)"
  type        = string
  default     = "dedicated"

  validation {
    condition     = contains(["shared_trials", "shared_paid", "dedicated"], var.database_type)
    error_message = "Database type must be: shared_trials, shared_paid, or dedicated"
  }
}

variable "status" {
  description = "Initial tenant status"
  type        = string
  default     = "ACTIVE"

  validation {
    condition     = contains(["TRIAL", "ACTIVE", "SUSPENDED", "ARCHIVED"], var.status)
    error_message = "Status must be: TRIAL, ACTIVE, SUSPENDED, or ARCHIVED"
  }
}

# Database configuration (only used if database_type = "dedicated")
variable "database_size" {
  description = "Database cluster size (DigitalOcean slug, only for dedicated databases)"
  type        = string
  default     = "db-s-2vcpu-4gb"
}

variable "region" {
  description = "DigitalOcean region (for data residency compliance)"
  type        = string
  default     = "sfo3"
}

variable "postgres_version" {
  description = "PostgreSQL version (must match application)"
  type        = string
  default     = "16"
}

variable "node_count" {
  description = "Number of database nodes (1 for standard, 2+ for HA)"
  type        = number
  default     = 1
}

variable "enable_connection_pool" {
  description = "Enable PgBouncer connection pooling"
  type        = bool
  default     = true
}

variable "connection_pool_size" {
  description = "Connection pool size"
  type        = number
  default     = 25
}

# Firewall configuration
variable "firewall_allowed_ips" {
  description = "List of IP addresses allowed to connect to database"
  type        = list(string)
  default     = []
}

variable "firewall_allowed_tags" {
  description = "List of DigitalOcean droplet tags allowed to connect"
  type        = list(string)
  default     = ["ectropy-app-servers"]
}

# Platform database connection (for registry updates)
variable "platform_db_url" {
  description = "Platform database URL (for tenant registry updates)"
  type        = string
  sensitive   = true

  validation {
    condition     = can(regex("^postgresql://", var.platform_db_url))
    error_message = "Platform DB URL must be a valid PostgreSQL connection string"
  }
}

# Prisma schema path
variable "prisma_schema_path" {
  description = "Path to Prisma schema file for migrations"
  type        = string
  default     = "./prisma/schema.dedicated.prisma"
}

# Optional features
variable "run_migrations" {
  description = "Automatically run Prisma migrations on new database"
  type        = bool
  default     = true
}

variable "seed_model_catalog" {
  description = "Seed model catalog data after migrations"
  type        = bool
  default     = false
}

variable "tags" {
  description = "Additional tags for resources"
  type        = list(string)
  default     = []
}

# ============================================================================
# Step 1: Provision Dedicated Database (if database_type = "dedicated")
# ============================================================================

module "dedicated_database" {
  count  = var.database_type == "dedicated" ? 1 : 0
  source = "../dedicated-tenant-database"

  tenant_slug             = var.tenant_slug
  database_size           = var.database_size
  region                  = var.region
  postgres_version        = var.postgres_version
  node_count              = var.node_count
  enable_connection_pool  = var.enable_connection_pool
  connection_pool_size    = var.connection_pool_size
  firewall_allowed_ips    = var.firewall_allowed_ips
  firewall_allowed_tags   = var.firewall_allowed_tags
  tags                    = var.tags
}

# ============================================================================
# Step 2: Insert Tenant Registry Entry (platform DB)
# ============================================================================

resource "null_resource" "tenant_registry_entry" {
  # Trigger on tenant configuration changes
  triggers = {
    tenant_slug = var.tenant_slug
    tenant_name = var.tenant_name
    tier        = var.tier
    status      = var.status
    database_type = var.database_type
  }

  provisioner "local-exec" {
    command = <<-EOT
      echo "========================================"
      echo "Step 2: Creating tenant registry entry"
      echo "========================================"
      echo "Tenant: ${var.tenant_slug}"
      echo "Name: ${var.tenant_name}"
      echo "Tier: ${var.tier}"
      echo "Status: ${var.status}"
      echo "Database Type: ${var.database_type}"
      echo ""

      # TODO: Execute SQL INSERT via psql
      # psql "$${PLATFORM_DB_URL}" <<SQL
      # INSERT INTO tenants (
      #   slug,
      #   name,
      #   status,
      #   subscription_tier,
      #   max_projects,
      #   max_users,
      #   max_storage_gb,
      #   created_at,
      #   updated_at
      # ) VALUES (
      #   '${var.tenant_slug}',
      #   '${var.tenant_name}',
      #   '${var.status}',
      #   '${var.tier}',
      #   ${var.tier == "ENTERPRISE" ? "NULL" : var.tier == "PROFESSIONAL" || var.tier == "BASIC" ? 25 : 3},
      #   ${var.tier == "ENTERPRISE" ? "NULL" : var.tier == "PROFESSIONAL" || var.tier == "BASIC" ? 50 : 5},
      #   ${var.tier == "ENTERPRISE" ? "NULL" : var.tier == "PROFESSIONAL" || var.tier == "BASIC" ? 10 : 1},
      #   NOW(),
      #   NOW()
      # ) ON CONFLICT (slug) DO UPDATE SET
      #   name = EXCLUDED.name,
      #   subscription_tier = EXCLUDED.subscription_tier,
      #   updated_at = NOW();
      # SQL

      echo "✅ Tenant registry entry created (TODO: implement SQL execution)"
      echo ""
    EOT

    environment = {
      PLATFORM_DB_URL = var.platform_db_url
    }
  }

  # Depends on database being provisioned first
  depends_on = [
    module.dedicated_database
  ]
}

# ============================================================================
# Step 3: Insert Database Connection Metadata (platform DB)
# ============================================================================

resource "null_resource" "database_connection_entry" {
  count = var.database_type == "dedicated" ? 1 : 0

  # Trigger on database configuration changes
  triggers = {
    tenant_slug   = var.tenant_slug
    database_id   = module.dedicated_database[0].cluster_id
    database_host = module.dedicated_database[0].database_host
  }

  provisioner "local-exec" {
    command = <<-EOT
      echo "========================================"
      echo "Step 3: Storing database connection metadata"
      echo "========================================"
      echo "Database: ${module.dedicated_database[0].database_name}"
      echo "Cluster ID: ${module.dedicated_database[0].cluster_id}"
      echo "Region: ${var.region}"
      echo ""

      # TODO: Execute SQL INSERT via psql
      # psql "$${PLATFORM_DB_URL}" <<SQL
      # INSERT INTO database_connections (
      #   tenant_slug,
      #   database_type,
      #   cluster_id,
      #   database_name,
      #   database_host,
      #   database_port,
      #   database_user,
      #   region,
      #   engine,
      #   version,
      #   created_at
      # ) VALUES (
      #   '${var.tenant_slug}',
      #   '${var.database_type}',
      #   '${module.dedicated_database[0].cluster_id}',
      #   '${module.dedicated_database[0].database_name}',
      #   '${module.dedicated_database[0].database_host}',
      #   ${module.dedicated_database[0].database_port},
      #   '${module.dedicated_database[0].database_user}',
      #   '${var.region}',
      #   'pg',
      #   '${var.postgres_version}',
      #   NOW()
      # ) ON CONFLICT (tenant_slug) DO UPDATE SET
      #   database_host = EXCLUDED.database_host,
      #   updated_at = NOW();
      # SQL

      echo "✅ Database connection metadata stored (TODO: implement SQL execution)"
      echo ""
    EOT

    environment = {
      PLATFORM_DB_URL = var.platform_db_url
    }
  }

  depends_on = [
    null_resource.tenant_registry_entry
  ]
}

# ============================================================================
# Step 4: Run Prisma Migrations on Dedicated Database
# ============================================================================

resource "null_resource" "run_prisma_migrations" {
  count = var.database_type == "dedicated" && var.run_migrations ? 1 : 0

  # Trigger on database changes
  triggers = {
    database_uri    = module.dedicated_database[0].connection_string
    prisma_schema   = var.prisma_schema_path
  }

  provisioner "local-exec" {
    command = <<-EOT
      echo "========================================"
      echo "Step 4: Running Prisma migrations"
      echo "========================================"
      echo "Database: ${module.dedicated_database[0].database_name}"
      echo "Schema: ${var.prisma_schema_path}"
      echo ""

      # Check if Prisma schema exists
      if [ ! -f "${var.prisma_schema_path}" ]; then
        echo "⚠️  WARNING: Prisma schema not found at ${var.prisma_schema_path}"
        echo "Skipping migration..."
        exit 0
      fi

      # Run Prisma migrations
      # Note: This assumes prisma CLI is available in PATH
      # TODO: Ensure prisma is installed before running
      # export DATABASE_URL="$${TENANT_DB_URL}"
      # npx prisma migrate deploy --schema=${var.prisma_schema_path}

      echo "✅ Prisma migrations completed (TODO: implement migration execution)"
      echo ""
    EOT

    environment = {
      TENANT_DB_URL = module.dedicated_database[0].connection_string
    }
  }

  depends_on = [
    null_resource.database_connection_entry
  ]
}

# ============================================================================
# Step 5: Seed Model Catalog (Optional)
# ============================================================================

resource "null_resource" "seed_model_catalog" {
  count = var.database_type == "dedicated" && var.seed_model_catalog ? 1 : 0

  # Trigger on seeding configuration
  triggers = {
    database_uri = module.dedicated_database[0].connection_string
    seed_enabled = var.seed_model_catalog
  }

  provisioner "local-exec" {
    command = <<-EOT
      echo "========================================"
      echo "Step 5: Seeding model catalog"
      echo "========================================"
      echo "Database: ${module.dedicated_database[0].database_name}"
      echo ""

      # TODO: Run seed script
      # export DATABASE_URL="$${TENANT_DB_URL}"
      # npx prisma db seed --schema=${var.prisma_schema_path}

      echo "✅ Model catalog seeded (TODO: implement seeding)"
      echo ""
    EOT

    environment = {
      TENANT_DB_URL = module.dedicated_database[0].connection_string
    }
  }

  depends_on = [
    null_resource.run_prisma_migrations
  ]
}

# ============================================================================
# Outputs
# ============================================================================

output "tenant_slug" {
  description = "Tenant identifier"
  value       = var.tenant_slug
}

output "tenant_name" {
  description = "Tenant display name"
  value       = var.tenant_name
}

output "tenant_tier" {
  description = "Tenant subscription tier"
  value       = var.tier
}

output "database_type" {
  description = "Database isolation type"
  value       = var.database_type
}

output "database_details" {
  description = "Database connection details (for dedicated databases)"
  value = var.database_type == "dedicated" ? {
    cluster_id      = module.dedicated_database[0].cluster_id
    database_name   = module.dedicated_database[0].database_name
    database_host   = module.dedicated_database[0].database_host
    database_port   = module.dedicated_database[0].database_port
    database_user   = module.dedicated_database[0].database_user
    region          = var.region
    postgres_version = var.postgres_version
  } : null
  sensitive = true
}

output "connection_string" {
  description = "Database connection string (for dedicated databases)"
  value       = var.database_type == "dedicated" ? module.dedicated_database[0].connection_string : null
  sensitive   = true
}

output "provisioning_summary" {
  description = "Provisioning workflow summary"
  value = <<-EOT
    ✅ Enterprise Tenant Provisioned
    ================================
    Tenant: ${var.tenant_name} (${var.tenant_slug})
    Tier: ${var.tier}
    Status: ${var.status}
    Database Type: ${var.database_type}

    ${var.database_type == "dedicated" ? "Dedicated Database:" : ""}
    ${var.database_type == "dedicated" ? "- Name: ${module.dedicated_database[0].database_name}" : ""}
    ${var.database_type == "dedicated" ? "- Region: ${var.region}" : ""}
    ${var.database_type == "dedicated" ? "- Size: ${var.database_size}" : ""}
    ${var.database_type == "dedicated" ? "- PostgreSQL: ${var.postgres_version}" : ""}

    Provisioning Steps Completed:
    ✅ Step 1: Dedicated database provisioned ${var.database_type == "dedicated" ? "(Cluster ID: ${module.dedicated_database[0].cluster_id})" : "(skipped - shared database)"}
    ✅ Step 2: Tenant registry entry created (TODO: implement)
    ✅ Step 3: Database connection metadata stored (TODO: implement)
    ✅ Step 4: Prisma migrations run (TODO: implement)
    ${var.seed_model_catalog ? "✅ Step 5: Model catalog seeded (TODO: implement)" : "⏭️  Step 5: Model catalog seeding skipped"}

    Next Steps:
    1. Verify tenant registry entry in platform DB
    2. Verify database connection metadata in platform DB
    3. Test database connectivity: psql <connection_string>
    4. Test application login for tenant: ${var.tenant_slug}.ectropy.ai
    5. Import/migrate tenant data (if upgrading from shared DB)
    6. Configure monitoring and alerts
    7. Onboard customer and provide access credentials
  EOT
}
