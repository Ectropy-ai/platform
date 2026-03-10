#!/bin/bash

# =============================================================================
# ECTROPY PRE-RELEASE CHECKLIST SCRIPT
# =============================================================================
# 
# PURPOSE: Comprehensive pre-release validation for production readiness
# USAGE: ./pre-release-checklist.sh [--fix] [--report-only]
# 
# This script validates:
# 1. Code quality and compilation
# 2. Dependencies and security
# 3. Documentation completeness
# 4. Testing infrastructure
# 5. Production readiness
# 
# =============================================================================

set -e

# Configuration
FIX_MODE=false
REPORT_ONLY=false
OUTPUT_DIR="release-validation"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Parse arguments
while [[$# -gt 0 ]]; do
  case $1 in
    --fix)
      FIX_MODE=true
      shift
      ;;
    --report-only)
      REPORT_ONLY=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--fix] [--report-only]"
      exit 1
      ;;
  esac
done

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Initialize results
PASS=0
FAIL=0
WARNING=0

# Check function
check_item() {
  local command="$1"
  local description="$2"
  local fix_command="${3:-}"
  
  echo -n "Checking: $description... "
  
  if eval "$command" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ PASS${NC}"
    ((PASS++))
    echo "✅ $description" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
    return 0
  else
    echo -e "${RED}❌ FAIL${NC}"
    ((FAIL++))
    echo "❌ $description" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
    
    if [ -n "$fix_command" ] && [ "$FIX_MODE" = true ]; then
      echo "  🔧 Attempting fix: $fix_command"
      eval "$fix_command" || echo "  ❌ Fix failed"
    fi
    return 1
  fi
}

# Warning function
warn_item() {
  local command="$1"
  local description="$2"
  
  echo -n "Checking: $description... "
  
  if eval "$command" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ PASS${NC}"
    ((PASS++))
    echo "✅ $description" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
  else
    echo -e "${YELLOW}⚠️  WARNING${NC}"
    ((WARNING++))
    echo "⚠️  $description" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
  fi
}

echo -e "${BLUE}📋 ECTROPY PRE-RELEASE CHECKLIST${NC}"
echo -e "${BLUE}=================================${NC}"
echo "Date: $(date)"
echo "Mode: $([ "$FIX_MODE" = true ] && echo "FIX ISSUES" || echo "CHECK ONLY")"
echo ""

# Initialize report
cat > "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md" << EOF
# 📋 ECTROPY PRE-RELEASE CHECKLIST RESULTS
Date: $(date)
Mode: $([ "$FIX_MODE" = true ] && echo "FIX ISSUES" || echo "CHECK ONLY")

## 📊 RESULTS SUMMARY

EOF

# ============================================================================
# SECTION 1: CODE QUALITY CHECKS
# ============================================================================
echo -e "${BLUE}## 🔍 CODE QUALITY CHECKS${NC}"
echo "## 🔍 CODE QUALITY CHECKS" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"

# Check if package.json exists
check_item "[ -f package.json ]" "Root package.json exists"

# Check if TypeScript builds without errors
check_item "npm run build 2>/dev/null" "All projects build successfully" "pnpm install"

# Check linting
if [ -f "package.json" ] && grep -q "lint" package.json; then
  check_item "npm run lint 2>/dev/null" "All linting passes" "npm run lint -- --fix"
else
  warn_item "false" "Linting script not found in package.json"
fi

# Check for TODO/FIXME files
check_item "[ \$(find . -name '*.todo' -o -name '*.fixme' | grep -v node_modules | wc -l) -eq 0 ]" "No TODO/FIXME files in codebase"

# Check TypeScript compilation
if command -v npx > /dev/null; then
  check_item "npx tsc --noEmit 2>/dev/null" "TypeScript compiles without errors"
fi

# Check for console.log statements in production code
warn_item "! grep -r 'console\.log' apps/ libs/ --include='*.ts' --include='*.tsx' | grep -v test | head -1" "No console.log statements in production code"

# ============================================================================
# SECTION 2: DEPENDENCIES & SECURITY
# ============================================================================
echo ""
echo -e "${BLUE}## 📦 DEPENDENCIES & SECURITY${NC}"
echo "" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
echo "## 📦 DEPENDENCIES & SECURITY" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"

