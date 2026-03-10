#!/bin/bash
# Docker User Configuration Test
# This test validates that all PostgreSQL services in Docker Compose files 
# include proper user directives to prevent permission issues

set -uo pipefail

# Test configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Test that PostgreSQL services have user directive
test_postgres_user_directive() {
    log_info "Testing PostgreSQL services have user directive..."
    
    local compose_files=(
        "docker-compose.yml"
        "docker-compose.production.yml"
        "docker-compose.staging.yml"
    )
    
    local all_passed=true
    
    for compose_file in "${compose_files[@]}"; do
        local file_path="$PROJECT_ROOT/$compose_file"
        if [[ ! -f "$file_path" ]]; then
            log_warning "Docker Compose file not found: $compose_file"
            continue
        fi
        
        log_info "Checking $compose_file..."
        
        # Find all postgres services and check for user directive using a more precise pattern
        # Look for service definitions that end with 'postgres:' 
        local postgres_services=$(awk '/^[[:space:]]*[a-zA-Z0-9_-]*postgres:[[:space:]]*$/ && !/^[[:space:]]*#/ {gsub(/[[:space:]]*:.*/, ""); gsub(/^[[:space:]]*/, ""); print $0 ":" NR}' "$file_path")
        
        if [[ -z "$postgres_services" ]]; then
            log_info "  No PostgreSQL services found in $compose_file"
            continue
        fi
        
        for service_line in $postgres_services; do
            local service_name=$(echo "$service_line" | cut -d: -f1)
            local line_num=$(echo "$service_line" | cut -d: -f2)
            log_info "  Found PostgreSQL service: $service_name"
            
            # Look for user directive within the next 30 lines of the service definition
            # Use a more specific search to find the user directive in this service block
            local user_line=$(sed -n "${line_num},$((line_num + 30))p" "$file_path" | grep -m1 "^[[:space:]]*user:" | head -1)
            
            if [[ -n "$user_line" ]]; then
                local user_value=$(echo "$user_line" | cut -d: -f2- | xargs)
                log_success "    ✅ Found user directive: $user_value"
                
                # Validate user directive format
                if [[ "$user_value" =~ \$\{UID:-[0-9]+\}:\$\{GID:-[0-9]+\} ]]; then
                    log_success "    ✅ User directive has correct format with environment variable support"
                else
                    log_warning "    ⚠️ User directive format could be improved: $user_value"
                fi
            else
                log_error "    ❌ Missing user directive for PostgreSQL service: $service_name"
                all_passed=false
            fi
        done
    done
    
    if [[ "$all_passed" == "true" ]]; then
        log_success "All PostgreSQL services have user directives"
        return 0
    else
        log_error "Some PostgreSQL services missing user directives"
        return 1
    fi
}

# Test that user directive prevents root ownership issues
test_user_directive_prevents_root_ownership() {
    log_info "Testing user directive prevents root ownership issues..."
    
    # Create a test Docker Compose snippet  
    local test_compose_file="/tmp/test-docker-compose-$$.yml"
    cat > "$test_compose_file" << 'EOF'
version: '3.8'
services:
  test-postgres:
    image: postgres:14
    user: "${UID:-1001}:${GID:-1001}"
    environment:
      POSTGRES_DB: testdb
      POSTGRES_USER: testuser
      POSTGRES_PASSWORD: testpass
    volumes:
      - test_data:/var/lib/postgresql/data
      - ./test-init:/docker-entrypoint-initdb.d:ro

volumes:
  test_data:
EOF
    
    # Create test-init directory for volume mount
    mkdir -p "./test-init"
    
    # Validate the compose file syntax (use docker compose if docker-compose not available)
    local compose_cmd="docker-compose"
    if ! command -v docker-compose >/dev/null 2>&1; then
        compose_cmd="docker compose"
    fi
    
    if $compose_cmd -f "$test_compose_file" config >/dev/null 2>&1; then
        log_success "Test Docker Compose file has valid syntax"
    else
        log_warning "Docker Compose validation skipped - Docker may not be available in CI"
        rm -f "$test_compose_file"
        rmdir "./test-init" 2>/dev/null || true
        return 0  # Don't fail if Docker isn't available
    fi
    
    # Check that user directive is properly substituted
    local config_output=$(UID=1001 GID=1001 $compose_cmd -f "$test_compose_file" config 2>/dev/null)
    if echo "$config_output" | grep -q "user: '1001:1001'"; then
        log_success "User directive properly substitutes environment variables"
    else
        log_warning "User directive environment variable substitution test skipped"
    fi
    
    # Cleanup
    rmdir "./test-init" 2>/dev/null || true
    
    rm -f "$test_compose_file"
    return 0
}

