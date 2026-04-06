#!/usr/bin/env node
/**
 * API Gateway Distribution Preparation
 * Prepares API Gateway for Docker deployment
 * 
 * Actions:
 * - Copies production dependencies to dist/
 * - Creates optimized package.json for production
 * - Removes dev dependencies and test files
 * - Copies Prisma schema for database client
 */

import fs from 'fs';
import path from 'path';

console.log('🔧 Preparing API Gateway distribution...');
console.log(`   Working directory: ${process.cwd()}`);

let rootPkg, apiPkg;

try {
  rootPkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  console.log(`   ✅ Root package.json loaded (version: ${rootPkg.version})`);
} catch (error) {
  console.error('❌ FATAL: Failed to read root package.json');
  console.error(error.message);
  process.exit(1);
}

try {
  apiPkg = JSON.parse(fs.readFileSync('apps/api-gateway/package.json', 'utf8'));
  console.log(`   ✅ API Gateway package.json loaded`);
} catch (error) {
  console.error('❌ FATAL: Failed to read apps/api-gateway/package.json');
  console.error(error.message);
  process.exit(1);
}

const distPkg = {
  name: 'api-gateway',
  version: rootPkg.version,
  main: './main.js',  // CRITICAL: Relative to package.json location
  dependencies: {
    ...apiPkg.dependencies,
    'prom-client': rootPkg.dependencies['prom-client'],
    'connect-redis': rootPkg.dependencies['connect-redis'],
    'graphql': rootPkg.dependencies['graphql'] || apiPkg.dependencies['graphql'],
    'graphql-tag': rootPkg.dependencies['graphql-tag'] || apiPkg.dependencies['graphql-tag'],
    express: rootPkg.dependencies['express'] || apiPkg.dependencies['express'],
    'express-validator': rootPkg.dependencies['express-validator'] || apiPkg.dependencies['express-validator'],
    compression: rootPkg.dependencies['compression'] || apiPkg.dependencies['compression'],
    cors: rootPkg.dependencies['cors'] || apiPkg.dependencies['cors'],
    helmet: rootPkg.dependencies['helmet'] || apiPkg.dependencies['helmet'],
    ioredis: rootPkg.dependencies['ioredis'] || apiPkg.dependencies['ioredis'],
    pg: rootPkg.dependencies['pg'] || apiPkg.dependencies['pg'],
    tslib: rootPkg.dependencies['tslib'] || apiPkg.dependencies['tslib'], // Required by webpack bundles
    pause: rootPkg.dependencies['pause'] || apiPkg.dependencies['pause'], // Required by passport middleware
    'passport-oauth2': rootPkg.dependencies['passport-oauth2'] || apiPkg.dependencies['passport-oauth2'], // Required by passport
    'passport-strategy': rootPkg.dependencies['passport-strategy'] || apiPkg.dependencies['passport-strategy'], // Required by passport
    'utils-merge': rootPkg.dependencies['utils-merge'] || apiPkg.dependencies['utils-merge'], // Required by passport
  },
  // CRITICAL: Include Prisma as dependencies (not devDependencies)
  // Production containers need both CLI and client for runtime generation
  devDependencies: {
    '@prisma/client': rootPkg.devDependencies['@prisma/client'],
    'prisma': rootPkg.devDependencies['prisma'],
  },
  // CRITICAL: Propagate pnpm overrides from workspace root
  // Runner stage uses --no-frozen-lockfile against this generated package.json,
  // so without overrides, transitive deps float to breaking versions.
  // Root cause of staging 502: jsdom@27 → cssstyle@5 → ESM crash on Node 20.
  ...(rootPkg.pnpm?.overrides ? { pnpm: { overrides: rootPkg.pnpm.overrides } } : {}),
};

console.log(`   📦 Generated package.json:`);
console.log(`      - name: ${distPkg.name}`);
console.log(`      - version: ${distPkg.version}`);
console.log(`      - main: ${distPkg.main}`);
console.log(`      - dependencies: ${Object.keys(distPkg.dependencies).length} packages`);

// Remove undefined dependencies
Object.keys(distPkg.dependencies).forEach((key) => {
  if (!distPkg.dependencies[key]) {
    console.log(`   ⚠️  Removing undefined dependency: ${key}`);
    delete distPkg.dependencies[key];
  }
});

const distPath = path.join('dist/apps/api-gateway');
console.log(`   📂 Target directory: ${distPath}`);

if (!fs.existsSync(distPath)) {
  console.log(`   ⚠️  Directory does not exist, creating: ${distPath}`);
  fs.mkdirSync(distPath, { recursive: true });
} else {
  console.log(`   ✅ Directory exists: ${distPath}`);
}

const packageJsonPath = path.join(distPath, 'package.json');
console.log(`   📝 Writing package.json to: ${packageJsonPath}`);

try {
  fs.writeFileSync(
    packageJsonPath,
    JSON.stringify(distPkg, null, 2)
  );
  console.log(`   ✅ package.json written successfully`);
  
  // Verify the file was written correctly
  const writtenPkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (writtenPkg.main !== './main.js') {
    console.error(`   ❌ FATAL: package.json main field is incorrect: ${writtenPkg.main}`);
    console.error(`   Expected: ./main.js`);
    process.exit(1);
  }
  console.log(`   ✅ Verified: main field is correct (${writtenPkg.main})`);
  
} catch (error) {
  console.error(`   ❌ FATAL: Failed to write package.json`);
  console.error(error.message);
  process.exit(1);
}

// Copy Prisma schema if exists
try {
  const prismaSchemaPath = path.join('prisma', 'schema.prisma');
  if (fs.existsSync(prismaSchemaPath)) {
    fs.copyFileSync(prismaSchemaPath, path.join(distPath, 'schema.prisma'));
    console.log('   ✅ Prisma schema copied');
  }
} catch (err) {
  console.warn('   ⚠️  Prisma schema not found (may not be needed)');
}

console.log('');
console.log('✅ API Gateway distribution prepared successfully');
console.log(`   - Production package.json created at ${packageJsonPath}`);
console.log(`   - Main entry point: ./main.js`);
console.log(`   - Dev dependencies removed from production bundle`);
console.log('');
