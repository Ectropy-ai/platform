#!/bin/bash
set -e

# Enterprise Pattern Detection and Remediation Script
# Implements comprehensive codebase analysis as mandated by enterprise standards

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Statistics tracking
TOTAL_ISSUES=0
SECURITY_ISSUES=0
PERFORMANCE_ISSUES=0
CONSISTENCY_ISSUES=0
TECH_DEBT_ISSUES=0

# Logging functions
log_info() {
    echo -e "${BLUE}🔍 $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_security() {
    echo -e "${RED}🔒 SECURITY: $1${NC}"
    SECURITY_ISSUES=$((SECURITY_ISSUES + 1))
    TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
}

log_performance() {
    echo -e "${CYAN}⚡ PERFORMANCE: $1${NC}"
    PERFORMANCE_ISSUES=$((PERFORMANCE_ISSUES + 1))
    TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
}

log_consistency() {
    echo -e "${YELLOW}📐 CONSISTENCY: $1${NC}"
    CONSISTENCY_ISSUES=$((CONSISTENCY_ISSUES + 1))
    TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
}

log_tech_debt() {
    echo -e "${YELLOW}🚧 TECH DEBT: $1${NC}"
    TECH_DEBT_ISSUES=$((TECH_DEBT_ISSUES + 1))
    TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
}

echo "🏗️ Enterprise Pattern Audit - Comprehensive Codebase Analysis"
echo "============================================================="
echo ""

# Create reports directory
mkdir -p reports/pattern-audit
REPORT_FILE="reports/pattern-audit/enterprise-audit-$(date +%Y%m%d-%H%M%S).md"

# Initialize report
cat > "$REPORT_FILE" << 'EOF'
# Enterprise Pattern Audit Report

Generated: $(date)

## Executive Summary
This report identifies patterns requiring remediation to meet enterprise standards.

## Findings by Category

EOF

log_info "1. Security Pattern Analysis"
echo "### Security Issues" >> "$REPORT_FILE"

# 1. SECURITY PATTERNS
echo "Scanning for security anti-patterns..."

# Check for eval usage
eval_count=$(grep -r "eval\|Function\|setTimeout.*string" --include="*.ts" --include="*.js" src/ apps/ libs/ 2>/dev/null | grep -v node_modules | wc -l)
if [ $eval_count -gt 0 ]; then
    log_security "Found $eval_count potential code injection vulnerabilities (eval, Function constructor, setTimeout with string)"
    echo "- **Code Injection Risk**: $eval_count instances of eval/Function/setTimeout with string" >> "$REPORT_FILE"
    grep -rn "eval\|Function\|setTimeout.*string" --include="*.ts" --include="*.js" src/ apps/ libs/ 2>/dev/null | head -5 >> "$REPORT_FILE"
fi

# Check for innerHTML usage
innerhtml_count=$(grep -r "innerHTML\|outerHTML" --include="*.ts" --include="*.tsx" src/ apps/ libs/ 2>/dev/null | grep -v node_modules | wc -l)
if [ $innerhtml_count -gt 0 ]; then
    log_security "Found $innerhtml_count potential XSS vulnerabilities (innerHTML/outerHTML)"
    echo "- **XSS Risk**: $innerhtml_count instances of innerHTML/outerHTML" >> "$REPORT_FILE"
fi

# Check for hardcoded secrets
secret_count=$(grep -r "password.*=.*['\"].\|secret.*=.*['\"].\|token.*=.*['\"].\|key.*=.*['\"]." --include="*.ts" --include="*.js" src/ apps/ libs/ 2>/dev/null | grep -v node_modules | grep -v "process\.env\|process\.env\." | wc -l)
if [ $secret_count -gt 0 ]; then
    log_security "Found $secret_count potential hardcoded secrets"
    echo "- **Hardcoded Secrets**: $secret_count potential instances" >> "$REPORT_FILE"
fi

# Check for unsafe environment variable usage
unsafe_env_count=$(grep -r "process\.env\." --include="*.ts" --include="*.js" src/ apps/ libs/ 2>/dev/null | grep -v "|| ''\|?? ''" | wc -l)
if [ $unsafe_env_count -gt 0 ]; then
    log_security "Found $unsafe_env_count unsafe environment variable usages (no fallback)"
    echo "- **Unsafe Environment Variables**: $unsafe_env_count instances without fallbacks" >> "$REPORT_FILE"
fi

log_info "2. Performance Anti-Pattern Analysis"
echo "" >> "$REPORT_FILE"
echo "### Performance Issues" >> "$REPORT_FILE"

# 2. PERFORMANCE PATTERNS
echo "Scanning for performance anti-patterns..."

# Check for synchronous operations
sync_count=$(grep -r "sync\(" --include="*.ts" --include="*.js" src/ apps/ libs/ 2>/dev/null | grep -v node_modules | wc -l)
if [ $sync_count -gt 0 ]; then
    log_performance "Found $sync_count synchronous operations that should be async"
    echo "- **Synchronous Operations**: $sync_count blocking operations" >> "$REPORT_FILE"
