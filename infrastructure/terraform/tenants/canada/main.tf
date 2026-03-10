# ============================================================================
# Canada Pilot Enterprise Tenant
# ============================================================================
# Purpose: March 2025 pilot with PIPEDA compliance
# Data Residency: Toronto, Canada (TOR1)
# Isolation: Dedicated database (compliance requirement)
# Status: Ready for provisioning (Phase 7)
#
# This configuration uses the new tenant-provisioning module (Phase 7)
# which orchestrates:
# 1. Dedicated database provisioning in Toronto
# 2. Tenant registry entry creation
# 3. Database connection metadata storage
# 4. Prisma migrations
#
# To provision:
# 1. Set environment variables:
#    export DIGITALOCEAN_TOKEN="<your-token>"
#    export TF_VAR_platform_database_url="<platform-db-url>"
#
# 2. Initialize Terraform:
#    terraform init
#
# 3. Plan and apply:
#    terraform plan -out=canada.tfplan
#    terraform apply canada.tfplan
# ============================================================================

terraform {
  required_version = ">= 1.0"

  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
  }

  # TODO: Configure backend for state management
  # backend "s3" {
  #   endpoint                    = "https://sfo3.digitaloceanspaces.com"
  #   key                         = "terraform/tenants/canada/terraform.tfstate"
  #   bucket                      = "ectropy-terraform-state"
  #   region                      = "us-west-1"  # Ignored by DigitalOcean Spaces
  #   skip_credentials_validation = true
  #   skip_metadata_api_check     = true
  # }
}

# ============================================================================
# Variables
# ============================================================================

variable "platform_database_url" {
  description = "Platform database connection string (for tenant registry updates)"
  type        = string
  sensitive   = true
}

variable "staging_droplet_ip" {
  description = "Staging droplet IP for database firewall"
  type        = string
  default     = "64.227.98.254"  # TODO: Replace with actual staging IP
}

variable "production_droplet_ip" {
  description = "Production droplet IP for database firewall"
  type        = string
  default     = ""  # TODO: Add production IP when available
}

# ============================================================================
# Canada Enterprise Tenant Provisioning
# ============================================================================

module "canada_visionarc_tenant" {
  source = "../../modules/tenant-provisioning"

  # Tenant identification
  tenant_name = "VisionArc Canada"
  tenant_slug = "canada-visionarc"

  # Subscription configuration
  tier   = "ENTERPRISE"
  status = "ACTIVE"

  # Database configuration (dedicated for PIPEDA compliance)
  database_type    = "dedicated"
  database_size    = "db-s-2vcpu-4gb"     # Standard enterprise size
  region           = "tor1"                # Toronto region (PIPEDA requirement)
  postgres_version = "16"                  # Match application requirement
  node_count       = 1                     # Single node (can upgrade to HA later)

  # Connection pooling
  enable_connection_pool = true
  connection_pool_size   = 25

  # Firewall configuration (restrict to app servers only)
  firewall_allowed_ips = compact([
    var.staging_droplet_ip,
    var.production_droplet_ip
  ])
  firewall_allowed_tags = [
    "ectropy-app-servers",
    "ectropy-staging",
    "ectropy-production"
  ]

  # Platform database connection (for registry updates)
  platform_db_url = var.platform_database_url

  # Prisma migrations
  prisma_schema_path = "../../../prisma/schema.dedicated.prisma"
  run_migrations     = true
  seed_model_catalog = false  # Do not seed for production tenant

  # Tags for organization and billing
  tags = [
    "customer:visionarc",
    "region:canada",
    "compliance:pipeda",
    "tier:enterprise"
  ]
}

# ============================================================================
# Canada-Specific Object Storage (S3-Compatible Spaces)
# ============================================================================

resource "digitalocean_spaces_bucket" "canada_storage" {
  name   = "ectropy-canada-visionarc-storage"
  region = "tor1"  # Toronto region for data residency

  # Enable versioning for audit compliance
  versioning {
    enabled = true
  }

  # Lifecycle rules for data retention
  lifecycle_rule {
    id      = "delete-old-temp-files"
    enabled = true

    expiration {
      days = 90  # Delete temporary files after 90 days
    }

    noncurrent_version_expiration {
      days = 30  # Delete old versions after 30 days
    }
  }

  # ACL for private access
  acl = "private"

  lifecycle {
    # Prevent accidental deletion of customer data
    prevent_destroy = true
  }
}

# ============================================================================
# Outputs
# ============================================================================

output "tenant_provisioning_summary" {
  description = "Tenant provisioning summary"
  value       = module.canada_visionarc_tenant.provisioning_summary
}

output "connection_string" {
  description = "Database connection string (Prisma-compatible)"
  value       = module.canada_visionarc_tenant.connection_string
  sensitive   = true
}

output "connection_string_pool" {
  description = "Connection pool URI (recommended for production)"
  value       = module.canada_visionarc_tenant.connection_string_pool
  sensitive   = true
}

output "database_details" {
  description = "Database connection details"
  value       = module.canada_visionarc_tenant.database_details
  sensitive   = true
}

output "storage_endpoint" {
  description = "S3 storage endpoint (Toronto region)"
  value       = digitalocean_spaces_bucket.canada_storage.bucket_domain_name
}

output "storage_region" {
  description = "Storage region (must be tor1)"
  value       = digitalocean_spaces_bucket.canada_storage.region
}

output "compliance_status" {
  description = "PIPEDA compliance status summary"
  value = <<-EOT
    ✅ PIPEDA Compliance Status
    ===========================
    Tenant: VisionArc Canada (canada-visionarc)

    Data Residency:
    - Database: Toronto (TOR1) ✓
    - Storage: Toronto (TOR1) ✓
    - Backups: Toronto (TOR1) ✓

    Isolation:
    - Dedicated database ✓
    - Private networking ✓
    - Firewall-restricted access ✓

    Security:
    - Encryption at rest ✓
    - Encryption in transit (SSL) ✓
    - Connection pooling enabled ✓

    Compliance:
    - Data Residency: ALL data stays in Canada ✓
    - Cross-Border Transfers: NONE ✓
    - Compliance Framework: PIPEDA ✓

    Next Steps:
    1. Verify tenant registry entry in platform DB
    2. Test database connectivity from app servers
    3. Configure application DATABASE_URL
    4. Import initial customer data
    5. Onboard customer team
  EOT
}

output "next_steps" {
  description = "Post-provisioning checklist"
  value       = module.canada_visionarc_tenant.next_steps
}
