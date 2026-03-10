/**
 * Centralized Configuration with Validation
 *
 * Phase: 5a - Demo Readiness & BIM Viewer Integration
 * Deliverable: p5a-d5 - OAuth Integration
 * Issue: #1996
 *
 * Implements 12-Factor App methodology with runtime validation.
 * Single source of truth for all environment configuration.
 * Validates at startup - fails fast if misconfigured.
 */

import { cleanEnv, str, url, port } from 'envalid';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

/**
 * Environment enum - Single source of truth
 * No more string matching hacks!
 */
export enum Environment {
  DEVELOPMENT = 'development',
  STAGING = 'staging',
  PRODUCTION = 'production',
  TEST = 'test',
}

/**
 * Validated configuration schema
 * All environment variables validated at startup
 * TypeScript autocomplete for all config values
 */
export const config = cleanEnv(process.env, {
  // Environment
  NODE_ENV: str({
    choices: ['development', 'staging', 'production', 'test'],
    default: 'development',
    desc: 'Application environment',
  }),

  // Server
  PORT: port({ default: 4000, desc: 'Server port' }),
  API_PORT: port({ default: 4000, desc: 'API Gateway port (alias)' }),

  // OAuth - Google
  GOOGLE_CLIENT_ID: str({
    desc: 'Google OAuth 2.0 Client ID',
    example: '123456789-abcdef.apps.googleusercontent.com',
  }),
  GOOGLE_CLIENT_SECRET: str({
    desc: 'Google OAuth 2.0 Client Secret',
  }),
  OAUTH_CALLBACK_URL: url({
    desc: 'OAuth callback URL',
    example: 'https://staging.ectropy.ai/auth/google/callback',
    default: 'http://localhost:4000/auth/google/callback',
  }),

  // OAuth - Authorization
  AUTHORIZED_USERS: str({
    desc: 'Comma-separated list of authorized user emails (fallback for bootstrap)',
    default: '',
  }),
  ADMIN_DOMAIN: str({
    desc: 'Email domain for automatic platform admin access (e.g., luh.tech)',
    default: 'luh.tech',
  }),

  // Session
  // ENTERPRISE SECURITY (2025-12-19): No default in production
  // Weak defaults enable session forgery attacks
  // Strategy: Fail-fast if not properly configured
  // TypeScript FIX: Cast to string to avoid type narrowing issues with ProcessEnv types
  SESSION_SECRET: str({
    desc: 'Secret key for session signing (minimum 32 characters)',
    default:
      (process.env.NODE_ENV as string) === 'production' ||
      (process.env.NODE_ENV as string) === 'staging'
        ? undefined // Force explicit configuration in secure environments
        : 'dev-session-secret-change-in-production-minimum-32-chars',
  }),

  // Redis
  REDIS_URL: url({
    desc: 'Redis connection URL',
    default: 'redis://localhost:6379',
  }),
  REDIS_PASSWORD: str({
    desc: 'Redis password',
    default: '',
  }),

  // Database
  DATABASE_URL: url({
    desc: 'PostgreSQL connection URL',
    default: 'postgresql://postgres:postgres@localhost:5432/ectropy',
  }),
  DATABASE_HOST: str({ default: 'localhost', desc: 'Database host' }),
  DATABASE_PORT: port({ default: 5432, desc: 'Database port' }),
  DATABASE_NAME: str({ default: 'ectropy', desc: 'Database name' }),
  DATABASE_USER: str({ default: 'postgres', desc: 'Database user' }),
  DATABASE_PASSWORD: str({ default: '', desc: 'Database password' }),

  // CORS
  CORS_ORIGINS: str({
    desc: 'Comma-separated list of allowed CORS origins',
    default: 'http://localhost:3000',
  }),
  ALLOWED_ORIGINS: str({
    desc: 'Alias for CORS_ORIGINS',
    default: '',
  }),

  // Frontend
  FRONTEND_URL: url({
    desc: 'Frontend application URL',
    default: 'http://localhost:3000',
  }),
  API_BASE_URL: url({
    desc: 'API base URL',
    default: 'http://localhost:4000',
  }),

  // JWT (for future token-based auth if needed)
  // ENTERPRISE SECURITY (2025-12-19): No defaults in secure environments
  // Weak defaults enable JWT forgery and token replay attacks
  // TypeScript FIX: Cast to string to avoid type narrowing issues with ProcessEnv types
  JWT_SECRET: str({
    desc: 'JWT signing secret (minimum 64 characters recommended)',
    default:
      (process.env.NODE_ENV as string) === 'production' ||
      (process.env.NODE_ENV as string) === 'staging'
        ? undefined // Force explicit configuration
        : 'dev-jwt-secret-change-in-production-must-be-at-least-64-characters-long',
  }),
  JWT_REFRESH_SECRET: str({
    desc: 'JWT refresh token secret (minimum 64 characters recommended)',
    default:
      (process.env.NODE_ENV as string) === 'production' ||
      (process.env.NODE_ENV as string) === 'staging'
        ? undefined // Force explicit configuration
        : 'dev-jwt-refresh-secret-change-in-production-must-be-64-characters',
  }),
  JWT_EXPIRES_IN: str({ default: '15m', desc: 'JWT expiration time' }),
  JWT_REFRESH_EXPIRES_IN: str({
    default: '7d',
    desc: 'JWT refresh expiration',
  }),

  // Email Configuration - Resend (ENTERPRISE FIX 2025-12-21)
  // Transactional email service for waitlist, password reset, verification
  RESEND_API_KEY: str({
    desc: 'Resend API key for transactional email',
    default: '',
  }),
  RESEND_FROM_EMAIL: str({
    desc: 'Default sender email address',
    default: 'noreply@ectropy.ai',
  }),
  EMAIL_RETRY_ATTEMPTS: str({
    desc: 'Number of retry attempts for failed email sends',
    default: '3',
  }),
});