fi

# Check for inefficient async loops
async_loop_count=$(grep -r "\.forEach.*await\|\.map.*await" --include="*.ts" --include="*.js" src/ apps/ libs/ 2>/dev/null | grep -v node_modules | wc -l)
if [ $async_loop_count -gt 0 ]; then
    log_performance "Found $async_loop_count inefficient async loops (should use Promise.all)"
    echo "- **Inefficient Async Loops**: $async_loop_count instances" >> "$REPORT_FILE"
fi

# Check for repeated Date instantiation
date_count=$(grep -r "new Date\(\)" --include="*.ts" --include="*.js" src/ apps/ libs/ 2>/dev/null | grep -v node_modules | wc -l)
if [ $date_count -gt 0 ]; then
    log_performance "Found $date_count repeated Date() instantiations (consider caching)"
    echo "- **Repeated Date Instantiation**: $date_count instances" >> "$REPORT_FILE"
fi

# Check for memory leaks (event listeners without cleanup)
event_leak_count=$(grep -r "addEventListener\|on\(" --include="*.ts" --include="*.js" src/ apps/ libs/ 2>/dev/null | grep -v "removeEventListener\|off(" | grep -v node_modules | wc -l)
if [ $event_leak_count -gt 0 ]; then
    log_performance "Found $event_leak_count potential memory leaks (event listeners without cleanup)"
    echo "- **Potential Memory Leaks**: $event_leak_count event listeners without cleanup" >> "$REPORT_FILE"
fi

log_info "3. Code Consistency Analysis"
echo "" >> "$REPORT_FILE"
echo "### Consistency Issues" >> "$REPORT_FILE"

# 3. CONSISTENCY PATTERNS
echo "Scanning for code consistency issues..."

# Check for direct console usage
console_count=$(grep -r "console\." --include="*.ts" --include="*.js" src/ apps/ libs/ 2>/dev/null | grep -v node_modules | grep -v "logger\|console.error.*fallback" | wc -l)
if [ $console_count -gt 0 ]; then
    log_consistency "Found $console_count direct console usages (should use logger)"
    echo "- **Direct Console Usage**: $console_count instances (should use structured logging)" >> "$REPORT_FILE"
fi

# Check for type safety issues
any_count=$(grep -r ": any\|as any" --include="*.ts" src/ apps/ libs/ 2>/dev/null | grep -v node_modules | wc -l)
if [ $any_count -gt 0 ]; then
    log_consistency "Found $any_count type safety violations (any type usage)"
    echo "- **Type Safety Violations**: $any_count 'any' type usages" >> "$REPORT_FILE"
fi

# Check for inconsistent error handling
error_patterns=$(grep -rn "catch.*console\|catch.*return\|catch.*throw.*err" --include="*.ts" --include="*.js" src/ apps/ libs/ 2>/dev/null | grep -v node_modules | wc -l)
if [ $error_patterns -gt 0 ]; then
    log_consistency "Found $error_patterns inconsistent error handling patterns"
    echo "- **Inconsistent Error Handling**: $error_patterns different patterns" >> "$REPORT_FILE"
fi

# Check for mixed async patterns
mixed_async=$(grep -rn "\.then\(" --include="*.ts" --include="*.js" src/ apps/ libs/ 2>/dev/null | grep -v node_modules | wc -l)
async_await=$(grep -rn "async.*await" --include="*.ts" --include="*.js" src/ apps/ libs/ 2>/dev/null | grep -v node_modules | wc -l)
if [ $mixed_async -gt 0 ] && [ $async_await -gt 0 ]; then
    log_consistency "Mixed async patterns: $mixed_async .then() and $async_await async/await"
    echo "- **Mixed Async Patterns**: $mixed_async .then() mixed with $async_await async/await" >> "$REPORT_FILE"
fi

log_info "4. Technical Debt Analysis"
echo "" >> "$REPORT_FILE"
echo "### Technical Debt" >> "$REPORT_FILE"

# 4. TECHNICAL DEBT PATTERNS
echo "Scanning for technical debt markers..."

# Check for TODO/FIXME/HACK comments
todo_count=$(grep -r "TODO\|FIXME\|HACK" --include="*.ts" --include="*.js" src/ apps/ libs/ 2>/dev/null | grep -v node_modules | wc -l)
if [ $todo_count -gt 0 ]; then
    log_tech_debt "Found $todo_count technical debt markers (TODO/FIXME/HACK)"
    echo "- **Technical Debt Markers**: $todo_count TODO/FIXME/HACK comments" >> "$REPORT_FILE"
    echo "  Sample items:" >> "$REPORT_FILE"
    grep -rn "TODO\|FIXME\|HACK" --include="*.ts" --include="*.js" src/ apps/ libs/ 2>/dev/null | head -3 >> "$REPORT_FILE"
