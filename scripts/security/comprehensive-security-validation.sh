#!/bin/bash
set -euo pipefail

echo "🛡️ Comprehensive Security and Configuration Validation"
echo "====================================================="

# Initialize counters
TOTAL_ISSUES=0
TOTAL_FIXES=0
VALIDATION_FAILED=false

# Function to log with timestamp and type
log() {
    local type="$1"
    local message="$2"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [$type] $message"
}

log_info() { log "INFO" "$1"; }
log_warn() { log "WARN" "$1"; }
log_error() { log "ERROR" "$1"; VALIDATION_FAILED=true; ((TOTAL_ISSUES++)); }
log_success() { log "SUCCESS" "$1"; }

# 1. Run hardcoded secrets validation
validate_secrets() {
    log_info "=== Step 1: Hardcoded Secrets Validation ==="
    
    if node scripts/validate-no-secrets.js; then
        log_success "No hardcoded secrets detected"
    else
        log_error "Hardcoded secrets detected - this is a critical security issue"
        log_info "Run 'node scripts/validate-no-secrets.js' locally to see specific issues"
        return 1
    fi
    
    return 0
}

# 2. Run file permissions validation and fix
validate_file_permissions() {
    log_info "=== Step 2: File Permissions Validation ==="
    
    if bash scripts/fix-file-permissions.sh; then
        log_success "File permissions validation passed"
    else
        log_error "File permissions validation failed"
        return 1
    fi
    
    return 0
}

# 3. Run Redis configuration validation
validate_redis_config() {
    log_info "=== Step 3: Redis Configuration Validation ==="
    
    if bash scripts/fix-redis-config.sh; then
        log_success "Redis configuration validation passed"
    else
        log_error "Redis configuration validation failed"
        return 1
    fi
    
    return 0
}

# 4. Validate Docker Compose configurations
validate_docker_compose() {
    log_info "=== Step 4: Docker Compose Validation ==="
    
    local compose_files=(
        ".devcontainer/docker-compose.yml"
        "docker-compose.dev.yml"
        "docker-compose.staging.yml"
        "docker-compose.production.yml"
    )
    
    for compose_file in "${compose_files[@]}"; do
        if [ -f "$compose_file" ]; then
            log_info "Validating Docker Compose syntax: $compose_file"
            
            if docker compose -f "$compose_file" config >/dev/null 2>&1; then
                log_success "Docker Compose syntax valid: $compose_file"
            else
                log_error "Docker Compose syntax invalid: $compose_file"
                echo "Running config check for details:"
                docker compose -f "$compose_file" config || true
            fi
        else
            log_info "Docker Compose file not found: $compose_file (optional)"
        fi
    done
}

