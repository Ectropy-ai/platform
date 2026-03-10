# ============================================================================
# Ectropy Root Terraform Configuration
# ============================================================================
# Description: Main entry point for Ectropy infrastructure provisioning
# Version: 1.0.0
# Last Updated: 2025-12-14
# Enterprise Transformation: Full IaC implementation
# ============================================================================

terraform {
  required_version = ">= 1.6.0"

  # Remote state backend (configured in backend.tf)
  # backend "s3" {
  #   # Configuration in backend.tf
  # }
}

# ----------------------------------------------------------------------------
# Provider Configuration
# ----------------------------------------------------------------------------

provider "digitalocean" {
  token = var.do_token

  # Optional: spaces access for Terraform state
  spaces_access_id  = var.spaces_access_id
  spaces_secret_key = var.spaces_secret_key
}

# ----------------------------------------------------------------------------
# Local Variables
# ----------------------------------------------------------------------------

locals {
  # Environment-specific naming
  name_prefix = "${var.project_name}-${var.environment}"

  # Common tags for all resources
  common_tags = [
    var.environment,
    var.project_name,
    "terraform-managed",
    "ectropy-platform"
  ]

  # VPC CIDR for private networking (ROOT CAUSE #80, P0 CRITICAL - Enterprise VPC isolation)
  # Phase 1: VPC-per-environment pattern using non-overlapping IP ranges
  # - Production: 10.10.0.0/20 (4,096 IPs, fully isolated)
  # - Staging:    10.20.0.0/20 (4,096 IPs, fully isolated)
  # - Development: 10.30.0.0/20 (4,096 IPs, fully isolated)
  # Replaces shared default-sfo3 VPC (10.124.0.0/20) for SOC 2/ISO 27001/PCI DSS compliance
  vpc_cidr = var.ip_range != "" ? var.ip_range : (
    var.environment == "production" ? "10.10.0.0/20" : (
      var.environment == "staging" ? "10.20.0.0/20" : "10.30.0.0/20"
    )
  )

  # Region selection
  region = var.region != "" ? var.region : "sfo3"

  # SSH allowed IPs (restrict access)
  ssh_allowed_ips = var.ssh_allowed_ips != [] ? var.ssh_allowed_ips : ["0.0.0.0/0"]

  # Load balancer health check configuration (enterprise 4-layer pattern)
  lb_health_check = {
    protocol                 = "http"
    port                     = 80           # nginx reverse proxy port
    path                     = "/lb-health" # independent health endpoint (no dependencies)
    check_interval_seconds   = 10
    response_timeout_seconds = 5
    healthy_threshold        = 2
    unhealthy_threshold      = 3
  }
}

# ----------------------------------------------------------------------------
# Data Sources - Existing Resources
# ----------------------------------------------------------------------------

# Existing VPC (if not creating new one)
data "digitalocean_vpc" "existing" {
  count = var.use_existing_vpc ? 1 : 0
  name  = var.existing_vpc_name
}

# ----------------------------------------------------------------------------
# SSH Key Management Module - Enterprise Key Rotation
# ----------------------------------------------------------------------------

module "ssh_keys" {
  source = "./modules/ssh-keys"

  environment         = var.environment
  key_prefix          = var.project_name
  existing_key_names  = var.ssh_key_names
  generate_new_key    = var.generate_ssh_key
}

# Existing SSH Keys (legacy - kept for compatibility)
data "digitalocean_ssh_keys" "existing" {
  filter {
    key    = "name"
    values = var.ssh_key_names
  }
}

# ----------------------------------------------------------------------------
# VPC Module - Private Networking
# ----------------------------------------------------------------------------

module "vpc" {
  count  = var.use_existing_vpc ? 0 : 1
  source = "./modules/vpc"

  name         = "${local.name_prefix}-vpc"
  region       = local.region
  ip_range     = local.vpc_cidr
  description  = "Private network for ${var.environment} environment"
  project_name = var.project_name
  environment  = var.environment
}

locals {
  vpc_uuid = var.use_existing_vpc ? data.digitalocean_vpc.existing[0].id : module.vpc[0].id
}