fi

# Check for disabled linting rules
eslint_disable_count=$(grep -r "eslint-disable" --include="*.ts" --include="*.js" src/ apps/ libs/ 2>/dev/null | grep -v node_modules | wc -l)
if [ $eslint_disable_count -gt 0 ]; then
    log_tech_debt "Found $eslint_disable_count ESLint rule disables (code smell)"
    echo "- **ESLint Rule Disables**: $eslint_disable_count instances" >> "$REPORT_FILE"
fi

# Check for duplicate code patterns
echo "Checking for duplicate utility functions..."
util_functions=$(grep -r "function.*util\|const.*util\|export.*util" --include="*.ts" --include="*.js" src/ apps/ libs/ 2>/dev/null | grep -v node_modules | wc -l)
if [ $util_functions -gt 10 ]; then
    log_tech_debt "Found $util_functions utility functions (potential duplication)"
    echo "- **Potential Duplicate Utilities**: $util_functions utility functions across codebase" >> "$REPORT_FILE"
fi

# Check for empty catch blocks
empty_catch=$(grep -r "catch.*{.*}" --include="*.ts" --include="*.js" src/ apps/ libs/ 2>/dev/null | grep -v node_modules | wc -l)
if [ $empty_catch -gt 0 ]; then
    log_tech_debt "Found $empty_catch empty catch blocks"
    echo "- **Empty Catch Blocks**: $empty_catch instances (should log or handle)" >> "$REPORT_FILE"
fi

log_info "5. Dependency and Import Analysis"
echo "" >> "$REPORT_FILE"
echo "### Import and Dependency Issues" >> "$REPORT_FILE"

# 5. IMPORT/DEPENDENCY PATTERNS
echo "Analyzing import and dependency patterns..."

# Check for wildcard imports
wildcard_imports=$(grep -r "import \*" --include="*.ts" --include="*.js" src/ apps/ libs/ 2>/dev/null | grep -v node_modules | wc -l)
if [ $wildcard_imports -gt 0 ]; then
    log_consistency "Found $wildcard_imports wildcard imports (should be specific)"
    echo "- **Wildcard Imports**: $wildcard_imports instances (prefer named imports)" >> "$REPORT_FILE"
fi

# Check for unused imports (basic pattern)
unused_imports=$(grep -r "import.*from.*'.*'" --include="*.ts" --include="*.js" src/ apps/ libs/ 2>/dev/null | grep -v node_modules | head -20 | while read line; do
    imported=$(echo "$line" | grep -o "import {[^}]*}" | head -1)
    if [ -n "$imported" ]; then
        echo "$imported" | grep -o "[A-Za-z][A-Za-z0-9]*" | while read item; do
            if ! grep -q "$item" "$(echo "$line" | cut -d: -f1)" 2>/dev/null; then
                echo "Potentially unused: $item in $(echo "$line" | cut -d: -f1)"
            fi
        done
    fi
done | wc -l)

# Final Statistics and Recommendations
echo "" >> "$REPORT_FILE"
echo "## Summary Statistics" >> "$REPORT_FILE"
echo "- **Total Issues Found**: $TOTAL_ISSUES" >> "$REPORT_FILE"
echo "- **Security Issues**: $SECURITY_ISSUES" >> "$REPORT_FILE"
echo "- **Performance Issues**: $PERFORMANCE_ISSUES" >> "$REPORT_FILE"
echo "- **Consistency Issues**: $CONSISTENCY_ISSUES" >> "$REPORT_FILE"
echo "- **Technical Debt**: $TECH_DEBT_ISSUES" >> "$REPORT_FILE"

echo ""
echo "============================================================="
echo "📊 ENTERPRISE AUDIT SUMMARY"
echo "============================================================="
log_info "Total Issues Found: $TOTAL_ISSUES"
echo "  🔒 Security Issues: $SECURITY_ISSUES"
echo "  ⚡ Performance Issues: $PERFORMANCE_ISSUES"
echo "  📐 Consistency Issues: $CONSISTENCY_ISSUES"
echo "  🚧 Technical Debt: $TECH_DEBT_ISSUES"
echo ""

if [ $TOTAL_ISSUES -gt 0 ]; then
    log_warning "Enterprise standards compliance: FAILED"
    log_warning "Requires systematic remediation of $TOTAL_ISSUES patterns"
    echo ""
    echo "📋 NEXT STEPS:"
    echo "1. Address all security issues immediately (Priority 1)"
    echo "2. Implement performance optimizations (Priority 2)"
    echo "3. Standardize code consistency patterns (Priority 3)"
    echo "4. Create technical debt remediation plan (Priority 4)"
    echo ""
    echo "📄 Detailed report generated: $REPORT_FILE"
    exit 1
else
    log_success "Enterprise standards compliance: PASSED"
    log_success "No critical patterns detected"
    echo "📄 Clean audit report generated: $REPORT_FILE"
    exit 0
fi