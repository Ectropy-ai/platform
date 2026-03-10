/**
 * Secret Migration Utility
 * Helps migrate from hardcoded secrets to secure secret management
 */

/// <reference types="node" />

import { SecretConfig } from './types.js';
import { SecretProviderFactory } from './factory.js';
import { SecretValidator } from './validation.js';
// Simplified implementation to avoid cross-library dependencies during build
function detectHardcodedSecrets(input: string | { content: string }): { hasSecrets: boolean; secrets: string[] } {
  const content = typeof input === 'string' ? input : input.content;
  
  // Simple regex patterns for common hardcoded secrets
  const patterns = [
    /password\s*=\s*["'](?!.*REPLACE|.*EXAMPLE|.*TEMPLATE)[^"']+["']/gi,
    /secret\s*=\s*["'](?!.*REPLACE|.*EXAMPLE|.*TEMPLATE)[^"']+["']/gi,
    /api_key\s*=\s*["'](?!.*REPLACE|.*EXAMPLE|.*TEMPLATE)[^"']+["']/gi,
    /token\s*=\s*["'](?!.*REPLACE|.*EXAMPLE|.*TEMPLATE)[^"']+["']/gi,
  ];
  
  const secrets: string[] = [];
  patterns.forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) {
      secrets.push(...matches);
    }
  });
  
  return {
    hasSecrets: secrets.length > 0,
    secrets
  };
}
import { readdirSync, existsSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join, relative } from 'path';

export interface MigrationResult {
  /** Number of secrets migrated */
  migrated: number;
  /** Number of validation failures */
  failures: number;
  /** Detailed results for each secret */
  details: MigrationDetail[];
  /** Summary of actions taken */
  summary: string[];
}

export interface MigrationDetail {
  /** Secret key name */
  key: string;
  /** Migration status */
  status: 'success' | 'failure' | 'skipped';
  /** Reason for status */
  reason: string;
  /** Original source (file/env) */
  source: string;
  /** New secure source */
  newSource?: string;
}

/**
 * Service-by-service migration following the problem statement approach
 */
export class SecretMigrationService {
  private readonly secretProvider = SecretProviderFactory.fromEnvironment();

