# Production Infrastructure Rebuild - Enterprise Grade
# Date: 2025-12-05
# Purpose: Rebuild production with dedicated CPU, correct sizing, no shortcuts

# Terraform configuration moved to backend.tf to consolidate
# Required providers and backend configuration now in single terraform{} block

# Variables for production configuration
variable "production_size" {
  description = "Droplet size for production servers"
  type        = string
  default     = "c2-4vcpu-8gb" # Dedicated CPU: 4 vCPU, 8GB RAM, 100GB disk, $94/mo
}

variable "production_region" {
  description = "Region for production servers"
  type        = string
  default     = "sfo3" # San Francisco
}

variable "ssh_keys" {
  description = "SSH key fingerprints"
  type        = list(string)
  # ROOT CAUSE #163 FIX: Add terraform-deploy-key to align with actual droplet state
  # Prevents droplet replacement due to SSH key drift
  # Phase 1: Immediate fix (both keys)
  # Phase 2: Refactor to environment-specific variables (staging_ssh_keys, production_ssh_keys)
  default = [
    "0a:b2:48:6d:1e:dc:95:e2:6e:96:ff:e8:fe:a8:35:42", # ectropy-production
    "72:7e:a1:f9:8d:74:b5:0d:25:4c:04:97:40:cd:39:8e", # terraform-deploy-key (GitOps automation)
  ]
}

variable "database_cluster_id" {
  description = "Existing PostgreSQL database cluster ID (override via TF_VAR_database_cluster_id or terraform.tfvars)"
  type        = string
  # ENTERPRISE PATTERN (2025-12-15): Default matches GitHub Variable DATABASE_CLUSTER_ID
  # Best practice: Set via environment variable in CI/CD (TF_VAR_database_cluster_id=${{ vars.DATABASE_CLUSTER_ID }})
  # This ensures Terraform and GitHub Actions use same centralized configuration
  # Database: ectropy-production-db (afac7c67-bd14-424c-a7e0-72ce480cfecb)
  default     = "afac7c67-bd14-424c-a7e0-72ce480cfecb"
}

