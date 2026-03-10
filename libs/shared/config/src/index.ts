/**
 * Configuration module barrel exports
 *
 * AP-004 SOLUTION: Enterprise Configuration Architecture
 * - env-schema.ts: Single source of truth with runtime validation (PRIMARY)
 * - config.validator.ts: Validation utilities only
 * - environment.ts: DEPRECATED - legacy compatibility
 *
 * AP-001 FIX (2026-01-01): Explicit exports to resolve TypeScript ambiguity
 */

// ============================================================================
// PRIMARY EXPORTS: env-schema.ts (AP-004 Solution - Single Source of Truth)
// ============================================================================

// P0 FIX (2026-01-05): Webpack module resolution fixed via duplicate module rename
// ACTUAL ROOT CAUSE: libs/shared/src/config/ (legacy) conflicted with libs/shared/config/src/
// SOLUTION: Renamed legacy module to config-LEGACY-ARCHIVE-DO-NOT-IMPORT
// VALIDATION: Extensions must remain .js for node16/nodenext module resolution

// Type-only exports (required for isolatedModules)
export type { EnvironmentConfig } from './env-schema.js';

// Runtime exports
export {
  // Enums (runtime values)
  Environment,
  LogLevel,

  // Core Configuration Functions
  getEnvConfig,
  resetEnvConfig,
  loadEnvironmentConfig,

  // URL Helper Functions (AP-001)
  getApiUrl,
  getMcpUrl,
  getWebUrl,
  getFrontendUrl,
  getBaseUrl,
  getSpeckleUrl,
  getCorsOrigins,
  getServiceUrl,

  // Schema
  envSchema,
} from './env-schema.js';

// ============================================================================
// VALIDATION UTILITIES: config.validator.ts
// ============================================================================
export {
  // Validation Functions
  validateEnvironmentConfig,
  validateJWTConfig,
  detectHardcodedSecrets,
  generateSecureSecret,
  getRequiredSecrets,
  createEnhancedConfig,
  ConfigValidator,

  // Validator-specific Types (avoid conflicts with env-schema.ts)
  type ISecretProvider,
  type ISecretProviderFactory,
  type AuthConfig,
  type ServerConfig,
  type BlockchainConfig,
  type LoggingConfig,
  type MonitoringConfig,
  type DatabaseConfig,
  type RedisConfig,
  type JWTConfig,
  type SpeckleConfig,
  type SecurityConfig,
} from './config.validator.js';

// ============================================================================
// DEPRECATED: environment.ts (Legacy Compatibility - Will be Removed)
// ============================================================================
// NOTE: Do NOT import from environment.ts - it conflicts with env-schema.ts
// Use env-schema.ts functions instead (getEnvConfig, getApiUrl, etc.)
