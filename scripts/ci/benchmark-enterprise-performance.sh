#!/bin/bash
# Enterprise Performance Benchmarking Script
# Tests API response times, upload performance, and viewer load times

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Output functions
print_header() { echo -e "${BLUE}==== $1 ====${NC}"; }
print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️ $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_info() { echo -e "ℹ️ $1"; }

# Performance thresholds (milliseconds)
API_RESPONSE_THRESHOLD=200
UPLOAD_THRESHOLD=5000
VIEWER_LOAD_THRESHOLD=3000

# Test configuration
API_GATEWAY_URL="http://localhost:4000"
MCP_SERVER_URL="http://localhost:3001"
WEB_DASHBOARD_URL="http://localhost:4200"
BENCHMARK_REPORT="reports/performance-benchmark-$(date +%Y%m%d-%H%M%S).json"

# Performance metrics
BENCHMARK_RESULTS=()
PERFORMANCE_ERRORS=0

# Function to measure API response time
measure_api_response() {
  local name="$1"
  local url="$2"
  local method="${3:-GET}"
  local data="${4:-}"
  
  print_info "Testing $name..."
  
  local start_time=$(date +%s%3N)
  local response_code
  
  if [ "$method" = "POST" ] && [ -n "$data" ]; then
    response_code=$(curl -s -o /dev/null -w "%{http_code}" \
      -X POST \
      -H "Content-Type: application/json" \
      -d "$data" \
      --max-time 10 \
      "$url" 2>/dev/null || echo "000")
  else
    response_code=$(curl -s -o /dev/null -w "%{http_code}" \
      --max-time 10 \
      "$url" 2>/dev/null || echo "000")
  fi
  
  local end_time=$(date +%s%3N)
  local duration=$((end_time - start_time))
  
  # Validate response and performance
  if [ "$response_code" -ge 200 ] && [ "$response_code" -lt 400 ]; then
    if [ $duration -le $API_RESPONSE_THRESHOLD ]; then
      print_success "$name: ${duration}ms (HTTP $response_code) ✅"
      BENCHMARK_RESULTS+=("\"$name\":{\"duration_ms\":$duration,\"status\":\"pass\",\"http_code\":$response_code}")
    else
      print_warning "$name: ${duration}ms (HTTP $response_code) ⚠️ (>${API_RESPONSE_THRESHOLD}ms threshold)"
      BENCHMARK_RESULTS+=("\"$name\":{\"duration_ms\":$duration,\"status\":\"slow\",\"http_code\":$response_code}")
    fi
  else
    print_error "$name: ${duration}ms (HTTP $response_code) ❌"
    BENCHMARK_RESULTS+=("\"$name\":{\"duration_ms\":$duration,\"status\":\"fail\",\"http_code\":$response_code}")
    PERFORMANCE_ERRORS=$((PERFORMANCE_ERRORS + 1))
  fi
}

# Function to measure file upload performance
measure_upload_performance() {
  local name="$1"
  local url="$2"
  local test_file="$3"
  
  print_info "Testing $name..."
  
  if [ ! -f "$test_file" ]; then
    print_warning "$name: Test file $test_file not found, creating sample..."
    mkdir -p "$(dirname "$test_file")"
    # Create a 1MB test file
    dd if=/dev/zero of="$test_file" bs=1024 count=1024 >/dev/null 2>&1
  fi
  
  local start_time=$(date +%s%3N)
  local response_code
  
  response_code=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST \
    -F "file=@$test_file" \
    --max-time 30 \
    "$url" 2>/dev/null || echo "000")
  
  local end_time=$(date +%s%3N)
  local duration=$((end_time - start_time))
  
  if [ "$response_code" -ge 200 ] && [ "$response_code" -lt 400 ]; then
    if [ $duration -le $UPLOAD_THRESHOLD ]; then
      print_success "$name: ${duration}ms (HTTP $response_code) ✅"
      BENCHMARK_RESULTS+=("\"$name\":{\"duration_ms\":$duration,\"status\":\"pass\",\"http_code\":$response_code}")
    else
      print_warning "$name: ${duration}ms (HTTP $response_code) ⚠️ (>${UPLOAD_THRESHOLD}ms threshold)"
      BENCHMARK_RESULTS+=("\"$name\":{\"duration_ms\":$duration,\"status\":\"slow\",\"http_code\":$response_code}")
    fi
  else
    print_error "$name: ${duration}ms (HTTP $response_code) ❌"
    BENCHMARK_RESULTS+=("\"$name\":{\"duration_ms\":$duration,\"status\":\"fail\",\"http_code\":$response_code}")
    PERFORMANCE_ERRORS=$((PERFORMANCE_ERRORS + 1))
  fi
}

