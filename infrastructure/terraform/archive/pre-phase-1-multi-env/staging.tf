# ============================================================================
# Staging Environment Infrastructure - VPC Isolated
# ============================================================================
# Date: 2026-02-01
# Purpose: Production-like environment with full VPC isolation
# Root Cause: #0 - Six-month circular motion pattern resolved
# Root Cause: #80 - VPC-per-environment network isolation
# Root Cause: #126 - Staging VPC Migration Phase 2
# Compliance: SOC 2, ISO 27001, PCI DSS
# ============================================================================

# ============================================================================
# Variables
# ============================================================================

variable "project_name" {
  description = "Project name for resource naming and tagging"
  type        = string
  default     = "ectropy"
}

# ============================================================================
# Staging VPC Module (ROOT CAUSE #80 - Network Isolation)
# ============================================================================
# Purpose: Dedicated isolated VPC for staging environment
# CIDR: 10.200.0.0/20 (non-overlapping with production 10.10.0.0/20)
# Security: Zero cross-environment connectivity

module "staging_vpc" {
  source = "../../terraform/modules/vpc"

  project_name = var.project_name
  environment  = "staging"
  region       = var.production_region
  ip_range     = "10.20.0.0/20" # Matches existing VPC (imported from manual creation 2026-01-25)

  description = "Isolated VPC for Ectropy staging environment - SOC 2/ISO 27001/PCI DSS compliance"

  # VPC Peering: Disabled for maximum isolation
  enable_peering = false
  peering_vpc_id = ""

  # Timeout configuration
  delete_timeout = "5m"
}

# ============================================================================
# Staging Droplet (VPC-Isolated)
# ============================================================================

resource "digitalocean_droplet" "staging" {
  name       = "ectropy-staging"
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
    "terraform-managed"
  ]

  user_data = <<-EOF
    #!/bin/bash
    set -euo pipefail

    # ROOT CAUSE FIX: Suppress interactive apt prompts (openssh-server config dialog)
    export DEBIAN_FRONTEND=noninteractive

    # Log all output for cloud-init debugging
    exec > >(tee /var/log/user-data.log)
    exec 2>&1

    echo "=== Starting cloud-init provisioning: $(date) ==="

    # System updates (security patches only)
    # NOTE: Removed 'apt-get upgrade -y' - caused OOM kill on s-2vcpu-4gb droplet
    # ROOT CAUSE: Line 6 killed by OOM during full system upgrade
    apt-get update

    # Install Docker
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    systemctl enable docker
    systemctl start docker

    # Install Docker Compose
    echo "Installing Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose

    # Configure Docker daemon with production-like settings
    echo "Configuring Docker daemon..."
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

    # Install monitoring tools (noninteractive mode)
    echo "Installing monitoring tools..."
    apt-get install -y htop iotop nethogs sysstat curl wget git jq netcat-openbsd

    # Verify installations
    echo "Verifying Docker installation..."
    docker --version
    docker-compose --version

    echo "=== Staging server provisioned successfully: $(date) ===" | tee /opt/ectropy/provisioned.txt
  EOF

  # Alpha environment - lifecycle protection disabled for rapid iteration
  # lifecycle {
  #   prevent_destroy = true  # Re-enable for production-ready staging
  # }
}

# Staging Load Balancer
resource "digitalocean_loadbalancer" "staging" {
  name     = "ectropy-staging-lb"
  region   = var.production_region
  vpc_uuid = module.staging_vpc.id  # CRITICAL: Assign LB to staging VPC

  # HTTPS forwarding
  forwarding_rule {
    entry_protocol   = "https"
    entry_port       = 443
    target_protocol  = "http"
    target_port      = 80
    certificate_name = "ectropy-prod-cert" # Uses wildcard cert (*.ectropy.ai, ectropy.ai)
  }

  # HTTP forwarding
  forwarding_rule {
    entry_protocol  = "http"
    entry_port      = 80
    target_protocol = "http"
    target_port     = 80
  }

  # Health check configuration
  healthcheck {
    protocol                 = "http"
    port                     = 80
    path                     = "/lb-health"
    check_interval_seconds   = 10
    response_timeout_seconds = 5
    unhealthy_threshold      = 3
    healthy_threshold        = 2
  }

  droplet_ids = [digitalocean_droplet.staging.id]

  # Sticky sessions for consistent testing
  sticky_sessions {
    type               = "cookies"
    cookie_name        = "lb_session_staging"
    cookie_ttl_seconds = 3600
  }
}

