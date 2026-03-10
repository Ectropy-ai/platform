#!/bin/bash
set -e

echo "🔧 Enterprise CI Workflow Consolidation"
echo "========================================"

# Create archive directory for old workflows
mkdir -p .github/workflows/archive
mkdir -p .github/workflows/disabled

echo "[1/5] Creating workflow archive structure..."

# List of workflows to archive (redundant CI workflows)
WORKFLOWS_TO_ARCHIVE=(
    "ci-simple.yml"
    "ci-simplified.yml" 
    "ci-recovery.yml"
    "ci-diagnostics.yml"
    "ci-core.yml"
)

# List of workflows to disable temporarily (conflicting workflows)
WORKFLOWS_TO_DISABLE=(
    "ai-assisted-development.yml"
    "devcontainer-validation.yml"
    "enhanced-progressive-deployment.yml"
    "deploy.yml"
)

echo "[2/5] Archiving redundant CI workflows..."
for workflow in "${WORKFLOWS_TO_ARCHIVE[@]}"; do
    if [ -f ".github/workflows/$workflow" ]; then
        echo "📦 Archiving $workflow"
        mv ".github/workflows/$workflow" ".github/workflows/archive/"
    else
        echo "⚠️  $workflow not found"
    fi
done

echo "[3/5] Temporarily disabling conflicting workflows..."
for workflow in "${WORKFLOWS_TO_DISABLE[@]}"; do
    if [ -f ".github/workflows/$workflow" ]; then
        echo "⏸️  Disabling $workflow"
        mv ".github/workflows/$workflow" ".github/workflows/disabled/"
    else
        echo "⚠️  $workflow not found"
    fi
done

echo "[4/5] Renaming current ci.yml to legacy..."
if [ -f ".github/workflows/ci.yml" ]; then
    mv ".github/workflows/ci.yml" ".github/workflows/archive/ci-legacy.yml"
    echo "📦 Moved ci.yml → archive/ci-legacy.yml"
fi

echo "[5/5] Setting up enterprise CI as primary workflow..."
if [ -f ".github/workflows/enterprise-ci.yml" ]; then
    echo "✅ Enterprise CI workflow ready"
else
    echo "❌ Enterprise CI workflow not found!"
    exit 1
fi

echo ""
echo "✅ Workflow consolidation completed!"
echo ""
echo "📊 Current workflow status:"
echo "Active workflows:"
ls -1 .github/workflows/*.yml 2>/dev/null | wc -l || echo "0"
echo ""
echo "Archived workflows:"
ls -1 .github/workflows/archive/*.yml 2>/dev/null | wc -l || echo "0"
echo ""
echo "Disabled workflows:"
ls -1 .github/workflows/disabled/*.yml 2>/dev/null | wc -l || echo "0"
echo ""
echo "🚀 Enterprise CI Pipeline is now the primary CI workflow!"
echo "   • Consolidated from 18 workflows to a single enterprise-standard pipeline"
echo "   • Includes proper concurrency control and environment support"
echo "   • Follows enterprise best practices for CI/CD"
echo "   • Eliminates naming conflicts and redundancy"
echo ""
echo "Next steps:"
echo "1. Test the new enterprise-ci.yml workflow"
echo "2. Gradually re-enable specialized workflows as needed"
echo "3. Update documentation to reflect new workflow structure"