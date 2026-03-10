/**
 * Enterprise-Grade Environment Configuration Service
 *
 * Solves AP-001: Hardcoded Localhost URLs
 * Solves AP-004: Configuration File Consolidation
 * Solves AP-011: Hardcoded Test URLs
 *
 * This module provides environment-aware configuration management that:
 * - Eliminates hardcoded localhost URLs
 * - Supports multi-environment deployments (dev, staging, production)
 * - Provides fail-fast validation in production
 * - Uses smart defaults in development
 * - Leverages service discovery and Docker networking
 * - Integrates with env-schema.ts for runtime validation
 *
 * @module @ectropy/shared/config/environment
 */

import {
  getEnvConfig,
  Environment as SchemaEnvironment,
} from './env-schema.js';

export type Environment = 'development' | 'staging' | 'production' | 'test';

export interface EnvironmentConfig {
  nodeEnv: Environment;

  // Database
  databaseHost: string;
  databasePort: number;
  databaseName: string;
  databaseUser: string;
  databasePassword: string;
  databaseUrl: string;

  // Redis
  redisHost: string;
  redisPort: number;
  redisUrl: string;

  // Services
  apiGatewayUrl: string;
  mcpServerUrl: string;
  webDashboardUrl: string;
  speckleServerUrl: string;
}

/**
 * Get configuration value with environment-aware defaults
 *
 * ENTERPRISE PATTERN:
 * - Production: Fail-fast if required vars missing
 * - Development: Allow smart defaults with warnings
 * - Test: Use test-specific defaults
 *
 * @param key - Environment variable name
 * @param options - Configuration options
 * @returns The configuration value
 * @throws Error in production if required variable is missing
 *
 * @example
 * ```typescript
 * // Required in production, with default for dev
 * const apiKey = getConfig('API_KEY', {
 *   required: true,
 *   default: 'dev-key-12345'
 * });
 *
 * // Optional with default
 * const timeout = getConfig('TIMEOUT_MS', {
 *   default: 30000
 * });
 * ```
 */
export function getConfig<T>(
  key: string,
  options: {
    required?: boolean;
    default?: T;
  } = {}
): T {
  const env = (process.env.NODE_ENV || 'development') as Environment;
  const value = process.env[key];

  // Production mode: Strict validation
  if (env === 'production' && options.required && !value) {
    throw new Error(
      `FATAL: Required environment variable ${key} is not set in production. ` +
        `Set this variable or deployment will fail.`
    );
  }

  // Development mode: Smart defaults with warnings
  if (env === 'development' && !value && options.default !== undefined) {
    console.warn(
      `⚠️  Using default for ${key}: ${options.default}. ` +
        `Set ${key} in .env.local for production-like behavior.`
    );
    return options.default;
  }

  // Test mode: Use defaults without warnings
  if (env === 'test' && !value && options.default !== undefined) {
    return options.default;
  }

  return (value || options.default) as unknown as T;
}

/**
 * Environment-aware service URL resolution
 *
 * Implements the following deployment patterns:
 * - Production: Service discovery via internal DNS (service names)
 * - Staging: Use environment-provided URLs
 * - Development: Use Docker Compose network names
 * - Test: Use localhost with dynamic ports
 *
 * @param serviceName - Name of the service to connect to
 * @param options - URL construction options
 * @returns Fully-qualified service URL
 * @throws Error in production/staging if service host not configured
 *
 * @example
 * ```typescript
 * // Get database URL (uses environment-specific logic)
 * const dbUrl = getServiceUrl('database');
 * // Production: http://postgres.internal:5432
 * // Development: http://postgres:5432
 * // Test: http://localhost:5432
 *
 * // Get API Gateway with custom protocol
 * const apiUrl = getServiceUrl('api-gateway', { protocol: 'https' });
 *
 * // Get service with custom port
 * const customUrl = getServiceUrl('redis', { port: 6380 });
 * ```
 */
