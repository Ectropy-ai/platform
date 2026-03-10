# ============================================================================
# Docker Compose Deployment Module
# ============================================================================
# Enterprise GitOps pattern for automated compose file deployment
# Triggered on compose file content changes (hash-based)
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
# Compose File Hash (Trigger for updates)
# ============================================================================
# Changes to compose file content trigger redeployment
# Uses SHA256 hash of file content for change detection

locals {
  compose_file_hash = filesha256(var.compose_file_path)
}

# ============================================================================
# Compose File Deployment
# ============================================================================
# Uses null_resource with remote-exec provisioner
# Executes on:
#   - Initial deployment (creation)
#   - Compose file content changes (hash change triggers replacement)
#   - Manual terraform taint/replace

resource "null_resource" "compose_deployment" {
  # Trigger redeployment when compose file changes
  # ROOT CAUSE #233 FIX: Added auto_start_services to triggers
  # Ensures changing auto-start setting triggers module redeployment
  # Pattern: Match env-deployment module trigger consistency
  triggers = {
    compose_hash        = local.compose_file_hash
    droplet_id          = var.droplet_id
    deployment_path     = var.deployment_path
    auto_start_services = var.auto_start_services
  }

  # SSH connection configuration
  connection {
    type        = "ssh"
    user        = var.ssh_user
    private_key = var.ssh_private_key
    host        = var.droplet_ip
    timeout     = "5m"
  }

  # Deploy compose file to server
  provisioner "remote-exec" {
    inline = [
      "#!/bin/bash",
      "set -euo pipefail",
      "echo '========================================='",
      "echo 'TERRAFORM COMPOSE DEPLOYMENT'",
      "echo 'ROOT CAUSE #148: Enterprise GitOps Pattern'",
      "echo '========================================='",
      "echo ''",
      "# Create deployment directory if doesn't exist",
      "mkdir -p ${var.deployment_path}",
      "mkdir -p ${var.deployment_path}/backups",
      "# Backup existing compose file",
      "if [ -f ${var.deployment_path}/docker-compose.yml ]; then",
      "  BACKUP_FILE='${var.deployment_path}/backups/docker-compose.yml.backup-'$(date +%Y%m%d-%H%M%S)",
      "  cp ${var.deployment_path}/docker-compose.yml \"$BACKUP_FILE\"",
      "  echo \"✅ Backup created: $BACKUP_FILE\"",
      "fi",
      "# Write new compose file (will be uploaded via file provisioner)",
      "echo '📦 Deploying docker-compose.yml...'",
      "# Verification will happen after file provisioner completes",
    ]
  }

  # Upload compose file to server
  provisioner "file" {
    source      = var.compose_file_path
    destination = "${var.deployment_path}/docker-compose.yml"
  }

  # Verify deployment and start services
  # ROOT CAUSE #233 FIX: Skip docker-compose commands that require .env
  # .env file created by env-deployment module (runs AFTER compose-deployment)
  # Validation uses simple file checks instead of docker-compose parsing
  provisioner "remote-exec" {
    inline = [
      "#!/bin/bash",
      "set -euo pipefail",
      "echo '🔍 Verifying deployment...'",
      "# Validate compose file (simple checks - no docker-compose parsing)",
      "LINES=$(wc -l < ${var.deployment_path}/docker-compose.yml)",
      "# Count 'speckle' string occurrences (not docker-compose refs)",
      "SPECKLE_REFS=$(grep -o -i 'speckle' ${var.deployment_path}/docker-compose.yml | wc -l)",
      "echo \"   Lines: $LINES (expected: ${var.expected_line_count})\"",
      "echo \"   Speckle references: $SPECKLE_REFS (expected: ${var.expected_speckle_refs})\"",
      "# Fail if compose file is too small (indicates transfer error)",
      "if [ \"$LINES\" -lt ${var.min_line_count} ]; then",
      "  echo '❌ ERROR: Compose file too small ($LINES lines)'",
      "  exit 1",
      "fi",
      "# Fail if Speckle configuration missing (for staging/prod)",
      "if [ \"${var.require_speckle}\" = \"true\" ] && [ \"$SPECKLE_REFS\" -lt ${var.min_speckle_refs} ]; then",
      "  echo '❌ ERROR: Missing Speckle configuration ($SPECKLE_REFS references)'",
      "  exit 1",
      "fi",
      "echo '✅ Compose file validated successfully (file-based checks only)'",
      "echo '⚠️  Docker validation skipped - env-deployment module handles service lifecycle'",
      var.auto_start_services ? join("\n", [
        "# DEPRECATED: Auto-start moved to env-deployment module",
        "# Pattern: env-deployment deploys .env → starts services with valid environment",
        "echo '⚠️  auto_start_services=true but starting moved to env-deployment module'",
      ]) : "echo '⚠️  Auto-start disabled (correct pattern for ROOT CAUSE #233)'",
      "echo ''",
      "echo '========================================='",
      "echo '✅ COMPOSE DEPLOYMENT COMPLETE'",
      "echo '========================================='",
      "echo ''",
      "echo 'Deployed: ${var.compose_file_path}'",
      "echo 'Hash: ${local.compose_file_hash}'",
      "echo 'Timestamp: '$(date -u +\"%Y-%m-%d %H:%M:%S UTC\")",
      "echo ''",
      "echo 'NOTE: Services will start after env-deployment module completes'",
    ]
  }

  # Note: No destroy provisioner needed - cleanup_on_destroy disabled by default
  # Preserves running services and data on terraform destroy
  # If cleanup needed, manually run: docker-compose down on server
}
