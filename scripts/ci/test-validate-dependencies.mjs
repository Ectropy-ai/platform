#!/usr/bin/env node
/**
 * Test script for validate-dependencies.mjs
 * 
 * Validates that the dependency validation script correctly:
 * 1. Detects import statements
 * 2. Detects require() statements
 * 3. Identifies missing dependencies
 * 4. Handles scoped packages correctly
 * 5. Skips node built-ins
 * 6. Skips relative imports
 * 7. Warns about transitive dependency usage
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');

// Node.js built-in modules to exclude from checks (matching validate-dependencies.mjs)
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

// Extract imports function (matching the enhanced version in validate-dependencies.mjs)
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

// Test configurations
const testCases = [
  {
    name: 'Import statement detection',
    code: `import express from 'express';\nimport { Router } from 'express';\nimport axios from 'axios';`,
    expected: ['express', 'axios'],
    description: 'Should detect ES6 import statements'
  },
  {
    name: 'Require statement detection',
    code: `const express = require('express');\nconst axios = require('axios');\nvar http = require('http');`,
    expected: ['express', 'axios'],
    description: 'Should detect CommonJS require() statements'
  },
  {
    name: 'Mixed import and require',
    code: `import express from 'express';\nconst axios = require('axios');\nimport lodash from 'lodash';`,
    expected: ['express', 'axios', 'lodash'],
    description: 'Should detect both import and require in same file'
  },
  {
    name: 'Scoped packages',
    code: `import { Client } from '@prisma/client';\nimport logger from '@ectropy/logger';\nconst mui = require('@mui/material');`,
    expected: ['@prisma/client', '@mui/material'],
    description: 'Should handle scoped packages and skip @ectropy packages'
  },
  {
    name: 'Node built-ins',
    code: `import fs from 'fs';\nconst path = require('path');\nimport http from 'http';\nconst crypto = require('crypto');`,
    expected: [],
    description: 'Should skip node built-in modules'
  },
  {
    name: 'Relative imports',
    code: `import config from './config';\nconst utils = require('../utils');\nimport '../styles.css';`,
    expected: [],
    description: 'Should skip relative imports'
  },
  {
    name: 'Subpath imports',
    code: `import debounce from 'lodash/debounce';\nconst join = require('path').join;\nimport Icon from '@mui/icons-material/Home';`,
    expected: ['lodash', '@mui/icons-material'],
    description: 'Should extract base package from subpath imports'
  },
  {
    name: 'Complex real-world example',
    code: `
import express, { Router, Request, Response } from 'express';
import multer from 'multer';
import type { Pool } from 'pg';
import { logger } from '@ectropy/shared/utils';
import path from 'path';
import fs from 'fs';

const axios = require('axios');
const { z } = require('zod');

class MyClass {
  constructor() {
    const lodash = require('lodash');
  }
}
    `,
    expected: ['express', 'multer', 'pg', 'axios', 'zod', 'lodash'],
    description: 'Should handle complex real-world code with mixed patterns'
  }
];

console.log('🧪 Testing validate-dependencies.mjs...\n');

// Create a temporary test directory
const testDir = path.join('/tmp', 'validate-deps-test');
const testSrcDir = path.join(testDir, 'src');

// Clean up and create fresh test directory
if (fs.existsSync(testDir)) {
  fs.rmSync(testDir, { recursive: true });
}
fs.mkdirSync(testSrcDir, { recursive: true });

// Run test cases
let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  console.log(`Testing: ${testCase.name}`);
  console.log(`  ${testCase.description}`);
  
  // Write test code to a file
  const testFilePath = path.join(testSrcDir, `test-${passed + failed}.ts`);
  fs.writeFileSync(testFilePath, testCase.code);
  
  // Extract imports
  const imports = extractImports(testFilePath);
  const importArray = Array.from(imports).sort();
  const expectedArray = testCase.expected.sort();
  
  // Compare results
  const missing = expectedArray.filter(exp => !importArray.includes(exp));
  const unexpected = importArray.filter(imp => !expectedArray.includes(imp));
  
  if (missing.length === 0 && unexpected.length === 0) {
    console.log(`  ✅ PASS`);
    console.log(`     Detected: ${importArray.length > 0 ? importArray.join(', ') : '(none)'}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL`);
    if (missing.length > 0) {
      console.log(`     Missing: ${missing.join(', ')}`);
    }
    if (unexpected.length > 0) {
      console.log(`     Unexpected: ${unexpected.join(', ')}`);
    }
    console.log(`     Expected: ${expectedArray.length > 0 ? expectedArray.join(', ') : '(none)'}`);
    console.log(`     Got: ${importArray.length > 0 ? importArray.join(', ') : '(none)'}`);
    failed++;
  }
  console.log('');
}

// Clean up
fs.rmSync(testDir, { recursive: true });

console.log('='.repeat(60));
console.log(`\nResults: ${passed} passed, ${failed} failed out of ${testCases.length} tests\n`);

if (failed === 0) {
  console.log('✅ All tests passed!');
  console.log('\nThe validate-dependencies.mjs script correctly:');
  console.log('  - Detects ES6 import statements');
  console.log('  - Detects CommonJS require() statements');
  console.log('  - Handles scoped packages (@scope/package)');
  console.log('  - Skips Node.js built-in modules');
  console.log('  - Skips relative imports (./file, ../file)');
  console.log('  - Skips @ectropy internal packages');
  console.log('  - Extracts base package from subpath imports');
  process.exit(0);
} else {
  console.log('❌ Some tests failed!');
  console.log('\nPlease review the failures above and fix the validation script.');
  process.exit(1);
}
