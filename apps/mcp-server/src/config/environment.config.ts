/**
 * Centralized Environment Configuration
 * Enterprise Standard: Single source of truth for all environment variables
 *
 * Benefits:
 * - Type safety for all configuration values
 * - Clear documentation of all environment variables
 * - Default values in one place
 * - Easy to test and validate
 */

import { getCurrentVersion } from '../utils/version.js';

/**
 * Parse integer from environment variable with fallback
 */
function getEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse boolean from environment variable with fallback
 */
function getEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Get environment variable with fallback
 */
function getEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

/**
 * Parse comma-separated list from environment variable
 */
function getEnvList(key: string, defaultValue: string[] = []): string[] {
  const value = process.env[key];
  if (!value) {
    return defaultValue;
  }
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Server Configuration
 */
export const serverConfig = {
  /**
   * Stdio server port (MCP protocol)
   * Environment: MCP_SERVER_STDIO_PORT, MCP_PORT, or PORT
   * Default: 3001
   */
  stdioPort: getEnvInt(
    'MCP_SERVER_STDIO_PORT',
    getEnvInt('MCP_PORT', getEnvInt('PORT', 3001))
  ),

  /**
   * Express API server port (HTTP REST API)
   * Environment: MCP_SERVER_EXPRESS_PORT or EXPRESS_PORT
   * Default: 3002
   */
  expressPort: getEnvInt(
    'MCP_SERVER_EXPRESS_PORT',
    getEnvInt('EXPRESS_PORT', 3002)
  ),

  /**
   * Node environment
   * Environment: NODE_ENV
   * Default: 'development'
   */
  nodeEnv: getEnv('NODE_ENV', 'development'),

  /**
   * Server version (from package.json or environment)
   * Environment: MCP_SERVER_VERSION
   * Default: Dynamic version from package.json
   */
  version: getEnv('MCP_SERVER_VERSION', getCurrentVersion()),

  /**
   * Validation-only mode (no database connections)
   * Environment: VALIDATION_ONLY
   * Default: false
   */
  validationOnly: getEnvBool('VALIDATION_ONLY', false),
} as const;

/**
 * Security Configuration
 */
export const securityConfig = {
  /**
   * MCP API Key for /tools endpoint
   * Environment: MCP_API_KEY
   * Required in production, optional in development
   */
  mcpApiKey: process.env.MCP_API_KEY,

  /**
   * Require API key in all environments
   * Environment: REQUIRE_API_KEY
   * Default: true (production), false (development)
   */
  requireApiKey: getEnvBool(
    'REQUIRE_API_KEY',
    serverConfig.nodeEnv === 'production'
  ),

  /**
   * Session secret for Express session
   * Environment: SESSION_SECRET
   * Default: Secure random in production, dev secret in development
   */
  sessionSecret: getEnv(
    'SESSION_SECRET',
    serverConfig.nodeEnv === 'production'
      ? '' // Will trigger error if not set
      : 'dev-session-secret-change-in-production'
  ),

  /**
   * JWT secret for token signing
   * Environment: JWT_SECRET
   * Default: Secure random in production, dev secret in development
   */
  jwtSecret: getEnv(
    'JWT_SECRET',
    serverConfig.nodeEnv === 'production'
      ? '' // Will trigger error if not set
      : 'dev-jwt-secret-change-in-production-min-32-chars'
  ),

  /**
   * Allowed CORS origins (comma-separated)
   * Environment: ALLOWED_ORIGINS
   * Default: localhost origins for development
   */
  allowedOrigins: getEnvList('ALLOWED_ORIGINS', [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://github.com',
    'https://github.dev',
  ]),

  /**
   * Enable rate limiting
   * Environment: ENABLE_RATE_LIMITING
   * Default: true
   */
  enableRateLimiting: getEnvBool('ENABLE_RATE_LIMITING', true),
} as const;

/**
 * Database Configuration
 * Note: Full database config is in database.config.ts
 * This provides quick access to connection strings
 */
export const databaseConfig = {
  /**
   * PostgreSQL host
   * Environment: DATABASE_HOST or DB_HOST
   * Default: 'localhost'
   */
  host: getEnv('DATABASE_HOST', getEnv('DB_HOST', 'localhost')),

  /**
   * PostgreSQL port
   * Environment: DATABASE_PORT or DB_PORT
   * Default: 5432
   */
  port: getEnvInt('DATABASE_PORT', getEnvInt('DB_PORT', 5432)),

  /**
   * PostgreSQL database name
   * Environment: DATABASE_NAME or DB_NAME
   * Default: 'ectropy_dev'
   */
  database: getEnv('DATABASE_NAME', getEnv('DB_NAME', 'ectropy_dev')),

  /**
   * PostgreSQL user
   * Environment: DATABASE_USER or DB_USER
   * Default: 'postgres'
   */
  user: getEnv('DATABASE_USER', getEnv('DB_USER', 'postgres')),

  /**
   * PostgreSQL password
   * Environment: DATABASE_PASSWORD or DB_PASSWORD
   * Default: 'postgres'
   */
  password: getEnv('DATABASE_PASSWORD', getEnv('DB_PASSWORD', 'postgres')),
} as const;

/**
 * Redis Configuration
 */
export const redisConfig = {
  /**
   * Redis host
   * Environment: REDIS_HOST
   * Default: 'localhost'
   */
  host: getEnv('REDIS_HOST', 'localhost'),

  /**
   * Redis port
   * Environment: REDIS_PORT
   * Default: 6379
   */
  port: getEnvInt('REDIS_PORT', 6379),

  /**
   * Redis password
   * Environment: REDIS_PASSWORD
   * Default: undefined (no password)
   */
  password: process.env.REDIS_PASSWORD,

  /**
   * Redis database number
   * Environment: REDIS_DB
   * Default: 0
   */
  db: getEnvInt('REDIS_DB', 0),

  /**
   * Redis key prefix
   * Environment: REDIS_KEY_PREFIX
   * Default: 'mcp:'
   */
  keyPrefix: getEnv('REDIS_KEY_PREFIX', 'mcp:'),
} as const;

/**
 * GitHub Integration Configuration
 */
export const githubConfig = {
  /**
   * GitHub Projects token
   * Environment: GITHUB_PROJECT_TOKEN or GITHUB_TOKEN
   */
  projectToken: process.env.GITHUB_PROJECT_TOKEN || process.env.GITHUB_TOKEN,

  /**
   * GitHub Project ID
   * Environment: GITHUB_PROJECT_ID
   */
  projectId: process.env.GITHUB_PROJECT_ID,
} as const;

/**
 * Speckle BIM Integration Configuration
 */
export const speckleConfig = {
  /**
   * Speckle server URL
   * Environment: SPECKLE_SERVER_URL
   * Default: 'http://localhost:8080'
   */
  serverUrl: getEnv('SPECKLE_SERVER_URL', 'http://localhost:8080'),

  /**
   * Speckle API URL
   * Environment: SPECKLE_API_URL
   * Default: 'http://speckle-server:3000/graphql'
   */
  apiUrl: getEnv('SPECKLE_API_URL', 'http://speckle-server:3000/graphql'),

  /**
   * Speckle server token
   * Environment: SPECKLE_SERVER_TOKEN
   */
  serverToken: process.env.SPECKLE_SERVER_TOKEN,
} as const;

/**
 * Validate critical configuration
 * Throws error if required config is missing in production
 */
export function validateConfig(): void {
  const errors: string[] = [];

  // Production-only validations
  if (serverConfig.nodeEnv === 'production') {
    if (!securityConfig.sessionSecret) {
      errors.push('SESSION_SECRET must be set in production');
    }
    if (!securityConfig.jwtSecret) {
      errors.push('JWT_SECRET must be set in production');
    }
    if (securityConfig.jwtSecret && securityConfig.jwtSecret.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters in production');
    }
    if (securityConfig.requireApiKey && !securityConfig.mcpApiKey) {
      errors.push('MCP_API_KEY must be set when REQUIRE_API_KEY is true');
    }
  }

  // All environments
  if (serverConfig.stdioPort === serverConfig.expressPort) {
    errors.push(
      `Stdio port (${serverConfig.stdioPort}) and Express port (${serverConfig.expressPort}) cannot be the same`
    );
  }

  if (errors.length > 0) {
    throw new Error(
      `Configuration validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`
    );
  }
}

/**
 * Log configuration (without sensitive data) for debugging
 */
export function logConfig(): void {
  console.log('📋 MCP Server Configuration:');
  console.log(`   Environment: ${serverConfig.nodeEnv}`);
  console.log(`   Version: ${serverConfig.version}`);
  console.log(`   Stdio Port: ${serverConfig.stdioPort}`);
  console.log(`   Express Port: ${serverConfig.expressPort}`);
  console.log(`   Validation Only: ${serverConfig.validationOnly}`);
  console.log(
    `   Database: ${databaseConfig.host}:${databaseConfig.port}/${databaseConfig.database}`
  );
  console.log(`   Redis: ${redisConfig.host}:${redisConfig.port}`);
  console.log(`   API Key Required: ${securityConfig.requireApiKey}`);
  console.log(`   Rate Limiting: ${securityConfig.enableRateLimiting}`);
  console.log(
    `   CORS Origins: ${securityConfig.allowedOrigins.length} configured`
  );
}

/**
 * Get full configuration object
 */
export const config = {
  server: serverConfig,
  security: securityConfig,
  database: databaseConfig,
  redis: redisConfig,
  github: githubConfig,
  speckle: speckleConfig,
} as const;

export default config;
