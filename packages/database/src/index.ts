/**
 * @ectropy/database - Enterprise Database Connection Management
 *
 * Unified database abstraction layer for Ectropy platform with:
 * - Dynamic routing between Platform and Shared databases
 * - Automatic Row-Level Security (RLS) enforcement for tenant isolation
 * - Connection pooling and lifecycle management
 * - Health checks and monitoring
 *
 * Quick Start:
 * ```typescript
 * import { DatabaseManager } from '@ectropy/database';
 *
 * // Initialize (optional - auto-initializes on first use)
 * DatabaseManager.initialize({
 *   platformOptions: { enableLogging: true },
 *   sharedTrialsOptions: { maxIdleTime: 600000 }
 * });
 *
 * // Get Platform database (global data: OAuth, API keys, tenants)
 * const platformDb = DatabaseManager.getPlatformDatabase();
 * const tenant = await platformDb.tenant.findUnique({ where: { id } });
 *
 * // Get tenant database (scoped data: projects, users, portfolios)
 * const tenantDb = await DatabaseManager.getTenantDatabase(tenantId);
 * const projects = await tenantDb.project.findMany();
 *
 * // Resolve database from user ID
 * const userDb = await DatabaseManager.getDatabaseForUser(userId);
 *
 * // Graceful shutdown
 * await DatabaseManager.shutdown();
 * ```
 *
 * Architecture:
 * - **Platform Database (ectropy_platform)**: Global data, no RLS
 *   - OAuth connections, API keys, tenant registry, user accounts
 *   - Singleton PrismaClient (shared across application)
 *
 * - **Shared Trials Database (ectropy_shared_trials)**: Tenant-scoped data, RLS enforced
 *   - Projects, Users, Portfolios, Speckle streams, Construction elements
 *   - Per-tenant PrismaClient instances with automatic RLS middleware
 *   - Connection pooling with auto-cleanup (5 min idle timeout)
 *
 * Security:
 * - All tenant databases have automatic RLS middleware
 * - Tenant ID validated as UUID (prevents SQL injection)
 * - app.current_tenant_id set before every query
 * - PostgreSQL RLS policies enforce tenant isolation
 *
 * @module @ectropy/database
 */

// ============================================================================
// Main API - DatabaseManager
// ============================================================================

export {
  DatabaseManager,
  type DatabaseManagerConfig,
} from './clients/connection-manager.js';

// ============================================================================
// Client Types
// ============================================================================

export type {
  PlatformPrismaClient,
  SharedPrismaClient,
} from './clients/connection-manager.js';

// ============================================================================
// Platform Database Types
// ============================================================================

export type {
  // Models
  Tenant,
  User,
  ApiKey,
  OAuthConnection,

  // Prisma namespace
  Prisma as PlatformPrisma,
} from '@prisma/client-platform';

// ============================================================================
// Shared Trials Database Types
// ============================================================================

export type {
  // Models
  Project,
  UserPortfolio,
  ProjectRole,
  SpeckleStream,
  ConstructionElement,
  BudgetItem,
  Rfi,
  AuditLog,

  // Re-export Tenant (from shared schema, has tenant_id)
  Tenant as SharedTenant,

  // Re-export User (from shared schema, scoped to tenant)
  User as SharedUser,

  // Enums
  TenantStatus,
  SubscriptionTier,
  UserRole,
  ProjectStatus,

  // Prisma namespace
  Prisma as SharedPrisma,
} from '@prisma/client-shared';

// ============================================================================
// Error Types
// ============================================================================

export {
  RLSContextError,
  isRLSContextError,
} from './middleware/rls-context.js';

// ============================================================================
// Advanced Usage - Direct Client Access (not recommended)
// ============================================================================

/**
 * Direct client access (advanced usage only)
 *
 * Most consumers should use DatabaseManager instead of these functions.
 * Direct client access is provided for advanced scenarios only.
 *
 * @example
 * ```typescript
 * // Advanced: Custom platform client configuration
 * import { getPlatformClient, closePlatformClient } from '@ectropy/database/advanced';
 *
 * const customClient = getPlatformClient({
 *   enableLogging: true,
 *   logLevels: ['query', 'info', 'warn', 'error']
 * });
 *
 * // Remember to clean up
 * await closePlatformClient();
 * ```
 */
export {
  getPlatformClient,
  closePlatformClient,
  checkPlatformHealth,
  isPlatformClientInitialized,
  type PlatformClientOptions,
} from './clients/platform-client.js';

export {
  getSharedTrialsClient,
  closeSharedTrialsClient,
  closeAllSharedTrialsClients,
  checkSharedTrialsHealth,
  getClientPoolStats,
  isSharedTrialsClientInitialized,
  type SharedTrialsClientOptions,
} from './clients/shared-trials-client.js';

// ============================================================================
// RLS Middleware (for custom Prisma clients)
// ============================================================================

/**
 * RLS Middleware for custom Prisma clients
 *
 * Only needed if you're creating custom Prisma clients outside of
 * DatabaseManager. For most use cases, use DatabaseManager.getTenantDatabase()
 * which automatically applies RLS middleware.
 *
 * @example
 * ```typescript
 * import { createRLSMiddleware, validateTenantId } from '@ectropy/database/middleware';
 * import { PrismaClient } from '@prisma/client-shared';
 *
 * // Validate tenant ID
 * validateTenantId(tenantId);
 *
 * // Create custom client with RLS
 * const prisma = new PrismaClient();
 * prisma.$use(createRLSMiddleware(tenantId));
 *
 * // All queries now scoped to tenant
 * const projects = await prisma.project.findMany();
 * ```
 */
export {
  createRLSMiddleware,
  createRLSMiddlewareForTesting,
  validateTenantId,
  type RLSMiddlewareOptions,
} from './middleware/rls-context.js';

// ============================================================================
// Express Middleware - Tenant Resolution
// ============================================================================

/**
 * Tenant Resolution Middleware for Express.js
 *
 * Automatically resolves tenant from request context (JWT, API key, subdomain, header)
 * and attaches tenant-scoped database client to Express Request.
 *
 * @example
 * ```typescript
 * import { TenantResolution } from '@ectropy/database/middleware';
 * import express from 'express';
 *
 * const app = express();
 *
 * // Require tenant for protected routes
 * app.use('/api/projects', TenantResolution.requireTenant());
 * app.get('/api/projects', async (req, res) => {
 *   const projects = await req.tenantDb!.project.findMany();
 *   res.json(projects);
 * });
 *
 * // Optional tenant for public routes
 * app.use('/api/public', TenantResolution.optionalTenant());
 * app.get('/api/public/data', async (req, res) => {
 *   if (req.tenantDb) {
 *     // Tenant-scoped query
 *     const data = await req.tenantDb.project.findMany();
 *   } else {
 *     // Global query
 *     const data = await getPublicData();
 *   }
 *   res.json(data);
 * });
 * ```
 *
 * Security Features:
 * - Multi-strategy tenant resolution (Header → JWT → User Lookup → Subdomain → API Key)
 * - Automatic RLS enforcement through tenant-scoped Prisma client
 * - Fail-fast validation with clear error messages
 * - Prevents tenant hopping via Platform DB validation
 */
export {
  TenantResolution,
  TenantResolutionError,
  TenantResolutionStrategy,
  isTenantResolutionError,
  type TenantResolutionOptions,
} from './middleware/tenant-resolution.js';