# ============================================================================
# Terraform GitOps Deployment Modules (ROOT CAUSE #148/#149/#156)
# ============================================================================
# Enterprise GitOps pattern for full-stack automated deployment:
#   1. Infrastructure configs (nginx) - ROOT CAUSE #156
#   2. Docker compose file - ROOT CAUSE #148
#   3. Environment variables - ROOT CAUSE #149
# Eliminates manual SSH deployment anti-patterns

variable "staging_ssh_private_key" {
  description = "SSH private key for Terraform deployments (terraform_deploy_key)"
  type        = string
  sensitive   = true
}

# ============================================================================
# Infrastructure Config Deployment (ROOT CAUSE #156)
# ============================================================================
# DEPLOYMENT ORDER: FIRST - Must deploy BEFORE compose (nginx configs required)
# Enterprise GitOps pattern for nginx configuration files
# Eliminates manual config file deployment (scp/rsync anti-patterns)

module "staging_infrastructure_deployment" {
  source = "../../terraform/modules/infrastructure-deployment"

  # Infrastructure
  droplet_id      = digitalocean_droplet.staging.id
  droplet_ip      = digitalocean_droplet.staging.ipv4_address
  ssh_private_key = var.staging_ssh_private_key

  # Environment
  environment = "staging"

  # Nginx configuration files
  nginx_main_conf_path = "${path.module}/../../infrastructure/nginx/main.conf"
  nginx_site_conf_path = "${path.module}/../../infrastructure/nginx/ectropy-staging.conf"

  # Deployment controls
  create_backup       = true
  validate_deployment = true

  # Service management (ROOT CAUSE #162 fix)
  # Enables GitOps nginx reload with conditional logic:
  #   - Initial deployment: Skips reload (nginx container doesn't exist yet)
  #   - Config updates: Reloads nginx (zero-downtime graceful reload)
  # Pattern: Follows compose-deployment and env-deployment module pattern
  auto_reload_nginx    = true
  nginx_container_name = "ectropy-nginx"  # Match docker-compose.staging.yml
}

# ============================================================================
# Docker Compose Deployment (ROOT CAUSE #148)
# ============================================================================
# DEPLOYMENT ORDER: SECOND - After infrastructure configs deployed
# Enterprise GitOps pattern for automated compose file deployment
# Eliminates 82% configuration drift (593 missing lines)

module "staging_compose_deployment" {
  source = "../../terraform/modules/compose-deployment"

  compose_file_path = "${path.module}/../../docker-compose.staging.yml"
  droplet_id        = digitalocean_droplet.staging.id
  droplet_ip        = digitalocean_droplet.staging.ipv4_address
  ssh_private_key   = var.staging_ssh_private_key

  # Validation thresholds (ROOT CAUSE #147: 723 lines, 49 Speckle refs)
  expected_line_count    = 723
  min_line_count         = 700
  require_speckle        = true
  expected_speckle_refs  = 49
  min_speckle_refs       = 40

  # Auto-start services disabled - env-deployment module handles service startup AFTER .env deployed
  auto_start_services = false

  # Dependency: Infrastructure configs must be deployed first
  depends_on = [module.staging_infrastructure_deployment]
}

# ============================================================================
# Environment Variables Deployment (ROOT CAUSE #149/#151)
# ============================================================================
# Enterprise GitOps pattern for automated .env file deployment
# Eliminates manual SSH heredocs from GitHub Actions (anti-pattern)
# Triggered on environment variable content changes (SHA256 hash)

