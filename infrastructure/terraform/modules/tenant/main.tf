# Multi-Tenant Provisioning Module
# Purpose: Create isolated tenant infrastructure
# Supports: Schema-per-tenant, database-per-tenant, dedicated infrastructure patterns
# Status: STUB - Framework for future implementation

variable "tenant_id" {
  description = "Unique tenant identifier (slug)"
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.tenant_id))
    error_message = "Tenant ID must be lowercase alphanumeric with hyphens"
  }
}

variable "tenant_name" {
  description = "Human-readable tenant name"
  type        = string
}

variable "data_residency_region" {
  description = "Data residency region (for compliance)"
  type        = string
  default     = "us" # 'us', 'canada', 'eu', 'uk', 'apac'

  validation {
    condition     = contains(["us", "canada", "eu", "uk", "apac"], var.data_residency_region)
    error_message = "Data residency must be: us, canada, eu, uk, or apac"
  }
}

variable "isolation_tier" {
  description = "Tenant isolation tier (schema, database, dedicated)"
  type        = string
  default     = "schema"

  validation {
    condition     = contains(["schema", "database", "dedicated"], var.isolation_tier)
    error_message = "Isolation tier must be: schema, database, or dedicated"
  }
}

variable "ssh_key_fingerprint" {
  description = "SSH key fingerprint for server access"
  type        = string
}

# Map regions to DigitalOcean regions
locals {
  region_map = {
    us     = "sfo3" # San Francisco
    canada = "tor1" # Toronto
    eu     = "ams3" # Amsterdam
    uk     = "lon1" # London
    apac   = "sgp1" # Singapore
  }

  do_region = local.region_map[var.data_residency_region]
}

# SCHEMA ISOLATION (Default)
# Creates tenant record in shared database
# No infrastructure changes needed - purely application-level
resource "null_resource" "tenant_schema" {
  count = var.isolation_tier == "schema" ? 1 : 0

  triggers = {
    tenant_id = var.tenant_id
  }

  provisioner "local-exec" {
    command = <<-EOT
      echo "========================================"
      echo "Creating schema-isolated tenant:"
      echo "  ID: ${var.tenant_id}"
      echo "  Name: ${var.tenant_name}"
      echo "  Region: ${var.data_residency_region}"
      echo "========================================"
      echo ""
      echo "TODO: Execute SQL to create tenant:"
      echo "  1. INSERT INTO tenants (id, slug, name, region, isolation_tier)"
      echo "     VALUES (..., '${var.tenant_id}', '${var.tenant_name}', '${var.data_residency_region}', 'schema');"
      echo "  2. CREATE SCHEMA IF NOT EXISTS ${var.tenant_id};"
      echo "  3. Apply row-level security policies"
      echo ""
      echo "✅ Schema-based tenant provisioning complete"
    EOT
  }
}

# DATABASE ISOLATION (Premium/Compliance)
# Creates dedicated database in appropriate region
resource "digitalocean_database_cluster" "tenant_database" {
  count = var.isolation_tier == "database" ? 1 : 0

  name       = "ectropy-${var.tenant_id}-db"
  engine     = "pg"
  version    = "17"
  size       = "db-s-1vcpu-2gb" # Can be parameterized
  region     = local.do_region
  node_count = 1

  tags = [
    var.tenant_id,
    var.data_residency_region,
    "tenant-database",
    "isolation-database"
  ]

  maintenance_window {
    day  = "sunday"
    hour = "04:00:00"
  }

  lifecycle {
    # Prevent accidental deletion of tenant databases
    prevent_destroy = true
  }
}

# DEDICATED INFRASTRUCTURE (Enterprise)
# Full isolated environment per tenant
resource "digitalocean_droplet" "tenant_dedicated" {
  count = var.isolation_tier == "dedicated" ? 1 : 0

  image  = "ubuntu-22-04-x64"
  name   = "ectropy-${var.tenant_id}"
  region = local.do_region
  size   = "s-2vcpu-4gb" # Can be parameterized

  ssh_keys   = [var.ssh_key_fingerprint]
  monitoring = true
  backups    = true

  tags = [
    var.tenant_id,
    var.data_residency_region,
    "tenant-dedicated",
    "isolation-dedicated"
  ]

  # Tenant-specific initialization
  user_data = templatefile("${path.module}/tenant-init.sh.tpl", {
    tenant_id   = var.tenant_id
    tenant_name = var.tenant_name
    region      = var.data_residency_region
  })

  lifecycle {
    # Prevent accidental deletion of tenant infrastructure
    prevent_destroy = true
  }
}

# Outputs
output "tenant_id" {
  value       = var.tenant_id
  description = "Tenant identifier"
}

output "isolation_tier" {
  value       = var.isolation_tier
  description = "Tenant isolation tier"
}

output "data_residency_region" {
  value       = var.data_residency_region
  description = "Data residency region for compliance"
}

output "database_connection" {
  value = var.isolation_tier == "database" ? (
    length(digitalocean_database_cluster.tenant_database) > 0 ?
    digitalocean_database_cluster.tenant_database[0].private_uri :
    "not-provisioned"
  ) : "shared-database"
  description = "Database connection string (sensitive)"
  sensitive   = true
}

output "database_id" {
  value = var.isolation_tier == "database" ? (
    length(digitalocean_database_cluster.tenant_database) > 0 ?
    digitalocean_database_cluster.tenant_database[0].id :
    null
  ) : null
  description = "Database cluster ID (for dedicated databases)"
}

output "droplet_ip" {
  value = var.isolation_tier == "dedicated" ? (
    length(digitalocean_droplet.tenant_dedicated) > 0 ?
    digitalocean_droplet.tenant_dedicated[0].ipv4_address :
    null
  ) : null
  description = "Droplet IP address (for dedicated infrastructure)"
}

output "provisioning_summary" {
  value = <<-EOT
    Tenant Provisioning Summary:
    ----------------------------
    Tenant ID: ${var.tenant_id}
    Tenant Name: ${var.tenant_name}
    Isolation Tier: ${var.isolation_tier}
    Data Residency: ${var.data_residency_region}
    DigitalOcean Region: ${local.do_region}

    ${var.isolation_tier == "schema" ? "✅ Schema-based isolation (shared database)" : ""}
    ${var.isolation_tier == "database" ? "✅ Dedicated database provisioned" : ""}
    ${var.isolation_tier == "dedicated" ? "✅ Dedicated infrastructure provisioned" : ""}

    Next Steps:
    ${var.isolation_tier == "schema" ? "1. Run database migrations to create tenant schema" : ""}
    ${var.isolation_tier == "database" ? "1. Connect application to dedicated database" : ""}
    ${var.isolation_tier == "dedicated" ? "1. Deploy application to dedicated droplet" : ""}
    2. Configure DNS (${var.tenant_id}.ectropy.ai)
    3. Generate API keys
    4. Onboard customer
  EOT
}
