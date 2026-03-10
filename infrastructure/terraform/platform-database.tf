# ============================================================================
# Platform Database - Global Metadata
# ============================================================================
# Purpose: Global platform database for model catalog, tenant registry,
#          database connections, user authentication, billing
# Database: ectropy_platform
# Phase: Phase 1 - Task 1.1
# Date: 2026-02-10
# Architecture: Database-per-tenant enterprise scaling
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

# Provider configuration (uses DIGITALOCEAN_TOKEN env var)
provider "digitalocean" {}

# ============================================================================
# Data Sources - Get existing VPC
# ============================================================================
# Using existing staging VPC for platform database (same network isolation)
# Future: Create dedicated platform VPC for production isolation

data "digitalocean_vpc" "staging" {
  name = "ectropy-staging-vpc"
}

# ============================================================================
# Platform Database Cluster
# ============================================================================

module "platform_database" {
  source = "../../terraform/modules/database"

  # Database configuration
  name            = "ectropy-platform-db"
  project_name    = "ectropy"
  environment     = "platform"
  engine          = "pg"
  engine_version  = "16"
  size            = "db-s-2vcpu-4gb" # 2 vCPU, 4GB RAM, $60/month
  region          = "sfo3"
  node_count      = 1                 # Single node for cost optimization

  # Network isolation - Use staging VPC
  vpc_uuid = data.digitalocean_vpc.staging.id

  # Logical databases to create
  databases = ["ectropy_platform"]

  # Database users (default: doadmin is created automatically)
  users = {}

  # Connection pools for Prisma (PostgreSQL only)
  connection_pools = {
    "platform_pool" = {
      mode    = "transaction" # Best for Prisma (statement pooling)
      size    = 25            # Connection pool size
      db_name = "ectropy_platform"
      user    = "doadmin"
    }
  }

  # Firewall rules - Allow access from staging droplet
  # NOTE: Add additional droplets/IPs as needed
  firewall_rules = [
    {
      type  = "tag"
      value = "ectropy" # Allows all Ectropy droplets (staging, production)
    }
  ]

  # Maintenance window (Sunday 2 AM UTC)
  maintenance_window_day  = "sunday"
  maintenance_window_hour = "02:00"

  # Tags for organization
  tags = [
    "platform-database",
    "global-metadata",
    "phase-1",
    "ectropy"
  ]

  # Project assignment - Ectropy project
  project_id = "57d9a21d-f4e4-48a0-868b-9dcec83e21cb"

  # Lifecycle protection - Prevent accidental destruction
  prevent_destroy = true
}

# ============================================================================
# Outputs
# ============================================================================

output "platform_database_id" {
  description = "Platform database cluster ID"
  value       = module.platform_database.id
}

output "platform_database_host" {
  description = "Platform database host"
  value       = module.platform_database.host
  sensitive   = true
}

output "platform_database_private_host" {
  description = "Platform database private host (VPC)"
  value       = module.platform_database.private_host
  sensitive   = true
}

output "platform_database_port" {
  description = "Platform database port"
  value       = module.platform_database.port
  sensitive   = true
}

output "platform_database_user" {
  description = "Platform database admin user"
  value       = module.platform_database.user
  sensitive   = true
}

output "platform_database_password" {
  description = "Platform database admin password"
  value       = module.platform_database.password
  sensitive   = true
}

output "platform_database_name" {
  description = "Platform database logical database name"
  value       = "ectropy_platform"
}

output "platform_database_uri" {
  description = "Platform database connection URI (public)"
  value       = module.platform_database.uri
  sensitive   = true
}

output "platform_database_private_uri" {
  description = "Platform database private connection URI (VPC)"
  value       = module.platform_database.private_uri
  sensitive   = true
}

output "platform_database_connection_string" {
  description = "Platform database connection string for Prisma (public)"
  value       = "${module.platform_database.uri}?sslmode=require"
  sensitive   = true
}

output "platform_database_private_connection_string" {
  description = "Platform database connection string for Prisma (VPC - preferred)"
  value       = "${module.platform_database.private_uri}?sslmode=require"
  sensitive   = true
}

output "platform_database_pool_uri" {
  description = "Platform database connection pool URI (use this for production)"
  value       = module.platform_database.connection_pools["platform_pool"].uri
  sensitive   = true
}

output "platform_database_pool_connection_string" {
  description = "Platform database pool connection string for Prisma (RECOMMENDED)"
  value       = "${module.platform_database.connection_pools["platform_pool"].uri}?sslmode=require"
  sensitive   = true
}

# ============================================================================
# Helpful Commands
# ============================================================================
# Initialize: terraform init
# Plan: terraform plan -out=platform-db.tfplan
# Apply: terraform apply platform-db.tfplan
# Show outputs: terraform output -json > platform-db-outputs.json
# Get connection string: terraform output -raw platform_database_pool_connection_string
# Destroy (DANGER): terraform destroy -target=module.platform_database
# ============================================================================
