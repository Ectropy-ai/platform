# Development Environment Infrastructure
# Date: 2025-12-17
# Purpose: Development environment for health check testing and experimentation

# Development Droplet
resource "digitalocean_droplet" "development" {
  name       = "ectropy-development"
  size       = "s-2vcpu-4gb" # Standard: 2 vCPU, 4GB RAM, 80GB disk, $36/month (required for Docker builds)
  image      = "ubuntu-22-04-x64"
  region     = var.production_region
  ssh_keys   = var.ssh_keys
  monitoring = true
  ipv6       = true

  tags = [
    "environment:development",
    "purpose:health-check-testing",
    "managed-by:terraform",
    "ectropy"
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
      }
    }
    DOCKER_CONFIG
    systemctl restart docker

    # Create application directory
    mkdir -p /opt/ectropy

    # Install development tools
    apt-get install -y curl wget git htop iotop nethogs sysstat netcat-openbsd jq

    echo "Development server provisioned: $(date)" > /opt/ectropy/provisioned.txt
  EOF

  # Lifecycle block temporarily removed to allow droplet recreation for fresh enterprise baseline
  # Will be re-enabled after successful recreation and deployment
}

# Development Firewall
resource "digitalocean_firewall" "development" {
  name = "ectropy-development-firewall"

  droplet_ids = [digitalocean_droplet.development.id]

  # SSH - Allow from anywhere (development convenience)
  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  # HTTP - Public web access
  inbound_rule {
    protocol         = "tcp"
    port_range       = "80"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  # HTTPS - Public web access
  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  # Default deny for all other ports (PostgreSQL 5432, Redis 6379, MinIO 9000, etc.)
  # Critical security fix (2025-12-17): Resolved P0 breach where database/Redis were exposed

  # Allow all outbound traffic
  outbound_rule {
    protocol              = "tcp"
    port_range            = "0"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "udp"
    port_range            = "0"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "icmp"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}

# Outputs for development environment
output "development_ip" {
  description = "Development server public IP address"
  value       = digitalocean_droplet.development.ipv4_address
}

output "development_ipv6" {
  description = "Development server IPv6 address"
  value       = digitalocean_droplet.development.ipv6_address
}

output "development_id" {
  description = "Development server droplet ID"
  value       = digitalocean_droplet.development.id
}

output "development_firewall_id" {
  description = "Development firewall ID"
  value       = digitalocean_firewall.development.id
}
