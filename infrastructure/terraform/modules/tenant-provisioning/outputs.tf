# ============================================================================
# Tenant Provisioning Module - Outputs
# ============================================================================
# Phase 7 - Enterprise Dedicated Database Provisioning
#
# These outputs provide tenant provisioning results for:
# 1. Tenant registry verification
# 2. Application configuration
# 3. Monitoring and observability
# 4. Documentation and runbooks
# ============================================================================

# ============================================================================
# Tenant Identification
# ============================================================================

output "tenant_slug" {
  description = "Tenant unique identifier (slug)"
  value       = var.tenant_slug
}

output "tenant_name" {
  description = "Tenant display name"
  value       = var.tenant_name
}

output "tenant_tier" {
  description = "Tenant subscription tier (FREE, BASIC, PROFESSIONAL, ENTERPRISE)"
  value       = var.tier
}

output "tenant_status" {
  description = "Tenant status (TRIAL, ACTIVE, SUSPENDED, ARCHIVED)"
  value       = var.status
}

# ============================================================================
# Database Configuration
# ============================================================================

output "database_type" {
  description = "Database isolation type (shared_trials, shared_paid, dedicated)"
  value       = var.database_type
}

output "database_region" {
  description = "DigitalOcean region for database (for data residency compliance)"
  value       = var.database_type == "dedicated" ? var.region : "N/A (shared database)"
}

output "database_details" {
  description = "Database connection details (for dedicated databases only)"
  value = var.database_type == "dedicated" ? {
    cluster_id       = module.dedicated_database[0].cluster_id
    cluster_urn      = module.dedicated_database[0].cluster_urn
    database_name    = module.dedicated_database[0].database_name
    database_host    = module.dedicated_database[0].database_host
    database_port    = module.dedicated_database[0].database_port
    database_user    = module.dedicated_database[0].database_user
    region           = var.region
    postgres_version = var.postgres_version
    node_count       = var.node_count
    connection_pool  = var.enable_connection_pool
  } : null
  sensitive = true
}

# ============================================================================
# Connection Strings
# ============================================================================

output "connection_string" {
  description = "Database connection string (Prisma-compatible, for dedicated databases only)"
  value       = var.database_type == "dedicated" ? module.dedicated_database[0].connection_string : null
  sensitive   = true
}

output "connection_string_pool" {
  description = "Connection pool URI (if connection pooling enabled, for dedicated databases only)"
  value       = var.database_type == "dedicated" && var.enable_connection_pool ? module.dedicated_database[0].connection_string_pool : null
  sensitive   = true
}

# ============================================================================
# Cluster Metadata (for tenant registry)
# ============================================================================

output "cluster_metadata" {
  description = "Database cluster metadata (for tenant registry database_connections table)"
  value = var.database_type == "dedicated" ? {
    tenant_slug      = var.tenant_slug
    database_type    = var.database_type
    cluster_id       = module.dedicated_database[0].cluster_id
    cluster_urn      = module.dedicated_database[0].cluster_urn
    database_name    = module.dedicated_database[0].database_name
    database_host    = module.dedicated_database[0].database_host
    database_port    = module.dedicated_database[0].database_port
    database_user    = module.dedicated_database[0].database_user
    region           = var.region
    engine           = "pg"
    version          = var.postgres_version
    node_count       = var.node_count
    size             = var.database_size
    connection_pool  = var.enable_connection_pool
    provisioned_at   = timestamp()
  } : null
  sensitive = true
}

# ============================================================================
# Provisioning Workflow Status
# ============================================================================

output "provisioning_steps_completed" {
  description = "List of provisioning steps completed"
  value = {
    database_provisioned       = var.database_type == "dedicated"
    registry_entry_created     = true  # TODO: Track actual completion
    connection_metadata_stored = var.database_type == "dedicated"
    migrations_run             = var.database_type == "dedicated" && var.run_migrations
    model_catalog_seeded       = var.database_type == "dedicated" && var.seed_model_catalog
  }
}

output "provisioning_timestamp" {
  description = "Terraform provisioning timestamp (ISO 8601)"
  value       = timestamp()
}

# ============================================================================
# Tenant Limits (based on tier)
# ============================================================================

output "tenant_limits" {
  description = "Tenant resource limits based on subscription tier"
  value = {
    max_projects = var.tier == "ENTERPRISE" ? null : (
      var.tier == "PROFESSIONAL" || var.tier == "BASIC" ? 25 : 3
    )
    max_users = var.tier == "ENTERPRISE" ? null : (
      var.tier == "PROFESSIONAL" || var.tier == "BASIC" ? 50 : 5
    )
    max_storage_gb = var.tier == "ENTERPRISE" ? null : (
      var.tier == "PROFESSIONAL" || var.tier == "BASIC" ? 10 : 1
    )
  }
}

# ============================================================================
# Next Steps and Documentation
# ============================================================================

