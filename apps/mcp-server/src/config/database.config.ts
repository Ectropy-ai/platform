/**
 * MCP Server Database Configuration
 * Production-grade database connection and pool management
 *
 * ENTERPRISE PATTERN: Environment-aware configuration
 * - Validation-only mode: No database required (for CI/CD, testing)
 * - Development mode: Relaxed password requirements
 * - Production mode: Strict security enforcement
 */

import { serverConfig } from './environment.config.js';

export interface MCPDatabaseConfig {
  postgres: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl: boolean | { rejectUnauthorized: boolean };
    pool: {
      min: number;
      max: number;
      idleTimeoutMillis: number;
      connectionTimeoutMillis: number;
      acquireTimeoutMillis: number;
    };
    enabled: boolean; // Whether database is configured and should be used
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
    keyPrefix: string;
    retryDelayOnFailover: number;
    maxRetriesPerRequest: number;
    connectTimeout: number;
    enabled: boolean; // Whether Redis is configured and should be used
  };
  validationOnly: boolean; // Global flag for validation-only mode
}

/**
 * Get MCP Database Configuration
 * Respects validation-only mode and environment-specific requirements
 */
export const getMCPDatabaseConfig = (): MCPDatabaseConfig => {
  const nodeEnv = serverConfig.nodeEnv;
  const isProduction = nodeEnv === 'production';
  const isValidationOnly = serverConfig.validationOnly;

  // Security: Enforce least-privilege database access
  // ENTERPRISE FIX (2026-02-12): Support DATABASE_* prefix for managed database deployments
  // Fallback to DB_* for backward compatibility with local development
  const dbUser =
    process.env['DATABASE_USER'] || process.env['DB_USER'] || 'ectropy_ci';
  const dbPassword =
    process.env['DATABASE_PASSWORD'] || process.env['DB_PASSWORD'] || '';
  const redisPassword = process.env['REDIS_PASSWORD'];

  // ENTERPRISE SSL CONFIGURATION (2026-02-12): Explicit SSL control per environment
  // Managed databases (DigitalOcean, AWS RDS, etc.) require SSL connections
  // Local development typically doesn't use SSL
  const databaseSSL = process.env['DATABASE_SSL'];
  const sslEnabled =
    databaseSSL === 'true' ||
    databaseSSL === '1' ||
    databaseSSL === 'yes' ||
    false;

  // CRITICAL SECURITY: Prevent root database access - ALWAYS forbidden
  if (dbUser === 'root') {
    throw new Error('SECURITY VIOLATION: root database access forbidden');
  }

  // Determine if database is enabled
  // In validation-only mode or when no password is set in dev, database is disabled
  const isDatabaseEnabled =
    !isValidationOnly && (!!dbPassword || !isProduction);

  // Enforce password requirement ONLY in production mode with database enabled
  if (isProduction && isDatabaseEnabled && !dbPassword) {
    throw new Error(
      'DATABASE ERROR: Password required for secure connection in production. ' +
        'Set DB_PASSWORD environment variable or use VALIDATION_ONLY=true mode.'
    );
  }

  // Determine Redis enabled state
  const isRedisEnabled = !isValidationOnly;

  return {
    postgres: {
      // ENTERPRISE FIX (2026-02-12): Prefer DATABASE_* for managed database, fallback to DB_* for local dev
      host:
        process.env['DATABASE_HOST'] || process.env['DB_HOST'] || 'localhost',
      port: parseInt(
        process.env['DATABASE_PORT'] || process.env['DB_PORT'] || '5432',
        10
      ),
      database:
        process.env['DATABASE_NAME'] ||
        process.env['DB_NAME'] ||
        'ectropy_test',
      user: dbUser,
      password: dbPassword,
      // ENTERPRISE FIX (2026-02-12): Explicit SSL control via DATABASE_SSL environment variable
      // Managed databases require SSL with rejectUnauthorized:false (industry standard)
      // Certificate validation handled at infrastructure level (DigitalOcean, AWS RDS, Heroku)
      // Connection still encrypted, but accepts managed database certificates
      ssl: sslEnabled ? { rejectUnauthorized: false } : false,
      pool: {
        min: parseInt(process.env['MCP_DB_POOL_MIN'] || '2', 10),
        max: parseInt(process.env['MCP_DB_POOL_MAX'] || '10', 10),
        idleTimeoutMillis: parseInt(
          process.env['MCP_DB_IDLE_TIMEOUT'] || '30000',
          10
        ),
        connectionTimeoutMillis: parseInt(
          process.env['MCP_DB_CONNECTION_TIMEOUT'] || '5000',
          10
        ),
        acquireTimeoutMillis: parseInt(
          process.env['MCP_DB_ACQUIRE_TIMEOUT'] || '10000',
          10
        ),
      },
      enabled: isDatabaseEnabled,
    },
    redis: {
      host: process.env['REDIS_HOST'] || 'localhost',
      port: parseInt(process.env['REDIS_PORT'] || '6379', 10),
      password: redisPassword,
      db: 0, // Default Redis database
      keyPrefix: `mcp:${nodeEnv}:`, // Environment-specific key prefix
      retryDelayOnFailover: 50,
      maxRetriesPerRequest: 3,
      connectTimeout: parseInt(
        process.env['MCP_REDIS_CONNECT_TIMEOUT'] || '10000',
        10
      ),
      enabled: isRedisEnabled,
    },
    validationOnly: isValidationOnly,
  };
};

