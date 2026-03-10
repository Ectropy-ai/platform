/**
 * Secrets Management Library - Staging Build Exports
 * This version excludes AWS dependencies for staging builds
 */

// Core types and interfaces - use type-only export for better TypeScript compliance
export * from './types.js';

// Secret sources - concrete implementations (staging: exclude AWS)
export { InfisicalSecretSource } from './infisical-source.js';
// Note: AWS Secrets Manager source excluded in staging builds

// Edge caching
export { EdgeCache } from './edge-cache.js';

// Main provider implementation (staging version without AWS)
export { EctropySecretProvider } from './secret-provider.staging.js';

// Factory for easy instantiation
export { SecretProviderFactory } from './factory.js';

// Validation framework
export { SecretValidator } from './validation.js';
export type {
  SecretValidationRule,
  ValidationResult,
  SecretValidationConfig,
} from './validation.js';

// Migration utilities
export { SecretMigrationService } from './migration.js';
export type {
  MigrationResult,
  MigrationDetail,
} from './migration.js';

// Monitoring and compliance
export { SecretMonitoringService } from './monitoring.js';
export type {
  SecurityAlert,
  ComplianceReport,
  ComplianceViolation,
} from './monitoring.js';

// Convenience re-exports for common patterns - explicit type-only exports
export type {
  SecretConfig,
  SecretValue,
  SecretProvider,
  SecretProviderConfig,
  SecretProviderMetrics,
  AuditLogEntry,
} from './types.js';