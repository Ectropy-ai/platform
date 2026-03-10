#!/bin/bash
set -euo pipefail

echo "🚀 Initializing Ectropy production server..."

# Update system
apt-get update -qq
apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
usermod -aG docker root

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/download/v2.23.0/docker-compose-$(uname -s)-$(uname -m)" \
     -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Create deployment directory
mkdir -p /opt/ectropy
chown -R root:root /opt/ectropy

# Install monitoring tools
apt-get install -y prometheus-node-exporter

# Configure firewall (UFW)
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
ufw --force enable

echo "✅ Production server initialized"
