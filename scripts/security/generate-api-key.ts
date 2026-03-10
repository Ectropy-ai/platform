#!/usr/bin/env ts-node
/**
 * API Key Generation CLI Script
 *
 * MILESTONE 1 TASK 4: Generate API Keys for server-to-server authentication
 * Strategic Alignment: business-tools PR #101 → Ectropy platform integration
 * Gap #1 (P0 BLOCKING): Enable n8n workflows to authenticate with Ectropy
 *
 * Usage:
 *   ts-node scripts/generate-api-key.ts --name "business-tools-n8n" --email "erik@luh.tech" --scopes "authorize_user,list_users,revoke_user,health_check"
 *   ts-node scripts/generate-api-key.ts --name "monitoring-bot" --email "erik@luh.tech" --scopes "*"
 *   ts-node scripts/generate-api-key.ts --name "ci-cd-pipeline" --email "erik@luh.tech" --scopes "health_check" --expires 90
 *
 * Arguments:
 *   --name:    Human-readable name for the API key (required)
 *   --email:   Email of the platform admin user to associate the key with (required)
 *   --scopes:  Comma-separated list of scopes (required)
 *   --expires: Number of days until expiration (optional, default: no expiration)
 *
 * Scopes:
 *   - authorize_user: POST /api/admin/authorize-user
 *   - list_users: GET /api/admin/demo-users
 *   - revoke_user: POST /api/admin/users/:userId/revoke
 *   - health_check: GET /api/admin/health
 *   - *: Wildcard (all permissions)
 *
 * Security:
 *   - Generates 32-byte random key with crypto.randomBytes()
 *   - Hashes key with bcrypt (cost factor: 12)
 *   - Stores only hash in database
 *   - Returns plaintext key ONCE (user must save it immediately)
 *   - Key format: ectropy_api_<base64>
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

interface ApiKeyOptions {
  name: string;
  email: string;
  scopes: string[];
  expiresInDays?: number;
}

/**
 * Generate a cryptographically secure random API key
 * Format: ectropy_api_<32_bytes_base64_urlsafe>
 */
function generateApiKey(): string {
  // Generate 32 random bytes (256 bits)
  const randomBytes = crypto.randomBytes(32);

  // Convert to base64url (URL-safe base64)
  const base64 = randomBytes
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return `ectropy_api_${base64}`;
}

/**
 * Hash API key with bcrypt
 * Cost factor: 12 (recommended for API keys)
 */
async function hashApiKey(key: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(key, saltRounds);
}

/**
 * Find platform admin user by email
 */
async function findPlatformAdmin(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new Error(`User not found: ${email}`);
  }

  if (!user.is_platform_admin) {
    throw new Error(`User is not a platform admin: ${email}`);
  }

  return user;
}

/**
 * Create API key in database
 */
async function createApiKey(options: ApiKeyOptions): Promise<string> {
  const { name, email, scopes, expiresInDays } = options;

  // Validate scopes
  const validScopes = [
    'authorize_user',
    'list_users',
    'revoke_user',
    'health_check',
    '*',
  ];
  const invalidScopes = scopes.filter((scope) => !validScopes.includes(scope));
  if (invalidScopes.length > 0) {
    throw new Error(
      `Invalid scopes: ${invalidScopes.join(', ')}. Valid scopes: ${validScopes.join(', ')}`
    );
  }

  // Find platform admin user
  console.log(`🔍 Finding platform admin user: ${email}`);
  const user = await findPlatformAdmin(email);
  console.log(`✅ Found platform admin: ${user.full_name} (${user.id})`);

  // Generate API key
  console.log('🔐 Generating API key...');
  const apiKey = generateApiKey();
  const keyHash = await hashApiKey(apiKey);
  console.log('✅ API key generated and hashed');

  // Calculate expiration date
  let expiresAt: Date | null = null;
  if (expiresInDays) {
    expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);
  }

  // Create API key in database
  console.log('💾 Storing API key in database...');
  const apiKeyRecord = await prisma.apiKey.create({
    data: {
      name,
      key_hash: keyHash,
      user_id: user.id,
      scopes,
      is_active: true,
      expires_at: expiresAt,
    },
  });

  console.log('✅ API key stored successfully');
  console.log('');
  console.log('='.repeat(80));
  console.log('API KEY CREATED SUCCESSFULLY');
  console.log('='.repeat(80));
  console.log('');
  console.log(`ID:         ${apiKeyRecord.id}`);
  console.log(`Name:       ${apiKeyRecord.name}`);
  console.log(`User:       ${user.full_name} (${user.email})`);
  console.log(`Scopes:     ${apiKeyRecord.scopes.join(', ')}`);
  console.log(`Expires:    ${expiresAt ? expiresAt.toISOString() : 'Never'}`);
  console.log(`Created:    ${apiKeyRecord.created_at.toISOString()}`);
  console.log('');
  console.log(
    '⚠️  IMPORTANT: Copy this API key NOW - it will NOT be shown again!'
  );
  console.log('');
  console.log(`API Key: ${apiKey}`);
  console.log('');
  console.log('='.repeat(80));
  console.log('');
  console.log('Usage:');
  console.log(`  Authorization: Bearer ${apiKey}`);
  console.log('');
  console.log('Example (curl):');
  console.log(
    `  curl -H "Authorization: Bearer ${apiKey}" https://staging.ectropy.ai/api/admin/health`
  );
  console.log('');
  console.log('Example (n8n HTTP Request Node):');
  console.log('  Authentication: Generic Credential Type');
  console.log(`  Header Name: Authorization`);
  console.log(`  Header Value: Bearer ${apiKey}`);
  console.log('');

  return apiKey;
}

/**
 * Parse command line arguments
 */
function parseArgs(): ApiKeyOptions {
  const args = process.argv.slice(2);
  const options: Partial<ApiKeyOptions> = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];

    if (!key.startsWith('--')) {
      throw new Error(`Invalid argument: ${key}`);
    }

    const optionName = key.substring(2);

    switch (optionName) {
      case 'name':
        options.name = value;
        break;
      case 'email':
        options.email = value;
        break;
      case 'scopes':
        options.scopes = value.split(',').map((s) => s.trim());
        break;
      case 'expires':
        options.expiresInDays = parseInt(value, 10);
        if (isNaN(options.expiresInDays)) {
          throw new Error(`Invalid expires value: ${value}`);
        }
        break;
      default:
        throw new Error(`Unknown option: ${optionName}`);
    }
  }

  // Validate required options
  if (!options.name) {
    throw new Error('Missing required option: --name');
  }
  if (!options.email) {
    throw new Error('Missing required option: --email');
  }
  if (!options.scopes || options.scopes.length === 0) {
    throw new Error('Missing required option: --scopes');
  }

  return options as ApiKeyOptions;
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('');
    console.log('🔑 API Key Generation CLI');
    console.log('');

    const options = parseArgs();
    await createApiKey(options);

    console.log('✅ Done!');
    console.log('');
  } catch (error) {
    console.error('');
    console.error(
      '❌ ERROR:',
      error instanceof Error ? error.message : String(error)
    );
    console.error('');
    console.error('Usage:');
    console.error(
      '  ts-node scripts/generate-api-key.ts --name <name> --email <email> --scopes <scopes> [--expires <days>]'
    );
    console.error('');
    console.error('Example:');
    console.error(
      '  ts-node scripts/generate-api-key.ts --name "business-tools-n8n" --email "erik@luh.tech" --scopes "authorize_user,list_users,revoke_user,health_check"'
    );
    console.error('');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
