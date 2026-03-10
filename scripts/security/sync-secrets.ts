#!/usr/bin/env node
/**
 * Enterprise Secret Synchronization Script
 * Securely syncs secrets from GitHub and manages local environment
 */

import { execSync } from 'child_process';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { z } from 'zod';
import * as path from 'path';

// Console colors using ANSI escape codes
const colors = {
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  reset: '\x1b[0m'
};

const SECRET_SCHEMA = z.object({
  OPENAI_API_KEY: z.string().min(20).startsWith('sk-').describe('OpenAI API key for AI features').optional(),
  REDIS_PASSWORD: z.string().optional().describe('Redis authentication password'),
  JWT_SECRET: z.string().min(32).optional().describe('JWT token signing secret'),
  DATABASE_URL: z.string().url().optional().describe('PostgreSQL connection URL'),
  JWT_REFRESH_SECRET: z.string().min(32).optional().describe('JWT refresh token secret'),
  ENCRYPTION_KEY: z.string().min(32).optional().describe('Application encryption key')
});

interface GitHubSecret {
  name: string;
  created_at: string;
  updated_at: string;
}

interface EncryptedPayload {
  iv: string;
  authTag: string;
  encrypted: string;
  timestamp: number;
}

class SecretManager {
  private readonly envPath = '.env.local';
  private readonly encryptedPath = '.env.local.enc';
  private readonly algorithm = 'aes-256-gcm';
  
  constructor() {
    console.log(colors.blue('🔐 Enterprise Secret Manager - Ectropy Platform'));
    console.log(colors.blue('=================================================='));
  }

  async syncFromGitHub(): Promise<void> {
    try {
      console.log(colors.blue('🔍 Checking GitHub CLI authentication...'));
      
      // Check GitHub CLI authentication
      this.checkGitHubAuth();
      
      console.log(colors.green('✅ GitHub CLI authenticated'));
      
      // Fetch available secrets
      const availableSecrets = await this.fetchAvailableSecrets();
      console.log(colors.blue(`📋 Found ${availableSecrets.length} available secrets`));
      
      // Create development environment with secure defaults
      await this.createDevelopmentEnvironment(availableSecrets);
      
      console.log(colors.green('✅ Secret synchronization completed successfully'));
      
    } catch (error) {
      console.error(colors.red('❌ Secret synchronization failed:'));
      console.error(colors.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  }
  
  private checkGitHubAuth(): void {
    try {
      execSync('gh auth status', { stdio: 'ignore' });
    } catch {
      throw new Error(`GitHub CLI not authenticated. Please run:
  ${colors.yellow('gh auth login')}
  
Then re-run this script.`);
    }
  }
  
  private async fetchAvailableSecrets(): Promise<GitHubSecret[]> {
    try {
      // Get repository info
      const repoInfo = execSync('gh repo view --json owner,name', { encoding: 'utf8' });
      const { owner, name } = JSON.parse(repoInfo);
      
      console.log(colors.blue(`🔍 Checking secrets for ${owner.login}/${name}...`));
      
      // Fetch secrets list (values are not accessible for security)
      const secretsListOutput = execSync(
        `gh api repos/${owner.login}/${name}/actions/secrets`,
        { encoding: 'utf8' }
      );
      
      const { secrets } = JSON.parse(secretsListOutput);
      return secrets;
      
    } catch (error) {
      throw new Error(`Failed to fetch GitHub secrets. You may need repository access.
Contact the repository administrator for access to secrets.`);
    }
  }
  
  private async createDevelopmentEnvironment(availableSecrets: GitHubSecret[]): Promise<void> {
    console.log(colors.blue('📝 Creating development environment configuration...'));
    
    const existingEnv = this.readExistingEnv();
    const requiredSecrets = Object.keys(SECRET_SCHEMA.shape);
    
    // Check which secrets are available in GitHub
    const availableSecretNames = availableSecrets.map(s => s.name);
    const missingSecrets = requiredSecrets.filter(key => 
      !availableSecretNames.includes(key) && !existingEnv[key]
    );
    
    if (missingSecrets.length > 0) {
      console.log(colors.yellow('⚠️  Missing secrets in GitHub:'));
      missingSecrets.forEach(secret => {
        console.log(colors.yellow(`   - ${secret}`));
      });
    }
    
    // Create .env.local with available information
    const envContent = this.generateEnvContent(existingEnv, availableSecretNames);
    writeFileSync(this.envPath, envContent);
    
    console.log(colors.green(`✅ Created/updated ${this.envPath}`));
    
    // Provide instructions for missing secrets
    if (missingSecrets.includes('OPENAI_API_KEY')) {
      console.log(colors.red('\n🚨 CRITICAL: OPENAI_API_KEY is required for AI features'));
      console.log(colors.yellow('📋 To add OpenAI API key:'));
      console.log(colors.yellow('   1. Get your API key from: https://platform.openai.com/api-keys'));
      console.log(colors.yellow('   2. Contact repository admin to add it to GitHub Secrets'));
      console.log(colors.yellow('   3. Or manually add to .env.local: OPENAI_API_KEY=sk-...'));
    }
  }
  
  private readExistingEnv(): Record<string, string> {
    if (!existsSync(this.envPath)) {
      return {};
    }
    
    try {
      const content = readFileSync(this.envPath, 'utf8');
      const env: Record<string, string> = {};
      
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length > 0) {
            env[key.trim()] = valueParts.join('=').trim();
          }
        }
      });
      