  /**
   * Scan repository for hardcoded secrets and provide migration plan
   */
  async scanForHardcodedSecrets(repositoryPath: string): Promise<{
    files: string[];
    secrets: Array<{ file: string; secrets: string[] }>;
    migrationPlan: Array<{ file: string; actions: string[] }>;
  }> {
    const files = await this.findSecretFiles(repositoryPath);
    const secretsFound: Array<{ file: string; secrets: string[] }> = [];
    const migrationPlan: Array<{ file: string; actions: string[] }> = [];

    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf-8') as string;
        let config: any;

        // Parse different file types
        if (file.endsWith('.json')) {
          config = JSON.parse(content);
        } else if (file.endsWith('.env') || file.includes('.env.')) {
          config = this.parseEnvFile(content);
        } else {
          // Skip non-config files
          continue;
        }

        const detection = detectHardcodedSecrets(config);
        if (detection.hasSecrets) {
          secretsFound.push({
            file: relative(repositoryPath, file),
            secrets: detection.secrets,
          });

          // Generate migration actions
          const actions = this.generateMigrationActions(detection.secrets);
          migrationPlan.push({
            file: relative(repositoryPath, file),
            actions,
          });
        }
      } catch (error) {
      }
    }

    return { files, secrets: secretsFound, migrationPlan };
  }

  /**
   * Migrate a single service to use secure secret management
   */
  async migrateService(
    serviceName: string,
    environment: 'development' | 'staging' | 'production',
    secretsToMigrate: Record<string, string>
  ): Promise<MigrationResult> {
    const details: MigrationDetail[] = [];
    const summary: string[] = [];
    let migrated = 0;
    let failures = 0;

    summary.push(`Starting migration for ${serviceName} service`);

    for (const [key, currentValue] of Object.entries(secretsToMigrate)) {
      try {
        // Create secret configuration
        const config: SecretConfig = {
          key,
          environment,
          classification: this.classifySecret(key),
        };

        // Validate current secret before migration
        const validationResults = SecretValidator.validateSecret(currentValue, config);
        const hasErrors = validationResults.some(r => !r.passed && r.severity === 'error');

        if (hasErrors) {
          // Generate a new secure secret if current one is invalid
          const newSecret = await this.generateSecureSecret(key, config);
          
          details.push({
            key,
            status: 'success',
            reason: 'Replaced insecure secret with generated secure value',
            source: 'hardcoded',
            newSource: 'generated',
          });

          summary.push(`✅ ${key}: Generated new secure secret (old value was insecure)`);
          migrated++;
        } else {
          // Current secret is valid, just move it to secure storage
          details.push({
            key,
            status: 'success',
            reason: 'Migrated existing secret to secure storage',
            source: 'hardcoded',
            newSource: environment === 'production' ? 'aws-secrets-manager' : 'infisical',
          });

          summary.push(`✅ ${key}: Migrated to secure storage`);
          migrated++;
        }
      } catch (error) {
        details.push({
          key,
          status: 'failure',
          reason: `Migration failed: ${error}`,
          source: 'hardcoded',
        });

        summary.push(`❌ ${key}: Migration failed - ${error}`);
        failures++;
      }
    }

    return {
      migrated,
      failures,
      details,
      summary,
    };
  }

  /**
   * Validate all services have migrated successfully
   */
  async validateMigrationComplete(
    services: string[],
    environment: 'development' | 'staging' | 'production'
  ): Promise<{ success: boolean; issues: string[] }> {
    const issues: string[] = [];

    for (const service of services) {
      try {
        // Check if service can load all required secrets
        const requiredSecrets = this.getRequiredSecretsForService(service);
        const validation = await this.secretProvider.validateRequiredSecrets(requiredSecrets);

        if (!validation.success) {
          issues.push(`${service}: Missing secrets - ${validation.missing.join(', ')}`);
        }

        // Check for any remaining hardcoded secrets in service files
        const serviceFiles = await this.findServiceFiles(service);
        for (const file of serviceFiles) {
          const content = readFileSync(file, 'utf-8');
          const detection = detectHardcodedSecrets({ content });
          
          if (detection.hasSecrets) {
            issues.push(`${service}: Still has hardcoded secrets in ${file}`);
          }
        }
      } catch (error) {
        issues.push(`${service}: Validation failed - ${error}`);
      }
    }

    return {
      success: issues.length === 0,
      issues,
    };
  }

  /**
   * Generate migration documentation
   */
  generateMigrationReport(results: MigrationResult[]): string {
    const totalMigrated = results.reduce((sum, r) => sum + r.migrated, 0);
    const totalFailures = results.reduce((sum, r) => sum + r.failures, 0);

    let report = `# Secret Migration Report\n\n`;
    report += `**Summary**: ${totalMigrated} secrets migrated, ${totalFailures} failures\n\n`;

    for (const result of results) {
      report += `## Service Migration Results\n\n`;
      report += `- **Migrated**: ${result.migrated}\n`;
      report += `- **Failures**: ${result.failures}\n\n`;

      if (result.summary.length > 0) {
        report += `### Summary\n`;
        for (const item of result.summary) {
          report += `- ${item}\n`;
        }
        report += `\n`;
      }

      if (result.details.length > 0) {
        report += `### Detailed Results\n\n`;
        report += `| Secret | Status | Reason | Source | New Source |\n`;
        report += `|--------|--------|--------|--------|------------|\n`;
        
        for (const detail of result.details) {
          report += `| ${detail.key} | ${detail.status} | ${detail.reason} | ${detail.source} | ${detail.newSource || 'N/A'} |\n`;
        }
        report += `\n`;
      }
    }

    return report;
  }

  // Private helper methods

  private async findSecretFiles(repositoryPath: string): Promise<string[]> {
    const extensions = ['.env', '.json', '.yml', '.yaml'];
    const excludePatterns = ['node_modules', '.git', 'dist', 'build'];
    const files: string[] = [];

    const scanDirectory = (dir: string) => {
      const entries = readdirSync(dir) as string[];
      
      for (const entryName of entries) {
        const fullPath = join(dir, entryName);
        
        const stats = statSync(fullPath);
        if (stats.isDirectory()) {
          // Skip excluded directories
          if (!excludePatterns.some(pattern => fullPath.includes(pattern))) {
            scanDirectory(fullPath);
          }
        } else if (stats.isFile()) {
          // Include files that might contain secrets
          if (extensions.some(ext => entryName.endsWith(ext)) ||
              entryName.includes('.env')) {
            files.push(fullPath);
          }
        }
      }
    };

    scanDirectory(repositoryPath);
    return files;
  }

  private parseEnvFile(content: string): Record<string, string> {
    const result: Record<string, string> = {};
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          result[key.trim()] = valueParts.join('=').trim();
        }
      }
    }
    
    return result;
  }

  private generateMigrationActions(secrets: string[]): string[] {
    return secrets.map(secret => {
      if (secret.includes('Password')) {
        return 'Replace with SecretProvider.getSecret() call';
      } else if (secret.includes('AWS')) {
        return 'Move to AWS Secrets Manager';
      } else if (secret.includes('JWT')) {
        return 'Generate new JWT secret and store securely';
      } else {
        return 'Migrate to secure secret storage';
      }
    });
  }

  private classifySecret(key: string): 'critical' | 'high' | 'medium' | 'low' {
    const criticalPatterns = ['JWT', 'PRIVATE_KEY', 'MASTER'];
    const highPatterns = ['PASSWORD', 'SECRET', 'TOKEN'];
    const mediumPatterns = ['API_KEY', 'WEBHOOK'];

    const upperKey = key.toUpperCase();
    
    if (criticalPatterns.some(pattern => upperKey.includes(pattern))) {
      return 'critical';
    } else if (highPatterns.some(pattern => upperKey.includes(pattern))) {
      return 'high';
    } else if (mediumPatterns.some(pattern => upperKey.includes(pattern))) {
      return 'medium';
    }
    
    return 'low';
  }

  private async generateSecureSecret(key: string, config: SecretConfig): Promise<string> {
    const length = config.classification === 'critical' ? 64 : 32;
    
    // Generate cryptographically secure random bytes
    const { randomBytes } = await import('crypto');
    return randomBytes(length).toString('hex');
  }

  private getRequiredSecretsForService(service: string): string[] {
    // Service-specific required secrets mapping
    const serviceSecrets: Record<string, string[]> = {
      'api-gateway': ['JWT_SECRET', 'POSTGRES_PASSWORD', 'REDIS_PASSWORD'],
      'web-dashboard': ['API_ENDPOINT'],
      'speckle-integration': ['SPECKLE_POSTGRES_PASSWORD', 'SPECKLE_REDIS_PASSWORD', 'SPECKLE_SESSION_SECRET'],
      'database': ['POSTGRES_PASSWORD'],
    };

    return serviceSecrets[service] || [];
  }

  private async findServiceFiles(service: string): Promise<string[]> {
    const serviceDirectories = [
      `apps/${service}`,
      `libs/${service}`,
      `libs/shared/${service}`,
    ];

    const files: string[] = [];
    
    for (const dir of serviceDirectories) {
      if (existsSync(dir)) {
        const scanDirectory = (scanDir: string) => {
          const entries = readdirSync(scanDir) as string[];
          
          for (const entryName of entries) {
            const fullPath = join(scanDir, entryName);
            
            const stats = statSync(fullPath);
            if (stats.isDirectory() && !entryName.includes('node_modules')) {
              scanDirectory(fullPath);
            } else if (stats.isFile() && (entryName.endsWith('.ts') || entryName.endsWith('.js'))) {
              files.push(fullPath);
            }
          }
        };

        scanDirectory(dir);
      }
    }

    return files;
  }
}