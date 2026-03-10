/**
 * =============================================================================
 * ECTROPY DATABASE INTEGRATION LAYER
 *
 * PURPOSE: Production-ready database connections and query abstractions
 * FEATURES:
 * - PostgreSQL connection with connection pooling
 * - Redis caching layer with TypeScript support
 * - Type-safe query builders and migrations
 * - Health checks and monitoring
 * SECURITY:
 * - Connection string sanitization
 * - Query parameter validation
 * - Connection timeout and retry logic
 * USAGE:
 * import { DatabaseService, CacheService } from '@ectropy/database';
 * const db = new DatabaseService(config);
 * const cache = new CacheService(redisConfig);
 */

export { DatabaseService } from './services/database.service.js';
export { CacheService } from './services/cache.service.js';
export { HealthCheckService } from './services/health-check.service.js';
export type { DatabaseConfig, RedisConfig } from './types/database.types.js';
export { DatabaseConfigService } from './config/database.config.js';
export { pool } from './pool.js';

// Multi-Tenant Foundation (MT-M1)
export {
  TenantContextService,
  TenantContextError,
  getTenantContextService,
  initializeTenantContext,
  createTenantMiddleware,
  tenantContextStorage,
} from './services/tenant-context.service.js';
export type {
  TenantContext,
  TenantValidationResult,
  TenantScopedOptions,
} from './services/tenant-context.service.js';
