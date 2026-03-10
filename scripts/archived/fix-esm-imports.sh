#!/bin/bash
set -e

# Projects to fix
PROJECTS=(
  "libs/database"
  "packages/clash"
  "libs/monitoring"
  "libs/embeddings"
  "packages/federation"
  "libs/secrets-management"
  "libs/ai-agents/compliance"
  "libs/ai-agents/performance"
  "libs/ai-agents/task-manager"
  "libs/ai-agents/procurement"
  "libs/blockchain"
  "libs/mcp-client"
  "libs/ai-agents"
  "libs/iot-edge"
)

echo "🔧 Starting ESM import fixes..."
echo "================================"

for project in "${PROJECTS[@]}"; do
  if [ ! -d "$project" ]; then
    echo "⚠️  Skipping $project - directory not found"
    continue
  fi
  
  echo "📦 Processing $project..."
  
  # Find all .ts files (excluding test files) and add .js extensions to relative imports
  # Only modify imports that don't already have .js extension
  find "$project" -name "*.ts" ! -name "*.spec.ts" ! -name "*.test.ts" -type f | while read -r file; do
    # Create a backup
    cp "$file" "$file.bak"
    
    # Add .js to relative imports that don't have it
    # Pattern 1: from './path' -> from './path.js'
    # Pattern 2: from '../path' -> from '../path.js'
    # But skip if already has .js, .json, or other extensions
    sed -E \
      -e "s|from '(\.\./[^']*[^.][^j][^s])';|from '\1.js';|g" \
      -e "s|from '(\./[^']*[^.][^j][^s])';|from '\1.js';|g" \
      -e 's|from "(\.\./[^"]*[^.][^j][^s])";|from "\1.js";|g' \
      -e 's|from "(\./[^"]*[^.][^j][^s])";|from "\1.js";|g' \
      "$file.bak" > "$file"
    
    # If no changes were made, restore from backup
    if diff "$file" "$file.bak" > /dev/null 2>&1; then
      mv "$file.bak" "$file"
    else
      echo "  ✓ Updated $file"
      rm "$file.bak"
    fi
  done
done

echo ""
echo "✅ ESM import fixes complete!"
echo "================================"
