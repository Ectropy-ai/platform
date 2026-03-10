#!/bin/bash
# Comprehensive security scanning for Ectropy Platform
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORTS_DIR="$PROJECT_ROOT/reports/security"

echo "🔒 Starting comprehensive security scan..."

# 1. Secrets scanning with GitLeaks
echo "📋 Scanning for secrets..."
if command -v gitleaks >/dev/null 2>&1; then
    gitleaks detect --config .gitleaks.toml --report-format json --report-path "$REPORTS_DIR/secrets-scan.json" || true
    echo "✅ Secrets scan completed"
else
    echo "⚠️ GitLeaks not installed, skipping secrets scan"
fi

# 2. Dependency vulnerability scanning
echo "📦 Scanning dependencies..."
pnpm audit --json > "$REPORTS_DIR/npm-audit.json" 2>/dev/null || true
echo "✅ Dependency scan completed"

# 3. Container security scanning (if Docker available)
echo "🐳 Scanning container images..."
if command -v trivy >/dev/null 2>&1 && command -v docker >/dev/null 2>&1; then
    # Scan the production Dockerfile
    trivy config --config security/configs/trivy.yaml Dockerfile.enterprise || true
    echo "✅ Container scan completed"
else
    echo "⚠️ Trivy or Docker not available, skipping container scan"
fi

# 4. Static code analysis
echo "🔍 Running static code analysis..."
if command -v eslint >/dev/null 2>&1; then
    npx eslint . --ext .ts,.tsx,.js,.jsx --format json --output-file "$REPORTS_DIR/eslint-security.json" || true
    echo "✅ Static analysis completed"
fi

# 5. Generate summary report
echo "📊 Generating security summary..."
cat > "$REPORTS_DIR/security-summary.md" << REPORT
# Security Scan Summary - $(date)

## Scan Results
- **Secrets Scan**: $([ -f "$REPORTS_DIR/secrets-scan.json" ] && echo "✅ Completed" || echo "❌ Failed")
- **Dependency Scan**: $([ -f "$REPORTS_DIR/npm-audit.json" ] && echo "✅ Completed" || echo "❌ Failed")
- **Container Scan**: $([ -f "$REPORTS_DIR/trivy-report.json" ] && echo "✅ Completed" || echo "❌ Failed")
- **Static Analysis**: $([ -f "$REPORTS_DIR/eslint-security.json" ] && echo "✅ Completed" || echo "❌ Failed")

## Next Steps
1. Review detailed reports in reports/security/
2. Address any critical or high-severity findings
3. Update security documentation as needed
4. Schedule follow-up scans

Generated: $(date)
REPORT

echo "🎉 Security scan completed! Check reports/security/ for detailed results."
