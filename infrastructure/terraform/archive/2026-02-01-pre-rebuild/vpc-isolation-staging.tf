# ============================================================================
# Staging Environment VPC Isolation
# ============================================================================
# Date: 2025-01-21
# Purpose: Network isolation for staging environment to prevent lateral
#          movement from staging to production environments
# Root Cause: #80 - Both environments share default VPC (10.116.0.0/20)
# Security Impact: Compromised staging can pivot to production over private network
# ============================================================================

# ----------------------------------------------------------------------------
# Staging VPC Module
# ----------------------------------------------------------------------------

module "staging_vpc" {
  source = "../../terraform/modules/vpc"

  project_name = var.project_name
  environment  = "staging"
  region       = var.production_region # Use same region as existing infrastructure
  ip_range     = "10.200.0.0/20"       # Non-overlapping CIDR block for staging

  description = "Isolated VPC for Ectropy staging environment - prevents lateral movement to production"

  # VPC Peering: Disabled by default for maximum isolation
  # Enable only if shared services (monitoring, logging) require cross-VPC communication
  enable_peering = false
  peering_vpc_id = ""

  # Timeout configuration for VPC deletion
  delete_timeout = "5m"
}

# ----------------------------------------------------------------------------
# Update Staging Droplet with VPC Assignment
# ----------------------------------------------------------------------------

# NOTE: This configuration requires droplet rebuild to apply VPC assignment
# Droplets cannot be migrated to VPC in-place - must be destroyed and recreated
# See migration script: infrastructure/scripts/migrate-to-vpc.sh

resource "digitalocean_droplet" "staging_isolated" {
  name       = "ectropy-staging-isolated"
  size       = "s-2vcpu-4gb" # Standard: 2 vCPU, 4GB RAM, 80GB disk, $24/month
  image      = "ubuntu-22-04-x64"
  region     = var.production_region
  ssh_keys   = var.ssh_keys
  monitoring = true
  ipv6       = true

  # CRITICAL: Assign to staging VPC for network isolation
  vpc_uuid = module.staging_vpc.id

  tags = [
    "environment:staging",
    "ectropy",
    "vpc-isolated",
    "standard-cpu",
    "managed-by:terraform"
  ]

  user_data = <<-EOF
    #!/bin/bash
    set -euo pipefail

    # System updates
    apt-get update
    apt-get upgrade -y

    # Install Docker
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    systemctl enable docker
    systemctl start docker

    # Install Docker Compose
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose

    # Configure Docker daemon with production-like settings
    mkdir -p /etc/docker
    cat > /etc/docker/daemon.json <<DOCKER_CONFIG
    {
      "log-driver": "json-file",
      "log-opts": {
        "max-size": "10m",
        "max-file": "3"
      },
      "live-restore": true
    }
    DOCKER_CONFIG
    systemctl restart docker

    # Create application directory
    mkdir -p /opt/ectropy

    # Configure automated Docker cleanup (weekly)
    cat > /etc/cron.weekly/docker-cleanup <<CLEANUP
    #!/bin/bash
    docker system prune -af --filter 'until=168h'
    docker builder prune -af
    CLEANUP
    chmod +x /etc/cron.weekly/docker-cleanup

    # Install monitoring tools
    apt-get install -y htop iotop nethogs sysstat curl wget git jq netcat-openbsd

    # VPC isolation marker
    echo "Staging server (VPC-isolated: 10.200.0.0/20) provisioned: $(date)" > /opt/ectropy/provisioned.txt
    echo "VPC_ID=${module.staging_vpc.id}" >> /opt/ectropy/provisioned.txt
  EOF

  lifecycle {
    prevent_destroy = true # Protect staging environment
    # MIGRATION NOTE: Set prevent_destroy = false temporarily during migration
    # restore to true after successful migration
  }
}

# ----------------------------------------------------------------------------
# Staging Firewall - Updated for VPC Isolation
# ----------------------------------------------------------------------------

