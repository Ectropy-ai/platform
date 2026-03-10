#!/bin/bash
set -euo pipefail

echo "🔧 Fixing Docker build order issues..."

# Function to fix a Dockerfile
fix_dockerfile() {
    local file=$1
    echo "Fixing: $file"
    
    # Check if scripts copy exists
    if ! grep -q "COPY scripts ./scripts" "$file"; then
        # Find the line with workspace pnpm install (not global installs)
        INSTALL_LINE=$(grep -n "RUN.*pnpm install.*frozen-lockfile\|RUN.*pnpm install[^-].*workspace\|RUN.*pnpm install$" "$file" | head -1 | cut -d: -f1 || echo "0")
        
        if [ "$INSTALL_LINE" != "0" ]; then
            # Insert COPY scripts before the install line
            sed -i "${INSTALL_LINE}i COPY scripts ./scripts" "$file"
            echo "  ✅ Added 'COPY scripts ./scripts' before install"
        fi
    fi
    
    # Ensure pnpm is installed
    if ! grep -q "npm install -g pnpm" "$file"; then
        # Add after WORKDIR
        sed -i '/^WORKDIR \/app/a RUN npm install -g pnpm@10.14.0' "$file"
        echo "  ✅ Added pnpm installation"
    fi
}

# Fix all Dockerfiles
for dockerfile in $(find . -name "Dockerfile*" -type f | grep -v node_modules); do
    if [[ "$dockerfile" == *".devcontainer"* ]]; then
        echo "Skipping devcontainer file: $dockerfile"
        continue
    fi
    fix_dockerfile "$dockerfile"
done

echo "✅ Build order fixes applied"