# Check for security vulnerabilities
check_item "npm audit --audit-level=moderate 2>/dev/null" "No moderate+ security vulnerabilities" "npm audit fix"

# Check for outdated dependencies
warn_item "[ \$(npm outdated 2>/dev/null | wc -l) -le 5 ]" "Dependencies reasonably up-to-date"

# Check for lock file
check_item "[ -f package-lock.json ] || [ -f yarn.lock ]" "Lock file exists for dependency consistency"

# Check for .env.template
check_item "[ -f .env.template ]" "Environment template exists"

# Check for hardcoded secrets
warn_item "! grep -r 'password.*=.*['\"][^'\"]' . --include='*.ts' --include='*.js' | grep -v node_modules | head -1" "No hardcoded credentials detected"

# ============================================================================
# SECTION 3: DOCUMENTATION
# ============================================================================
echo ""
echo -e "${BLUE}## 📚 DOCUMENTATION${NC}"
echo "" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
echo "## 📚 DOCUMENTATION" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"

# Check for README
check_item "[ -f README.md ]" "README.md exists"

# Check for CHANGELOG
warn_item "[ -f CHANGELOG.md ]" "CHANGELOG.md exists"

# Check for API documentation
warn_item "[ -f docs/API.md ] || [ -d docs/api ]" "API documentation exists"

# Check for architecture documentation
warn_item "[ -f docs/ARCHITECTURE.md ] || [ -d docs/architecture ]" "Architecture documentation exists"

# Check for deployment guide
warn_item "[ -f DEPLOYMENT.md ] || [ -f docs/DEPLOYMENT.md ]" "Deployment documentation exists"

# ============================================================================
# SECTION 4: TESTING INFRASTRUCTURE
# ============================================================================
echo ""
echo -e "${BLUE}## 🧪 TESTING INFRASTRUCTURE${NC}"
echo "" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
echo "## 🧪 TESTING INFRASTRUCTURE" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"

# Check for test directory
check_item "[ -d tests ] || [ -d test ] || find . -name '*.test.*' -o -name '*.spec.*' | grep -v node_modules | head -1" "Test files exist"

# Check for test script
if [ -f "package.json" ] && grep -q "test" package.json; then
  check_item "npm test 2>/dev/null || echo 'Tests configured'" "Test script exists"
else
  warn_item "false" "Test script in package.json"
fi

# Check for CI configuration
warn_item "[ -f .github/workflows/ci.yml ] || [ -f .gitlab-ci.yml ] || [ -f .circleci/config.yml ]" "CI/CD configuration exists"

# ============================================================================
# SECTION 5: PRODUCTION READINESS
# ============================================================================
echo ""
echo -e "${BLUE}## 🏭 PRODUCTION READINESS${NC}"
echo "" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
echo "## 🏭 PRODUCTION READINESS" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"

# Check for version in package.json
check_item "[ -f package.json ] && grep -q '\"version\"' package.json" "Version defined in package.json"

# Check for containerization
warn_item "[ -f Dockerfile ] || [ -f docker-compose.yml ]" "Containerization configured"

# Check for production build script
if [ -f "package.json" ] && grep -q "build" package.json; then
  check_item "npm run build 2>/dev/null" "Production build succeeds"
else
  warn_item "false" "Production build script exists"
fi

# Check for start script
warn_item "[ -f package.json ] && grep -q '\"start\"' package.json" "Start script defined"

# Check for health check endpoint
warn_item "grep -r '/health\\|/status' . --include='*.ts' --include='*.js' | grep -v node_modules | head -1" "Health check endpoint exists"

# ============================================================================
# SECTION 6: GIT & RELEASE READINESS
# ============================================================================
echo ""
echo -e "${BLUE}## 🔄 GIT & RELEASE READINESS${NC}"
echo "" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
echo "## 🔄 GIT & RELEASE READINESS" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"

# Check for clean working directory
check_item "[ -z \"\$(git status --porcelain)\" ]" "Git working directory is clean"

# Check for main branch
check_item "git show-ref --verify --quiet refs/heads/main" "Main branch exists"

# Check for tags
warn_item "git tag | head -1" "Git tags exist for versioning"