# Function to check service availability
check_service_availability() {
  local service_name="$1"
  local url="$2"
  
  if curl -s -f "$url" >/dev/null 2>&1; then
    print_success "$service_name is running"
    return 0
  else
    print_error "$service_name is not accessible at $url"
    return 1
  fi
}

print_header "Enterprise Performance Benchmarking"
print_info "Testing API response times, upload performance, and system metrics"

# Create reports directory
mkdir -p reports

# Phase 1: Service Availability Check
print_header "Phase 1: Service Availability"

API_AVAILABLE=false
MCP_AVAILABLE=false
WEB_AVAILABLE=false

if check_service_availability "API Gateway" "$API_GATEWAY_URL/health"; then
  API_AVAILABLE=true
fi

if check_service_availability "MCP Server" "$MCP_SERVER_URL/health"; then
  MCP_AVAILABLE=true
fi

if check_service_availability "Web Dashboard" "$WEB_DASHBOARD_URL/"; then
  WEB_AVAILABLE=true
fi

# Phase 2: API Performance Benchmarking
print_header "Phase 2: API Response Time Benchmarking"

if [ "$API_AVAILABLE" = true ]; then
  # Health check
  measure_api_response "API Health Check" "$API_GATEWAY_URL/health"
  
  # Demo stats endpoint
  measure_api_response "Demo Stats API" "$API_GATEWAY_URL/api/demo/stats"
  
  # Auth check (expected to be fast even with 401)
  measure_api_response "Auth Check API" "$API_GATEWAY_URL/api/auth/check"
  
  # Test POST endpoint
  measure_api_response "MCP Query API" "$API_GATEWAY_URL/api/mcp/agents/analyze/execute" "POST" \
    '{"action":"analyze","input":{"text":"performance test"}}'
else
  print_warning "API Gateway not available - skipping API benchmarks"
fi

if [ "$MCP_AVAILABLE" = true ]; then
  # MCP specific endpoints
  measure_api_response "MCP Health Check" "$MCP_SERVER_URL/health"
  
  measure_api_response "MCP Agents List" "$MCP_SERVER_URL/api/agents"
  
  measure_api_response "MCP Monitoring" "$MCP_SERVER_URL/api/monitoring/health"
else
  print_warning "MCP Server not available - skipping MCP benchmarks"
fi

# Phase 3: Upload Performance Testing
print_header "Phase 3: Upload Performance Testing"

if [ "$API_AVAILABLE" = true ]; then
  # Test file upload performance
  TEST_FILE="reports/test-upload.bin"
  
  # Test small file upload (1MB)
  measure_upload_performance "Small File Upload (1MB)" "$API_GATEWAY_URL/api/upload/ifc" "$TEST_FILE"
  
  # Test larger file if service supports it
  LARGE_TEST_FILE="reports/test-large-upload.bin"
  if [ ! -f "$LARGE_TEST_FILE" ]; then
    print_info "Creating 5MB test file for upload performance..."
    dd if=/dev/zero of="$LARGE_TEST_FILE" bs=1024 count=5120 >/dev/null 2>&1 || {
      print_warning "Failed to create large test file, skipping large upload test"
    }
  fi
  
  if [ -f "$LARGE_TEST_FILE" ]; then
    measure_upload_performance "Large File Upload (5MB)" "$API_GATEWAY_URL/api/upload/ifc" "$LARGE_TEST_FILE"
  fi
else
  print_warning "API Gateway not available - skipping upload benchmarks"
fi

# Phase 4: Dashboard Load Time Testing
print_header "Phase 4: Dashboard Load Time Testing"

if [ "$WEB_AVAILABLE" = true ]; then
  # Test main dashboard pages
  DASHBOARD_PAGES=(
    "Landing Page:/"
    "Architect Dashboard:/dashboard/architect"
    "Engineer Dashboard:/dashboard/engineer"
    "Contractor Dashboard:/dashboard/contractor"
    "Owner Dashboard:/dashboard/owner"
  )
  
  for page_info in "${DASHBOARD_PAGES[@]}"; do
    IFS=':' read -r page_name page_path <<< "$page_info"
    measure_api_response "$page_name" "$WEB_DASHBOARD_URL$page_path"
  done
else
  print_warning "Web Dashboard not available - skipping dashboard benchmarks"
fi

# Phase 5: Memory and Resource Usage Analysis
print_header "Phase 5: System Resource Analysis"

# Check system memory usage
MEMORY_USAGE=$(free -m | awk 'NR==2{printf "%.1f%%", $3*100/$2 }' 2>/dev/null || echo "N/A")
print_info "System Memory Usage: $MEMORY_USAGE"

# Check CPU load
CPU_LOAD=$(uptime | awk -F'load average:' '{ print $2 }' | cut -d, -f1 | xargs 2>/dev/null || echo "N/A")
print_info "CPU Load Average: $CPU_LOAD"

