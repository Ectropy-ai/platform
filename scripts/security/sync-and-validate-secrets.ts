#!/usr/bin/env tsx

/**
 * Enterprise Secret Management System - Complete Rewrite
 *
 * Implements robust secret management with multiple source fallbacks:
 * 1. GitHub secrets (with proper auth check)
 * 2. Environment variables
 * 3. Development defaults
 * 4. FAIL LOUDLY if required secrets missing
 */

import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import * as crypto from 'crypto';

interface SecretSource {
  github?: string;
  envVar?: string;
  default?: string;
  required: boolean;
  description: string;
  validator?: (value: string) => Promise<boolean>;
}

const SECRET_CONFIG: Record<string, SecretSource> = {
  // =============================================================================
  // CORE APPLICATION SETTINGS  
  // =============================================================================
  NODE_ENV: {
    default: 'development',
    required: true,
    description: 'Application environment'
  },
  PORT: {
    default: '4000',
    required: true,
    description: 'Main application port'
  },
  API_PORT: {
    default: '4000',
    required: true,
    description: 'API Gateway port'
  },
  MCP_PORT: {
    default: '3001',
    required: true,
    description: 'MCP server port'
  },
  WEB_PORT: {
    default: '4200',
    required: true,
    description: 'Web dashboard port'
  },

  // =============================================================================
  // SERVICE URLS
  // =============================================================================
  API_URL: {
    default: 'http://localhost:4000',
    required: true,
    description: 'API Gateway URL'
  },
  FRONTEND_URL: {
    default: 'http://localhost:4200',
    required: true,
    description: 'Frontend URL'
  },
  MCP_URL: {
    default: 'http://localhost:3001',
    required: true,
    description: 'MCP server URL'
  },

  // =============================================================================
  // CORS CONFIGURATION
  // =============================================================================
  CORS_ORIGINS: {
    default: 'http://localhost:4200,http://localhost:3000',
    required: true,
    description: 'CORS allowed origins'
  },

  // =============================================================================
  // DATABASE CONFIGURATION
  // =============================================================================
  DATABASE_URL: {
    default: 'postgresql://postgres:postgres@localhost:5432/ectropy_dev',
    required: true,
    description: 'PostgreSQL database connection URL',
    validator: async (value: string) => {
      try {
        const url = new URL(value);
        return url.protocol === 'postgresql:' && url.hostname.length > 0;
      } catch {
        return false;
      }
    }
  },
  DATABASE_HOST: {
    default: 'localhost',
    required: true,
    description: 'Database host'
  },
  DATABASE_PORT: {
    default: '5432',
    required: true,
    description: 'Database port'
  },
  DATABASE_NAME: {
    default: 'ectropy_dev',
    required: true,
    description: 'Database name'
  },
  DATABASE_USER: {
    default: 'postgres',
    required: true,
    description: 'Database username'
  },
  DATABASE_PASSWORD: {
    default: 'postgres',
    required: true,
    description: 'Database password'
  },
  JWT_SECRET: {
    github: 'JWT_SECRET',
    default: crypto.randomBytes(32).toString('hex'),
    required: true,
    description: 'JWT token signing secret',
    validator: async (value: string) => value.length >= 32
  },
  JWT_REFRESH_SECRET: {
    github: 'JWT_REFRESH_SECRET', 
    default: crypto.randomBytes(32).toString('hex'),
    required: true,
    description: 'JWT refresh token secret',
    validator: async (value: string) => value.length >= 32
  },
  SESSION_SECRET: {
    github: 'SESSION_SECRET',
    default: crypto.randomBytes(32).toString('hex'),
    required: true,
    description: 'Session encryption secret',
    validator: async (value: string) => value.length >= 32
  },
  OPENAI_API_KEY: {
    github: 'OPENAI_API_KEY',
    envVar: 'OPENAI_API_KEY',
    default: 'sk-your-key-here',
    required: false,
    description: 'OpenAI API key for AI functionality (optional for development)',
    validator: async (value: string) => {
      // Allow placeholder value for development
      if (value === 'sk-your-key-here') return true;
      return value.startsWith('sk-') && value.length > 20;
    }
  },
  REDIS_URL: {
    default: 'redis://localhost:6379',
    required: true,
    description: 'Redis connection URL',
    validator: async (value: string) => {
      try {
        const url = new URL(value);
        return url.protocol === 'redis:' && url.hostname.length > 0;
      } catch {
        return false;
      }
    }
  },
  REDIS_HOST: {
    default: 'localhost',
    required: true,
    description: 'Redis host'
  },
  REDIS_PORT: {
    default: '6379',
    required: true,
    description: 'Redis port'
  }
};

class EnterpriseSecretManager {
  private readonly envPath = '.env.local';
  private readonly auditPath = '.secret-audit.json';

  constructor() {
    console.log('🔐 Enterprise Secret Manager - Ectropy Platform');
    console.log('==================================================\n');
  }

  private checkGitHubAuth(): boolean {
    try {
      execSync('gh auth status', { stdio: 'pipe' });
      return true;
    } catch {
      console.log('⚠️  GitHub CLI not authenticated - will use fallbacks');
      return false;
    }
  }

