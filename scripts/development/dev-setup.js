#!/usr/bin/env node

/**
 * Development Environment Setup Script
 * Ensures all prerequisites are met before starting services
 */

import fs from 'fs';
import path from 'path';
import PlatformUtils from './platform-utils.cjs.js';

console.log('🔧 Ectropy Development Setup\n');
console.log(`Platform: ${PlatformUtils.platform}`);

// Check Node version
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
if (majorVersion < 20) {
  console.error(`❌ Node.js v20+ required, current: ${nodeVersion}`);
  process.exit(1);
}
console.log(`✅ Node.js ${nodeVersion}`);

// Check for cross-env
try {
  require.resolve('cross-env');
  console.log('✅ cross-env installed');
} catch (e) {
  console.log('📦 Installing cross-env...');
  PlatformUtils.exec('pnpm add -w -D cross-env');
}

// Check for environment file
const envFiles = ['.env.local', '.env.development', '.env'];
const envExists = envFiles.some(file => 
  fs.existsSync(path.join(process.cwd(), file))
);

if (!envExists) {
  console.log('📝 Creating .env.development from template...');
  const template = `# Auto-generated development environment
NODE_ENV=development
PORT=4000
WEB_PORT=3002
HOST=0.0.0.0
API_PORT=4000

# Database Configuration
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=ectropy_dev
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ectropy_dev

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=""
REDIS_URL=redis://localhost:6379

# JWT Configuration
JWT_SECRET=development_jwt_secret_minimum_32_characters_long_for_development_use_only
JWT_REFRESH_SECRET=development_jwt_refresh_secret_minimum_32_characters_long_for_development
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# Session Configuration
SESSION_SECRET=development_session_secret_32_chars
ENCRYPTION_KEY=development_encryption_key_32_byte

# CORS Configuration
CORS_ORIGINS=http://localhost:3000,http://localhost:3002,http://localhost:4000,http://localhost:8080

# MCP Server Configuration
MCP_PORT=3001

# Security Configuration
HELMET_ENABLED=true
CSRF_ENABLED=false
SSL_ENABLED=false

# Logging Configuration
LOG_LEVEL=debug
LOG_FORMAT=pretty

# Feature Flags
ENABLE_REALTIME=true
ENABLE_BIM_VIEWER=true
ENABLE_ANALYTICS=true
ENABLE_API_DOCS=true
ENABLE_DEBUG_ROUTES=true

# Development Flags
DEBUG_ENABLED=true
MOCK_SERVICES_ENABLED=false
TEST_MODE_ENABLED=false
`;
  fs.writeFileSync('.env.development', template);
  console.log('✅ Created .env.development with all required variables');
}

// Check Docker
try {
  PlatformUtils.exec('docker --version', { stdio: 'pipe' });
  console.log('✅ Docker installed');
  
  // Start services if needed
  const containers = PlatformUtils.exec('docker ps --format "{{.Names}}"', { 
    encoding: 'utf8',
    stdio: 'pipe' 
  }).toString();
  
  const required = ['ectropy-postgres', 'ectropy-redis', 'ectropy-qdrant'];
  const missing = required.filter(name => !containers.includes(name));
  
  if (missing.length > 0) {
    console.log('🐳 Starting Docker services...');
    try {
      PlatformUtils.exec('docker compose -f docker-compose.local.yml up -d');
    } catch (e) {
      console.log('⚠️ Docker services failed to start, continuing anyway');
    }
  } else {
    console.log('✅ Docker services running');
  }
} catch (err) {
  console.error('❌ Docker not found. Please install Docker Desktop');
  if (PlatformUtils.isWindows) {
    console.log('Download: https://desktop.docker.com/win/stable/Docker%20Desktop%20Installer.exe');
  }
  process.exit(1);
}

// Build shared library
console.log('📦 Building shared library...');
try {
  PlatformUtils.exec('pnpm nx build shared');
  console.log('✅ Shared library built');
} catch (err) {
  console.log('🔧 Fixing shared library TypeScript config...');
  try {
    PlatformUtils.exec('node scripts/fix-tsconfigs.cjs');
    
    // Try again
    try {
      PlatformUtils.exec('pnpm nx build shared');
      console.log('✅ Shared library built after fix');
    } catch (e) {
      console.error('❌ CRITICAL: Shared library build failed after fix attempt');
      console.error('Error details:', e.message);
      console.error('This will prevent services from starting correctly.');
      console.error('Please check TypeScript configuration and fix build errors.');
      process.exit(1);
    }
  } catch (fixErr) {
    console.error('❌ CRITICAL: Could not fix TypeScript configuration');
    console.error('Fix error:', fixErr.message);
    console.error('Original build error:', err.message);
    console.error('Manual intervention required - check tsconfig files and dependencies');
    process.exit(1);
  }
}

console.log('\n✅ Development environment ready!');
console.log('\nStart services with:');
console.log('  npm run dev:api:direct  # Terminal 1');
console.log('  npm run dev:mcp:direct  # Terminal 2');
console.log('  npm run dev:web         # Terminal 3');