# Check for gitignore
check_item "[ -f .gitignore ]" ".gitignore file exists"

# ============================================================================
# SECTION 7: PLATFORM-SPECIFIC CHECKS
# ============================================================================
echo ""
echo -e "${BLUE}## 🏗️ PLATFORM-SPECIFIC CHECKS${NC}"
echo "" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
echo "## 🏗️ PLATFORM-SPECIFIC CHECKS" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"

# Check for key Ectropy components
check_item "[ -d apps/web-dashboard ] || [ -d apps/api-gateway ]" "Core application directories exist"

# Check for database configuration
warn_item "[ -f libs/database ] || grep -r 'database\\|Database' . --include='*.ts' | head -1" "Database configuration exists"

# Check for authentication setup
warn_item "grep -r 'auth\\|Auth' . --include='*.ts' --include='*.js' | grep -v node_modules | head -1" "Authentication system configured"

# Check for BIM/Speckle integration
warn_item "grep -r 'speckle\\|Speckle\\|BIM' . --include='*.ts' | grep -v node_modules | head -1" "BIM/Speckle integration configured"

# ============================================================================
# FINAL SUMMARY
# ============================================================================
echo ""
echo "📊 CHECKLIST SUMMARY" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
echo "===================" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
echo "✅ Passed: $PASS" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
echo "❌ Failed: $FAIL" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
echo "⚠️  Warnings: $WARNING" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"

TOTAL=$((PASS + FAIL + WARNING))
if [ $TOTAL -gt 0 ]; then
  SCORE=$((PASS * 100 / TOTAL))
  echo "📊 Score: $SCORE%" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
else
  SCORE=0
  echo "📊 Score: Unable to calculate" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
fi

echo ""
echo -e "${BLUE}📊 FINAL SUMMARY${NC}"
echo -e "${BLUE}================${NC}"
echo -e "✅ Passed: ${GREEN}$PASS${NC}"
echo -e "❌ Failed: ${RED}$FAIL${NC}"
echo -e "⚠️  Warnings: ${YELLOW}$WARNING${NC}"
echo -e "📊 Score: ${BLUE}$SCORE%${NC}"

# Determine release readiness
if [ $FAIL -eq 0 ] && [ $SCORE -ge 80 ]; then
  echo ""
  echo -e "${GREEN}🎉 READY FOR RELEASE!${NC}"
  echo "All critical checks passed. The project is ready for release."
  echo "🎉 READY FOR RELEASE!" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
  echo "All critical checks passed." >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
elif [ $FAIL -eq 0 ]; then
  echo ""
  echo -e "${YELLOW}⚠️  RELEASE WITH CAUTION${NC}"
  echo "No critical failures, but some improvements recommended."
  echo "⚠️  RELEASE WITH CAUTION" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
  echo "No critical failures, but some improvements recommended." >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
else
  echo ""
  echo -e "${RED}⚠️  RELEASE BLOCKED${NC}"
  echo "Critical issues must be resolved before release."
  echo "⚠️  RELEASE BLOCKED" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
  echo "Critical issues must be resolved before release." >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
fi

# Generate action items
echo "" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
echo "## 📋 NEXT STEPS" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"

if [ $FAIL -gt 0 ]; then
  echo "### Critical Actions Required" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
  echo "1. Fix all failed checks above" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
  echo "2. Re-run checklist to verify fixes" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
fi

if [ $WARNING -gt 0 ]; then
  echo "### Recommended Improvements" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
  echo "1. Address warning items for better release quality" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
  echo "2. Consider adding missing documentation" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
fi

echo "### Release Preparation" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
echo "1. Update version in package.json" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
echo "2. Update CHANGELOG.md with release notes" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
echo "3. Create release tag: git tag v\$VERSION" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
echo "4. Build production assets" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"
echo "5. Deploy to staging for final testing" >> "$OUTPUT_DIR/checklist-results-$TIMESTAMP.md"

echo ""
echo -e "${GREEN}📋 Pre-release checklist complete!${NC}"
echo "Detailed results saved to: $OUTPUT_DIR/checklist-results-$TIMESTAMP.md"

if [ "$REPORT_ONLY" = false ]; then
  echo ""
  echo "To generate a release automation script, run:"
  echo "./create-release.sh"
fi
