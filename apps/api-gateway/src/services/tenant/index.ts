/**
 * Tenant Management Module
 *
 * Exports all tenant management services, types, and utilities.
 *
 * @module services/tenant
 * @version 1.0.0
 */

// Types and DTOs
export * from './types.js';

// Service
export {
  TenantService,
  getTenantService,
  initializeTenantService,
} from './tenant.service.js';

// Type-only exports (required for isolatedModules)
export type { TenantServiceConfig } from './tenant.service.js';
