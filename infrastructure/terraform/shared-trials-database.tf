# ============================================================================
# Shared Trials Database - Multi-Tenant with RLS
# ============================================================================
# Purpose: Cost-effective shared database for trial tenants with row-level security
# Database: ectropy_shared_trials (logical database in platform cluster)
# Phase: Phase 2 - Shared Trials Database with RLS
# Date: 2026-02-11
# Architecture: Leverages existing platform cluster for cost optimization
# Note: Shares terraform and provider configuration with platform-database.tf
# ============================================================================

# ============================================================================
# Data Source - Get existing platform database cluster
# ============================================================================

data "digitalocean_database_cluster" "platform" {
  name = "ectropy-platform-db"
}

# ============================================================================
# Shared Trials Logical Database
# ============================================================================
# Creates ectropy_shared_trials database in existing platform cluster
# Cost: $0 additional infrastructure cost (uses existing cluster capacity)
# Scalability: 200-300 trial tenants max on platform cluster
# Future: Can migrate to dedicated cluster when approaching capacity

resource "digitalocean_database_db" "shared_trials" {
  cluster_id = data.digitalocean_database_cluster.platform.id
  name       = "ectropy_shared_trials"
}

# ============================================================================
# Connection Pool for Shared Trials Database
# ============================================================================
# Optimized for multi-tenant trial workloads
# Pool size: 50 connections (higher than platform pool due to multi-tenancy)

resource "digitalocean_database_connection_pool" "trials_pool" {
  cluster_id = data.digitalocean_database_cluster.platform.id
  name       = "trials_pool"
  mode       = "transaction" # Best for Prisma and multi-tenant workloads
  size       = 50             # Increased pool size for trial tenant concurrency
  db_name    = resource.digitalocean_database_db.shared_trials.name
  user       = data.digitalocean_database_cluster.platform.user

  depends_on = [digitalocean_database_db.shared_trials]
}

# ============================================================================
# Outputs
# ============================================================================

output "shared_trials_database_name" {
  description = "Shared trials database logical database name"
  value       = digitalocean_database_db.shared_trials.name
}

output "shared_trials_cluster_id" {
  description = "Platform database cluster ID (shared with platform DB)"
  value       = data.digitalocean_database_cluster.platform.id
}

output "shared_trials_connection_string" {
  description = "Shared trials database connection string (direct)"
  value       = "postgresql://${data.digitalocean_database_cluster.platform.user}:${data.digitalocean_database_cluster.platform.password}@${data.digitalocean_database_cluster.platform.host}:${data.digitalocean_database_cluster.platform.port}/${digitalocean_database_db.shared_trials.name}?sslmode=require"
  sensitive   = true
}

output "shared_trials_private_connection_string" {
  description = "Shared trials database private connection string (VPC)"
  value       = "postgresql://${data.digitalocean_database_cluster.platform.user}:${data.digitalocean_database_cluster.platform.password}@${data.digitalocean_database_cluster.platform.private_host}:${data.digitalocean_database_cluster.platform.port}/${digitalocean_database_db.shared_trials.name}?sslmode=require"
  sensitive   = true
}

output "shared_trials_pool_uri" {
  description = "Shared trials connection pool URI (use this for Prisma)"
  value       = resource.digitalocean_database_connection_pool.trials_pool.uri
  sensitive   = true
}

output "shared_trials_pool_connection_string" {
  description = "Shared trials pool connection string for Prisma (RECOMMENDED)"
  value       = "${resource.digitalocean_database_connection_pool.trials_pool.uri}?sslmode=require"
  sensitive   = true
}

output "shared_trials_pool_host" {
  description = "Shared trials connection pool host"
  value       = resource.digitalocean_database_connection_pool.trials_pool.host
  sensitive   = true
}

output "shared_trials_pool_port" {
  description = "Shared trials connection pool port"
  value       = resource.digitalocean_database_connection_pool.trials_pool.port
  sensitive   = true
}

# ============================================================================
# Architecture Notes
# ============================================================================
# Option B (Implemented): Add logical database to platform cluster
# - Cost: $0 additional infrastructure (shares platform cluster $60/month)
# - Max tenants: 200-300 trials (cluster capacity dependent)
# - Benefits: No additional infrastructure cost, simpler management
# - Migration path: Move to dedicated cluster when approaching capacity
#
# Option A (Future): Dedicated cluster for trials
# - Cost: $120/month (db-s-4vcpu-8gb)
# - Max tenants: 500 trials
# - When to migrate: When platform cluster reaches 70% capacity
# - Command: Create new cluster, run data migration, update DNS/secrets
# ============================================================================

# ============================================================================
# Helpful Commands
# ============================================================================
# Initialize: terraform init
# Plan: terraform plan -out=shared-trials-db.tfplan
# Apply: terraform apply shared-trials-db.tfplan
# Get connection string: terraform output -raw shared_trials_pool_connection_string
# Store in GitHub Secrets: terraform output -raw shared_trials_pool_connection_string | gh secret set SHARED_DATABASE_URL --repo luhtech/Ectropy
# ============================================================================
