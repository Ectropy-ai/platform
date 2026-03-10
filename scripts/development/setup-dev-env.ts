#!/usr/bin/env node
/**
 * Development Environment Setup Script
 * Automated setup for Ectropy Platform development environment
 */

import { config } from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { randomBytes } from 'crypto';

// Console colors using ANSI escape codes
const colors = {
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  reset: '\x1b[0m',
};

interface ValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

class DevEnvironmentSetup {
  private readonly requiredSecrets = ['OPENAI_API_KEY'];

  private readonly optionalSecrets = [
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
  ];

  constructor() {
    console.log(
      colors.blue('🔧 Ectropy Platform - Development Environment Setup')
    );
    console.log(
      colors.blue('===================================================')
    );
  }

  async setup(): Promise<void> {
    try {
      console.log(colors.blue('🚀 Setting up development environment...\n'));

      // Step 1: Check for existing .env.local
      await this.ensureEnvLocal();

      // Step 2: Load environment variables
      this.loadEnvironment();

      // Step 3: Validate secrets
      const validation = await this.validateSecrets();

      if (!validation.valid) {
        await this.handleMissingSecrets(validation.missing);
        // Continue with available tests if not in production
        if (process.env.NODE_ENV !== 'production') {
          console.log(
            colors.yellow('\n⚠️  Continuing with available connection tests...')
          );
        } else {
          return;
        }
      }

      // Step 4: Test API connectivity
      await this.testConnections();

      // Step 5: Verify services
      await this.verifyServices();

      console.log(
        colors.green(
          '\n✅ Development environment setup completed successfully!'
        )
      );
      console.log(colors.blue('\n🚀 Next steps:'));
      console.log(colors.blue('   1. Start services: npm run docker:start'));
      console.log(colors.blue('   2. Start development: npm run dev'));
    } catch (error) {
      console.error(colors.red('❌ Development environment setup failed:'));
      console.error(
        colors.red(error instanceof Error ? error.message : String(error))
      );
      process.exit(1);
    }
  }

  private async ensureEnvLocal(): Promise<void> {
    if (!existsSync('.env.local')) {
      console.log(
        colors.yellow('📝 No .env.local found. Creating with defaults...')
      );
      await this.createEnvLocal();
    } else {
      console.log(colors.green('✅ Found existing .env.local'));
    }
  }

  private async createEnvLocal(): Promise<void> {
    const template = `# Ectropy Platform - Local Development Environment
# Generated: ${new Date().toISOString()}
# DO NOT COMMIT THIS FILE

# ============================================
# CRITICAL - REQUIRED FOR AI FEATURES
# ============================================
# Get your OpenAI API key from: https://platform.openai.com/api-keys
# OPENAI_API_KEY=sk-your-key-here

# ============================================
# INFRASTRUCTURE - LOCAL DEVELOPMENT
# ============================================
# These match docker-compose.local.yml services

# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=ectropy_dev
DATABASE_USER=ectropy
DATABASE_PASSWORD=dev_secure_db_2024
DATABASE_URL=postgresql://ectropy:\${DEV_DB_PASSWORD}@localhost:5432/ectropy_dev

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=dev_secure_redis_2024
REDIS_URL=redis://:dev_secure_redis_2024@localhost:6379

# JWT Secrets (auto-generated for development)
JWT_SECRET=${this.generateSecureSecret(64)}
JWT_REFRESH_SECRET=${this.generateSecureSecret(64)}

# Encryption
ENCRYPTION_KEY=${this.generateSecureSecret(32)}

# ============================================
# APPLICATION SETTINGS
# ============================================
NODE_ENV=development
PORT=4000
LOG_LEVEL=debug

# API Gateway
API_GATEWAY_PORT=4001

# MCP Server  
MCP_SERVER_PORT=3001

# Web Dashboard
WEB_DASHBOARD_PORT=4200

# ============================================
# BIM INTEGRATION (OPTIONAL)
# ============================================
SPECKLE_SERVER_URL=http://localhost:3000
SPECKLE_TOKEN=

# ============================================
# MONITORING & OBSERVABILITY
# ============================================
ENABLE_METRICS=true
METRICS_PORT=9090
HEALTH_CHECK_ENABLED=true

# ============================================
# FEATURE FLAGS
# ============================================
ENABLE_AI_AGENTS=true
ENABLE_BIM_PROCESSING=true
ENABLE_BLOCKCHAIN=false

# ============================================
# SECURITY SETTINGS
# ============================================
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
CORS_ORIGIN=http://localhost:4200,http://localhost:3000
`;

    writeFileSync('.env.local', template.trim());
    console.log(
      colors.green('✅ Created .env.local with development defaults')
    );
    console.log(
      colors.yellow('\n⚠️  IMPORTANT: Add your OPENAI_API_KEY to .env.local')
    );
    console.log(
      colors.blue(
        '   Get your API key from: https://platform.openai.com/api-keys'
      )
    );
  }

