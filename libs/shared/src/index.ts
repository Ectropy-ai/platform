/**
 * =============================================================================
 * ECTROPY SHARED LIBRARY - MAIN EXPORTS
 *
 * This file provides centralized exports for all shared modules across the
 * Ectropy platform. It follows enterprise-grade patterns for module organization
 * and provides a clean, type-safe API surface.
 */

// Core utilities
export { Logger } from './utils/index.js';
export { PlatformUtils } from './utils/platform-utils.js';
export { ValidationUtils } from './utils/validation.js';

// Middleware
export { SecurityMiddleware } from './middleware/security.middleware.js';
export { AuthMiddleware } from './middleware/auth.middleware.js';
export * from './middleware/index.js';

// Types - Critical for type safety across services
export * from './types/index.js';
// Export specific types from separate files to avoid conflicts
export type {
  UserProfile,
  UserPermission,
  UserRole,
  UserSession,
  UserStatus,
  UserCreateRequest,
  UserUpdateRequest,
} from './types/user.types.js';
export type {
  Agent,
  AgentType,
  AgentStatus,
  AgentCapability,
  AgentConfig,
  AgentExecution,
  ExecutionStatus,
  AgentInput,
  AgentOutput,
  AgentMetrics,
  AgentPrediction,
} from './types/agent.types.js';
export type {
  ServiceHealth,
  OverallHealth,
  DatabaseHealth,
  RedisHealth,
  SystemHealth,
  PerformanceMetrics,
} from './types/health.types.js';

// Environment Configuration (Enterprise Multi-Environment Support)
export {
  getConfig,
  getServiceUrl,
  getDatabaseUrl,
  getRedisUrl,
  validateEnvironment,
  type Environment,
  type EnvironmentConfig,
} from '../config/src/environment.js';

// Redis client
export * from './redis/index.js';

// Health management
export * from './health/index.js';

// Utilities - exported with namespace to avoid conflicts
export * as utils from './utils/index.js';

// Re-export commonly used utilities directly for convenience
export { logger } from './utils/index.js';

// Node.js ESM utilities
export * from './node-utils.js';

// Version for dependency tracking
export const SHARED_VERSION = '1.0.0';
export const SHARED_LIB_VERSION = '1.0.0';
export const SHARED_LIB_BUILD = process.env.BUILD_NUMBER || 'local';
