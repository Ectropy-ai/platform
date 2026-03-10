#!/bin/bash
# ============================================================================
# Config Sync Script - DigitalOcean Spaces Pull Pattern (Development)
# ============================================================================
# Purpose: Pull docker-compose.yml and .env from S3, restart services if changed
# Pattern: Zero-SSH deployment via S3-compatible object storage
# ============================================================================

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

SPACES_BUCKET="${SPACES_BUCKET:-ectropy-development-configs}"
SPACES_REGION="${SPACES_REGION:-sfo3}"
SPACES_ENDPOINT="https://${SPACES_REGION}.digitaloceanspaces.com"
CONFIG_DIR="${CONFIG_DIR:-/opt/ectropy}"
LOG_FILE="${LOG_FILE:-/var/log/config-sync.log}"
BACKUP_DIR="${CONFIG_DIR}/backups"

# S3 object keys (matches config-upload module paths)
COMPOSE_KEY="development/compose/docker-compose.development.yml"
ENV_KEY="development/env/.env.development"

# Local file paths
COMPOSE_FILE="${CONFIG_DIR}/docker-compose.yml"
ENV_FILE="${CONFIG_DIR}/.env"

# Nginx config S3 keys
NGINX_MAIN_KEY="development/nginx/main.conf"
NGINX_SITE_KEY="development/nginx/development.conf"

# Nginx local paths (match docker-compose volume mounts)
NGINX_DIR="${CONFIG_DIR}/infrastructure/nginx"
NGINX_MAIN_FILE="${NGINX_DIR}/main.conf"
NGINX_SITE_FILE="${NGINX_DIR}/development.conf"

# AWS CLI configuration for DigitalOcean Spaces
export AWS_ENDPOINT_URL="${SPACES_ENDPOINT}"

# ============================================================================
# Logging Functions
# ============================================================================

log_info() {
  echo "[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] [INFO] $*" | tee -a "${LOG_FILE}" >&2
}

log_warn() {
  echo "[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] [WARN] $*" | tee -a "${LOG_FILE}" >&2
}

log_error() {
  echo "[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] [ERROR] $*" | tee -a "${LOG_FILE}" >&2
}

log_success() {
  echo "[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] [SUCCESS] $*" | tee -a "${LOG_FILE}" >&2
}

# ============================================================================
# Validation Functions
# ============================================================================