export function getServiceUrl(
  serviceName:
    | 'database'
    | 'redis'
    | 'api-gateway'
    | 'mcp-server'
    | 'web-dashboard'
    | 'speckle',
  options: { port?: number; protocol?: 'http' | 'https' } = {}
): string {
  const env = (process.env.NODE_ENV || 'development') as Environment;
  const protocol = options.protocol || 'http';

  // Check for explicit environment variable first (highest priority)
  const envVar = `${serviceName.toUpperCase().replace(/-/g, '_')}_URL`;
  const explicitUrl = process.env[envVar];
  if (explicitUrl) {
    return explicitUrl;
  }

  switch (env) {
    case 'production':
    case 'staging': {
      // Use service discovery (internal DNS) or fail
      const hostEnvVar = `${serviceName.toUpperCase().replace(/-/g, '_')}_HOST`;
      const host = process.env[hostEnvVar];

      if (!host) {
        throw new Error(
          `Service ${serviceName} host not configured for ${env} environment. ` +
            `Set ${hostEnvVar} or ${envVar} environment variable.`
        );
      }

      const portEnvVar = `${serviceName.toUpperCase().replace(/-/g, '_')}_PORT`;
      const port =
        options.port || process.env[portEnvVar] || getDefaultPort(serviceName);

      return `${protocol}://${host}:${port}`;
    }

    case 'development': {
      // Use Docker Compose service names (internal network resolution)
      const dockerServiceNames: Record<string, string> = {
        database: 'postgres',
        redis: 'redis',
        'api-gateway': 'api-gateway',
        'mcp-server': 'mcp-server',
        'web-dashboard': 'web-dashboard',
        speckle: 'speckle-server',
      };

      const dockerPort = options.port || getDefaultPort(serviceName);
      const dockerServiceName = dockerServiceNames[serviceName];

      return `${protocol}://${dockerServiceName}:${dockerPort}`;
    }

    case 'test': {
      // Use localhost with default ports (for integration tests)
      const testPort = options.port || getDefaultPort(serviceName);
      return `${protocol}://localhost:${testPort}`;
    }

    default: {
      // Fallback to test mode for unknown environments
      const fallbackPort = options.port || getDefaultPort(serviceName);
      console.warn(
        `⚠️  Unknown environment: ${env}. Falling back to localhost for ${serviceName}.`
      );
      return `${protocol}://localhost:${fallbackPort}`;
    }
  }
}

/**
 * Get default port for a service
 *
 * @internal
 * @param serviceName - Service name
 * @returns Default port number
 */
function getDefaultPort(serviceName: string): number {
  const defaultPorts: Record<string, number> = {
    database: 5432,
    redis: 6379,
    'api-gateway': 4000,
    'mcp-server': 3002,
    'web-dashboard': 3000,
    speckle: 3001,
  };

  return defaultPorts[serviceName] || 80;
}

/**
 * Get database connection URL
 *
 * Convenience function that constructs a PostgreSQL connection URL
 * using environment-aware configuration.
 *
 * @returns PostgreSQL connection URL
 *
 * @example
 * ```typescript
 * const dbUrl = getDatabaseUrl();
 * // Production: postgresql://user:pass@db.internal:5432/ectropy
 * // Development: postgresql://postgres:postgres@postgres:5432/ectropy_dev
 * // Test: postgresql://postgres:postgres@localhost:5432/ectropy_test
 * ```
 */
export function getDatabaseUrl(): string {
  const env = (process.env.NODE_ENV || 'development') as Environment;

  // Check for explicit DATABASE_URL first
  const explicitUrl = process.env.DATABASE_URL;
  if (explicitUrl) {
    return explicitUrl;
  }

  // Construct from components
  const user = getConfig('DATABASE_USER', {
    default: 'postgres',
  });

  const password = getConfig('DATABASE_PASSWORD', {
    default: 'postgres',
  });

  const dbName = getConfig('DATABASE_NAME', {
    default: env === 'test' ? 'ectropy_test' : 'ectropy_dev',
  });

  const host = getConfig('DATABASE_HOST', {
    default: env === 'development' ? 'postgres' : 'localhost',
  });

  const port = getConfig('DATABASE_PORT', {
    default: 5432,
  });

  return `postgresql://${user}:${password}@${host}:${port}/${dbName}`;
}

/**
 * Get Redis connection URL
 *
 * Convenience function that constructs a Redis connection URL
 * using environment-aware configuration.
 *
 * @returns Redis connection URL
 *
 * @example
 * ```typescript
 * const redisUrl = getRedisUrl();
 * // Production: redis://redis.internal:6379
 * // Development: redis://redis:6379
 * // Test: redis://localhost:6379
 * ```
 */
export function getRedisUrl(): string {
  const env = (process.env.NODE_ENV || 'development') as Environment;

  // Check for explicit REDIS_URL first
  const explicitUrl = process.env.REDIS_URL;
  if (explicitUrl) {
    return explicitUrl;
  }

  // Construct from components
  const host = getConfig('REDIS_HOST', {
    default: env === 'development' ? 'redis' : 'localhost',
  });

  const port = getConfig('REDIS_PORT', {
    default: 6379,
  });

  return `redis://${host}:${port}`;
}

/**
 * Validate that all required environment variables are set
 *
 * Should be called at application startup to fail-fast if configuration
 * is incomplete in production environments.
 *
 * @throws Error if required variables are missing in production
 *
 * @example
 * ```typescript
 * // In main.ts or server.ts
 * validateEnvironment();
 *
 * // Start server...
 * ```
 */
export function validateEnvironment(): void {
  const env = (process.env.NODE_ENV || 'development') as Environment;

  if (env === 'production') {
    // In production, ensure critical variables are set
    const required = ['DATABASE_URL', 'REDIS_URL', 'API_GATEWAY_URL'];

    const missing = required.filter((key) => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(
        `FATAL: Missing required environment variables in production: ${missing.join(', ')}. ` +
          `Set these variables before deployment.`
      );
    }
  }

  console.log(`✓ Environment configuration validated for ${env} mode`);
}
