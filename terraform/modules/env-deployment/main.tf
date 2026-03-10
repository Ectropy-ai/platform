# ============================================================================
# Environment File Deployment Module
# ============================================================================
# Enterprise GitOps pattern for automated .env file deployment
# Triggered on environment variable content changes (hash-based)
# ============================================================================

terraform {
  required_version = ">= 1.0"

  required_providers {
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }
}

# ============================================================================
# Environment Content Hash (Trigger for updates)
# ============================================================================
# Changes to environment variables trigger redeployment
# Uses SHA256 hash of concatenated environment values for change detection

locals {
  # Concatenate all environment variables for hash calculation
  env_content = join("\n", [
    "VERSION=${var.app_version}",
    "DATABASE_URL=${var.database_url}",
    "DATABASE_HOST=${var.database_host}",
    "DATABASE_PORT=${var.database_port}",
    "DATABASE_NAME=${var.database_name}",
    "DATABASE_USER=${var.database_user}",
    "DATABASE_PASSWORD=${var.database_password}",
    "DATABASE_SSL=${var.database_ssl}",  # ROOT CAUSE #222: Enable SSL for DigitalOcean managed PostgreSQL
    "JWT_SECRET=${var.jwt_secret}",
    "JWT_REFRESH_SECRET=${var.jwt_refresh_secret}",
    "SESSION_SECRET=${var.session_secret}",
    "GOOGLE_CLIENT_ID=${var.google_client_id}",
    "GOOGLE_CLIENT_SECRET=${var.google_client_secret}",
    "REDIS_PASSWORD=${var.redis_password}",
    "ENCRYPTION_KEY=${var.encryption_key}",
    "MCP_API_KEY=${var.mcp_api_key}",
    "OPENAI_API_KEY=${var.openai_api_key}",
    "API_URL=${var.api_url}",
    "FRONTEND_URL=${var.frontend_url}",
    "SPECKLE_SERVER_TOKEN=${var.speckle_server_token}",
    "SPECKLE_ADMIN_PASSWORD=${var.speckle_admin_password}",
    "SPECKLE_SESSION_SECRET=${var.speckle_session_secret}",
    "SPECKLE_PUBLIC_URL=${var.speckle_public_url}",   # ROOT CAUSE #232: Path-based routing for Speckle frontend
    "MINIO_ACCESS_KEY=${var.minio_access_key}",
    "MINIO_SECRET_KEY=${var.minio_secret_key}",
    "RESEND_API_KEY=${var.resend_api_key}",
    "WATCHTOWER_HTTP_API_TOKEN=${var.watchtower_http_api_token}",
    "CONSOLE_PORT=${var.console_port}",      # ROOT CAUSE #199: Ectropy Console port (default: 3004)
    "MCP_STDIO_PORT=${var.mcp_stdio_port}",  # ROOT CAUSE #199: MCP Server port (default: 3001)
  ])

  env_content_hash = sha256(local.env_content)
}

# ============================================================================
# Environment File Deployment
# ============================================================================
# Uses null_resource with remote-exec provisioner
# Executes on:
#   - Initial deployment (creation)
#   - Environment variable content changes (hash change triggers replacement)
#   - Manual terraform taint/replace