  private async getSecretValue(name: string, config: SecretSource): Promise<{value: string, source: string}> {
    // Try GitHub secrets first
    if (config.github && this.checkGitHubAuth()) {
      try {
        const value = execSync(`gh secret get ${config.github}`, {
          encoding: 'utf-8',
          stdio: 'pipe',
        }).trim();
        if (value) {
          return { value, source: 'github' };
        }
      } catch (error) {
        console.log(`⚠️  GitHub secret ${config.github} not found`);
      }
    }

    // Try environment variables
    if (config.envVar && process.env[config.envVar]) {
      return { value: process.env[config.envVar]!, source: 'environment' };
    }

    // Use default if available
    if (config.default) {
      return { value: config.default, source: 'default' };
    }

    // If required and no value found, fail
    if (config.required) {
      throw new Error(`Required secret ${name} not found in any source`);
    }

    throw new Error(`Optional secret ${name} not found`);
  }

  async syncSecrets(): Promise<void> {
    console.log('🔍 Syncing secrets from multiple sources...\n');

    const envContent: string[] = [];
    const errors: string[] = [];
    const auditEntries: any[] = [];

    for (const [name, config] of Object.entries(SECRET_CONFIG)) {
      const auditEntry = {
        name,
        description: config.description,
        required: config.required,
        timestamp: new Date().toISOString(),
        status: 'unknown',
        source: 'unknown',
      };

      try {
        const { value, source } = await this.getSecretValue(name, config);
        
        console.log(`📥 Retrieved ${name} from ${source}`);
        
        // Validate if validator exists
        if (config.validator) {
          console.log(`🧪 Validating ${name}...`);
          const isValid = await config.validator(value);
          if (!isValid) {
            const error = `${name} validation failed`;
            errors.push(error);
            auditEntry.status = 'validation_error';
            auditEntry.error_message = error;
            auditEntries.push(auditEntry);
            continue;
          }
          console.log(`✅ ${name} validation passed`);
        }

        envContent.push(`${name}=${value}`);
        auditEntry.status = 'success';
        auditEntry.source = source;
        console.log(`✅ ${name} synchronized and validated\n`);

      } catch (error: any) {
        const errorMessage = `❌ ${error.message}`;
        console.error(errorMessage);
        errors.push(errorMessage);
        auditEntry.status = 'error';
        auditEntry.error_message = error.message;
      }

      auditEntries.push(auditEntry);
    }

    // Write audit log
    const auditReport = {
      timestamp: new Date().toISOString(),
      total_secrets: Object.keys(SECRET_CONFIG).length,
      processed: auditEntries.length,
      successful: auditEntries.filter((e) => e.status === 'success').length,
      errors: errors.length,
      entries: auditEntries,
    };

    writeFileSync(this.auditPath, JSON.stringify(auditReport, null, 2));

    if (errors.length > 0) {
      console.error('\n🚨 Secret synchronization failed:');
      errors.forEach(error => console.error(`   ${error}`));
      console.error('\n💡 Possible solutions:');
      console.error('   1. Set OPENAI_API_KEY environment variable');
      console.error('   2. Authenticate with GitHub: gh auth login');
      console.error('   3. Add secrets to GitHub repository settings');
      throw new Error(`Secret synchronization failed with ${errors.length} errors`);
    }

    // Write .env.local file
    const envFileContent = [
      '# Ectropy Platform Environment Variables',
      `# Generated on ${new Date().toISOString()}`,
      '# DO NOT COMMIT THIS FILE',
      '',
      ...envContent,
      ''
    ].join('\n');

    writeFileSync(this.envPath, envFileContent);
    console.log(`\n✅ Successfully created ${this.envPath} with ${envContent.length} secrets`);
    console.log(`📊 Audit report saved to ${this.auditPath}`);
    
    // Report sources used
    console.log('\n📋 Sources used:');
    auditEntries.filter(e => e.status === 'success').forEach(entry => {
      console.log(`   ${entry.name}: ${entry.source}`);
    });
  }

  async validateExistingSecrets(): Promise<boolean> {
    console.log('🔍 Validating existing secret configuration...\n');

    if (!existsSync(this.envPath)) {
      console.error(`❌ ${this.envPath} not found. Run sync first.`);
      return false;
    }

    const content = readFileSync(this.envPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.includes('=') && !line.startsWith('#'));
    
    const existingSecrets = new Map<string, string>();
    lines.forEach(line => {
      const [key, ...valueParts] = line.split('=');
      existingSecrets.set(key.trim(), valueParts.join('='));
    });

    let allValid = true;
    const errors: string[] = [];

    for (const [name, config] of Object.entries(SECRET_CONFIG)) {
      if (config.required && !existingSecrets.has(name)) {
        errors.push(`Required secret ${name} missing from ${this.envPath}`);
        allValid = false;
        continue;
      }

      const value = existingSecrets.get(name);
      if (value && config.validator) {
        const isValid = await config.validator(value);
        if (!isValid) {
          errors.push(`Secret ${name} failed validation`);
          allValid = false;
        } else {
          console.log(`✅ ${name} is valid`);
        }
      }
    }

    if (!allValid) {
      console.error('\n🚨 Validation errors:');
      errors.forEach(error => console.error(`   ${error}`));
    } else {
      console.log('\n✅ All secrets are valid');
    }

    return allValid;
  }
}

// CLI interface
async function main(): Promise<void> {
  const manager = new EnterpriseSecretManager();
  const command = process.argv[2] || 'sync';

  try {
    switch (command) {
      case 'sync':
        await manager.syncSecrets();
        break;

      case 'validate':
        const isValid = await manager.validateExistingSecrets();
        process.exit(isValid ? 0 : 1);
        break;

      default:
        console.log(
          'Usage: sync-and-validate-secrets.ts [sync|validate]'
        );
        process.exit(1);
    }
  } catch (error: any) {
    console.error('❌ Operation failed:', error.message);
    process.exit(1);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { EnterpriseSecretManager, SECRET_CONFIG };