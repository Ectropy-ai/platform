#!/bin/bash
# Network diagnostics for self-hosted runners
# Tests connectivity to npm registry and other critical services

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

# Test DNS resolution
test_dns() {
    local host=$1
    log "Testing DNS resolution for $host..."
    
    if command -v nslookup >/dev/null 2>&1; then
        if nslookup "$host" >/dev/null 2>&1; then
            success "DNS resolution successful for $host"
            return 0
        else
            error "DNS resolution failed for $host"
            return 1
        fi
    elif command -v host >/dev/null 2>&1; then
        if host "$host" >/dev/null 2>&1; then
            success "DNS resolution successful for $host"
            return 0
        else
            error "DNS resolution failed for $host"
            return 1
        fi
    elif command -v dig >/dev/null 2>&1; then
        if dig "$host" +short | grep -q .; then
            success "DNS resolution successful for $host"
            return 0
        else
            error "DNS resolution failed for $host"
            return 1
        fi
    else
        warning "No DNS tools available (nslookup, host, or dig)"
        return 0
    fi
}

# Test HTTP connectivity
test_http() {
    local url=$1
    local name=$2
    log "Testing HTTP connectivity to $name ($url)..."
    
    if curl -I --connect-timeout 10 --max-time 30 "$url" >/dev/null 2>&1; then
        success "HTTP connectivity successful to $name"
        return 0
    else
        error "HTTP connectivity failed to $name"
        # Show more details
        curl -I --connect-timeout 10 --max-time 30 "$url" 2>&1 || true
        return 1
    fi
}

# Test HTTPS connectivity with detailed output
test_https_detailed() {
    local url=$1
    local name=$2
    log "Testing HTTPS connectivity to $name ($url)..."
    
    local status_code
    status_code=$(curl -I --connect-timeout 10 --max-time 30 -s -o /dev/null -w '%{http_code}' "$url" 2>&1) || status_code="000"
    
    if [[ "$status_code" =~ ^[23] ]]; then
        success "HTTPS connectivity successful to $name (HTTP $status_code)"
        return 0
    else
        error "HTTPS connectivity failed to $name (HTTP $status_code)"
        # Try with verbose output for debugging
        log "Verbose output:"
        curl -I --connect-timeout 10 --max-time 30 -v "$url" 2>&1 | head -20 || true
        return 1
    fi
}

# Test TCP connectivity
test_tcp() {
    local host=$1
    local port=$2
    local name=$3
    log "Testing TCP connectivity to $name ($host:$port)..."
    
    if command -v nc >/dev/null 2>&1; then
        if timeout 10 nc -zv "$host" "$port" 2>&1 | grep -q "succeeded\|open"; then
            success "TCP connectivity successful to $name"
            return 0
        else
            error "TCP connectivity failed to $name"
            return 1
        fi
    elif command -v telnet >/dev/null 2>&1; then
        if echo "quit" | timeout 10 telnet "$host" "$port" 2>&1 | grep -q "Connected\|Escape"; then
            success "TCP connectivity successful to $name"
            return 0
        else
            error "TCP connectivity failed to $name"
            return 1
        fi
    else
        warning "No TCP testing tools available (nc or telnet)"
        return 0
    fi
}

# Test npm registry connectivity
test_npm_registry() {
    log "Testing npm registry connectivity..."
    
    local failures=0
    
    # Test DNS
    test_dns "registry.npmjs.org" || ((failures++))
    
    # Test HTTPS
    test_https_detailed "https://registry.npmjs.org" "npm registry" || ((failures++))
    
    # Test TCP
    test_tcp "registry.npmjs.org" "443" "npm registry HTTPS" || ((failures++))
    
    # Test actual package fetch
    log "Testing actual package fetch from registry..."
    if curl --connect-timeout 10 --max-time 30 -s "https://registry.npmjs.org/yallist/4.0.0" | grep -q "version"; then
        success "Package fetch test successful"
    else
        error "Package fetch test failed"
        ((failures++))
    fi
    
    return $failures
}

# Check for proxy/firewall configuration
check_proxy_config() {
    log "Checking proxy/firewall configuration..."
    
    if [[ -n "${HTTP_PROXY:-}" ]] || [[ -n "${http_proxy:-}" ]]; then
        warning "HTTP proxy configured: ${HTTP_PROXY:-${http_proxy}}"
    else
        log "No HTTP proxy configured"
    fi
    
    if [[ -n "${HTTPS_PROXY:-}" ]] || [[ -n "${https_proxy:-}" ]]; then
        warning "HTTPS proxy configured: ${HTTPS_PROXY:-${https_proxy}}"
    else
        log "No HTTPS proxy configured"
    fi
    
    if [[ -n "${NO_PROXY:-}" ]] || [[ -n "${no_proxy:-}" ]]; then
        log "NO_PROXY configured: ${NO_PROXY:-${no_proxy}}"
    fi
}

# Check network interfaces
check_network_interfaces() {
    log "Checking network interfaces..."
    
    if command -v ip >/dev/null 2>&1; then
        log "Network interfaces:"
        ip addr show | grep -E "^[0-9]|inet " || true
    elif command -v ifconfig >/dev/null 2>&1; then
        log "Network interfaces:"
        ifconfig | grep -E "^[a-z]|inet " || true
    fi
}

# Check DNS configuration
check_dns_config() {
    log "Checking DNS configuration..."
    
    if [[ -f /etc/resolv.conf ]]; then
        log "DNS nameservers:"
        grep "nameserver" /etc/resolv.conf || warning "No nameservers found in /etc/resolv.conf"
    else
        warning "/etc/resolv.conf not found"
    fi
}

# Main diagnostics
main() {
    log "🔍 Starting network diagnostics for self-hosted runner..."
    echo ""
    
    log "============================================"
    log "System Information"
    log "============================================"
    log "Hostname: $(hostname)"
    log "Kernel: $(uname -sr)"
    log "Date: $(date)"
    echo ""
    
    log "============================================"
    log "Network Configuration"
    log "============================================"
    check_network_interfaces
    echo ""
    check_dns_config
    echo ""
    check_proxy_config
    echo ""
    
    log "============================================"
    log "Critical Services Connectivity"
    log "============================================"
    
    local total_failures=0
    
    # Test npm registry (most important)
    test_npm_registry || total_failures=$?
    echo ""
    
    # Test GitHub
    log "Testing GitHub connectivity..."
    test_dns "github.com" || ((total_failures++))
    test_https_detailed "https://github.com" "GitHub" || ((total_failures++))
    echo ""
    
    # Test DNS servers
    log "Testing DNS servers..."
    test_tcp "8.8.8.8" "53" "Google DNS" || ((total_failures++))
    test_tcp "1.1.1.1" "53" "Cloudflare DNS" || ((total_failures++))
    echo ""
    
    log "============================================"
    log "Diagnostics Summary"
    log "============================================"
    
    if [[ $total_failures -eq 0 ]]; then
        success "All network connectivity tests passed! ✅"
        return 0
    elif [[ $total_failures -lt 3 ]]; then
        warning "Some network connectivity tests failed ($total_failures failures)"
        warning "The runner may still function but could experience intermittent issues"
        return 0
    else
        error "Multiple network connectivity tests failed ($total_failures failures)"
        error "The runner is likely to experience significant connectivity issues"
        return 1
    fi
}

main "$@"