# ----------------------------------------------------------------------------
# Firewall Module - Security Rules
# ----------------------------------------------------------------------------

module "firewall" {
  source = "./modules/firewall"

  # FIXED: Use unique name to avoid conflict with existing firewall
  name         = "${local.name_prefix}-tf-managed"
  project_name = var.project_name
  environment  = var.environment

  # Targeting (can use droplet IDs or tags)
  droplet_ids = var.firewall_droplet_ids
  target_tags = var.firewall_target_tags

  # Standard rules (enable as needed)
  enable_ssh_access    = true
  ssh_source_addresses = local.ssh_allowed_ips

  enable_http_access = true
  load_balancer_uids = var.load_balancer_uids

  enable_icmp           = true
  icmp_source_addresses = ["0.0.0.0/0", "::/0"]

  enable_vpc_traffic = true
  vpc_cidr           = local.vpc_cidr

  enable_postgres_access    = var.enable_postgres_firewall
  postgres_source_addresses = [local.vpc_cidr]

  enable_redis_access    = var.enable_redis_firewall
  redis_source_addresses = [local.vpc_cidr]

  enable_default_outbound = true

  # Custom rules
  inbound_rules  = var.custom_inbound_rules
  outbound_rules = var.custom_outbound_rules

  tags = local.common_tags
}

# ----------------------------------------------------------------------------
# Database Module - Managed PostgreSQL
# ----------------------------------------------------------------------------

module "database" {
  count  = var.create_database ? 1 : 0
  source = "./modules/database"

  name           = "${local.name_prefix}-db"
  engine         = "pg"
  engine_version = var.database_version
  size           = var.database_size
  region         = local.region
  node_count     = var.database_node_count
  project_name   = var.project_name
  environment    = var.environment

  # Database configuration (uses flattened parameters)
  databases = var.database_names
  users     = var.database_users

  # High availability - VPC for private networking
  vpc_uuid = local.vpc_uuid

  # Backup configuration (flattened from object)
  backup_restore_enabled           = var.database_backup_timestamp != ""
  backup_restore_database_name     = "ectropy_${var.environment}"
  backup_restore_backup_created_at = var.database_backup_timestamp

  # Maintenance window (flattened from object)
  maintenance_window_day  = "sunday"
  maintenance_window_hour = "04:00"

  # Firewall rules
  firewall_rules = var.database_firewall_rules

  # Project assignment
  project_id = var.project_id
}

# ----------------------------------------------------------------------------
# Cloud-Init Module - Automated Server Provisioning
# ----------------------------------------------------------------------------

module "cloud_init" {
  count  = var.environment == "staging" ? 1 : 0
  source = "./modules/cloud-init"

  environment          = var.environment
  hostname             = "${local.name_prefix}-server"
  domain               = var.staging_domain
  ssh_public_keys      = module.ssh_keys.ssh_public_keys
  docker_registry      = var.docker_registry
  database_url         = var.create_database ? module.database[0].connection_info["uri"] : var.external_database_url
  redis_url            = var.redis_url
  api_url              = var.api_url
  frontend_url         = var.frontend_url
  docr_token           = var.docr_token
  watchtower_token     = var.watchtower_api_token
  google_client_id     = var.google_client_id
  google_client_secret = var.google_client_secret
  jwt_secret           = var.jwt_secret
  jwt_refresh_secret   = var.jwt_refresh_secret
  session_secret       = var.session_secret
}

# ----------------------------------------------------------------------------
# Droplet Module - Application Servers
# ----------------------------------------------------------------------------

# Production Blue Droplet
module "droplet_blue" {
  count  = var.environment == "production" && var.enable_blue_green ? 1 : 0
  source = "./modules/droplet"

  name         = "${local.name_prefix}-blue"
  image        = var.droplet_image
  size         = var.droplet_size
  region       = local.region
  project_name = var.project_name
  environment  = var.environment

  # Networking
  vpc_uuid           = local.vpc_uuid
  ipv6               = var.droplet_ipv6
  monitoring         = true
  private_networking = true

  # SSH keys
  ssh_keys = data.digitalocean_ssh_keys.existing.ssh_keys[*].id

