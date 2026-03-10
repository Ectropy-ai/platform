#!/bin/bash
set -e

echo "🎯 ECTROPY FINAL VALIDATION"
echo "=========================="

# 1. Type Safety
echo "1️⃣ TypeScript Compilation..."
pnpm nx run-many --target=type-check --all
echo "✅ TypeScript: PASS"

# 2. Security
echo "2️⃣ Security Audit..."
pnpm audit --audit-level=moderate
echo "✅ Security: PASS"

# 3. Build
echo "3️⃣ Production Build..."
NODE_ENV=production pnpm nx run-many --target=build --all
echo "✅ Build: PASS"

# 4. Integration
echo "4️⃣ Integration Tests..."
./scripts/test-mcp-integration.sh
echo "✅ Integration: PASS"

# 5. AECO
echo "5️⃣ AECO Validation..."
./scripts/test-aeco-functionality.sh
echo "✅ AECO: PASS"

# 6. Performance
echo "6️⃣ Load Testing..."
./scripts/load-test.sh
echo "✅ Performance: PASS"

# 7. Metrics
echo "7️⃣ Metrics Check..."
curl -s http://localhost:3001/metrics | grep "http_request_duration"
echo "✅ Metrics: PASS"

echo ""
echo "🎉 ALL VALIDATION CHECKS PASSED!"
echo "🚀 Platform ready for production deployment"