resource "null_resource" "env_deployment" {
  # Trigger redeployment when environment variables change
  # ROOT CAUSE #198: Added auto_restart_services to triggers
  # Ensures changing auto-restart setting triggers redeployment
  triggers = {
    env_hash              = local.env_content_hash
    droplet_id            = var.droplet_id
    deployment_path       = var.deployment_path
    auto_restart_services = var.auto_restart_services
  }

  # SSH connection configuration
  connection {
    type        = "ssh"
    user        = var.ssh_user
    private_key = var.ssh_private_key
    host        = var.droplet_ip
    timeout     = "5m"
  }

  # Deploy .env file to server
  provisioner "remote-exec" {
    inline = [
      "#!/bin/bash",
      "set -euo pipefail",
      "echo '========================================='",
      "echo 'TERRAFORM ENV DEPLOYMENT'",
      "echo 'ROOT CAUSE #149: Enterprise GitOps Pattern'",
      "echo '========================================='",
      "echo ''",
      "# Create deployment directory if doesn't exist",
      "mkdir -p ${var.deployment_path}",
      "mkdir -p ${var.deployment_path}/backups",
      "# Backup existing .env file",
      "if [ -f ${var.deployment_path}/.env ]; then",
      "  BACKUP_FILE='${var.deployment_path}/backups/.env.backup-'$(date +%Y%m%d-%H%M%S)",
      "  cp ${var.deployment_path}/.env \"$BACKUP_FILE\"",
      "  echo \"✅ Backup created: $BACKUP_FILE\"",
      "fi",
      "# Write new .env file (using heredoc to avoid escaping issues)",
      "cat > ${var.deployment_path}/.env <<'ENV_EOF'",
      local.env_content,
      "ENV_EOF",
      "# Set secure file permissions (owner read/write only)",
      "chmod 600 ${var.deployment_path}/.env",
      "echo '🔍 Verifying deployment...'",
      "# Verify .env file",
      "LINES=$(wc -l < ${var.deployment_path}/.env)",
      "echo \"   Lines: $LINES (expected: ${var.expected_line_count})\"",
      "echo \"   Permissions: $(stat -c '%a' ${var.deployment_path}/.env)\"",
      "# Fail if .env file is too small (indicates transfer error)",
      "if [ \"$LINES\" -lt ${var.min_line_count} ]; then",
      "  echo '❌ ERROR: .env file too small ($LINES lines)'",
      "  exit 1",
      "fi",
      "echo '✅ Environment file validated successfully'",
      var.auto_restart_services ? join("\n", [
        "# Restart services to pick up new environment variables",
        "echo '🔄 Restarting services to apply new environment...'",
        "cd ${var.deployment_path}",
        "if [ -f docker-compose.yml ]; then",
        "  docker-compose down",
        "  docker-compose up -d",
        "  echo '⏳ Waiting for services to initialize (30 seconds)...'",
        "  sleep 30",
        "  echo '📊 Service status:'",
        "  docker-compose ps",
        "  echo ''",
        "  # ROOT CAUSE #225 FIX: Reload nginx after container recreation",
        "  # When containers restart, they get new Docker bridge network IPs",
        "  # nginx must reload to apply runtime DNS resolution pattern from config",
        "  # This ensures nginx can reach backends at their new IP addresses",
        "  echo '🔄 Reloading nginx to pick up new container IPs...'",
        "  if docker ps --filter name=${var.nginx_container_name} --filter status=running -q | grep -q .; then",
        "    echo '✅ Nginx container found (${var.nginx_container_name}), performing reload...'",
        "    if docker exec ${var.nginx_container_name} nginx -s reload 2>&1; then",
        "      echo '✅ Nginx reloaded successfully - services ready'",
        "    else",
        "      echo '⚠️  Nginx reload failed (non-fatal - may still work with runtime DNS)'",
        "    fi",
        "  else",
        "    echo 'ℹ️  Nginx container not running (${var.nginx_container_name}), skipping reload'",
        "  fi",
        "else",
        "  echo '⚠️  No docker-compose.yml found, skipping service restart'",
        "fi",
      ]) : "echo '⚠️  Auto-restart disabled, skipping service restart'",
      "echo ''",
      "echo '========================================='",
      "echo '✅ ENV DEPLOYMENT COMPLETE'",
      "echo '========================================='",
      "echo ''",
      "echo 'Environment Hash: ${local.env_content_hash}'",
      "echo 'Timestamp: '$(date -u +\"%Y-%m-%d %H:%M:%S UTC\")",
    ]
  }

  # Note: No destroy provisioner needed - cleanup_on_destroy disabled by default
  # Preserves .env file and running services on terraform destroy
  # If cleanup needed, manually run: rm /opt/ectropy/.env on server
}
