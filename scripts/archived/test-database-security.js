#!/usr/bin/env node

// Test script to validate database security configuration
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 Testing Database Security Configuration...');

// Test 1: Root user rejection
console.log('\n📋 Test 1: Root user rejection');
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'test';

try {
  const configPath = path.join(
    __dirname,
    '../apps/mcp-server/src/config/database.config.ts'
  );
  const { getMCPDatabaseConfig } = await import(
    `${pathToFileURL(configPath).href}?t=${Date.now()}`
  );
  getMCPDatabaseConfig();

  console.log('❌ SECURITY FAILURE: Root user was allowed');
  process.exit(1);
} catch (error) {
  if (
    error.message.includes('SECURITY VIOLATION: root database access forbidden')
  ) {
    console.log('✅ SECURITY SUCCESS: Root user correctly rejected');
  } else {
    console.log('❌ UNEXPECTED ERROR:', error.message);
    process.exit(1);
  }
}

// Test 2: Missing password rejection
console.log('\n📋 Test 2: Missing password rejection');
process.env.DB_USER = 'ectropy_ci';
delete process.env.DB_PASSWORD;

try {
  const { getMCPDatabaseConfig } = await import(
    `${
      pathToFileURL(
        path.join(__dirname, '../apps/mcp-server/src/config/database.config.ts')
      ).href
    }?t=${Date.now()}`
  );
  getMCPDatabaseConfig();

  console.log('❌ SECURITY FAILURE: Missing password was allowed');
  process.exit(1);
} catch (error) {
  if (
    error.message.includes(
      'DATABASE ERROR: Password required for secure connection'
    )
  ) {
    console.log('✅ SECURITY SUCCESS: Missing password correctly rejected');
  } else {
    console.log('❌ UNEXPECTED ERROR:', error.message);
    process.exit(1);
  }
}

// Test 3: Valid configuration
console.log('\n📋 Test 3: Valid configuration acceptance');
process.env.DB_USER = 'ectropy_ci';
process.env.DB_PASSWORD = 'secure_password';

try {
  const { getMCPDatabaseConfig } = await import(
    `${
      pathToFileURL(
        path.join(__dirname, '../apps/mcp-server/src/config/database.config.ts')
      ).href
    }?t=${Date.now()}`
  );
  const config = getMCPDatabaseConfig();

  if (
    config.postgres.user === 'ectropy_ci' &&
    config.postgres.password === 'secure_password'
  ) {
    console.log('✅ CONFIGURATION SUCCESS: Valid config accepted');
  } else {
    console.log('❌ CONFIGURATION ERROR: Invalid config values');
    process.exit(1);
  }
} catch (error) {
  console.log('❌ CONFIGURATION ERROR:', error.message);
  process.exit(1);
}

console.log('\n🎉 All database security tests passed!');
console.log('✅ Root user access: BLOCKED');
console.log('✅ Password requirement: ENFORCED');
console.log('✅ Valid configuration: ACCEPTED');