/**
 * Environment helpers - Type-safe and clean
 */
export const ENV = config.NODE_ENV as Environment;
export const isProduction = ENV === Environment.PRODUCTION;
export const isStaging = ENV === Environment.STAGING;
export const isDevelopment = ENV === Environment.DEVELOPMENT;
export const isTest = ENV === Environment.TEST;
export const isSecure = isProduction || isStaging;

/**
 * CORS origins as array
 */
export const getCorsOrigins = (): string[] => {
  const origins = config.CORS_ORIGINS || config.ALLOWED_ORIGINS || '';
  return origins
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
};

/**
 * Authorized users as array
 */
export const getAuthorizedUsers = (): string[] => {
  return config.AUTHORIZED_USERS.split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
};

/**
 * ENTERPRISE SECURITY (2025-12-19): Strategic Configuration Validation
 * Validates configuration at startup with comprehensive security checks
 * Implements defense-in-depth strategy: envalid + custom validation
 * Throws if any required variables are missing or invalid
 *
 * Security Principles:
 * - Fail-fast: Detect misconfigurations at startup, not at runtime
 * - No weak defaults: Force explicit configuration in secure environments
 * - Defense in depth: Multiple layers of validation
 */
export function validateConfig(): void {
  // Layer 1: OAuth Configuration (existing)
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
    throw new Error(
      'SECURITY: OAuth configuration incomplete - GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required'
    );
  }

  // Layer 2: Session Security (enhanced)
  if (!config.SESSION_SECRET) {
    throw new Error(
      'SECURITY: SESSION_SECRET is required - weak session secrets enable session forgery attacks'
    );
  }
  if (config.SESSION_SECRET.length < 32) {
    throw new Error(
      `SECURITY: SESSION_SECRET must be at least 32 characters (current: ${config.SESSION_SECRET.length})`
    );
  }
  // Detect common weak secrets
  const weakSecrets = [
    'your-session-secret-here',
    'change-me',
    'secret',
    'password',
    'dev-session-secret',
  ];
  if (
    weakSecrets.some((weak) =>
      config.SESSION_SECRET.toLowerCase().includes(weak)
    )
  ) {
    if (isProduction || isStaging) {
      throw new Error(
        'SECURITY: SESSION_SECRET appears to be a default/weak value - use a cryptographically random string'
      );
    }
  }

  // Layer 3: JWT Security (new)
  if (isProduction || isStaging) {
    if (!config.JWT_SECRET || !config.JWT_REFRESH_SECRET) {
      throw new Error(
        'SECURITY: JWT_SECRET and JWT_REFRESH_SECRET are required in production/staging'
      );
    }
    if (config.JWT_SECRET.length < 64) {
      throw new Error(
        `SECURITY: JWT_SECRET should be at least 64 characters for production use (current: ${config.JWT_SECRET.length})`
      );
    }
    if (config.JWT_REFRESH_SECRET.length < 64) {
      throw new Error(
        `SECURITY: JWT_REFRESH_SECRET should be at least 64 characters (current: ${config.JWT_REFRESH_SECRET.length})`
      );
    }
    // Ensure JWT secrets are different
    if (config.JWT_SECRET === config.JWT_REFRESH_SECRET) {
      throw new Error(
        'SECURITY: JWT_SECRET and JWT_REFRESH_SECRET must be different values'
      );
    }
  }

  // Layer 4: HTTPS Enforcement (enhanced)
  if (isProduction || isStaging) {
    if (!config.OAUTH_CALLBACK_URL.startsWith('https://')) {
      throw new Error(
        'SECURITY: OAUTH_CALLBACK_URL must use HTTPS in production/staging environments'
      );
    }

    // Validate CORS origins don't include localhost in production
    const corsOrigins = getCorsOrigins();
    const hasLocalhost = corsOrigins.some(
      (origin) => origin.includes('localhost') || origin.includes('127.0.0.1')
    );
    if (hasLocalhost) {
      logger.warn(
        '⚠️  WARNING: CORS_ORIGINS includes localhost in production/staging environment'
      );
      logger.warn(
        '   This may be a misconfiguration. Verify CORS_ORIGINS is set correctly.'
      );
    }

    // Ensure CORS origins use HTTPS
    const hasInsecureOrigin = corsOrigins.some(
      (origin) => origin.startsWith('http://') && !origin.includes('localhost')
    );
    if (hasInsecureOrigin) {
      throw new Error(
        'SECURITY: CORS_ORIGINS must use HTTPS in production/staging (found insecure HTTP origins)'
      );
    }
  }

  // Layer 5: Rate Limiting Enforcement (strategic opt-out pattern)
  if (isProduction || isStaging) {
    if (process.env.DISABLE_RATE_LIMITING === 'true') {
      throw new Error(
        'SECURITY: Cannot disable rate limiting in production/staging - removes DoS protection'
      );
    }
    // Always enabled in production/staging (opt-out pattern)
    logger.info('   Rate limiting: enabled (always-on in production/staging)');
  } else {
    // Development: enabled by default unless explicitly disabled
    const isDisabled = process.env.DISABLE_RATE_LIMITING === 'true';
    logger.info(
      `   Rate limiting: ${isDisabled ? 'DISABLED (dev only)' : 'enabled'}`
    );
  }

  logger.info('✅ Configuration validated successfully');
  logger.info(`   Environment: ${ENV}`);
  logger.info(`   Port: ${config.PORT}`);
  logger.info(`   OAuth Callback: ${config.OAUTH_CALLBACK_URL}`);
  logger.info(`   CORS Origins: ${getCorsOrigins().join(', ')}`);
  logger.info(
    `   Session Secret Length: ${config.SESSION_SECRET.length} chars`
  );
  if (isProduction || isStaging) {
    logger.info(
      `   JWT Secret Length: ${config.JWT_SECRET?.length || 0} chars`
    );
  }
}

/**
 * Export configuration object for easy importing
 * Usage: import { config, ENV, isProduction } from './config'
 */
export default config;