check_prerequisites() {
  log_info "Checking prerequisites..."

  if ! command -v aws &> /dev/null; then
    log_error "AWS CLI not installed. Install with: apt-get install awscli"
    exit 1
  fi

  if [[ -z "${AWS_ACCESS_KEY_ID:-}" ]] || [[ -z "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
    log_error "AWS credentials not configured. Required: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY"
    exit 1
  fi

  if [[ ! -d "${CONFIG_DIR}" ]]; then
    log_warn "Config directory ${CONFIG_DIR} does not exist. Creating..."
    mkdir -p "${CONFIG_DIR}"
  fi

  if [[ ! -d "${BACKUP_DIR}" ]]; then
    log_info "Creating backup directory: ${BACKUP_DIR}"
    mkdir -p "${BACKUP_DIR}"
  fi

  log_success "Prerequisites validated"
}

# ============================================================================
# S3 Functions
# ============================================================================

download_from_s3() {
  local s3_key="$1"
  local local_path="$2"
  local temp_path="${local_path}.tmp"

  log_info "Downloading s3://${SPACES_BUCKET}/${s3_key} to ${temp_path}..."

  if aws s3 cp "s3://${SPACES_BUCKET}/${s3_key}" "${temp_path}" \
      --endpoint-url "${SPACES_ENDPOINT}" \
      --region "${SPACES_REGION}" \
      --no-progress >> "${LOG_FILE}" 2>&1; then
    log_success "Downloaded ${s3_key}"
    echo "${temp_path}"
  else
    log_error "Failed to download ${s3_key} from S3"
    return 1
  fi
}

get_file_hash() {
  local file_path="$1"

  if [[ ! -f "${file_path}" ]]; then
    echo "NONE"
    return 0
  fi

  sha256sum "${file_path}" | awk '{print $1}'
}

# ============================================================================
# Backup Functions
# ============================================================================

create_backup() {
  local file_path="$1"
  local backup_name="$(basename "${file_path}")"
  local timestamp="$(date -u +"%Y%m%d-%H%M%S")"
  local backup_path="${BACKUP_DIR}/${backup_name}.${timestamp}.backup"

  if [[ -f "${file_path}" ]]; then
    log_info "Creating backup: ${backup_path}"
    cp "${file_path}" "${backup_path}"
    log_success "Backup created: ${backup_path}"
  else
    log_warn "No existing file to backup: ${file_path}"
  fi
}

# ============================================================================
# Deployment Functions
# ============================================================================

deploy_config_file() {
  local s3_key="$1"
  local local_path="$2"
  local file_type="$3"

  log_info "Deploying ${file_type} from S3..."

  local temp_path
  if ! temp_path=$(download_from_s3 "${s3_key}" "${local_path}"); then
    log_error "Failed to download ${file_type} from S3"
    return 1
  fi

  local old_hash=$(get_file_hash "${local_path}")
  local new_hash=$(get_file_hash "${temp_path}")

  log_info "${file_type} hash comparison: current=${old_hash} new=${new_hash}"

  if [[ "${old_hash}" == "${new_hash}" ]]; then
    log_info "${file_type} unchanged, skipping deployment"
    rm -f "${temp_path}"
    return 2  # No changes
  fi

  create_backup "${local_path}"

  log_info "Replacing ${local_path} with new version..."
  mv "${temp_path}" "${local_path}"

  if [[ "${file_type}" == "env" ]]; then
    chmod 600 "${local_path}"
  else
    chmod 644 "${local_path}"
  fi

  log_success "${file_type} deployed successfully"
  return 0
}

# ============================================================================
# DOCR Configuration (Docker Registry Auth)
# ============================================================================

deploy_docker_config() {
  if [[ -z "${DOCR_CONFIG_JSON:-}" ]]; then
    log_info "DOCR_CONFIG_JSON not set, skipping Docker config deployment"
    return 0
  fi

  local docker_config_dir="/opt/ectropy/.docker"
  local docker_config_file="${docker_config_dir}/config.json"

  log_info "Deploying Docker registry configuration..."
  mkdir -p "${docker_config_dir}"
  echo "${DOCR_CONFIG_JSON}" > "${docker_config_file}"
  chmod 600 "${docker_config_file}"

  log_success "Docker config deployed to ${docker_config_file}"
  return 0
}

# ============================================================================
# Service Restart Functions
# ============================================================================

restart_services() {
  log_info "Restarting Docker Compose services..."

  export DOCKER_CONFIG="/opt/ectropy/.docker"

  if ! docker compose -f "${COMPOSE_FILE}" ps &> /dev/null; then
    log_warn "Docker Compose not running, starting services..."
    if docker compose -f "${COMPOSE_FILE}" up -d 2>> "${LOG_FILE}"; then
      log_success "Services started successfully"
    else
      log_error "Failed to start services"
      return 1
    fi
  else
    if docker compose -f "${COMPOSE_FILE}" up -d --force-recreate 2>> "${LOG_FILE}"; then
      log_success "Services restarted successfully"
    else
      log_error "Failed to restart services"
      return 1
    fi
  fi

  log_info "Waiting 10 seconds for services to stabilize..."
  sleep 10

  local running_count=$(docker compose -f "${COMPOSE_FILE}" ps --services --filter "status=running" | wc -l)
  local total_count=$(docker compose -f "${COMPOSE_FILE}" ps --services | wc -l)

  log_info "Services status: ${running_count}/${total_count} running"

  if [[ ${running_count} -eq ${total_count} ]]; then
    log_success "All services running successfully"
    return 0
  else
    log_warn "Some services not running (${running_count}/${total_count})"
    return 1
  fi
}

# ============================================================================
# Deployment Lock Check
# ============================================================================

check_deployment_lock() {
  local lock_file="${CONFIG_DIR}/.deployment.lock"

  if [[ -f "${lock_file}" ]]; then
    local lock_age=$(($(date +%s) - $(stat -c %Y "${lock_file}")))
    log_warn "Deployment lock exists (age: ${lock_age}s). Skipping sync."

    if [[ ${lock_age} -gt 600 ]]; then
      log_warn "Lock is stale (>10 minutes), removing..."
      rm -f "${lock_file}"
      return 0
    fi

    return 1
  fi

  return 0
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
  log_info "=========================================="
  log_info "Config Sync Started (Zero-SSH Pattern)"
  log_info "=========================================="
  log_info "Spaces Bucket: ${SPACES_BUCKET}"
  log_info "Config Directory: ${CONFIG_DIR}"
  log_info "=========================================="

  check_prerequisites
  deploy_docker_config

  if ! check_deployment_lock; then
    log_info "Skipping sync due to deployment lock"
    exit 0
  fi

  mkdir -p "${NGINX_DIR}"

  local compose_changed=false
  local env_changed=false
  local nginx_changed=false

  # Deploy nginx configs first (must exist before docker compose up)
  if deploy_config_file "${NGINX_MAIN_KEY}" "${NGINX_MAIN_FILE}" "nginx-main"; then
    nginx_changed=true
  elif [[ $? -eq 1 ]]; then
    log_error "Failed to deploy nginx main.conf"
    exit 1
  fi

  if deploy_config_file "${NGINX_SITE_KEY}" "${NGINX_SITE_FILE}" "nginx-site"; then
    nginx_changed=true
  elif [[ $? -eq 1 ]]; then
    log_error "Failed to deploy nginx site config"
    exit 1
  fi

  # Deploy docker-compose.yml
  if deploy_config_file "${COMPOSE_KEY}" "${COMPOSE_FILE}" "compose"; then
    compose_changed=true
  elif [[ $? -eq 1 ]]; then
    log_error "Failed to deploy docker-compose.yml"
    exit 1
  fi

  # Deploy .env file
  if deploy_config_file "${ENV_KEY}" "${ENV_FILE}" "env"; then
    env_changed=true
  elif [[ $? -eq 1 ]]; then
    log_error "Failed to deploy .env file"
    exit 1
  fi

  # Restart services if any config changed
  if [[ "${compose_changed}" == true ]] || [[ "${env_changed}" == true ]] || [[ "${nginx_changed}" == true ]]; then
    log_info "Configuration changed, restarting services..."
    if restart_services; then
      log_success "Deployment complete - services restarted successfully"
    else
      log_error "Deployment complete - service restart failed"
      exit 1
    fi
  else
    log_info "No configuration changes detected, skipping service restart"
  fi

  # Force-start if no containers running but config exists
  local running_containers=$(docker compose -f "${COMPOSE_FILE}" ps -q 2>/dev/null | wc -l)
  if [[ ${running_containers} -eq 0 ]] && [[ -f "${COMPOSE_FILE}" ]] && [[ -f "${ENV_FILE}" ]]; then
    log_warn "No Docker containers running but config files exist. Force-starting services..."
    if restart_services; then
      log_success "Services force-started successfully"
    else
      log_error "Failed to force-start services"
      exit 1
    fi
  fi

  log_info "=========================================="
  log_success "Config Sync Complete"
  log_info "=========================================="
}

main "$@"
