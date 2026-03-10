/**
 * ENTERPRISE MOCK - Auth Configuration
 *
 * Purpose: Provide consistent test configuration for auth services
 *
 * ENTERPRISE STANDARDS:
 * - Secure default values
 * - Configurable for different test scenarios
 * - Documented configuration options
 */

import type { AuthConfig } from '../../types/auth.types.js';

/**
 * Default test configuration with secure values
 */
export const DEFAULT_TEST_CONFIG: AuthConfig = {
  jwtSecret: 'test-jwt-secret-key-for-unit-tests-only-minimum-32-characters',
  jwtExpiresIn: '1h',
  refreshTokenExpiresIn: '7d',
  sessionTimeout: 3600, // 1 hour in seconds
  maxLoginAttempts: 5,
  lockoutDuration: 900, // 15 minutes in seconds
};

/**
 * Creates a test auth configuration with optional overrides
 */
export function createTestAuthConfig(
  overrides: Partial<AuthConfig> = {}
): AuthConfig {
  return {
    ...DEFAULT_TEST_CONFIG,
    ...overrides,
  };
}

/**
 * Configuration for testing account lockout scenarios
 */
export function createLockoutTestConfig(): AuthConfig {
  return createTestAuthConfig({
    maxLoginAttempts: 3, // Lower for faster tests
    lockoutDuration: 60, // 1 minute for testing
  });
}

/**
 * Configuration for testing short-lived tokens
 */
export function createShortTokenConfig(): AuthConfig {
  return createTestAuthConfig({
    jwtExpiresIn: '1s', // Very short for expiration tests
    refreshTokenExpiresIn: '5s',
    sessionTimeout: 5,
  });
}

/**
 * Configuration for testing long-lived sessions
 */
export function createLongSessionConfig(): AuthConfig {
  return createTestAuthConfig({
    jwtExpiresIn: '24h',
    refreshTokenExpiresIn: '30d',
    sessionTimeout: 86400, // 24 hours
  });
}