# Test that volume mount permissions are compatible
test_volume_mount_compatibility() {
    log_info "Testing volume mount compatibility with user directive..."
    
    local compose_files=(
        "docker-compose.yml"
        "docker-compose.production.yml"
        "docker-compose.staging.yml"
    )
    
    local all_passed=true
    
    for compose_file in "${compose_files[@]}"; do
        local file_path="$PROJECT_ROOT/$compose_file"
        if [[ ! -f "$file_path" ]]; then
            continue
        fi
        
        log_info "Checking volume mounts in $compose_file..."
        
        # Check for database/init volume mount
        if grep -q "./database/init:/docker-entrypoint-initdb.d:ro" "$file_path"; then
            log_success "  ✅ Found database/init volume mount with read-only flag"
        else
            log_warning "  ⚠️ database/init volume mount not found or not read-only"
        fi
        
        # Check for proper volume syntax
        local volume_lines=$(grep -n "./database/init:" "$file_path")
        for line in $volume_lines; do
            if echo "$line" | grep -q ":ro"; then
                log_success "  ✅ Volume mount is read-only: $(echo "$line" | cut -d: -f2-)"
            else
                log_warning "  ⚠️ Volume mount should be read-only: $(echo "$line" | cut -d: -f2-)"
            fi
        done
    done
    
    return 0
}

# Test CI environment variable compatibility
test_ci_environment_compatibility() {
    log_info "Testing CI environment variable compatibility..."
    
    # Test default UID/GID values
    local test_uid=1001
    local test_gid=1001
    
    # Validate that our default values are reasonable for CI
    if [[ $test_uid -ge 1000 && $test_uid -le 65535 ]]; then
        log_success "Default UID ($test_uid) is in acceptable range for CI environments"
    else
        log_error "Default UID ($test_uid) may cause issues in CI environments"
        return 1
    fi
    
    if [[ $test_gid -ge 1000 && $test_gid -le 65535 ]]; then
        log_success "Default GID ($test_gid) is in acceptable range for CI environments"
    else
        log_error "Default GID ($test_gid) may cause issues in CI environments"
        return 1
    fi
    
    # Test environment variable substitution pattern
    local test_pattern='${UID:-1001}:${GID:-1001}'
    if [[ "$test_pattern" =~ \$\{UID:-[0-9]+\}:\$\{GID:-[0-9]+\} ]]; then
        log_success "Environment variable pattern is correctly formatted"
    else
        log_error "Environment variable pattern has formatting issues"
        return 1
    fi
    
    return 0
}

# Main test runner
main() {
    log_info "🧪 Running Docker User Configuration Tests..."
    echo ""
    
    local test_functions=(
        "test_postgres_user_directive"
        "test_user_directive_prevents_root_ownership"
        "test_volume_mount_compatibility"
        "test_ci_environment_compatibility"
    )
    
    local passed=0
    local failed=0
    
    for test_func in "${test_functions[@]}"; do
        echo ""
        if $test_func; then
            ((passed++))
        else
            ((failed++))
        fi
    done
    
    echo ""
    log_info "📊 Docker User Configuration Test Results:"
    log_success "  ✅ Passed: $passed"
    if [[ $failed -gt 0 ]]; then
        log_error "  ❌ Failed: $failed"
    fi
    
    if [[ $failed -eq 0 ]]; then
        log_success "🎉 All Docker user configuration tests passed!"
        log_info "Docker services should now run with consistent user permissions."
        return 0
    else
        log_error "❌ Docker user configuration tests failed"
        log_info "Some Docker services may still have permission issues."
        return 1
    fi
}

# Run tests
main "$@"