      return env;
    } catch {
      return {};
    }
  }
  
  private generateEnvContent(existingEnv: Record<string, string>, availableSecrets: string[]): string {
    const timestamp = new Date().toISOString();
    
    let content = `# Ectropy Platform - Local Development Environment
# Generated by scripts/sync-secrets.ts at ${timestamp}
# DO NOT COMMIT THIS FILE - Contains development secrets

# === CRITICAL SECRETS ===
# These are required for core platform functionality

`;

    // Add OPENAI_API_KEY with guidance
    if (existingEnv.OPENAI_API_KEY) {
      content += `# OpenAI API Key (REQUIRED for AI features)\nOPENAI_API_KEY=${existingEnv.OPENAI_API_KEY}\n\n`;
    } else if (availableSecrets.includes('OPENAI_API_KEY')) {
      content += `# OpenAI API Key (Available in GitHub Secrets - contact admin for access)\n# OPENAI_API_KEY=sk-...\n\n`;
    } else {
      content += `# OpenAI API Key (REQUIRED - Get from https://platform.openai.com/api-keys)\n# OPENAI_API_KEY=sk-...\n\n`;
    }
    
    // Add other secrets with appropriate defaults or placeholders
    content += `# === INFRASTRUCTURE SECRETS ===
# These have secure defaults for local development

`;
    
    // JWT secrets
    if (existingEnv.JWT_SECRET) {
      content += `JWT_SECRET=${existingEnv.JWT_SECRET}\n`;
    } else {
      content += `JWT_SECRET=${this.generateSecureSecret(64)}\n`;
    }
    
    if (existingEnv.JWT_REFRESH_SECRET) {
      content += `JWT_REFRESH_SECRET=${existingEnv.JWT_REFRESH_SECRET}\n`;
    } else {
      content += `JWT_REFRESH_SECRET=${this.generateSecureSecret(64)}\n`;
    }
    
    // Database configuration
    content += `
# === DATABASE CONFIGURATION ===
# Local development defaults (matches docker-compose.local.yml)

DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=ectropy_dev
DATABASE_USER=ectropy
DATABASE_PASSWORD=${existingEnv.DATABASE_PASSWORD || 'dev_secure_db_2024'}
DATABASE_URL=${existingEnv.DATABASE_URL || 'postgresql://ectropy:dev_secure_db_2024@localhost:5432/ectropy_dev'}

`;

    // Redis configuration
    content += `# === REDIS CONFIGURATION ===
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=${existingEnv.REDIS_PASSWORD || 'dev_secure_redis_2024'}
REDIS_URL=redis://:dev_secure_redis_2024@localhost:6379

`;

    // Environment and other settings
    content += `# === ENVIRONMENT SETTINGS ===
NODE_ENV=development
PORT=4000
LOG_LEVEL=debug

# === ENCRYPTION ===
ENCRYPTION_KEY=${existingEnv.ENCRYPTION_KEY || this.generateSecureSecret(32)}

# === BIM INTEGRATION ===  
# Speckle integration (optional for local development)
SPECKLE_SERVER_URL=http://localhost:3000
SPECKLE_TOKEN=

# === MONITORING ===
ENABLE_METRICS=true
METRICS_PORT=9090
`;

    return content;
  }
  
  private generateSecureSecret(length: number = 32): string {
    return randomBytes(length).toString('hex');
  }
  
  async validateSecrets(): Promise<void> {
    console.log(colors.blue('🔍 Validating secret configuration...'));
    
    if (!existsSync(this.envPath)) {
      if (process.env.CI) {
        console.log('CI environment detected, skipping .env.local validation');
        return;
      }
      throw new Error('.env.local not found. Run sync first.');
    }
    
    const env = this.readExistingEnv();
    
    try {
      // Validate using existing schema
      const validation = SECRET_SCHEMA.safeParse(env);
      
      let hasErrors = false;
      
      if (!validation.success) {
        console.log(colors.yellow('⚠️  Validation issues found:'));
        validation.error.issues.forEach(issue => {
          console.log(colors.yellow(`   - ${issue.path.join('.')}: ${issue.message}`));
          // Only treat missing OpenAI key as error, others as warnings
          if (issue.path.includes('OPENAI_API_KEY') && issue.code === 'invalid_type') {
            hasErrors = true;
          }
        });
      } else {
        console.log(colors.green('✅ All required secrets validated'));
      }
      
      // Test OpenAI API if key is present
      if (env.OPENAI_API_KEY) {
        await this.testOpenAIConnection(env.OPENAI_API_KEY);
      } else {
        console.log(colors.yellow('⚠️  OPENAI_API_KEY not set - AI features will not work'));
        // Don't treat missing OpenAI key as fatal error in development
        if (process.env.NODE_ENV === 'production') {
          hasErrors = true;
        }
      }
      
      if (hasErrors && process.env.NODE_ENV === 'production') {
        throw new Error('Critical validation failures in production environment');
      }
      
    } catch (error) {
      throw new Error(`Secret validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  private async testOpenAIConnection(apiKey: string): Promise<void> {
    console.log(colors.blue('🔍 Testing OpenAI API connection...'));
    
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'User-Agent': 'Ectropy-Platform/1.0'
        },
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Invalid OpenAI API key');
        } else if (response.status === 429) {
          throw new Error('OpenAI API rate limit exceeded');
        } else {
          throw new Error(`OpenAI API returned ${response.status}: ${response.statusText}`);
        }
      }
      
      const data = await response.json();
      const modelCount = data.data ? data.data.length : 0;
      
      console.log(colors.green(`✅ OpenAI API connection successful (${modelCount} models available)`));
      
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('OpenAI API connection timeout - check your internet connection');
      }
      throw error;
    }
  }
  
  async generateSecureConfig(): Promise<void> {
    console.log(colors.blue('🔐 Generating secure production configuration template...'));
    
    const secureConfig = `# Ectropy Platform - Production Secret Template
# Generated: ${new Date().toISOString()}
# IMPORTANT: Replace all placeholder values with actual secrets

# === CRITICAL PRODUCTION SECRETS ===
OPENAI_API_KEY=\${OPENAI_API_KEY}
JWT_SECRET=\${JWT_SECRET}
JWT_REFRESH_SECRET=\${JWT_REFRESH_SECRET}
ENCRYPTION_KEY=\${ENCRYPTION_KEY}

# === DATABASE (Production) ===
DATABASE_URL=\${DATABASE_URL}
POSTGRES_PASSWORD=\${POSTGRES_PASSWORD}

# === REDIS (Production) ===
REDIS_URL=\${REDIS_URL}
REDIS_PASSWORD=\${REDIS_PASSWORD}

# === SPECKLE INTEGRATION ===
SPECKLE_SERVER_URL=\${SPECKLE_SERVER_URL}
SPECKLE_TOKEN=\${SPECKLE_TOKEN}
SPECKLE_POSTGRES_PASSWORD=\${SPECKLE_POSTGRES_PASSWORD}
SPECKLE_REDIS_PASSWORD=\${SPECKLE_REDIS_PASSWORD}
SPECKLE_SESSION_SECRET=\${SPECKLE_SESSION_SECRET}

# === ENVIRONMENT ===
NODE_ENV=production
LOG_LEVEL=info
ENABLE_METRICS=true
`;

    writeFileSync('.env.production.template', secureConfig);
    console.log(colors.green('✅ Created .env.production.template'));
    console.log(colors.blue('📋 Use this template for production deployment'));
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'sync';
  
  const secretManager = new SecretManager();
  
  try {
    switch (command) {
      case 'sync':
        await secretManager.syncFromGitHub();
        await secretManager.validateSecrets();
        break;
        
      case 'validate':
        await secretManager.validateSecrets();
        break;
        
      case 'generate':
        await secretManager.generateSecureConfig();
        break;
        
      default:
        console.log(colors.yellow(`
Usage: tsx scripts/sync-secrets.ts [command]

Commands:
  sync      Sync secrets from GitHub and create/update .env.local (default)
  validate  Validate existing secret configuration
  generate  Generate production configuration template

Examples:
  tsx scripts/sync-secrets.ts
  tsx scripts/sync-secrets.ts validate
  tsx scripts/sync-secrets.ts generate
`));
        break;
    }
    
  } catch (error) {
    console.error(colors.red('❌ Operation failed:'));
    console.error(colors.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { SecretManager };