  private generateSecureSecret(length: number = 32): string {
    return randomBytes(length).toString('hex');
  }

  private loadEnvironment(): void {
    // Load .env.local first, then other env files
    config({ path: '.env.local' });
    config({ path: '.env.development' });
    config({ path: '.env' });
  }

  private async validateSecrets(): Promise<ValidationResult> {
    console.log(colors.blue('🔍 Validating secret configuration...'));

    const missing: string[] = [];
    const warnings: string[] = [];

    // Check required secrets
    this.requiredSecrets.forEach((secret) => {
      const value = process.env[secret];
      if (!value || value.trim() === '') {
        missing.push(secret);
      } else {
        // Validate secret format if we have existing validation
        try {
          const isValid = this.validateSecretFormat(secret, value);
          if (!isValid) {
            warnings.push(`${secret}: Invalid format`);
          }
        } catch (error) {
          warnings.push(`${secret}: Validation failed - ${error}`);
        }
      }
    });

    // Check optional secrets
    this.optionalSecrets.forEach((secret) => {
      const value = process.env[secret];
      if (!value || value.trim() === '') {
        warnings.push(`${secret}: Not configured (optional)`);
      }
    });

    // Display results
    if (missing.length === 0 && warnings.length === 0) {
      console.log(colors.green('✅ All secrets validated successfully'));
    } else {
      if (warnings.length > 0) {
        console.log(colors.yellow('\n⚠️  Validation warnings:'));
        warnings.forEach((warning) => {
          console.log(colors.yellow(`   - ${warning}`));
        });
      }
    }

    return {
      valid: missing.length === 0,
      missing,
      warnings,
    };
  }

  private validateSecretFormat(key: string, value: string): boolean {
    switch (key) {
      case 'OPENAI_API_KEY':
        return /^sk-[a-zA-Z0-9]{40,}$/.test(value);
      case 'JWT_SECRET':
      case 'JWT_REFRESH_SECRET':
        return value.length >= 32;
      case 'DATABASE_URL':
        return /^postgresql:\/\/.+$/.test(value);
      case 'REDIS_URL':
        return /^redis:\/\/.+$/.test(value);
      default:
        return true;
    }
  }