  # User data (cloud-init)
  user_data = var.droplet_user_data_blue

  # Role (required for droplet identification)
  role = "blue"

  # Volume configuration
  volume_size = 0 # Configure if needed via variables

  # Tags
  tags = concat(local.common_tags, ["blue", "blue-green", "dedicated-cpu"])
}

# Production Green Droplet (PRIMARY)
module "droplet_green" {
  count  = var.environment == "production" && var.enable_blue_green ? 1 : 0
  source = "./modules/droplet"

  name         = "${local.name_prefix}-green"
  image        = var.droplet_image
  size         = var.droplet_size
  region       = local.region
  project_name = var.project_name
  environment  = var.environment

  # Networking
  vpc_uuid           = local.vpc_uuid
  ipv6               = var.droplet_ipv6
  monitoring         = true
  private_networking = true

  # SSH keys
  ssh_keys = data.digitalocean_ssh_keys.existing.ssh_keys[*].id

  # User data (cloud-init)
  user_data = var.droplet_user_data_green

  # Role (required for droplet identification)
  role = "green"

  # Volume configuration
  volume_size = 0 # Configure if needed via variables

  # Tags
  tags = concat(local.common_tags, ["green", "blue-green", "dedicated-cpu", "primary"])
}

# Staging/Development Single Droplet
module "droplet_single" {
  count  = var.environment != "production" || !var.enable_blue_green ? 1 : 0
  source = "./modules/droplet"

  name         = "${local.name_prefix}-server"
  image        = var.droplet_image
  size         = var.droplet_size
  region       = local.region
  project_name = var.project_name
  environment  = var.environment

  # Networking
  vpc_uuid           = local.vpc_uuid
  ipv6               = var.droplet_ipv6
  monitoring         = true
  private_networking = true

  # SSH keys - Use enterprise key management
  ssh_keys = module.ssh_keys.ssh_key_ids

  # User data (cloud-init) - Use enterprise provisioning for staging
  user_data = var.environment == "staging" ? module.cloud_init[0].user_data : var.droplet_user_data

  # Role (required for droplet identification)
  role = "primary"

  # Volume configuration
  volume_size = 0 # Configure if needed via variables

  # Tags
  tags = local.common_tags
}

# ----------------------------------------------------------------------------
# Load Balancer Module - Traffic Distribution
# ----------------------------------------------------------------------------

module "load_balancer" {
  count  = var.create_load_balancer ? 1 : 0
  source = "./modules/load-balancer"

  name         = "${local.name_prefix}-lb"
  region       = local.region
  size         = var.load_balancer_size
  project_name = var.project_name
  environment  = var.environment

  # Droplet targeting (ROOT CAUSE #99: Enterprise tag-based pattern for multi-tenant scalability)
  # Tag-based targeting is the enterprise standard:
  # - Automatic droplet discovery (no manual ID management)
  # - Supports multi-tenant architecture with tag-based isolation
  # - Enables blue-green deployments without LB reconfiguration
  # - Recommended by DigitalOcean for production workloads
  # Cannot use both droplet_ids and droplet_tag simultaneously
  droplet_ids = var.load_balancer_tag != "" ? null : (
    var.environment == "production" && var.enable_blue_green ? null : module.droplet_single[*].droplet_id
  )

  droplet_tag = var.load_balancer_tag != "" ? var.load_balancer_tag : (
    var.environment == "production" && var.enable_blue_green ? "blue-green" : null
  )

  # VPC
  vpc_uuid = local.vpc_uuid

  # Algorithm
  algorithm = var.load_balancer_algorithm

  # Health check (enterprise 4-layer pattern)
  health_check = local.lb_health_check

  # Sticky sessions
  enable_sticky_sessions = var.load_balancer_sticky_sessions
  sticky_sessions        = var.load_balancer_sticky_config

  # SSL/HTTPS
  redirect_http_to_https = var.load_balancer_redirect_https

  # Forwarding rules
  forwarding_rules = var.load_balancer_forwarding_rules

  # Firewall
  firewall_rules = var.load_balancer_firewall_rules

  # Lifecycle
  prevent_destroy = var.environment == "production"

  tags = local.common_tags
}

