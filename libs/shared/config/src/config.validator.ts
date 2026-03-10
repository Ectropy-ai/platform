/**
 * Configuration Validator - Ectropy Platform
 * Validates environment configuration and prevents hardcoded secrets
 * Enhanced with hybrid Infisical + AWS Secrets Manager support
 */

import { randomBytes } from 'crypto';

// Generic secret provider interface to avoid circular dependencies
export interface ISecretProvider {
  getSecret(key: string): Promise<any>;
}

export interface ISecretProviderFactory {
  createProvider(config: any): ISecretProvider;
}

export interface AuthConfig {
  jwtSecret: string;
  jwtRefreshSecret: string;
  [key: string]: unknown;
}

export interface ServerConfig {
  host: string;
  port?: number;
  corsOrigins?: string[];
  [key: string]: unknown;
}

export interface BlockchainConfig {
  network?: string;
  providerUrl: string;
  chainId?: number;
  contractAddress?: string;
  [key: string]: unknown;
}

export interface LoggingConfig {
  level: string;
  format?: string;
  destinations?: Array<{ type: string; level?: string; filename?: string }>;
  [key: string]: unknown;
}

export interface MonitoringConfig {
  enabled: boolean;
  metricsPort?: number;
  healthCheckInterval?: number;
  [key: string]: unknown;
}

export interface EnvironmentConfig {
  nodeEnv: 'development' | 'test' | 'staging' | 'production';
  port?: number;
  database: DatabaseConfig;
  redis: RedisConfig;
  auth: AuthConfig;
  jwt?: JWTConfig;
  server: ServerConfig;
  security?: SecurityConfig;
  blockchain: BlockchainConfig;
  speckle: SpeckleConfig;
  logging: LoggingConfig;
  monitoring: MonitoringConfig;
  // Enhanced with secrets management
  secretProvider?: ISecretProvider;
}
export interface DatabaseConfig {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
  ssl?: boolean;
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
  max?: number;
  maxConnections?: number; // Alias for max
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  retryDelayOnFailover?: number;
  enableOfflineQueue?: boolean;
}

export interface JWTConfig {
  secret: string;
  refreshSecret: string;
  expiresIn?: string;
  refreshExpiresIn?: string;
  issuer?: string;
  audience?: string;
}

export interface SpeckleConfig {
  serverUrl?: string;
  adminEmail?: string;
  adminPassword?: string;
  enableAuth?: boolean;
  sessionSecret?: string;
  enableTelemetry?: boolean;
}

export interface SecurityConfig {
  rateLimitMax: number;
  corsOrigins?: string[];
  helmutSecurityHeaders?: boolean;
  enableRequestLogging?: boolean;
  secretsRotationInterval?: number;
  // Enhanced secrets management settings
  enableHybridSecrets?: boolean;
  requireFipsInProduction?: boolean;
  secretsCacheTtl?: number;
  [key: string]: any;
}

/**
 * Enhanced validation with hybrid secrets management support
 */
export async function validateEnvironmentConfig(config: any, enableSecretsValidation = true): Promise<{
  success: boolean;
  data?: EnvironmentConfig;
  errors?: string[];
  secretsValidation?: {
    success: boolean;
    missing: string[];
    errors: string[];
  };
}> {
  try {
    // Basic validation - replace with proper zod when ready
    if (!config) {
      return { success: false, errors: ['Configuration is required'] };
    }

    const structuralErrors: string[] = [];

    if (
      !config.auth ||
      typeof config.auth.jwtSecret !== 'string' ||
      typeof config.auth.jwtRefreshSecret !== 'string'
    ) {
      structuralErrors.push('Invalid auth configuration');
    }

    if (
      !config.server ||
      typeof config.server.host !== 'string' ||
      (config.server.port !== undefined && typeof config.server.port !== 'number')
    ) {
      structuralErrors.push('Invalid server configuration');
    }

    if (
      !config.blockchain ||
      typeof config.blockchain.providerUrl !== 'string'
    ) {
      structuralErrors.push('Invalid blockchain configuration');
    }

    if (!config.logging || typeof config.logging.level !== 'string') {
      structuralErrors.push('Invalid logging configuration');
    }

    if (
      !config.monitoring ||
      typeof config.monitoring.enabled !== 'boolean'
    ) {
      structuralErrors.push('Invalid monitoring configuration');
    }

    if (structuralErrors.length > 0) {
      return { success: false, errors: structuralErrors };
    }

    let secretsValidation;
    if (enableSecretsValidation && config.secretProvider) {
      // Validate required secrets using the hybrid provider
      const requiredSecrets = getRequiredSecrets(config.nodeEnv);
      secretsValidation = await config.secretProvider.validateRequiredSecrets(requiredSecrets);
      
      if (!secretsValidation.success && config.nodeEnv !== 'development') {
        return {
          success: false,
          errors: ['Required secrets validation failed'],
          secretsValidation,
        };
      }
    }

    return { 
      success: true, 
      data: config as EnvironmentConfig,
      secretsValidation,
    };
  } catch (error) {
    return {
      success: false,
      errors: [(error as Error).message],
    };
  }
}