# Check disk usage
DISK_USAGE=$(df -h . | awk 'NR==2 {print $5}' 2>/dev/null || echo "N/A")
print_info "Disk Usage: $DISK_USAGE"

# Generate Performance Report
print_header "Phase 6: Performance Report Generation"

# Count performance categories
TOTAL_TESTS=${#BENCHMARK_RESULTS[@]}
PASSED_TESTS=$(printf '%s\n' "${BENCHMARK_RESULTS[@]}" | grep -c '"status":"pass"' || echo 0)
SLOW_TESTS=$(printf '%s\n' "${BENCHMARK_RESULTS[@]}" | grep -c '"status":"slow"' || echo 0)
FAILED_TESTS=$(printf '%s\n' "${BENCHMARK_RESULTS[@]}" | grep -c '"status":"fail"' || echo 0)

# Calculate performance score
if [ $TOTAL_TESTS -gt 0 ]; then
  PERFORMANCE_SCORE=$(( (PASSED_TESTS * 100 + SLOW_TESTS * 50) / TOTAL_TESTS ))
else
  PERFORMANCE_SCORE=0
fi

# Generate JSON report
cat > "$BENCHMARK_REPORT" << EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "benchmark_type": "enterprise_performance",
  "thresholds": {
    "api_response_ms": $API_RESPONSE_THRESHOLD,
    "upload_ms": $UPLOAD_THRESHOLD,
    "viewer_load_ms": $VIEWER_LOAD_THRESHOLD
  },
  "services": {
    "api_gateway": $API_AVAILABLE,
    "mcp_server": $MCP_AVAILABLE,
    "web_dashboard": $WEB_AVAILABLE
  },
  "system_metrics": {
    "memory_usage": "$MEMORY_USAGE",
    "cpu_load": "$CPU_LOAD",
    "disk_usage": "$DISK_USAGE"
  },
  "performance_summary": {
    "total_tests": $TOTAL_TESTS,
    "passed": $PASSED_TESTS,
    "slow": $SLOW_TESTS,
    "failed": $FAILED_TESTS,
    "performance_score": $PERFORMANCE_SCORE,
    "errors": $PERFORMANCE_ERRORS
  },
  "test_results": {
    $(IFS=','; echo "${BENCHMARK_RESULTS[*]}")
  }
}
EOF

print_success "Performance report saved: $BENCHMARK_REPORT"

# Final Performance Assessment
print_header "Performance Benchmark Summary"

print_info "Test Results: $PASSED_TESTS passed, $SLOW_TESTS slow, $FAILED_TESTS failed (total: $TOTAL_TESTS)"

if [ $PERFORMANCE_SCORE -ge 90 ]; then
  print_success "🚀 Excellent Performance Score: $PERFORMANCE_SCORE%"
  print_success "Enterprise demo ready - all performance requirements met!"
elif [ $PERFORMANCE_SCORE -ge 70 ]; then
  print_warning "⚠️ Good Performance Score: $PERFORMANCE_SCORE%"
  print_info "Demo ready with some performance considerations"
else
  print_error "❌ Performance Score Below Threshold: $PERFORMANCE_SCORE%"
  print_info "Performance optimization required before enterprise demo"
fi

# Service availability summary
print_info "Service Availability:"
[ "$API_AVAILABLE" = true ] && print_info "  ✅ API Gateway (4000)" || print_info "  ❌ API Gateway (4000)"
[ "$MCP_AVAILABLE" = true ] && print_info "  ✅ MCP Server (3001)" || print_info "  ❌ MCP Server (3001)"
[ "$WEB_AVAILABLE" = true ] && print_info "  ✅ Web Dashboard (4200)" || print_info "  ❌ Web Dashboard (4200)"

# Performance recommendations
if [ $SLOW_TESTS -gt 0 ] || [ $FAILED_TESTS -gt 0 ]; then
  print_header "Performance Recommendations"
  
  if [ $SLOW_TESTS -gt 0 ]; then
    print_info "• $SLOW_TESTS endpoints exceeded response time thresholds"
    print_info "• Consider optimizing database queries and caching"
  fi
  
  if [ $FAILED_TESTS -gt 0 ]; then
    print_info "• $FAILED_TESTS endpoints failed to respond"
    print_info "• Check service logs and error handling"
  fi
  
  print_info "• Monitor memory usage: $MEMORY_USAGE"
  print_info "• Monitor CPU load: $CPU_LOAD"
fi

# Cleanup test files
rm -f reports/test-upload.bin reports/test-large-upload.bin

# Exit with appropriate code
if [ $PERFORMANCE_ERRORS -eq 0 ] && [ $PERFORMANCE_SCORE -ge 70 ]; then
  exit 0
else
  exit 1
fi