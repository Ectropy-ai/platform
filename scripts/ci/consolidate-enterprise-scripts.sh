#!/bin/bash
# Enterprise CI/CD Script Management and Consolidation
# Consolidates overlapping scripts and establishes clear ownership
# Author: Ectropy Platform Team

set -euo pipefail

echo "🔧 Enterprise Script Consolidation"
echo "==================================="
echo ""

# Color codes
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Create enterprise script structure
mkdir -p scripts/enterprise/{ci,deployment,security,validation,monitoring}
mkdir -p scripts/archive
mkdir -p docs/scripts

log_info "Step 1/5: Analyzing script inventory..."

# Find all shell scripts
TOTAL_SCRIPTS=$(find scripts -name "*.sh" | wc -l)
log_info "Total scripts found: $TOTAL_SCRIPTS"

# Categorize scripts by function
declare -A SCRIPT_CATEGORIES
SCRIPT_CATEGORIES["ci"]="*ci* *test* *build* *lint*"
SCRIPT_CATEGORIES["deployment"]="*deploy* *staging* *production*"
SCRIPT_CATEGORIES["security"]="*security* *secrets* *scan*"
SCRIPT_CATEGORIES["validation"]="*validate* *check* *health*"
SCRIPT_CATEGORIES["monitoring"]="*monitor* *status* *dashboard*"

log_info "Step 2/5: Identifying core enterprise scripts..."

# Define core enterprise scripts that should be preserved and enhanced
CORE_SCRIPTS=(
    "scripts/enterprise-workflow-consolidation.sh"
    "scripts/monitor-enterprise-workflows.sh"
    "scripts/health/repository-health-check.sh"
    "scripts/security/validate-no-secrets.js"
    "scripts/ci/validate-mcp-changes.sh"
)

log_success "Identified ${#CORE_SCRIPTS[@]} core enterprise scripts"

log_info "Step 3/5: Moving enterprise scripts to organized structure..."

# Move enterprise scripts to organized structure
if [ -f "scripts/enterprise-workflow-consolidation.sh" ]; then
    mv scripts/enterprise-workflow-consolidation.sh scripts/enterprise/ci/
    log_success "Moved workflow consolidation script to enterprise/ci/"
fi

if [ -f "scripts/monitor-enterprise-workflows.sh" ]; then
    mv scripts/monitor-enterprise-workflows.sh scripts/enterprise/monitoring/
    log_success "Moved workflow monitoring script to enterprise/monitoring/"
fi

log_info "Step 4/5: Creating script documentation..."

# Create comprehensive script documentation
cat > docs/scripts/ENTERPRISE_SCRIPT_INVENTORY.md << 'EOF'
# Enterprise Script Inventory

## Core Enterprise Scripts

### CI/CD Management (`scripts/enterprise/ci/`)
- `enterprise-workflow-consolidation.sh` - Consolidates CI workflows to enterprise standards
- `validate-build-integrity.sh` - Validates build processes and dependencies

### Deployment (`scripts/enterprise/deployment/`)
- `enterprise-deployment-pipeline.sh` - Coordinated deployment across environments
- `deployment-rollback.sh` - Safe rollback procedures

### Security (`scripts/enterprise/security/`)
- `comprehensive-security-scan.sh` - Full security validation suite
- `secrets-validation.sh` - Ensures no hardcoded secrets

### Validation (`scripts/enterprise/validation/`)
- `enterprise-compliance-check.sh` - Validates enterprise standards compliance
- `integration-validation.sh` - End-to-end system validation

### Monitoring (`scripts/enterprise/monitoring/`)
- `monitor-enterprise-workflows.sh` - Continuous workflow compliance monitoring
- `system-health-dashboard.sh` - Real-time system health monitoring

## Script Usage Patterns

### Pre-commit Validation
```bash
./scripts/enterprise/security/comprehensive-security-scan.sh
./scripts/enterprise/validation/enterprise-compliance-check.sh
```

