#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const STANDARD_CONFIG = {
  compilerOptions: {
    module: "NodeNext",
    moduleResolution: "NodeNext",
    target: "ES2022",
    lib: ["ES2022"],
    declaration: true,
    declarationMap: true,
    sourceMap: true,
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    forceConsistentCasingInFileNames: true,
    resolveJsonModule: true,
    allowSyntheticDefaultImports: true,
    isolatedModules: true
  }
};

function fixTsConfig(filePath) {
  const config = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  // Preserve extends and other top-level properties
  const fixed = {
    ...config,
    compilerOptions: {
      ...STANDARD_CONFIG.compilerOptions,
      ...config.compilerOptions,
      // Ensure these are always correct
      module: "NodeNext",
      moduleResolution: "NodeNext",
      outDir: config.compilerOptions?.outDir || "./dist",
      rootDir: config.compilerOptions?.rootDir || "./src"
    }
  };
  
  fs.writeFileSync(filePath, JSON.stringify(fixed, null, 2));
  console.log(`✅ Fixed: ${filePath}`);
}

// Simple recursive function to find tsconfig.json files
function findTsConfigFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
      files.push(...findTsConfigFiles(fullPath));
    } else if (entry.isFile() && entry.name === 'tsconfig.json') {
      files.push(fullPath);
    }
  }
  
  return files;
}

// Find and fix all tsconfig.json files
const tsconfigs = findTsConfigFiles('.');

tsconfigs.forEach(fixTsConfig);
console.log(`\n✅ Fixed ${tsconfigs.length} TypeScript configurations`);