  private async handleMissingSecrets(missing: string[]): Promise<void> {
    console.error(colors.red('\n❌ Missing required secrets:'));
    missing.forEach((secret) => {
      console.error(colors.red(`   - ${secret}`));
    });

    console.log(colors.yellow('\n📋 Secret Setup Instructions:'));

    if (missing.includes('OPENAI_API_KEY')) {
      console.log(colors.yellow('\n🔑 OpenAI API Key:'));
      console.log(
        colors.yellow('   1. Visit: https://platform.openai.com/api-keys')
      );
      console.log(colors.yellow('   2. Create a new API key'));
      console.log(
        colors.yellow('   3. Add to .env.local: OPENAI_API_KEY=sk-...')
      );
    }

    console.log(colors.yellow('\n🔄 After adding secrets, re-run:'));
    console.log(colors.yellow('   npm run setup:dev'));

    console.log(colors.blue('\n💡 Alternative: Use sync-secrets script:'));
    console.log(colors.blue('   tsx scripts/sync-secrets.ts'));

    // In development, don't exit with error - just warn
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    } else {
      console.log(
        colors.yellow('\n⚠️  Continuing with partial setup for development...')
      );
    }
  }

  private async testConnections(): Promise<void> {
    console.log(colors.blue('\n🔍 Testing API connections...'));

    // Test OpenAI API if key is present
    if (process.env.OPENAI_API_KEY) {
      await this.testOpenAIConnection();
    } else {
      console.log(
        colors.yellow('⚠️  Skipping OpenAI test - API key not configured')
      );
    }

    // Test database connection if configured
    if (process.env.DATABASE_URL) {
      await this.testDatabaseConnection();
    }

    // Test Redis connection if configured
    if (process.env.REDIS_URL) {
      await this.testRedisConnection();
    }
  }

  private async testOpenAIConnection(): Promise<void> {
    try {
      console.log(colors.blue('🔍 Testing OpenAI API connection...'));

      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'User-Agent': 'Ectropy-Platform/1.0',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error(
            'Invalid OpenAI API key - check your .env.local file'
          );
        } else if (response.status === 429) {
          console.log(
            colors.yellow(
              '⚠️  OpenAI API rate limited - connection OK but hitting limits'
            )
          );
          return;
        } else {
          throw new Error(
            `OpenAI API error: ${response.status} ${response.statusText}`
          );
        }
      }

      const data = await response.json();
      const modelCount = data.data ? data.data.length : 0;
      console.log(
        colors.green(
          `✅ OpenAI API connection successful (${modelCount} models available)`
        )
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log(
          colors.yellow(
            '⚠️  OpenAI API connection timeout - check internet connection'
          )
        );
      } else {
        console.error(colors.red(`❌ OpenAI API connection failed: ${error}`));
        throw error;
      }
    }
  }

  private async testDatabaseConnection(): Promise<void> {
    try {
      console.log(colors.blue('🔍 Testing database connection...'));

      // Simple connection test using pg
      const { Client } = await import('pg');
      const client = new Client({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 5000,
      });

      await client.connect();
      const result = await client.query('SELECT version()');
      await client.end();

      console.log(colors.green('✅ Database connection successful'));
    } catch (error) {
      console.log(
        colors.yellow(
          '⚠️  Database connection failed - this is OK for initial setup'
        )
      );
      console.log(
        colors.yellow('   Run "npm run docker:start" to start local database')
      );
    }
  }

  private async testRedisConnection(): Promise<void> {
    try {
      console.log(colors.blue('🔍 Testing Redis connection...'));

      // Simple Redis connection test with shorter timeout
      const redis = await import('ioredis');
      const client = new redis.Redis(process.env.REDIS_URL, {
        connectTimeout: 2000, // Shorter timeout
        lazyConnect: true,
        maxRetriesPerRequest: 1, // Don't retry
        retryDelayOnFailover: 0,
      });

      // Suppress error logging for Redis connection test
      client.on('error', () => {}); // Ignore errors

      await client.ping();
      await client.disconnect();

      console.log(colors.green('✅ Redis connection successful'));
    } catch (error) {
      console.log(
        colors.yellow(
          '⚠️  Redis connection failed - this is OK for initial setup'
        )
      );
      console.log(
        colors.yellow('   Run "npm run docker:start" to start local Redis')
      );
    }
  }

  private async verifyServices(): Promise<void> {
    console.log(colors.blue('\n🔍 Verifying service configuration...'));

    // Check if Docker is available
    try {
      execSync('docker --version', { stdio: 'ignore' });
      console.log(colors.green('✅ Docker available'));

      // Check if docker-compose files exist
      const composeFiles = [
        'docker-compose.local.yml',
        'docker-compose.yml',
        'docker-compose.development.yml',
      ];

      const availableComposeFiles = composeFiles.filter((file) =>
        existsSync(file)
      );

      if (availableComposeFiles.length > 0) {
        console.log(
          colors.green(
            `✅ Docker Compose files available: ${availableComposeFiles.join(', ')}`
          )
        );
      } else {
        console.log(colors.yellow('⚠️  No Docker Compose files found'));
      }
    } catch (error) {
      console.log(
        colors.yellow(
          '⚠️  Docker not available - some services may need manual setup'
        )
      );
    }

    // Verify nx configuration
    if (existsSync('nx.json')) {
      console.log(colors.green('✅ Nx workspace configured'));
    }

    // Check package.json scripts
    try {
      const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
      const hasDevScripts = [
        'serve:api-gateway',
        'serve:web-dashboard',
        'serve:mcp-server',
      ].every((script) => packageJson.scripts[script]);

      if (hasDevScripts) {
        console.log(colors.green('✅ Development scripts configured'));
      } else {
        console.log(
          colors.yellow('⚠️  Some development scripts may be missing')
        );
      }
    } catch (error) {
      console.log(colors.yellow('⚠️  Could not verify package.json scripts'));
    }
  }

  async troubleshoot(): Promise<void> {
    console.log(colors.blue('\n🔧 Development Environment Troubleshooting'));
    console.log(colors.blue('============================================\n'));

    // Check Node.js version
    const nodeVersion = process.version;
    console.log(colors.blue(`Node.js version: ${nodeVersion}`));

    if (parseInt(nodeVersion.slice(1)) < 20) {
      console.log(colors.red('❌ Node.js 20+ required. Please upgrade.'));
    } else {
      console.log(colors.green('✅ Node.js version OK'));
    }

    // Check pnpm
    try {
      const pnpmVersion = execSync('pnpm --version', {
        encoding: 'utf8',
      }).trim();
      console.log(colors.green(`✅ pnpm version: ${pnpmVersion}`));
    } catch (error) {
      console.log(colors.red('❌ pnpm not found. Run: corepack enable'));
    }

    // Check environment files
    const envFiles = ['.env.local', '.env.development', '.env.example'];
    envFiles.forEach((file) => {
      if (existsSync(file)) {
        console.log(colors.green(`✅ ${file} exists`));
      } else {
        console.log(colors.yellow(`⚠️  ${file} missing`));
      }
    });

    // Check for common issues
    this.loadEnvironment();

    if (!process.env.OPENAI_API_KEY) {
      console.log(colors.red('\n❌ OPENAI_API_KEY not configured'));
      console.log(
        colors.yellow(
          '   Solution: Add to .env.local or run tsx scripts/sync-secrets.ts'
        )
      );
    }

    if (!process.env.DATABASE_URL) {
      console.log(colors.yellow('\n⚠️  DATABASE_URL not configured'));
      console.log(
        colors.yellow(
          '   Solution: Start local database with npm run docker:start'
        )
      );
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'setup';

  const devSetup = new DevEnvironmentSetup();

  try {
    switch (command) {
      case 'setup':
        await devSetup.setup();
        break;

      case 'troubleshoot':
        await devSetup.troubleshoot();
        break;

      default:
        console.log(
          colors.yellow(`
Usage: tsx scripts/setup-dev-env.ts [command]

Commands:
  setup        Set up development environment (default)
  troubleshoot Diagnose development environment issues

Examples:
  tsx scripts/setup-dev-env.ts
  tsx scripts/setup-dev-env.ts troubleshoot
`)
        );
        break;
    }
  } catch (error) {
    console.error(colors.red('❌ Operation failed:'));
    console.error(
      colors.red(error instanceof Error ? error.message : String(error))
    );
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { DevEnvironmentSetup };
