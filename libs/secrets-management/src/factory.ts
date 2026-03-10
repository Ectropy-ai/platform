/**
 * Factory for creating SecretProvider instances
 * Simplifies configuration and provides sensible defaults
 */

import { SecretProviderConfig } from './types.js';
import { EctropySecretProvider } from './secret-provider.js';

export class SecretProviderFactory {
  /**
   * Create a SecretProvider with environment-specific defaults
   */
  static create(environment: 'development' | 'staging' | 'production', overrides: Partial<SecretProviderConfig> = {}): EctropySecretProvider {
    const baseConfig = this.getEnvironmentDefaults(environment);
    const config: SecretProviderConfig = {
      ...baseConfig,
      ...overrides,
      // Merge nested objects
      infisical: { ...baseConfig.infisical, ...overrides.infisical },
      aws: { ...baseConfig.aws, ...overrides.aws },
      compliance: { ...baseConfig.compliance, ...overrides.compliance },
    };

    return new EctropySecretProvider(config);
  }

  /**
   * Create SecretProvider from environment variables
   */
  static fromEnvironment(environment?: 'development' | 'staging' | 'production'): EctropySecretProvider {
    const env = environment || (process.env['NODE_ENV'] as any) || 'development';
    
    const envVars = process.env as Record<string, string | undefined>;
    const config: SecretProviderConfig = {
      environment: env,
      defaultCacheTtl: parseInt(envVars['SECRETS_CACHE_TTL'] || '300', 10), // 5 minutes
      enableEdgeCache: envVars['SECRETS_ENABLE_EDGE_CACHE'] !== 'false',
      slaTimeoutMs: parseInt(envVars['SECRETS_SLA_TIMEOUT_MS'] || '15000', 10), // 15 seconds
      
      infisical: {
        baseUrl: envVars['INFISICAL_API_URL'] || 'https://app.infisical.com',
        token: envVars['INFISICAL_TOKEN'],
        clientId: envVars['INFISICAL_CLIENT_ID'],
        clientSecret: envVars['INFISICAL_CLIENT_SECRET'],
        defaultProject: envVars['INFISICAL_PROJECT_ID'],
      },
      
      aws: {
        region: envVars['AWS_REGION'] || envVars['AWS_DEFAULT_REGION'] || 'us-east-1',
        accessKeyId: envVars['AWS_ACCESS_KEY_ID'],
        secretAccessKey: envVars['AWS_SECRET_ACCESS_KEY'],
        sessionToken: envVars['AWS_SESSION_TOKEN'],
        endpoint: envVars['AWS_SECRETS_MANAGER_ENDPOINT'],
      },
      
      compliance: {
        enableAuditLogging: envVars['SECRETS_ENABLE_AUDIT_LOGGING'] !== 'false',
        requireFipsForProduction: env === 'production',
        rotationScheduleDays: parseInt(envVars['SECRETS_ROTATION_SCHEDULE_DAYS'] || '90', 10),
      },
    };

    return new EctropySecretProvider(config);
  }

  private static getEnvironmentDefaults(environment: 'development' | 'staging' | 'production'): SecretProviderConfig {
    const baseConfig: SecretProviderConfig = {
      environment,
      defaultCacheTtl: 300, // 5 minutes
      enableEdgeCache: true,
      slaTimeoutMs: 15000, // 15 seconds
      
      infisical: {
        baseUrl: 'https://app.infisical.com',
      },
      
      aws: {
        region: 'us-east-1',
      },
      
      compliance: {
        enableAuditLogging: true,
        requireFipsForProduction: environment === 'production',
        rotationScheduleDays: 90,
      },
    };

    // Environment-specific overrides
    switch (environment) {
      case 'development':
        return {
          ...baseConfig,
          defaultCacheTtl: 60, // 1 minute for faster development
          slaTimeoutMs: 30000, // More lenient timeout
          compliance: {
            ...baseConfig.compliance,
            requireFipsForProduction: false,
            rotationScheduleDays: 30, // More frequent rotation for testing
          },
        };

      case 'staging':
        return {
          ...baseConfig,
          defaultCacheTtl: 180, // 3 minutes
          slaTimeoutMs: 20000, // 20 seconds
          compliance: {
            ...baseConfig.compliance,
            requireFipsForProduction: false,
            rotationScheduleDays: 60,
          },
        };

      case 'production':
        return {
          ...baseConfig,
          defaultCacheTtl: 600, // 10 minutes for production stability
          slaTimeoutMs: 10000, // Strict 10 second timeout
          enableEdgeCache: true, // Critical for construction site resilience
          compliance: {
            ...baseConfig.compliance,
            requireFipsForProduction: true,
            rotationScheduleDays: 90,
          },
        };

      default:
        return baseConfig;
    }
  }
}