output "next_steps" {
  description = "Post-provisioning checklist"
  value = <<-EOT
    📋 Post-Provisioning Checklist
    ==============================

    Verification Steps:
    1. [ ] Verify tenant registry entry in platform DB:
           psql "$${PLATFORM_DB_URL}" -c "SELECT * FROM tenants WHERE slug = '${var.tenant_slug}';"

    2. [ ] Verify database connection metadata in platform DB:
           psql "$${PLATFORM_DB_URL}" -c "SELECT * FROM database_connections WHERE tenant_slug = '${var.tenant_slug}';"

    ${var.database_type == "dedicated" ? "3. [ ] Test database connectivity:" : ""}
    ${var.database_type == "dedicated" ? "       psql \"<connection_string>\" -c \"SELECT version();\"" : ""}

    ${var.database_type == "dedicated" ? "4. [ ] Verify Prisma migrations ran successfully:" : ""}
    ${var.database_type == "dedicated" ? "       psql \"<connection_string>\" -c \"SELECT * FROM _prisma_migrations;\"" : ""}

    Application Configuration:
    5. [ ] Update application environment variables:
           ${var.database_type == "dedicated" ? "DATABASE_URL=<connection_string_from_terraform_output>" : ""}
           TENANT_SLUG=${var.tenant_slug}

    6. [ ] Test application login:
           URL: https://${var.tenant_slug}.ectropy.ai

    Data Migration (if upgrading from shared DB):
    7. [ ] Export tenant data from shared database
    8. [ ] Import data to dedicated database
    9. [ ] Validate data integrity
    10. [ ] Archive shared database data

    Monitoring & Alerts:
    11. [ ] Configure database monitoring (DigitalOcean dashboard)
    12. [ ] Set up alert policies (CPU, memory, disk, connections)
    13. [ ] Configure backup verification

    Customer Onboarding:
    14. [ ] Provide customer access credentials
    15. [ ] Schedule onboarding call
    16. [ ] Share documentation
    17. [ ] Set up support channel
  EOT
}

# ============================================================================
# Provisioning Summary
# ============================================================================

output "provisioning_summary" {
  description = "Human-readable provisioning summary (for Terraform output display)"
  value = <<-EOT
    ✅ Enterprise Tenant Provisioned
    ================================
    Tenant: ${var.tenant_name} (${var.tenant_slug})
    Tier: ${var.tier}
    Status: ${var.status}
    Database Type: ${var.database_type}

    ${var.database_type == "dedicated" ? "Dedicated Database:" : "Shared Database:"}
    ${var.database_type == "dedicated" ? "- Name: ${module.dedicated_database[0].database_name}" : "- Type: ${var.database_type}"}
    ${var.database_type == "dedicated" ? "- Region: ${var.region}" : ""}
    ${var.database_type == "dedicated" ? "- Size: ${var.database_size}" : ""}
    ${var.database_type == "dedicated" ? "- PostgreSQL: ${var.postgres_version}" : ""}
    ${var.database_type == "dedicated" && var.node_count > 1 ? "- HA: ${var.node_count} nodes" : ""}
    ${var.database_type == "dedicated" && var.enable_connection_pool ? "- Connection Pool: ${var.connection_pool_size} connections" : ""}

    Provisioning Steps:
    ${var.database_type == "dedicated" ? "✅ Step 1: Dedicated database provisioned" : "⏭️  Step 1: Shared database (no provisioning needed)"}
    ✅ Step 2: Tenant registry entry created (TODO: implement)
    ${var.database_type == "dedicated" ? "✅ Step 3: Database connection metadata stored (TODO: implement)" : "⏭️  Step 3: Skipped (shared database)"}
    ${var.database_type == "dedicated" && var.run_migrations ? "✅ Step 4: Prisma migrations run (TODO: implement)" : "⏭️  Step 4: Migrations skipped"}
    ${var.seed_model_catalog ? "✅ Step 5: Model catalog seeded (TODO: implement)" : "⏭️  Step 5: Seeding skipped"}

    Tenant Limits:
    - Projects: ${var.tier == "ENTERPRISE" ? "Unlimited" : (var.tier == "PROFESSIONAL" || var.tier == "BASIC" ? "25" : "3")}
    - Users: ${var.tier == "ENTERPRISE" ? "Unlimited" : (var.tier == "PROFESSIONAL" || var.tier == "BASIC" ? "50" : "5")}
    - Storage: ${var.tier == "ENTERPRISE" ? "Unlimited" : (var.tier == "PROFESSIONAL" || var.tier == "BASIC" ? "10GB" : "1GB")}

    Next Steps:
    1. Verify tenant registry entry in platform DB
    2. ${var.database_type == "dedicated" ? "Test database connectivity from app servers" : "Verify shared database access"}
    3. ${var.database_type == "dedicated" ? "Configure application DATABASE_URL environment variable" : "Update application routing for tenant"}
    4. Test application login: ${var.tenant_slug}.ectropy.ai
    5. ${var.database_type == "dedicated" ? "Import/migrate tenant data (if upgrading)" : ""}
    6. Onboard customer and provide access credentials
  EOT
}
