# ============================================================================
# Production Environment VPC Isolation
# ============================================================================
# Date: 2025-01-21
# Purpose: Network isolation for production environment to prevent lateral
#          movement from staging or compromised environments
# Root Cause: #80 - Both environments share default VPC (10.116.0.0/20)
# Security Impact: Compromised staging can pivot to production over private network
# ============================================================================

# ----------------------------------------------------------------------------
# Production VPC Module
# ----------------------------------------------------------------------------

module "production_vpc" {
  source = "../../terraform/modules/vpc"

  project_name = var.project_name
  environment  = "production"
  region       = var.production_region # Use same region as existing infrastructure
  ip_range     = "10.10.0.0/20"        # Matches existing VPC (imported from manual creation 2026-01-21)

  description = "Isolated VPC for Ectropy production environment - enterprise security boundary"

  # VPC Peering: Disabled by default for maximum isolation
  # Enable only if shared services (monitoring, logging, disaster recovery) require cross-VPC communication
  # Example: Peering with dedicated monitoring VPC or backup infrastructure
  enable_peering = false
  peering_vpc_id = ""

  # Timeout configuration for VPC deletion
  delete_timeout = "5m"
}

# ----------------------------------------------------------------------------
# Update Production Blue Droplet with VPC Assignment
# ----------------------------------------------------------------------------

# NOTE: This configuration requires droplet rebuild to apply VPC assignment
# Droplets cannot be migrated to VPC in-place - must be destroyed and recreated
# See migration script: infrastructure/scripts/migrate-to-vpc.sh