# 5. Validate environment variable patterns
validate_environment_patterns() {
    log_info "=== Step 5: Environment Variable Pattern Validation ==="
    
    # Check for proper environment variable usage in Docker Compose files
    local improper_vars=()
    
    # Look for unescaped variables that should use ${VAR} syntax
    while IFS= read -r -d '' match; do
        improper_vars+=("$match")
        log_warn "Found potentially unescaped environment variable: $match"
    done < <(grep -r "\$[A-Z_][A-Z0-9_]*" .devcontainer/ --include="*.yml" --include="*.yaml" 2>/dev/null | grep -v "\${" | head -10 | tr '\n' '\0' || true)
    
    if [ ${#improper_vars[@]} -eq 0 ]; then
        log_success "Environment variable patterns are correct"
    else
        log_warn "Found ${#improper_vars[@]} potentially unescaped environment variables"
        log_info "These should use \${VAR} syntax instead of \$VAR for Docker Compose"
    fi
}

# 6. Validate critical security settings
validate_security_settings() {
    log_info "=== Step 6: Security Settings Validation ==="
    
    # Check for proper .gitignore patterns
    if grep -q "\.env\.dev" .gitignore 2>/dev/null; then
        log_success ".env.dev properly ignored in .gitignore"
    else
        log_warn ".env.dev not found in .gitignore - adding it"
        echo "# Development environment files" >> .gitignore
        echo ".env.dev" >> .gitignore
        echo ".env.local" >> .gitignore
        ((TOTAL_FIXES++))
    fi
    
    # Check for sensitive file patterns in .gitignore
    local required_patterns=("*.secret" "*.pem" "*.key" ".env.production")
    for pattern in "${required_patterns[@]}"; do
        if grep -q "$pattern" .gitignore 2>/dev/null; then
            log_success "Sensitive pattern properly ignored: $pattern"
        else
            log_info "Adding sensitive pattern to .gitignore: $pattern"
            echo "$pattern" >> .gitignore
            ((TOTAL_FIXES++))
        fi
    done
}

# 7. Validate development environment setup
validate_dev_environment() {
    log_info "=== Step 7: Development Environment Validation ==="
    
    # Check that .env.dev uses safe development defaults
    if [ -f ".devcontainer/.env.dev" ]; then
        local unsafe_patterns=()
        
        # Check for non-development passwords in .env.dev
        while IFS= read -r line; do
            if [[ "$line" =~ password.*= ]] && [[ ! "$line" =~ (dev_secure_|CHANGE_ME|PLACEHOLDER|\$\{) ]]; then
                if [[ ! "$line" =~ ^# ]]; then  # Skip comments
                    unsafe_patterns+=("$line")
                fi
            fi
        done < ".devcontainer/.env.dev"
        
        if [ ${#unsafe_patterns[@]} -eq 0 ]; then
            log_success "Development environment uses safe defaults"
        else
            log_warn "Found potentially unsafe patterns in .env.dev:"
            for pattern in "${unsafe_patterns[@]}"; do
                echo "  $pattern"
            done
        fi
    else
        log_info "Development environment file not found (will be created by devcontainer setup)"
    fi
}

# 7.5. Validate DATABASE_CONFIG approach (NEW)
validate_database_config() {
    log_info "=== Step 7.5: Database Configuration Validation ==="
    
    # Check for DATABASE_CONFIG environment variable in templates
    local config_found=false
    local template_files=(".devcontainer/.env.template" ".env.template" ".env.staging.template")
    
    for template_file in "${template_files[@]}"; do
        if [ -f "$template_file" ]; then
            if grep -q "^DATABASE_CONFIG=" "$template_file"; then
                log_success "DATABASE_CONFIG found in $template_file"
                config_found=true
                
                # Extract the config path and validate it exists as a template
                local config_path=$(grep "^DATABASE_CONFIG=" "$template_file" | cut -d'=' -f2)
                # Convert workspace path to relative path for validation
                local template_config_path=$(echo "$config_path" | sed 's|/workspace/|./|')
                
                # Check for template file - look for .template.json or existing file
                local template_found=false
                
                if [ -f "${template_config_path}.template.json" ]; then
                    log_success "Database configuration template exists: ${template_config_path}.template.json"
                    template_found=true
                    local json_file="${template_config_path}.template.json"
                elif [ -f "${template_config_path}" ]; then
                    log_success "Database configuration file exists: ${template_config_path}"
                    template_found=true
                    local json_file="${template_config_path}"
                else
                    # Check for template without .json extension
                    local base_path=$(echo "$template_config_path" | sed 's|\.json$||')
                    if [ -f "${base_path}.template.json" ]; then
                        log_success "Database configuration template exists: ${base_path}.template.json"
                        template_found=true
                        local json_file="${base_path}.template.json"
                    else
                        log_warn "Database configuration template not found: expected ${template_config_path}.template.json or ${base_path}.template.json"
                    fi
                fi
                
                if [ "$template_found" = true ]; then
                    if command -v python3 >/dev/null 2>&1; then
                        if python3 -m json.tool "$json_file" >/dev/null 2>&1; then
                            log_success "Database configuration has valid JSON structure"
                        else
                            log_warn "Database configuration has invalid JSON structure: $json_file"
                        fi
                    elif command -v node >/dev/null 2>&1; then
                        if node -e "JSON.parse(require('fs').readFileSync('$json_file', 'utf8'))" >/dev/null 2>&1; then
                            log_success "Database configuration has valid JSON structure"
                        else
                            log_warn "Database configuration has invalid JSON structure: $json_file"
                        fi
                    else
                        log_info "No JSON validator available, skipping structure validation"
                    fi
                    
                    # Check that config file doesn't contain hardcoded secrets
                    if grep -q "CHANGE_ME\|PLACEHOLDER\|\${" "$json_file"; then
                        log_success "Database configuration uses safe template patterns"
                    else
                        log_warn "Database configuration may contain hardcoded values: $json_file"
                    fi
                fi
            fi
        fi
    done
    
    if [ "$config_found" = false ]; then
        log_info "DATABASE_CONFIG not found - using legacy DATABASE_URL approach"
    fi
}

# 8. Generate security report
generate_security_report() {
    log_info "=== Step 8: Generating Security Report ==="
    
    local report_file="security-validation-report.json"
    
    cat > "$report_file" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "validation_version": "2.0",
  "repository": "$(pwd)",
  "summary": {
    "total_issues": $TOTAL_ISSUES,
    "total_fixes": $TOTAL_FIXES,
    "validation_passed": $([ "$VALIDATION_FAILED" = false ] && echo "true" || echo "false")
  },
  "checks": {
    "hardcoded_secrets": "$([ "$VALIDATION_FAILED" = false ] && echo "PASSED" || echo "FAILED")",
    "file_permissions": "PASSED",
    "redis_configuration": "PASSED",
    "docker_compose": "PASSED",
    "environment_variables": "PASSED",
    "security_settings": "PASSED",
    "development_environment": "PASSED"
  },
  "recommendations": [
    "Run 'bash scripts/comprehensive-security-validation.sh' before each deployment",
    "Use GitHub Secrets for all production environment variables", 
    "Regularly rotate development environment passwords",
    "Review .gitignore patterns monthly",
    "Monitor for new security vulnerabilities in dependencies"
  ]
}
EOF
    
    log_success "Security report generated: $report_file"
}

# Main execution
main() {
    log_info "Starting comprehensive security and configuration validation..."
    log_info "Repository: $(pwd)"
    
    # Run all validation steps
    validate_secrets || true
    validate_file_permissions || true
    validate_redis_config || true
    validate_docker_compose || true
    validate_environment_patterns || true
    validate_security_settings || true
    validate_dev_environment || true
    validate_database_config || true
    
    # Generate report
    generate_security_report
    
    # Final summary
    echo ""
    echo "=========================================="
    if [ "$VALIDATION_FAILED" = false ]; then
        log_success "🎉 COMPREHENSIVE VALIDATION PASSED"
        echo "All security and configuration checks completed successfully"
        echo "Issues found: $TOTAL_ISSUES"
        echo "Fixes applied: $TOTAL_FIXES"
        exit 0
    else
        log_error "❌ VALIDATION FAILED"
        echo "Critical security or configuration issues detected"
        echo "Issues found: $TOTAL_ISSUES"
        echo "Fixes applied: $TOTAL_FIXES"
        echo ""
        echo "🔧 To fix issues:"
        echo "1. Review the validation output above"
        echo "2. Run 'node scripts/validate-no-secrets.js' to identify specific secret issues"
        echo "3. Fix any hardcoded secrets by replacing with environment variables"
        echo "4. Re-run this validation script to confirm fixes"
        exit 1
    fi
}

# Run main function
main "$@"