module "staging_env_deployment" {
  source = "../../terraform/modules/env-deployment"

  # Infrastructure
  droplet_id      = digitalocean_droplet.staging.id
  droplet_ip      = digitalocean_droplet.staging.ipv4_address
  ssh_private_key = var.staging_ssh_private_key

  # Application Configuration
  app_version = var.app_version

  # Database Configuration
  database_url      = var.database_url
  database_host     = var.database_host
  database_port     = var.database_port
  database_name     = var.database_name
  database_user     = var.database_user
  database_password = var.database_password

  # Authentication & Security
  jwt_secret         = var.jwt_secret
  jwt_refresh_secret = var.jwt_refresh_secret
  session_secret     = var.session_secret
  google_client_id     = var.google_client_id
  google_client_secret = var.google_client_secret

  # Data Layer
  redis_password = var.redis_password
  encryption_key = var.encryption_key

  # External APIs
  mcp_api_key    = var.mcp_api_key
  openai_api_key = var.openai_api_key

  # Service URLs
  api_url      = var.api_url
  frontend_url = var.frontend_url

  # Speckle BIM Integration (ROOT CAUSE #147)
  speckle_server_token   = var.speckle_server_token
  speckle_admin_password = var.speckle_admin_password
  speckle_session_secret = var.speckle_session_secret
  minio_access_key       = var.minio_access_key
  minio_secret_key       = var.minio_secret_key

  # Infrastructure Services
  resend_api_key            = var.resend_api_key
  watchtower_http_api_token = var.watchtower_http_api_token

  # Validation thresholds
  expected_line_count = 25
  min_line_count      = 20

  # Service restart disabled by default - compose-deployment handles service startup
  auto_restart_services = false

  # Deployment depends on compose file being deployed first
  depends_on = [module.staging_compose_deployment]
}

# Outputs for staging environment
output "staging_ip" {
  description = "Staging server public IP address"
  value       = digitalocean_droplet.staging.ipv4_address
}

output "staging_ipv6" {
  description = "Staging server IPv6 address"
  value       = digitalocean_droplet.staging.ipv6_address
}

output "staging_id" {
  description = "Staging server droplet ID"
  value       = digitalocean_droplet.staging.id
}

output "staging_lb_ip" {
  description = "Staging load balancer IP address"
  value       = digitalocean_loadbalancer.staging.ip
}

output "staging_lb_id" {
  description = "Staging load balancer ID"
  value       = digitalocean_loadbalancer.staging.id
}

# Deployment metadata outputs
output "compose_deployment_hash" {
  description = "SHA256 hash of deployed docker-compose.yml"
  value       = module.staging_compose_deployment.compose_hash
}

output "env_deployment_hash" {
  description = "SHA256 hash of deployed environment variables"
  value       = module.staging_env_deployment.env_hash
  sensitive   = true  # Contains hash of sensitive environment variables
}

output "deployment_timestamp" {
  description = "Timestamp of last environment deployment"
  value       = module.staging_env_deployment.deployment_timestamp
}

# ============================================================================
# VPC Isolation Outputs (ROOT CAUSE #80/#126)
# ============================================================================

output "staging_vpc_id" {
  description = "Staging VPC ID for network isolation"
  value       = module.staging_vpc.id
}

output "staging_vpc_name" {
  description = "Staging VPC name"
  value       = module.staging_vpc.name
}

output "staging_vpc_ip_range" {
  description = "Staging VPC CIDR block (10.20.0.0/20)"
  value       = module.staging_vpc.ip_range
}

output "staging_vpc_region" {
  description = "Staging VPC region"
  value       = module.staging_vpc.region
}

output "staging_private_ip" {
  description = "Staging droplet private IP (within VPC)"
  value       = digitalocean_droplet.staging.ipv4_address_private
}
