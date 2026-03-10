#!/bin/bash
echo "📊 ESM Migration Dashboard"
echo "=========================="

# Count files safely
CJS_FILES=$(find . -type f \( -name "*.js" -o -name "*.ts" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/dist/*" 2>/dev/null)

CJS_COUNT=$(echo "$CJS_FILES" | xargs grep -l "require\|module\.exports" 2>/dev/null | wc -l)
ESM_COUNT=$(echo "$CJS_FILES" | xargs grep -l "^import\|^export" 2>/dev/null | wc -l)

TOTAL=$((CJS_COUNT + ESM_COUNT))
if [ $TOTAL -gt 0 ]; then
  PROGRESS=$((ESM_COUNT * 100 / TOTAL))
else
  PROGRESS=100
fi

echo "✅ ESM Modules: $ESM_COUNT"
echo "❌ CommonJS Files: $CJS_COUNT"
echo "📈 Progress: $PROGRESS%"

if [ $CJS_COUNT -gt 0 ]; then
  echo -e "\n🔧 Priority Files to Convert:"
  echo "$CJS_FILES" | xargs grep -l "require\|module\.exports" 2>/dev/null | head -10
fi

echo "{
  \"timestamp\": \"$(date -Iseconds)\",
  \"esmModules\": $ESM_COUNT,
  \"commonjsFiles\": $CJS_COUNT,
  \"progress\": $PROGRESS
}" > migration-status.json