# Blue Production Server (Primary)
resource "digitalocean_droplet" "production_blue" {
  name     = "ectropy-production-blue"
  size     = var.production_size
  image    = "ubuntu-22-04-x64"
  region   = var.production_region
  ssh_keys = var.ssh_keys

  monitoring = true
  ipv6       = true

  tags = [
    "production",
    "ectropy",
    "blue-green",
    "blue",
    "dedicated-cpu"
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
    apt-get install -y htop iotop nethogs sysstat

    echo "Production Blue server provisioned: $(date)" > /opt/ectropy/provisioned.txt
  EOF

  lifecycle {
    create_before_destroy = true
  }
}

# Green Production Server (Standby)
resource "digitalocean_droplet" "production_green" {
  name     = "ectropy-production-green"
  size     = var.production_size
  image    = "ubuntu-22-04-x64"
  region   = var.production_region
  ssh_keys = var.ssh_keys

  monitoring = true
  ipv6       = true

  tags = [
    "production",
    "ectropy",
    "blue-green",
    "green",
    "dedicated-cpu"
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
    apt-get install -y htop iotop nethogs sysstat

    echo "Production Green server provisioned: $(date)" > /opt/ectropy/provisioned.txt
  EOF

  lifecycle {
    create_before_destroy = true
  }
}

# Production Load Balancer
resource "digitalocean_loadbalancer" "production" {
  name   = "ectropy-production-lb-v2"
  region = var.production_region

  # ENTERPRISE FIX (2025-12-22): TERRAFORM ALIGNMENT - Nginx runs on port 80
  # Production deployment uses nginx reverse proxy on port 80 (not direct app on 3000)
  # This matches staging deployment pattern and enterprise best practices
  forwarding_rule {
    entry_protocol   = "https"
    entry_port       = 443
    target_protocol  = "http"
    target_port      = 80
    certificate_name = "ectropy-prod-cert" # Wildcard cert: *.ectropy.ai,ectropy.ai
  }

  forwarding_rule {
    entry_protocol  = "http"
    entry_port      = 80
    target_protocol = "http"
    target_port     = 80
  }

  # ENTERPRISE FIX (2025-12-22): TERRAFORM ALIGNMENT - Match Actual Deployed Configuration
  # Investigation: doctl showed actual LB using port:80,path:/lb-health (not port:3000,path:/health)
  # Root Cause: Terraform state out of sync with production infrastructure
  # Resolution: Update Terraform to reflect current production truth for future IaC management
  # Evidence: apps/mcp-server/data/github-repository-variables.json (OAuth routing resolution)
  healthcheck {
    protocol                 = "http"
    port                     = 80
    path                     = "/lb-health"
    check_interval_seconds   = 10
    response_timeout_seconds = 5
    unhealthy_threshold      = 3
    healthy_threshold        = 2
  }

  droplet_ids = [
    digitalocean_droplet.production_blue.id,
    digitalocean_droplet.production_green.id
  ]

  # Sticky sessions for consistent user experience
  sticky_sessions {
    type               = "cookies"
    cookie_name        = "lb_session"
    cookie_ttl_seconds = 3600
  }
}

# Firewall for production servers
resource "digitalocean_firewall" "production" {
  name = "ectropy-production-firewall-v2"

  droplet_ids = [
    digitalocean_droplet.production_blue.id,
    digitalocean_droplet.production_green.id
  ]

  # ENTERPRISE SECURITY: SSH restricted to deployment infrastructure only
  # Principle of least privilege: Only staging/runner can deploy to production
  inbound_rule {
    protocol   = "tcp"
    port_range = "22"
    source_addresses = [
      "143.198.154.94/32",  # Staging server (for deployment scripts)
      "165.232.132.224/32", # Self-hosted runner (GitHub Actions deployments)
      # TODO: Add emergency access IP here (use VPN or bastion host for best security)
      # Example: "203.0.113.0/24", # Office VPN network
    ]
  }

  # Allow HTTP from load balancer
  inbound_rule {
    protocol                  = "tcp"
    port_range                = "3000"
    source_load_balancer_uids = [digitalocean_loadbalancer.production.id]
  }

  # Allow all outbound traffic
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

# Reserved IPs for production servers (optional but recommended)
resource "digitalocean_reserved_ip" "production_blue" {
  region     = var.production_region
  droplet_id = digitalocean_droplet.production_blue.id
}

resource "digitalocean_reserved_ip" "production_green" {
  region     = var.production_region
  droplet_id = digitalocean_droplet.production_green.id
}

# Outputs
output "production_blue_ip" {
  description = "Blue server IP address"
  value       = digitalocean_droplet.production_blue.ipv4_address
}

output "production_green_ip" {
  description = "Green server IP address"
  value       = digitalocean_droplet.production_green.ipv4_address
}

output "production_blue_reserved_ip" {
  description = "Blue server reserved IP"
  value       = digitalocean_reserved_ip.production_blue.ip_address
}

output "production_green_reserved_ip" {
  description = "Green server reserved IP"
  value       = digitalocean_reserved_ip.production_green.ip_address
}

output "load_balancer_ip" {
  description = "Load balancer IP address"
  value       = digitalocean_loadbalancer.production.ip
}

output "load_balancer_id" {
  description = "Load balancer ID"
  value       = digitalocean_loadbalancer.production.id
}

output "production_blue_id" {
  description = "Blue server droplet ID"
  value       = digitalocean_droplet.production_blue.id
}

output "production_green_id" {
  description = "Green server droplet ID"
  value       = digitalocean_droplet.production_green.id
}

# Data source for existing database (to reference in app configuration)
# Commented out for initial plan - will be enabled after setting DO_TOKEN
# data "digitalocean_database_cluster" "production_db" {
#   name = "ectropy-production-db-do-user-18619920-0"
# }

# output "database_connection_uri" {
#   description = "Database connection URI"
#   value       = data.digitalocean_database_cluster.production_db.uri
#   sensitive   = true
# }

# output "database_host" {
#   description = "Database host"
#   value       = data.digitalocean_database_cluster.production_db.host
# }

# output "database_port" {
#   description = "Database port"
#   value       = data.digitalocean_database_cluster.production_db.port
# }
