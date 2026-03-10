#!/usr/bin/env node
/**
 * Dependency Validation Script
 * 
 * Validates that all apps declare the external dependencies they import.
 * This prevents MODULE_NOT_FOUND errors in Docker containers where
 * monorepo shared node_modules don't exist.
 * 
 * Usage:
 *   node scripts/validate-dependencies.mjs [--fix]
 * 
 * Exit codes:
 *   0 - All dependencies are properly declared
 *   1 - Missing dependencies found (or other errors)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Node.js built-in modules to exclude from checks
const NODE_BUILTINS = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
  'events', 'fs', 'fs/promises', 'http', 'http2', 'https', 'inspector',
  'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode',
  'querystring', 'readline', 'repl', 'stream', 'string_decoder', 'sys',
  'timers', 'tls', 'trace_events', 'tty', 'url', 'util', 'v8', 'vm',
  'wasi', 'worker_threads', 'zlib', 'node:buffer', 'node:child_process',
  'node:crypto', 'node:events', 'node:fs', 'node:http', 'node:path',
  'node:stream', 'node:url', 'node:util'
]);

// Packages that are acceptable to use from test files without declaring
// (these are typically in root devDependencies)
const TEST_ONLY_PACKAGES = new Set([
  'vitest',
  '@jest/globals',
  'supertest'
]);

function extractImports(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const imports = new Set();
    
    // Match import statements: import ... from 'package' or import ... from "package"
    const importRegex = /^import\s+.*?\s+from\s+['"]([^'"]+)['"]/gm;
    let match;
    
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      
      // Skip relative imports
      if (importPath.startsWith('.') || importPath.startsWith('/')) {
        continue;
      }
      
      // Skip @ectropy internal packages
      if (importPath.startsWith('@ectropy')) {
        continue;
      }
      
      // Skip node builtins
      if (NODE_BUILTINS.has(importPath)) {
        continue;
      }
      
      // Extract package name (handle scoped packages)
      let packageName = importPath;
      if (importPath.startsWith('@')) {
        // Scoped package: @scope/package or @scope/package/subpath
        const parts = importPath.split('/');
        packageName = parts.slice(0, 2).join('/');
      } else {
        // Regular package: package or package/subpath
        packageName = importPath.split('/')[0];
      }
      
      imports.add(packageName);
    }
    
    // Match require statements: require('package') or require("package")
    // Handles: const x = require('pkg'), require('pkg'), var x = require('pkg')
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    
    while ((match = requireRegex.exec(content)) !== null) {
      const requirePath = match[1];
      
      // Skip relative imports
      if (requirePath.startsWith('.') || requirePath.startsWith('/')) {
        continue;
      }
      
      // Skip @ectropy internal packages
      if (requirePath.startsWith('@ectropy')) {
        continue;
      }
      
      // Skip node builtins
      if (NODE_BUILTINS.has(requirePath)) {
        continue;
      }
      
      // Extract package name (handle scoped packages)
      let packageName = requirePath;
      if (requirePath.startsWith('@')) {
        // Scoped package: @scope/package or @scope/package/subpath
        const parts = requirePath.split('/');
        packageName = parts.slice(0, 2).join('/');
      } else {
        // Regular package: package or package/subpath
        packageName = requirePath.split('/')[0];
      }
      
      imports.add(packageName);
    }
    
    return imports;
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message);
    return new Set();
  }
}

/**
 * Get transitive dependencies from node_modules
 * This helps detect if we're actually using transitive dependencies
 * that aren't explicitly declared in package.json
 */
function getTransitiveDependencies(appPath, packageName) {
  try {
    const packageJsonPath = path.join(
      appPath,
      'node_modules',
      packageName,
      'package.json'
    );
    
    if (!fs.existsSync(packageJsonPath)) {
      // Try root node_modules (monorepo pattern)
      const rootPackageJsonPath = path.join(
        path.resolve(__dirname, '../..'),
        'node_modules',
        packageName,
        'package.json'
      );
      
      if (!fs.existsSync(rootPackageJsonPath)) {
        return new Set();
      }
      
      const packageJson = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8'));
      return new Set([
        ...Object.keys(packageJson.dependencies || {}),
        ...Object.keys(packageJson.peerDependencies || {})
      ]);
    }
    
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return new Set([
      ...Object.keys(packageJson.dependencies || {}),
      ...Object.keys(packageJson.peerDependencies || {})
    ]);
  } catch (error) {
    return new Set();
  }
}

function getAllFiles(dir, extensions = ['.ts', '.tsx', '.js', '.jsx']) {
  const files = [];
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Skip node_modules and dist directories
        if (entry.name !== 'node_modules' && entry.name !== 'dist') {
          files.push(...getAllFiles(fullPath, extensions));
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error.message);
  }
  
  return files;
}

function isTestFile(filePath) {
  const basename = path.basename(filePath);
  return basename.includes('.test.') || 
         basename.includes('.spec.') ||
         filePath.includes('/__tests__/') ||
         filePath.includes('/test/');
}

