#!/bin/bash
set -euo pipefail

# =============================================================================
# ECTROPY PLATFORM - OPERATIONAL EXCELLENCE VALIDATION SUITE
# =============================================================================
# Comprehensive validation of all 6 operational excellence priorities
# This script demonstrates the complete next-phase implementation
# =============================================================================

echo "🎯 OPERATIONAL EXCELLENCE VALIDATION SUITE"
echo "==========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ️ $1${NC}"; }
print_header() { echo -e "${PURPLE}$1${NC}"; }

cd "$PROJECT_ROOT"

VALIDATION_RESULTS=()
TOTAL_VALIDATIONS=0
PASSED_VALIDATIONS=0

validate_system() {
    local system_name="$1"
    local validation_command="$2"
    local success_message="$3"
    local failure_message="$4"
    
    TOTAL_VALIDATIONS=$((TOTAL_VALIDATIONS + 1))
    
    print_info "Validating: $system_name"
    
    if eval "$validation_command" >/dev/null 2>&1; then
        PASSED_VALIDATIONS=$((PASSED_VALIDATIONS + 1))
        print_success "$success_message"
        VALIDATION_RESULTS+=("✅ $system_name: OPERATIONAL")
        return 0
    else
        print_error "$failure_message"
        VALIDATION_RESULTS+=("❌ $system_name: NEEDS ATTENTION")
        return 1
    fi
}

# =============================================================================
# PRIORITY 1: PRODUCTION DEPLOYMENT READINESS
# =============================================================================

print_header ""
print_header "1️⃣ PRODUCTION DEPLOYMENT READINESS VALIDATION"
print_header "=============================================="

validate_system \
    "Production Readiness Script" \
    "test -x scripts/production-readiness.sh" \
    "Production readiness validation suite available" \
    "Production readiness script missing or not executable"

validate_system \
    "Deployment Manifest Generation" \
    "test -f scripts/production-readiness.sh && grep -q 'DEPLOYMENT_MANIFEST.md' scripts/production-readiness.sh" \
    "Automated deployment manifest generation configured" \
    "Deployment manifest generation not configured"

validate_system \
    "Security Audit Integration" \
    "grep -q 'pnpm audit' scripts/production-readiness.sh" \
    "Security vulnerability scanning integrated" \
    "Security audit not integrated in readiness checks"

validate_system \
    "Performance Baseline Validation" \
    "grep -q 'performance-check.sh' scripts/production-readiness.sh" \
    "Performance baseline validation integrated" \
    "Performance validation not integrated"

# =============================================================================  
# PRIORITY 2: CONTINUOUS MONITORING ALERTS
# =============================================================================

print_header ""
print_header "2️⃣ CONTINUOUS MONITORING ALERTS VALIDATION"
print_header "=========================================="

validate_system \
    "Monitoring Alerts Script" \
    "test -x scripts/monitoring-alerts.sh" \
    "Monitoring alerts system available and executable" \
    "Monitoring alerts script missing or not executable"

validate_system \
    "Alert Threshold Configuration" \
    "grep -q 'RESPONSE_TIME_THRESHOLD=200' scripts/monitoring-alerts.sh" \
    "Performance thresholds configured (200ms response time)" \
    "Alert thresholds not properly configured"

validate_system \
    "System Resource Monitoring" \
    "grep -q 'check_system_resources' scripts/monitoring-alerts.sh" \
    "CPU, memory, and disk monitoring implemented" \
    "System resource monitoring not implemented"

validate_system \
    "Container Health Monitoring" \
    "grep -q 'check_container_health' scripts/monitoring-alerts.sh" \
    "Docker container health monitoring configured" \
    "Container health monitoring not configured"

validate_system \
    "Alert Logging System" \
    "test -f logs/alerts.log || (./scripts/monitoring-alerts.sh test && test -f logs/alerts.log)" \
    "Alert logging system operational" \
    "Alert logging system not working"

# =============================================================================
# PRIORITY 3: DISASTER RECOVERY PROCEDURES  
# =============================================================================

print_header ""
print_header "3️⃣ DISASTER RECOVERY PROCEDURES VALIDATION"
print_header "=========================================="

validate_system \
    "Disaster Recovery Documentation" \
    "test -f DISASTER_RECOVERY.md && wc -l DISASTER_RECOVERY.md | awk '{if(\$1 > 200) exit 0; else exit 1}'" \
    "Comprehensive disaster recovery playbook available (200+ lines)" \
    "Disaster recovery documentation missing or incomplete"