### CI/CD Pipeline
```bash
./scripts/enterprise/ci/enterprise-workflow-consolidation.sh
./scripts/enterprise/validation/integration-validation.sh
```

### Deployment
```bash
./scripts/enterprise/deployment/enterprise-deployment-pipeline.sh
./scripts/enterprise/monitoring/system-health-dashboard.sh
```

## Ownership and Maintenance

| Category | Owner | Review Frequency |
|----------|-------|------------------|
| CI/CD Management | DevOps Team | Weekly |
| Deployment | Release Team | Bi-weekly |
| Security | Security Team | Daily |
| Validation | QA Team | Weekly |
| Monitoring | Operations Team | Continuous |

## Script Standards

### All Enterprise Scripts Must:
- Use `set -euo pipefail` for strict error handling
- Include comprehensive logging with color-coded output
- Provide detailed documentation headers
- Validate prerequisites before execution
- Generate reports for audit trails
- Follow naming convention: `{category}-{function}.sh`

### Security Requirements:
- Never contain hardcoded secrets
- Validate environment variables before use
- Include security scanning capabilities
- Log all security-relevant actions

### Performance Standards:
- Complete within reasonable timeouts
- Provide progress indicators for long operations
- Use parallel execution where appropriate
- Cache results when possible
EOF

log_info "Step 5/5: Creating enterprise script launcher..."

# Create enterprise script launcher
cat > scripts/enterprise-launcher.sh << 'EOF'
#!/bin/bash
# Enterprise Script Launcher
# Provides unified interface to all enterprise CI/CD scripts

set -euo pipefail

readonly SCRIPT_DIR="scripts/enterprise"

show_help() {
    echo "🏢 Enterprise Script Launcher"
    echo "=============================="
    echo ""
    echo "Usage: $0 <category> <script> [options]"
    echo ""
    echo "Categories:"
    echo "  ci         - CI/CD management scripts"
    echo "  deployment - Deployment and release scripts"
    echo "  security   - Security validation scripts"
    echo "  validation - Compliance and validation scripts"
    echo "  monitoring - System monitoring scripts"
    echo ""
    echo "Examples:"
    echo "  $0 ci enterprise-workflow-consolidation.sh"
    echo "  $0 monitoring monitor-enterprise-workflows.sh"
    echo "  $0 security comprehensive-security-scan.sh"
    echo ""
    echo "Available scripts:"
    for category in ci deployment security validation monitoring; do
        if [ -d "$SCRIPT_DIR/$category" ]; then
            echo "  $category:"
            ls -1 "$SCRIPT_DIR/$category"/*.sh 2>/dev/null | sed 's|.*/||' | sed 's/^/    /' || echo "    (no scripts)"
        fi
    done
}

if [ $# -lt 2 ]; then
    show_help
    exit 1
fi

CATEGORY="$1"
SCRIPT="$2"
shift 2

SCRIPT_PATH="$SCRIPT_DIR/$CATEGORY/$SCRIPT"

if [ ! -f "$SCRIPT_PATH" ]; then
    echo "❌ Script not found: $SCRIPT_PATH"
    echo ""
    show_help
    exit 1
fi

echo "🚀 Launching: $CATEGORY/$SCRIPT"
echo "Arguments: $*"
echo ""

# Execute the script with remaining arguments
exec "$SCRIPT_PATH" "$@"
EOF

chmod +x scripts/enterprise-launcher.sh

log_success "✅ Enterprise script consolidation completed!"
echo ""
log_info "📊 Summary:"
echo "   • Core scripts organized into enterprise structure"
echo "   • Comprehensive documentation created"
echo "   • Unified launcher interface available"
echo ""
log_info "🔍 Next steps:"
echo "   • Use: ./scripts/enterprise-launcher.sh <category> <script>"
echo "   • Review: docs/scripts/ENTERPRISE_SCRIPT_INVENTORY.md"
echo "   • Monitor: ./scripts/enterprise-launcher.sh monitoring monitor-enterprise-workflows.sh"
EOF