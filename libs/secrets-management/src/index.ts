/**
 * Secrets Management Library - Barrel Exports
 * Hybrid Infisical + AWS Secrets Manager implementation for Ectropy Platform
 */

// Core types and interfaces - use type-only export for better TypeScript compliance
export type {
  SecretConfig,
  SecretValue,
  SecretProviderConfig,
  SecretProviderMetrics,
  AuditLogEntry,
  SecretProvider
} from './types.js';

// Export the abstract class for extension
export { BaseSecretSource } from './types.js';

// Secret sources - concrete implementations
export { InfisicalSecretSource } from './infisical-source.js';
export { AwsSecretsManagerSource } from './aws-secrets-manager-source.js';

// Edge caching
export { EdgeCache } from './edge-cache.js';

// Main provider implementation
export { EctropySecretProvider } from './secret-provider.js';

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