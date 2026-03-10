#!/bin/bash
# Unified Build Pipeline for Embeddings Scripts
# Compiles TypeScript scripts to JavaScript for deterministic execution

set -e

echo "🔧 Building TypeScript embeddings scripts..."

# Create dist/scripts directory if it doesn't exist
mkdir -p dist/scripts

# Compile embeddings scripts
if command -v tsc &> /dev/null; then
    echo "✅ TypeScript compiler found"
    
    # Try to compile update-embeddings.ts
    if [ -f "scripts/update-embeddings.ts" ]; then
        echo "🔄 Attempting to compile update-embeddings.ts..."
        if tsc scripts/update-embeddings.ts --outDir dist/scripts --target ES2022 --module ESNext --moduleResolution node --esModuleInterop --allowSyntheticDefaultImports --skipLibCheck --noEmit 2>/dev/null; then
            echo "✅ Compiled update-embeddings.ts"
            # Actually compile if validation passed
            tsc scripts/update-embeddings.ts --outDir dist/scripts --target ES2022 --module ESNext --moduleResolution node --esModuleInterop --allowSyntheticDefaultImports --skipLibCheck
        else
            echo "⚠️ TypeScript compilation failed, using JavaScript fallback"
            if [ -f "scripts/update-embeddings.js" ]; then
                cp scripts/update-embeddings.js dist/scripts/
                echo "✅ Copied update-embeddings.js fallback"
            fi
        fi
    fi
    
    # Try to compile validate-embeddings.ts
    if [ -f "scripts/validate-embeddings.ts" ]; then
        echo "🔄 Attempting to compile validate-embeddings.ts..."
        if tsc scripts/validate-embeddings.ts --outDir dist/scripts --target ES2022 --module ESNext --moduleResolution node --esModuleInterop --allowSyntheticDefaultImports --skipLibCheck --noEmit 2>/dev/null; then
            echo "✅ Compiled validate-embeddings.ts"
            # Actually compile if validation passed
            tsc scripts/validate-embeddings.ts --outDir dist/scripts --target ES2022 --module ESNext --moduleResolution node --esModuleInterop --allowSyntheticDefaultImports --skipLibCheck
        else
            echo "⚠️ TypeScript compilation failed for validate-embeddings.ts"
            echo "💡 Runtime fallback will be used"
        fi
    fi
    
    echo "✅ TypeScript processing completed"
else
    echo "⚠️ TypeScript compiler not found, using JavaScript fallbacks"
fi

# Ensure JavaScript fallbacks are available
if [ -f "scripts/update-embeddings.js" ]; then
    cp scripts/update-embeddings.js dist/scripts/ 2>/dev/null || true
    echo "✅ JavaScript fallback available: update-embeddings.js"
fi

if [ -f "scripts/test-embeddings-runtime.js" ]; then
    cp scripts/test-embeddings-runtime.js dist/scripts/ 2>/dev/null || true
    echo "✅ JavaScript fallback available: test-embeddings-runtime.js"
fi

echo "🎯 Build completed - scripts ready for execution with progressive fallback"