# ----------------------------------------------------------------------------
# DNS Module - Domain Management
# ----------------------------------------------------------------------------

# NOTE: DNS module temporarily commented out for lockfile generation
# Parameters need alignment with module variables - will fix in separate commit
/*
module "dns" {
  count  = var.create_dns_records ? 1 : 0
  source = "./modules/dns"

  domain       = var.dns_domain
  project_name = var.project_name
  environment  = var.environment

  # A Records
  a_records = merge(
    # Load balancer A record
    var.create_load_balancer ? {
      "${var.environment}" = {
        value = module.load_balancer[0].ip_address
        ttl   = 300
      }
    } : {},
    # Custom A records
    var.dns_a_records
  )

  # CNAME records
  cname_records = var.dns_cname_records

  # Create www CNAME
  create_www_cname = var.dns_create_www_cname
  www_target       = var.environment == "production" ? var.dns_domain : "${var.environment}.${var.dns_domain}"

  tags = local.common_tags
}
*/

# ----------------------------------------------------------------------------
# Container Registry Module - Zero-SSH Deployments
# ----------------------------------------------------------------------------
# ROOT CAUSE #126: Enables container pull architecture for VPC-isolated deployments
# Note: DigitalOcean allows only ONE container registry per account
# This is a global resource (not per-environment)
# ----------------------------------------------------------------------------

module "container_registry" {
  count  = var.create_container_registry ? 1 : 0
  source = "./modules/container-registry"

  registry_name       = var.container_registry_name
  subscription_tier   = var.container_registry_tier
  region              = local.region
  enable_write_access = true  # Required for CI/CD push
  project_name        = var.project_name
  environment         = "shared"  # Registry serves all environments
}

# ----------------------------------------------------------------------------
# Outputs
# ----------------------------------------------------------------------------

output "environment" {
  description = "Current environment"
  value       = var.environment
}

output "region" {
  description = "Deployment region"
  value       = local.region
}

output "vpc_id" {
  description = "VPC UUID"
  value       = local.vpc_uuid
}

output "vpc_cidr" {
  description = "VPC CIDR block"
  value       = local.vpc_cidr
}

output "firewall_id" {
  description = "Firewall ID"
  value       = module.firewall.id
}

output "database_id" {
  description = "Database cluster ID"
  value       = var.create_database ? module.database[0].database_id : null
}

output "database_connection" {
  description = "Database connection details"
  value       = var.create_database ? module.database[0].connection_info : null
  sensitive   = true
}

output "droplet_ids" {
  description = "Droplet IDs"
  value = var.environment == "production" && var.enable_blue_green ? {
    blue  = module.droplet_blue[*].droplet_id
    green = module.droplet_green[*].droplet_id
    } : {
    single = module.droplet_single[*].droplet_id
  }
}

output "droplet_ips" {
  description = "Droplet public IP addresses"
  value = var.environment == "production" && var.enable_blue_green ? {
    blue  = module.droplet_blue[*].ipv4_address
    green = module.droplet_green[*].ipv4_address
    } : {
    single = module.droplet_single[*].ipv4_address
  }
}

output "load_balancer_id" {
  description = "Load balancer ID"
  value       = var.create_load_balancer ? module.load_balancer[0].lb_id : null
}

output "load_balancer_ip" {
  description = "Load balancer IP address"
  value       = var.create_load_balancer ? module.load_balancer[0].ip_address : null
}

output "dns_records" {
  description = "Created DNS records (DNS module currently disabled)"
  value       = null
  # TODO: Re-enable when DNS module is uncommented
  # value       = var.create_dns_records ? module.dns[0].a_records : null
}

# Enterprise health check configuration
output "health_check_config" {
  description = "Load balancer health check configuration"
  value       = local.lb_health_check
}

# Container Registry outputs
output "container_registry_endpoint" {
  description = "Container registry endpoint for docker login"
  value       = var.create_container_registry ? module.container_registry[0].registry_endpoint : null
}

output "container_registry_image_prefix" {
  description = "Prefix for tagging images (registry.digitalocean.com/name)"
  value       = var.create_container_registry ? module.container_registry[0].image_prefix : null
}
