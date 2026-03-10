#!/bin/bash
echo "\U0001F50D Scanning for CommonJS patterns..."
echo "Files with require():"
grep -r "require(" --include="*.js" --include="*.cjs" --exclude-dir=node_modules --exclude-dir=dist . 2>/dev/null | head -20
echo ""
echo "Files with module.exports:"
grep -r "module.exports" --include="*.js" --include="*.cjs" --exclude-dir=node_modules --exclude-dir=dist . 2>/dev/null | head -20
echo ""
echo "Total CommonJS files found:"
find . -type f \( -name "*.cjs" -o -name "*.js" \) -not -path "*/node_modules/*" -not -path "*/dist/*" -exec grep -l "require\|module.exports" {} \; 2>/dev/null | wc -l