resource "digitalocean_droplet" "production_blue_isolated" {
  name       = "ectropy-production-blue-isolated"
  size       = var.production_size # Dedicated CPU: c2-4vcpu-8gb (4 vCPU, 8GB RAM, $94/mo)
  image      = "ubuntu-22-04-x64"
  region     = var.production_region
  ssh_keys   = var.ssh_keys
  monitoring = true
  ipv6       = true

  # CRITICAL: Assign to production VPC for network isolation
  vpc_uuid = module.production_vpc.id

  tags = [
    "production",
    "ectropy",
    "blue-green",
    "blue",
    "vpc-isolated",
    "dedicated-cpu",
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

    # Configure Docker daemon
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
    echo "Production Blue server (VPC-isolated: 10.100.0.0/20) provisioned: $(date)" > /opt/ectropy/provisioned.txt
    echo "VPC_ID=${module.production_vpc.id}" >> /opt/ectropy/provisioned.txt
  EOF

  lifecycle {
    create_before_destroy = true
    prevent_destroy       = true # Extra protection for production
    # MIGRATION NOTE: Set prevent_destroy = false temporarily during migration
    # restore to true after successful migration
  }
}

# ----------------------------------------------------------------------------
# Update Production Green Droplet with VPC Assignment
# ----------------------------------------------------------------------------

resource "digitalocean_droplet" "production_green_isolated" {
  name       = "ectropy-production-green-isolated"
  size       = var.production_size # Dedicated CPU: c2-4vcpu-8gb (4 vCPU, 8GB RAM, $94/mo)
  image      = "ubuntu-22-04-x64"
  region     = var.production_region
  ssh_keys   = var.ssh_keys
  monitoring = true
  ipv6       = true

  # CRITICAL: Assign to production VPC for network isolation
  vpc_uuid = module.production_vpc.id

  tags = [
    "production",
    "ectropy",
    "blue-green",
    "green",
    "vpc-isolated",
    "dedicated-cpu",
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

    # Configure Docker daemon
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
    echo "Production Green server (VPC-isolated: 10.100.0.0/20) provisioned: $(date)" > /opt/ectropy/provisioned.txt
    echo "VPC_ID=${module.production_vpc.id}" >> /opt/ectropy/provisioned.txt
  EOF

  lifecycle {
    create_before_destroy = true
    prevent_destroy       = true # Extra protection for production
    # MIGRATION NOTE: Set prevent_destroy = false temporarily during migration
    # restore to true after successful migration
  }
}

# ----------------------------------------------------------------------------
# Production Firewall - Updated for VPC Isolation
# ----------------------------------------------------------------------------

resource "digitalocean_firewall" "production_isolated" {
  name = "ectropy-production-firewall-vpc-isolated"

  droplet_ids = [
    digitalocean_droplet.production_blue_isolated.id,
    digitalocean_droplet.production_green_isolated.id
  ]

  # ENTERPRISE SECURITY: SSH restricted to deployment infrastructure only
  # Principle of least privilege: Only authorized deployment sources
  inbound_rule {
    protocol   = "tcp"
    port_range = "22"
    source_addresses = [
      "165.232.132.224/32", # Self-hosted runner (GitHub Actions deployments)
      # TODO: Add emergency access IP here (use VPN or bastion host for best security)
      # Example: "203.0.113.0/24", # Office VPN network
      # Example: "10.50.0.5/32",  # Bastion host in dedicated management VPC
    ]
  }

  # HTTP from load balancer
  inbound_rule {
    protocol                  = "tcp"
    port_range                = "80"
    source_load_balancer_uids = [digitalocean_loadbalancer.production.id]
  }

  # Application port from load balancer (if needed)
  inbound_rule {
    protocol                  = "tcp"
    port_range                = "3000"
    source_load_balancer_uids = [digitalocean_loadbalancer.production.id]
  }

  # Allow traffic within production VPC only (10.100.0.0/20)
  inbound_rule {
    protocol         = "tcp"
    port_range       = "1-65535"
    source_addresses = ["10.100.0.0/20"]
  }

  inbound_rule {
    protocol         = "udp"
    port_range       = "1-65535"
    source_addresses = ["10.100.0.0/20"]
  }

  # SECURITY: Block staging VPC CIDR (10.200.0.0/20)
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
# Reserved IPs for Production - VPC Isolated Droplets
# ----------------------------------------------------------------------------

resource "digitalocean_reserved_ip" "production_blue_isolated" {
  region     = var.production_region
  droplet_id = digitalocean_droplet.production_blue_isolated.id
}

resource "digitalocean_reserved_ip" "production_green_isolated" {
  region     = var.production_region
  droplet_id = digitalocean_droplet.production_green_isolated.id
}

# ----------------------------------------------------------------------------
# Database Integration - Production Database in Production VPC
# ----------------------------------------------------------------------------

# ENTERPRISE PATTERN: Database clusters should be created in same VPC as compute resources
# Existing databases cannot be moved to VPC - requires new cluster creation
# Migration path:
#   1. Create new database cluster in production VPC
#   2. Setup replication from existing cluster (pg_dump/restore or logical replication)
#   3. Monitor replication lag and data consistency
#   4. Update application connection strings during maintenance window
#   5. Decommission old cluster after 48-hour verification period

# Uncomment and configure when ready to migrate database to VPC

# resource "digitalocean_database_cluster" "production_isolated" {
#   name       = "ectropy-production-db-vpc"
#   engine     = "pg"
#   version    = "15"
#   size       = "db-s-2vcpu-4gb"  # Production: 2 vCPU, 4GB RAM, 38GB disk, $60/month
#   region     = var.production_region
#   node_count = 2  # High availability with standby replica
#
#   # CRITICAL: Assign to production VPC
#   private_network_uuid = module.production_vpc.id
#
#   tags = [
#     "environment:production",
#     "ectropy",
#     "vpc-isolated",
#     "high-availability"
#   ]
#
#   # Automated backups
#   maintenance_window {
#     day  = "sunday"
#     hour = "03:00:00"
#   }
# }
#
# # Database firewall - restrict to production VPC only
# resource "digitalocean_database_firewall" "production_isolated" {
#   cluster_id = digitalocean_database_cluster.production_isolated.id
#
#   # Allow access only from production VPC
#   rule {
#     type  = "ip_addr"
#     value = "10.100.0.0/20"
#   }
#
#   # SECURITY: No public internet access
#   # SECURITY: No staging VPC access (10.200.0.0/20)
# }

# ----------------------------------------------------------------------------
# Redis Integration - Production Redis in Production VPC
# ----------------------------------------------------------------------------

# Uncomment and configure when ready to migrate Redis to VPC

# resource "digitalocean_database_cluster" "production_redis_isolated" {
#   name       = "ectropy-production-redis-vpc"
#   engine     = "redis"
#   version    = "7"
#   size       = "db-s-2vcpu-4gb"  # Production: 2 vCPU, 4GB RAM, $60/month
#   region     = var.production_region
#   node_count = 2  # High availability with replica
#
#   # CRITICAL: Assign to production VPC
#   private_network_uuid = module.production_vpc.id
#
#   tags = [
#     "environment:production",
#     "ectropy",
#     "vpc-isolated",
#     "high-availability"
#   ]
#
#   # Automated backups
#   maintenance_window {
#     day  = "sunday"
#     hour = "04:00:00"
#   }
# }
#
# # Redis firewall - restrict to production VPC only
# resource "digitalocean_database_firewall" "production_redis_isolated" {
#   cluster_id = digitalocean_database_cluster.production_redis_isolated.id
#
#   # Allow access only from production VPC
#   rule {
#     type  = "ip_addr"
#     value = "10.100.0.0/20"
#   }
#
#   # SECURITY: No public internet access
#   # SECURITY: No staging VPC access (10.200.0.0/20)
# }

# ----------------------------------------------------------------------------
# Outputs for Production VPC Isolation
# ----------------------------------------------------------------------------

output "production_vpc_id" {
  description = "Production VPC ID for network isolation"
  value       = module.production_vpc.id
}

output "production_vpc_urn" {
  description = "Production VPC URN for resource references"
  value       = module.production_vpc.urn
}

output "production_vpc_name" {
  description = "Production VPC name"
  value       = module.production_vpc.name
}

output "production_vpc_ip_range" {
  description = "Production VPC CIDR block (10.100.0.0/20)"
  value       = module.production_vpc.ip_range
}

output "production_vpc_region" {
  description = "Production VPC region"
  value       = module.production_vpc.region
}

output "production_blue_isolated_ip" {
  description = "Production blue isolated droplet public IP"
  value       = digitalocean_droplet.production_blue_isolated.ipv4_address
}

output "production_blue_isolated_private_ip" {
  description = "Production blue isolated droplet private IP (VPC)"
  value       = digitalocean_droplet.production_blue_isolated.ipv4_address_private
}

output "production_green_isolated_ip" {
  description = "Production green isolated droplet public IP"
  value       = digitalocean_droplet.production_green_isolated.ipv4_address
}

output "production_green_isolated_private_ip" {
  description = "Production green isolated droplet private IP (VPC)"
  value       = digitalocean_droplet.production_green_isolated.ipv4_address_private
}

output "production_blue_isolated_reserved_ip" {
  description = "Production blue isolated reserved IP"
  value       = digitalocean_reserved_ip.production_blue_isolated.ip_address
}

output "production_green_isolated_reserved_ip" {
  description = "Production green isolated reserved IP"
  value       = digitalocean_reserved_ip.production_green_isolated.ip_address
}

output "production_blue_isolated_id" {
  description = "Production blue isolated droplet ID"
  value       = digitalocean_droplet.production_blue_isolated.id
}

output "production_green_isolated_id" {
  description = "Production green isolated droplet ID"
  value       = digitalocean_droplet.production_green_isolated.id
}

# ----------------------------------------------------------------------------
# Migration Notes
# ----------------------------------------------------------------------------

# MIGRATION CHECKLIST:
#
# 1. Review current production infrastructure:
#    - Blue droplet: digitalocean_droplet.production_blue (production-rebuild.tf)
#    - Green droplet: digitalocean_droplet.production_green (production-rebuild.tf)
#    - Load balancer: digitalocean_loadbalancer.production
#    - Firewall: digitalocean_firewall.production
#    - Database: afac7c67-bd14-424c-a7e0-72ce480cfecb (external, not VPC-isolated)
#    - Redis: External cluster (not managed by Terraform, not VPC-isolated)
#
# 2. Pre-migration validation:
#    terraform plan -target=module.production_vpc
#    - Verify VPC configuration is correct
#    - Check CIDR block doesn't conflict (10.100.0.0/20)
#    - Confirm region matches existing infrastructure (sfo3)
#    - Review firewall rules for correctness
#
# 3. Execute migration (BLUE-GREEN STRATEGY):
#    Run infrastructure/scripts/migrate-to-vpc.sh production
#    - Script uses blue-green deployment for zero-downtime
#    - Rebuilds green server first with VPC assignment
#    - Deploys application and verifies health
#    - Switches load balancer to green server
#    - Rebuilds blue server with VPC assignment
#    - Restores load balancer to both servers
#    - Total estimated time: 30 minutes
#
# 4. Post-migration validation:
#    - Test application connectivity: curl https://ectropy.ai/health
#    - Verify database connectivity from VPC
#    - Check Redis connectivity from VPC
#    - Confirm isolation from staging VPC (10.200.0.0/20)
#    - Validate firewall rules block cross-VPC traffic
#    - Run integration tests: npm run test:integration
#    - Monitor error rates in production logs
#    - Check response times and performance metrics
#
# 5. Database/Redis migration (future - CRITICAL for complete isolation):
#    Phase 1: Create new clusters in production VPC
#    Phase 2: Setup replication from existing clusters
#    Phase 3: Monitor replication lag (target: <1 second)
#    Phase 4: Schedule maintenance window (off-peak hours)
#    Phase 5: Update application connection strings
#    Phase 6: Deploy updated application configuration
#    Phase 7: Monitor for 48 hours before decommissioning old clusters
#    Phase 8: Decommission old clusters and clean up firewall rules
#
# ROLLBACK PROCEDURE:
# If migration fails, roll back by:
# 1. Switch load balancer back to original droplets
# 2. terraform state rm digitalocean_droplet.production_blue_isolated
# 3. terraform state rm digitalocean_droplet.production_green_isolated
# 4. terraform state rm module.production_vpc
# 5. Restore from backup: terraform apply -target=digitalocean_droplet.production_blue
# 6. Restore from backup: terraform apply -target=digitalocean_droplet.production_green
# 7. Verify application functionality
# 8. Create incident report and investigate failure root cause
# 9. Schedule retry after fixes implemented
#
# ESTIMATED DOWNTIME: 0 minutes (blue-green deployment)
# - Green server rebuild: 10 minutes (no customer impact)
# - Load balancer switch: 0 minutes (seamless failover)
# - Blue server rebuild: 10 minutes (no customer impact)
# - Validation and monitoring: 10 minutes
#
# SECURITY BENEFITS POST-MIGRATION:
# - Complete network isolation between staging and production
# - Reduced blast radius for security incidents
# - Compliance with security frameworks (SOC 2, ISO 27001)
# - Defense-in-depth security architecture
# - Simplified security audit and compliance validation