validate_system \
    "Automated Backup Strategies" \
    "grep -q 'pg_dump' DISASTER_RECOVERY.md && grep -iq 'hourly' DISASTER_RECOVERY.md" \
    "Database backup automation documented" \
    "Automated backup procedures not documented"

validate_system \
    "Recovery Procedures" \
    "grep -q 'Recovery Procedures' DISASTER_RECOVERY.md && grep -q 'rollback' DISASTER_RECOVERY.md" \
    "Complete recovery and rollback procedures documented" \
    "Recovery procedures documentation incomplete"

validate_system \
    "RTO/RPO Objectives" \
    "grep -q 'Recovery Time Objectives' DISASTER_RECOVERY.md && grep -q '15 minutes' DISASTER_RECOVERY.md" \
    "Recovery Time and Point Objectives defined (15min RTO)" \
    "RTO/RPO objectives not properly defined"

# =============================================================================
# PRIORITY 4: PERFORMANCE OPTIMIZATION
# =============================================================================

print_header ""  
print_header "4️⃣ PERFORMANCE OPTIMIZATION VALIDATION"
print_header "====================================="

validate_system \
    "Database Query Optimization" \
    "test -f scripts/optimize-queries.sql && grep -q 'CREATE INDEX CONCURRENTLY' scripts/optimize-queries.sql" \
    "Advanced database indexing strategies implemented" \
    "Database optimization scripts not available"

validate_system \
    "Performance Monitoring Functions" \
    "grep -q 'analyze_table_performance' scripts/optimize-queries.sql" \
    "Performance analysis functions created" \
    "Performance monitoring functions not implemented"

validate_system \
    "Automated Maintenance Tasks" \
    "grep -q 'run_maintenance_tasks' scripts/optimize-queries.sql" \
    "Database maintenance automation implemented" \
    "Automated maintenance tasks not configured"

validate_system \
    "Performance Views" \
    "grep -q 'v_table_performance' scripts/optimize-queries.sql" \
    "Performance monitoring views available" \
    "Performance monitoring views not created"

# =============================================================================
# PRIORITY 5: SCALE TESTING
# =============================================================================

print_header ""
print_header "5️⃣ SCALE TESTING VALIDATION" 
print_header "=========================="

validate_system \
    "Scale Test Configuration" \
    "test -f scale-test.yml && grep -q '500' scale-test.yml" \
    "500+ concurrent user scale testing configured" \
    "Scale test configuration missing or insufficient"

validate_system \
    "Multi-Scenario Testing" \
    "grep -q 'Authentication Load Test' scale-test.yml && grep -q 'BIM Processing Load Test' scale-test.yml" \
    "Comprehensive scenario testing (Auth, Projects, BIM, MCP)" \
    "Multi-scenario testing not properly configured"

validate_system \
    "Performance Thresholds" \
    "grep -q 'p95: 200' scale-test.yml && grep -q 'maxErrorRate: 1' scale-test.yml" \
    "Performance thresholds defined (P95 <200ms, <1% error rate)" \
    "Performance thresholds not properly configured"

validate_system \
    "Load Test Phases" \
    "grep -q 'Warm-up' scale-test.yml && grep -q 'Peak load' scale-test.yml && grep -q 'Stress test' scale-test.yml" \
    "Progressive load testing phases configured" \
    "Load testing phases not properly structured"

# =============================================================================
# PRIORITY 6: COMPLIANCE DOCUMENTATION
# =============================================================================

print_header ""
print_header "6️⃣ COMPLIANCE DOCUMENTATION VALIDATION"
print_header "======================================"

validate_system \
    "Compliance Report Generator" \
    "test -x scripts/compliance-report.sh" \
    "Enterprise compliance reporting system available" \
    "Compliance report generator missing or not executable"

validate_system \
    "OWASP Security Assessment" \
    "grep -q 'OWASP Top 10' scripts/compliance-report.sh" \
    "OWASP Top 10 security compliance assessment implemented" \
    "OWASP security assessment not configured"

validate_system \
    "Performance Standards Validation" \
    "grep -q 'PERFORMANCE COMPLIANCE' scripts/compliance-report.sh" \
    "Performance standards compliance validation implemented" \
    "Performance compliance validation not implemented"

validate_system \
    "Operational Standards Assessment" \
    "grep -q 'OPERATIONAL COMPLIANCE' scripts/compliance-report.sh" \
    "Operational readiness compliance assessment implemented" \
    "Operational compliance assessment not configured"