/**
 * Validate MCP Database Configuration
 * Skips validation for disabled services in validation-only mode
 */
export const validateMCPDatabaseConfig = (
  config: MCPDatabaseConfig
): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // In validation-only mode, skip most validation
  if (config.validationOnly) {
    warnings.push(
      'Running in validation-only mode - database and Redis disabled'
    );
    return { valid: true, errors: [], warnings };
  }

  // Validate PostgreSQL configuration (only if enabled)
  if (config.postgres.enabled) {
    if (!config.postgres.host) {
      errors.push('PostgreSQL host is required');
    }
    if (!config.postgres.database) {
      errors.push('PostgreSQL database name is required');
    }
    if (!config.postgres.user) {
      errors.push('PostgreSQL user is required');
    }
    if (config.postgres.pool.min < 1) {
      errors.push('PostgreSQL pool minimum must be at least 1');
    }
    if (config.postgres.pool.max < config.postgres.pool.min) {
      errors.push('PostgreSQL pool maximum must be greater than minimum');
    }
  } else {
    warnings.push('PostgreSQL is disabled - some features may be unavailable');
  }

  // Validate Redis configuration (only if enabled)
  if (config.redis.enabled) {
    if (!config.redis.host) {
      errors.push('Redis host is required');
    }
    if (config.redis.port < 1 || config.redis.port > 65535) {
      errors.push('Redis port must be between 1 and 65535');
    }
  } else {
    warnings.push('Redis is disabled - caching will use in-memory fallback');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
};

/**
 * Get a safe database configuration that won't throw
 * Returns config with enabled flags properly set
 */
export const getSafeMCPDatabaseConfig = (): MCPDatabaseConfig => {
  try {
    return getMCPDatabaseConfig();
  } catch (error) {
    // If config fails, return disabled config
    console.warn(
      'Database configuration failed, running in degraded mode:',
      error
    );
    return {
      postgres: {
        host: 'localhost',
        port: 5432,
        database: 'ectropy_test',
        user: 'ectropy_ci',
        password: '',
        ssl: false,
        pool: {
          min: 2,
          max: 10,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
          acquireTimeoutMillis: 10000,
        },
        enabled: false,
      },
      redis: {
        host: 'localhost',
        port: 6379,
        db: 0,
        keyPrefix: 'mcp:disabled:',
        retryDelayOnFailover: 50,
        maxRetriesPerRequest: 3,
        connectTimeout: 10000,
        enabled: false,
      },
      validationOnly: true,
    };
  }
};