/**
 * Check if secrets are hardcoded in configuration
 */
/**
 * Check if secrets are hardcoded in configuration
 * Enhanced detection with comprehensive pattern matching
 */
export function detectHardcodedSecrets(config: Record<string, any>): {
  hasSecrets: boolean;
  secrets: string[];
} {
  const secrets: string[] = [];
  
  // Enhanced secret detection patterns
  const secretPatterns = [
    // Direct assignment patterns
    { pattern: /password\s*[:=]\s*['"][^'"]{8,}['"]/, description: 'Password assignment' },
    { pattern: /secret\s*[:=]\s*['"][^'"]{8,}['"]/, description: 'Secret assignment' },
    { pattern: /key\s*[:=]\s*['"][^'"]{8,}['"]/, description: 'Key assignment' },
    { pattern: /token\s*[:=]\s*['"][^'"]{8,}['"]/, description: 'Token assignment' },
    
    // Environment variable patterns
    { pattern: /PASSWORD['"]\s*[:=]\s*['"][^'"]{8,}['"]/, description: 'Password env var' },
    { pattern: /SECRET['"]\s*[:=]\s*['"][^'"]{8,}['"]/, description: 'Secret env var' },
    { pattern: /JWT_SECRET['"]\s*[:=]\s*['"][^'"]{8,}['"]/, description: 'JWT secret env var' },
    
    // Database connection strings with passwords
    { pattern: /postgresql:\/\/[^:]+:[^@]{8,}@/, description: 'PostgreSQL connection string' },
    { pattern: /mysql:\/\/[^:]+:[^@]{8,}@/, description: 'MySQL connection string' },
    { pattern: /redis:\/\/:[^@]{8,}@/, description: 'Redis connection string' },
    
    // AWS/Cloud credentials
    { pattern: /AKIA[0-9A-Z]{16}/, description: 'AWS access key' },
    { pattern: /aws_secret_access_key\s*[:=]\s*['"][^'"]{20,}['"]/, description: 'AWS secret key' },
    
    // Common secret formats
    { pattern: /['"]\w{32,}['"]/, description: 'Potential 32+ char secret' },
    { pattern: /[A-Za-z0-9+/]{40,}={0,2}/, description: 'Base64 encoded secret' },
  ];

  const configString = JSON.stringify(config, null, 2);
  
  for (const { pattern, description } of secretPatterns) {
    const matches = configString.match(pattern);
    if (matches) {
      secrets.push(`${description}: ${matches[0].substring(0, 50)}...`);
    }
  }

  // Check for common placeholder values that should be replaced
  const placeholderPatterns = [
    'CHANGEME', 'REPLACE_ME', 'YOUR_SECRET_HERE', 'TODO', 'FIXME',
    'password123', 'admin123', 'secret123', 'default_password'
  ];

  for (const placeholder of placeholderPatterns) {
    if (configString.toLowerCase().includes(placeholder.toLowerCase())) {
      secrets.push(`Placeholder value found: ${placeholder}`);
    }
  }

  return {
    hasSecrets: secrets.length > 0,
    secrets,
  };
}

/**
 * Generate secure random secrets for development
 */
export function generateSecureSecret(length: number = 64): string {
  return randomBytes(length).toString('hex');
}

/**
 * Validate JWT configuration
 */
export function validateJWTConfig(jwtConfig: any): boolean {
  if (!jwtConfig?.secret || jwtConfig.secret.length < 32) {
    return false;
  }
  return true;
}

/**
 * Get required secrets based on environment
 */
export function getRequiredSecrets(environment: string): string[] {
  const baseSecrets = [
    'POSTGRES_PASSWORD',
    'REDIS_PASSWORD',
    'JWT_SECRET',
  ];

  const speckleSecrets = [
    'SPECKLE_POSTGRES_PASSWORD',
    'SPECKLE_REDIS_PASSWORD',
    'SPECKLE_SESSION_SECRET',
  ];

  if (environment === 'production') {
    return [
      ...baseSecrets,
      ...speckleSecrets,
      'JWT_REFRESH_SECRET',
      'ENCRYPTION_KEY',
    ];
  }

  if (environment === 'staging') {
    return [
      ...baseSecrets,
      ...speckleSecrets,
    ];
  }

  // Development environment - more lenient
  return baseSecrets;
}

/**
 * Create enhanced configuration with hybrid secrets support
 */
export async function createEnhancedConfig(environment?: 'development' | 'staging' | 'production', secretProviderFactory?: ISecretProviderFactory): Promise<EnvironmentConfig> {
  const env = environment || (process.env['NODE_ENV'] as any) || 'development';
  
  // Initialize hybrid secrets provider (only if factory is provided)
  let secretProvider: ISecretProvider | null = null;
  if (secretProviderFactory) {
    secretProvider = secretProviderFactory.createProvider(env);
    
    // For development, we can alternative to env vars if no secrets provider
    if (env !== 'development') {
      // In production/staging, require secrets provider
    }
  }

  // Helper function to get secret value with fallback
  const getSecretValue = async (key: string, fallback?: string): Promise<string> => {
    // First try to get from secret provider if available
    if (secretProvider) {
      try {
        const secret = await secretProvider.getSecret(key);
        if (secret && secret.value) {
          return secret.value;
        }
      } catch (error) {
        // Fall through to environment variables
      }
    }
    
    // alternative to environment variables
    const envValue = process.env[key];
    if (envValue) {
      return envValue;
    }
    
    // Use provided fallback
    if (fallback) {
      return fallback;
    }
    
    // For development, generate secure secret
    if (env === 'development') {
      return generateSecureSecret();
    }
    
    throw new Error(`Required secret '${key}' not found in any source`);
  };

  const config: EnvironmentConfig = {
    nodeEnv: env,
    port: parseInt(process.env['PORT'] || '3000', 10),
    secretProvider: secretProvider || undefined, // Include provider for runtime access
    database: {
      host: process.env['DB_HOST'] || process.env['POSTGRES_HOST'] || 'localhost',
      port: parseInt(process.env['DB_PORT'] || process.env['POSTGRES_PORT'] || '5432', 10),
      name: process.env['DB_NAME'] || process.env['POSTGRES_DB'] || 'ectropy',
      user: process.env['DB_USER'] || process.env['POSTGRES_USER'] || 'postgres',
      password: await getSecretValue('POSTGRES_PASSWORD'),
      maxConnections: parseInt(process.env['DB_MAX_CONNECTIONS'] || '10', 10),
      max: parseInt(process.env['DB_MAX_CONNECTIONS'] || '10', 10),
    },
    redis: {
      host: process.env['REDIS_HOST'] || 'localhost',
      port: parseInt(process.env['REDIS_PORT'] || '6379', 10),
      password: await getSecretValue('REDIS_PASSWORD'),
    },
    auth: {
      jwtSecret: await getSecretValue('JWT_SECRET'),
      jwtRefreshSecret: await getSecretValue('JWT_REFRESH_SECRET', generateSecureSecret()),
    },
    jwt: {
      secret: await getSecretValue('JWT_SECRET'),
      refreshSecret: await getSecretValue('JWT_REFRESH_SECRET', generateSecureSecret()),
      expiresIn: process.env['JWT_EXPIRES_IN'] || '24h',
      refreshExpiresIn: process.env['JWT_REFRESH_EXPIRES_IN'] || '7d',
    },
    server: {
      host: process.env['SERVER_HOST'] || '0.0.0.0',
      port: parseInt(process.env['PORT'] || '3000', 10),
    },
    security: {
      rateLimitMax: parseInt(process.env['RATE_LIMIT_MAX'] || '100', 10),
      enableHybridSecrets: true,
      requireFipsInProduction: env === 'production',
      secretsCacheTtl: parseInt(process.env['SECRETS_CACHE_TTL'] || '300', 10),
    },
    blockchain: {
      network: process.env['BLOCKCHAIN_NETWORK'] || 'development',
      providerUrl:
        process.env['BLOCKCHAIN_PROVIDER_URL'] || 'http://localhost:8545',
    },
    speckle: {
      serverUrl: process.env['SPECKLE_SERVER_URL'] || 'http://localhost:3001',
      enableAuth: process.env['SPECKLE_ENABLE_AUTH'] === 'true',
      enableTelemetry: process.env['SPECKLE_ENABLE_TELEMETRY'] !== 'false',
      sessionSecret: await getSecretValue('SPECKLE_SESSION_SECRET', generateSecureSecret()),
    },
    logging: {
      level: process.env['LOG_LEVEL'] || 'info',
      format: process.env['LOG_FORMAT'] || 'json',
    },
    monitoring: {
      enabled: process.env['MONITORING_ENABLED'] === 'true',
      metricsPort: parseInt(process.env['MONITORING_PORT'] || '9090', 10),
    },
  };

  return config;
}
/**
 * Legacy ConfigValidator class for backwards compatibility
 */
export class ConfigValidator {
  static validate(config: any) {
    return validateEnvironmentConfig(config, false); // Disable secrets validation for legacy
  }

  static async validateWithSecrets(config: any) {
    return validateEnvironmentConfig(config, true);
  }

  static validateJWT(jwtConfig: any) {
    return validateJWTConfig(jwtConfig);
  }

  static generateSecret(length?: number) {
    return generateSecureSecret(length);
  }

  static validateRequiredEnvVars(): void {
    const requiredVars = [
      'NODE_ENV',
      'PORT',
      'DB_HOST',
      'DB_PORT',
      'DB_NAME',
      'DB_USER',
    ];
    const missingVars = requiredVars.filter((varName) => !process.env[varName]);
    if (missingVars.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missingVars.join(', ')}`
      );
    }
  }

  static getConfigFromEnv(): EnvironmentConfig {
    // Basic config from environment variables (legacy mode)
    return {
      nodeEnv: (process.env['NODE_ENV'] as any) || 'development',
      port: parseInt(process.env['PORT'] || '3000', 10),
      database: {
        host: process.env['DB_HOST'] || 'localhost',
        port: parseInt(process.env['DB_PORT'] || '5432', 10),
        name: process.env['DB_NAME'] || 'ectropy',
        user: process.env['DB_USER'] || 'postgres',
        password: process.env['DB_PASSWORD'] || '',
        maxConnections: parseInt(process.env['DB_MAX_CONNECTIONS'] || '10', 10),
        max: parseInt(process.env['DB_MAX_CONNECTIONS'] || '10', 10),
      },
      redis: {
        host: process.env['REDIS_HOST'] || 'localhost',
        port: parseInt(process.env['REDIS_PORT'] || '6379', 10),
        password: process.env['REDIS_PASSWORD'],
      },
      auth: {
        jwtSecret: process.env['JWT_SECRET'] || generateSecureSecret(),
        jwtRefreshSecret:
          process.env['JWT_REFRESH_SECRET'] || generateSecureSecret(),
      },
      jwt: {
        secret: process.env['JWT_SECRET'] || generateSecureSecret(),
        refreshSecret:
          process.env['JWT_REFRESH_SECRET'] || generateSecureSecret(),
        expiresIn: process.env['JWT_EXPIRES_IN'] || '24h',
        refreshExpiresIn: process.env['JWT_REFRESH_EXPIRES_IN'] || '7d',
      },
      server: {
        host: process.env['SERVER_HOST'] || '0.0.0.0',
        port: parseInt(process.env['PORT'] || '3000', 10),
      },
      security: {
        rateLimitMax: parseInt(process.env['RATE_LIMIT_MAX'] || '100', 10),
      },
      blockchain: {
        network: process.env['BLOCKCHAIN_NETWORK'] || 'development',
        providerUrl:
          process.env['BLOCKCHAIN_PROVIDER_URL'] || 'http://localhost:8545',
      },
      speckle: {
        serverUrl: process.env['SPECKLE_SERVER_URL'] || 'http://localhost:3001',
        enableAuth: process.env['SPECKLE_ENABLE_AUTH'] === 'true',
        enableTelemetry: process.env['SPECKLE_ENABLE_TELEMETRY'] !== 'false',
      },
      logging: {
        level: process.env['LOG_LEVEL'] || 'info',
        format: process.env['LOG_FORMAT'] || 'json',
      },
      monitoring: {
        enabled: process.env['MONITORING_ENABLED'] === 'true',
        metricsPort: parseInt(process.env['MONITORING_PORT'] || '9090', 10),
      },
    };
  }

  /**
   * New enhanced method for hybrid secrets support
   */
  static async getEnhancedConfig(environment?: 'development' | 'staging' | 'production'): Promise<EnvironmentConfig> {
    return createEnhancedConfig(environment);
  }
}