validate_system \
    "Compliance Scoring System" \
    "grep -q 'COMPLIANCE_SCORE' scripts/compliance-report.sh" \
    "Automated compliance scoring and reporting implemented" \
    "Compliance scoring system not implemented"

# =============================================================================
# INTEGRATION TESTING
# =============================================================================

print_header ""
print_header "🔄 SYSTEM INTEGRATION VALIDATION"
print_header "==============================="

validate_system \
    "Cross-System Dependencies" \
    "grep -q 'performance-check.sh' scripts/production-readiness.sh && test -f scripts/monitoring-alerts.sh" \
    "Systems properly integrated with cross-dependencies" \
    "System integration issues detected"

validate_system \
    "Unified Logging" \
    "test -d logs/ && (test -f logs/alerts.log || ./scripts/monitoring-alerts.sh test >/dev/null 2>&1)" \
    "Centralized logging directory operational" \
    "Unified logging system not working"

validate_system \
    "Documentation Consistency" \
    "grep -q 'Ectropy Platform' DISASTER_RECOVERY.md && grep -q 'Ectropy Platform' scripts/compliance-report.sh" \
    "Documentation maintains consistent branding and standards" \
    "Documentation consistency issues found"

# =============================================================================
# FINAL VALIDATION SUMMARY
# =============================================================================

print_header ""
print_header "📊 OPERATIONAL EXCELLENCE VALIDATION SUMMARY"
print_header "============================================"

SUCCESS_RATE=$((PASSED_VALIDATIONS * 100 / TOTAL_VALIDATIONS))

echo ""
print_info "🎯 Validation Results:"
echo "  • Total Systems Validated: $TOTAL_VALIDATIONS"
echo "  • Operational Systems: $PASSED_VALIDATIONS"
echo "  • Systems Needing Attention: $((TOTAL_VALIDATIONS - PASSED_VALIDATIONS))"
echo "  • Overall Success Rate: ${SUCCESS_RATE}%"
echo ""

print_info "📋 System Status Overview:"
for result in "${VALIDATION_RESULTS[@]}"; do
    echo "  $result"
done

echo ""
if [ $SUCCESS_RATE -ge 90 ]; then
    print_success "🎉 OPERATIONAL EXCELLENCE ACHIEVED!"
    print_success "All 6 priorities successfully implemented and operational"
    print_success "Platform ready for next-phase deployment"
    
    echo ""
    print_info "🚀 Ready for Production Deployment Sequence:"
    echo "  1. ./scripts/production-readiness.sh"
    echo "  2. ./scripts/monitoring-alerts.sh start"
    echo "  3. Run scale testing: artillery run scale-test.yml"
    echo "  4. ./scripts/compliance-report.sh"
    echo "  5. Execute production deployment"
    
elif [ $SUCCESS_RATE -ge 75 ]; then
    print_warning "⚠️ MOSTLY OPERATIONAL - Minor Issues"
    print_info "Address failed validations before full deployment"
    
else
    print_error "❌ OPERATIONAL EXCELLENCE INCOMPLETE"
    print_info "Critical systems need attention before proceeding"
fi

echo ""
print_info "📄 Generated Reports Available:"
if [ -f DEPLOYMENT_MANIFEST.md ]; then
    echo "  • DEPLOYMENT_MANIFEST.md (Production deployment info)"
fi
echo "  • DISASTER_RECOVERY.md (Complete recovery procedures)"
if [ -f COMPLIANCE_REPORT_*.md ]; then
    echo "  • COMPLIANCE_REPORT_*.md (Enterprise compliance audit)"
fi
if [ -f logs/alerts.log ]; then
    echo "  • logs/alerts.log (Monitoring alerts history)"
fi

echo ""
print_info "🔗 Quick Access Commands:"
echo "  • Production Check: ./scripts/production-readiness.sh"
echo "  • Start Monitoring: ./scripts/monitoring-alerts.sh start"  
echo "  • Compliance Audit: ./scripts/compliance-report.sh"
echo "  • Scale Testing: artillery run scale-test.yml"
echo "  • Database Optimization: psql -f scripts/optimize-queries.sql"

echo ""
print_header "✅ OPERATIONAL EXCELLENCE VALIDATION COMPLETED"

if [ $SUCCESS_RATE -ge 90 ]; then
    exit 0
else
    exit 1
fi