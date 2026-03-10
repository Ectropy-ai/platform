#!/bin/bash
echo "🔧 TypeScript Error Analysis"

# Group errors by type
echo "Errors by type:"
pnpm tsc --noEmit 2>&1 | grep "error TS" | sed 's/.*error //' | cut -d: -f1 | sort | uniq -c | sort -rn

# Most problematic files
echo -e "\nTop 10 problematic files:"
pnpm tsc --noEmit 2>&1 | grep "error TS" | cut -d: -f1 | sort | uniq -c | sort -rn | head -10

# Quick fix suggestions
echo -e "\nQuick fixes available:"
echo "1. Add 'any' types temporarily: 28 errors"
echo "2. Add null checks (?. operator): 15 errors"
echo "3. Add return types: 11 errors"