resource "digitalocean_firewall" "staging_isolated" {
  name = "ectropy-staging-firewall-vpc-isolated"

  droplet_ids = [digitalocean_droplet.staging_isolated.id]

  # SSH access - restricted to authorized sources only
  inbound_rule {
    protocol   = "tcp"
    port_range = "22"
    source_addresses = [
      "165.232.132.224/32", # Self-hosted runner (GitHub Actions deployments)
      # TODO: Add emergency access IP here (use VPN or bastion host for best security)
      # Example: "203.0.113.0/24", # Office VPN network
    ]
  }

  # HTTP from load balancer
  inbound_rule {
    protocol                  = "tcp"
    port_range                = "80"
    source_load_balancer_uids = [digitalocean_loadbalancer.staging.id]
  }

  # Allow traffic within staging VPC only (10.200.0.0/20)
  inbound_rule {
    protocol         = "tcp"
    port_range       = "1-65535"
    source_addresses = ["10.200.0.0/20"]
  }

  inbound_rule {
    protocol         = "udp"
    port_range       = "1-65535"
    source_addresses = ["10.200.0.0/20"]
  }

  # SECURITY: Block production VPC CIDR (10.100.0.0/20)
  # This explicitly prevents cross-environment communication
  # Note: DigitalOcean firewalls are default-deny, but explicit documentation is valuable

  # Allow all outbound traffic (for external APIs, package updates, etc.)
  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "udp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "icmp"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}

# ----------------------------------------------------------------------------
# Database Integration - Staging Database in Staging VPC
# ----------------------------------------------------------------------------

# ENTERPRISE PATTERN: Database clusters should be created in same VPC as compute resources
# Existing databases cannot be moved to VPC - requires new cluster creation
# Migration path:
#   1. Create new database cluster in staging VPC
#   2. Replicate data from existing cluster
#   3. Update application connection strings
#   4. Decommission old cluster

# Uncomment and configure when ready to migrate database to VPC

# resource "digitalocean_database_cluster" "staging_isolated" {
#   name       = "ectropy-staging-db-vpc"
#   engine     = "pg"
#   version    = "15"
#   size       = "db-s-1vcpu-1gb"  # Development: 1 vCPU, 1GB RAM, 10GB disk, $15/month
#   region     = var.production_region
#   node_count = 1
#
#   # CRITICAL: Assign to staging VPC
#   private_network_uuid = module.staging_vpc.id
#
#   tags = [
#     "environment:staging",
#     "ectropy",
#     "vpc-isolated"
#   ]
# }

# ----------------------------------------------------------------------------
# Redis Integration - Staging Redis in Staging VPC
# ----------------------------------------------------------------------------

# Uncomment and configure when ready to migrate Redis to VPC

# resource "digitalocean_database_cluster" "staging_redis_isolated" {
#   name       = "ectropy-staging-redis-vpc"
#   engine     = "redis"
#   version    = "7"
#   size       = "db-s-1vcpu-1gb"  # Development: 1 vCPU, 1GB RAM, $15/month
#   region     = var.production_region
#   node_count = 1
#
#   # CRITICAL: Assign to staging VPC
#   private_network_uuid = module.staging_vpc.id
#
#   tags = [
#     "environment:staging",
#     "ectropy",
#     "vpc-isolated"
#   ]
# }

# ----------------------------------------------------------------------------
# Outputs for Staging VPC Isolation
# ----------------------------------------------------------------------------

output "staging_vpc_id" {
  description = "Staging VPC ID for network isolation"
  value       = module.staging_vpc.id
}

output "staging_vpc_urn" {
  description = "Staging VPC URN for resource references"
  value       = module.staging_vpc.urn
}

output "staging_vpc_name" {
  description = "Staging VPC name"
  value       = module.staging_vpc.name
}

output "staging_vpc_ip_range" {
  description = "Staging VPC CIDR block (10.200.0.0/20)"
  value       = module.staging_vpc.ip_range
}

output "staging_vpc_region" {
  description = "Staging VPC region"
  value       = module.staging_vpc.region
}

output "staging_isolated_droplet_ip" {
  description = "Staging isolated droplet public IP"
  value       = digitalocean_droplet.staging_isolated.ipv4_address
}

output "staging_isolated_droplet_private_ip" {
  description = "Staging isolated droplet private IP (VPC)"
  value       = digitalocean_droplet.staging_isolated.ipv4_address_private
}

output "staging_isolated_droplet_id" {
  description = "Staging isolated droplet ID"
  value       = digitalocean_droplet.staging_isolated.id
}

# ----------------------------------------------------------------------------
# Migration Notes
# ----------------------------------------------------------------------------

# MIGRATION CHECKLIST:
#
# 1. Review current staging infrastructure:
#    - Droplets: digitalocean_droplet.staging (staging.tf)
#    - Load balancer: digitalocean_loadbalancer.staging
#    - Database: External cluster (not managed by Terraform)
#    - Redis: External cluster (not managed by Terraform)
#
# 2. Pre-migration validation:
#    terraform plan -target=module.staging_vpc
#    - Verify VPC configuration is correct
#    - Check CIDR block doesn't conflict (10.200.0.0/20)
#    - Confirm region matches existing infrastructure
#
# 3. Execute migration:
#    Run infrastructure/scripts/migrate-to-vpc.sh staging
#    - Script handles droplet rebuild with VPC assignment
#    - Updates firewall rules for new CIDR block
#    - Verifies connectivity after migration
#
# 4. Post-migration validation:
#    - Test application connectivity
#    - Verify database connectivity
#    - Check Redis connectivity
#    - Confirm isolation from production VPC (10.100.0.0/20)
#    - Validate firewall rules block cross-VPC traffic
#
# 5. Database/Redis migration (future):
#    - Create new clusters in staging VPC
#    - Replicate data from existing clusters
#    - Update application connection strings
#    - Monitor for 24 hours before decommissioning old clusters
#
# ROLLBACK PROCEDURE:
# If migration fails, roll back by:
# 1. terraform state rm digitalocean_droplet.staging_isolated
# 2. terraform state rm module.staging_vpc
# 3. Restore from backup: terraform apply -target=digitalocean_droplet.staging
# 4. Verify application functionality
# 5. Investigate failure root cause before retry
#
# ESTIMATED DOWNTIME: 15 minutes
# - 5 min: Droplet rebuild and provisioning
# - 5 min: Application deployment and container startup
# - 5 min: Health checks and load balancer re-registration