function validateApp(appName, appPath) {
  const srcPath = path.join(appPath, 'src');
  const packageJsonPath = path.join(appPath, 'package.json');
  
  if (!fs.existsSync(srcPath)) {
    console.log(`⚠️  Skipping ${appName}: No src directory`);
    return { valid: true, missing: [] };
  }
  
  if (!fs.existsSync(packageJsonPath)) {
    console.log(`⚠️  Skipping ${appName}: No package.json`);
    return { valid: true, missing: [] };
  }
  
  // Get all source files
  const files = getAllFiles(srcPath);
  
  // Separate test files from production files
  const prodFiles = files.filter(f => !isTestFile(f));
  const testFiles = files.filter(f => isTestFile(f));
  
  // Extract imports from production files
  const prodImports = new Set();
  for (const file of prodFiles) {
    const imports = extractImports(file);
    imports.forEach(imp => prodImports.add(imp));
  }
  
  // Extract imports from test files
  const testImports = new Set();
  for (const file of testFiles) {
    const imports = extractImports(file);
    imports.forEach(imp => testImports.add(imp));
  }
  
  // Read package.json
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const declaredDeps = new Set([
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.devDependencies || {})
  ]);
  
  // Find missing dependencies
  // Production code must declare all dependencies
  const missingProd = [...prodImports].filter(imp => !declaredDeps.has(imp));
  
  // Test code can use test-only packages from root devDependencies
  const missingTest = [...testImports]
    .filter(imp => !declaredDeps.has(imp))
    .filter(imp => !TEST_ONLY_PACKAGES.has(imp));
  
  const missing = [...new Set([...missingProd, ...missingTest])];
  
  // Check for potential transitive dependency issues
  // Get all transitive dependencies of declared packages
  const transitiveWarnings = [];
  const allDeclaredPackages = [...declaredDeps];
  
  for (const declaredPkg of allDeclaredPackages) {
    const transitiveDeps = getTransitiveDependencies(appPath, declaredPkg);
    
    // Check if we're importing/requiring any of these transitive dependencies directly
    const directlyUsedTransitive = [...transitiveDeps].filter(
      transDep => prodImports.has(transDep) && !declaredDeps.has(transDep)
    );
    
    if (directlyUsedTransitive.length > 0) {
      transitiveWarnings.push({
        parent: declaredPkg,
        transitive: directlyUsedTransitive
      });
    }
  }
  
  return {
    valid: missing.length === 0,
    missing: missing.sort(),
    missingProd: missingProd.sort(),
    missingTest: missingTest.sort(),
    transitiveWarnings
  };
}

// Main execution
const args = process.argv.slice(2);
const fixMode = args.includes('--fix');

const repoRoot = path.resolve(__dirname, '../..');
const apps = [
  { name: 'mcp-server', path: path.join(repoRoot, 'apps/mcp-server') },
  { name: 'api-gateway', path: path.join(repoRoot, 'apps/api-gateway') },
  { name: 'web-dashboard', path: path.join(repoRoot, 'apps/web-dashboard') }
];

console.log('🔍 Validating app dependencies...\n');

let allValid = true;
const results = {};

for (const app of apps) {
  const result = validateApp(app.name, app.path);
  results[app.name] = result;
  
  if (result.valid) {
    console.log(`✅ ${app.name}: All dependencies properly declared`);
  } else {
    allValid = false;
    console.log(`\n❌ ${app.name}: Missing ${result.missing.length} dependencies`);
    
    if (result.missingProd.length > 0) {
      console.log(`   Production code missing:`);
      result.missingProd.forEach(dep => console.log(`     - ${dep}`));
    }
    
    if (result.missingTest.length > 0) {
      console.log(`   Test code missing:`);
      result.missingTest.forEach(dep => console.log(`     - ${dep}`));
    }
  }
  
  // Show transitive dependency warnings even if validation passes
  if (result.transitiveWarnings && result.transitiveWarnings.length > 0) {
    console.log(`\n⚠️  ${app.name}: Using transitive dependencies directly`);
    console.log(`   These dependencies should be declared explicitly in package.json:`);
    
    result.transitiveWarnings.forEach(warning => {
      console.log(`   From ${warning.parent}:`);
      warning.transitive.forEach(dep => console.log(`     - ${dep}`));
    });
    
    console.log(`   \n   Why this matters:`);
    console.log(`   - Docker builds may fail if transitive deps aren't in lockfile`);
    console.log(`   - Dependency updates could break your code silently`);
    console.log(`   - Violates enterprise dependency declaration pattern`);
  }
}

console.log('\n' + '='.repeat(60));

// Check if any app has transitive warnings
const hasTransitiveWarnings = Object.values(results).some(
  r => r.transitiveWarnings && r.transitiveWarnings.length > 0
);

if (allValid) {
  if (hasTransitiveWarnings) {
    console.log('⚠️  All required dependencies declared, but transitive dependency warnings found');
    console.log('\nRecommended actions:');
    console.log('1. Add transitive dependencies to package.json for safety');
    console.log('2. Run `pnpm install` to update lockfile');
    console.log('3. Test in Docker containers to verify');
    console.log('\nNote: These warnings prevent MODULE_NOT_FOUND errors in production.');
    process.exit(0); // Exit with 0 but show warnings
  } else {
    console.log('✅ All apps have properly declared dependencies');
    process.exit(0);
  }
} else {
  console.log('❌ Some apps have undeclared dependencies');
  console.log('\nTo fix this issue:');
  console.log('1. Add missing dependencies to the respective app\'s package.json');
  console.log('2. Run the prepare-*-dist.mjs scripts to verify container builds');
  console.log('3. Test in Docker containers to ensure no MODULE_NOT_FOUND errors');
  console.log('\nNote: The spread pattern (...appPkg.dependencies) in prepare scripts');
  console.log('will automatically pick up newly added dependencies.');
  process.exit(1);
}
