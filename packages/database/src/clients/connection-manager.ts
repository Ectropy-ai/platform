/**
 * Database Connection Manager
 *
 * Purpose: Orchestrate dynamic routing between Platform and Shared databases
 *
 * Pattern: Route based on data scope
 * - Global data (OAuth, API keys, tenant registry) → Platform DB
 * - Tenant-scoped data (projects, users, portfolios) → Shared Trials DB (with RLS)
 *
 * Usage:
 * ```typescript
 * import { DatabaseManager } from '@ectropy/database';
 *
 * // Get platform database for global operations
 * const platformDb = DatabaseManager.getPlatformDatabase();
 * const tenant = await platformDb.tenant.findUnique({ where: { id } });
 *
 * // Get tenant database for scoped operations
 * const tenantDb = await DatabaseManager.getTenantDatabase(tenantId);
 * const projects = await tenantDb.project.findMany();
 *
 * // Resolve tenant from user ID
 * const tenantDb = await DatabaseManager.getDatabaseForUser(userId);
 * ```
 *
 * @module connection-manager
 */

import type { PrismaClient as PlatformPrismaClient } from '@prisma/client-platform';
import type { PrismaClient as SharedPrismaClient } from '@prisma/client-shared';
import {
  getPlatformClient,
  closePlatformClient,
  checkPlatformHealth,
  isPlatformClientInitialized,
  type PlatformClientOptions,
} from './platform-client.js';
import {
  getSharedTrialsClient,
  closeSharedTrialsClient,
  closeAllSharedTrialsClients,
  checkSharedTrialsHealth,
  isSharedTrialsClientInitialized,
  getClientPoolStats,
  type SharedTrialsClientOptions,
} from './shared-trials-client.js';
import {
  validateTenantId,
} from '../middleware/rls-context.js';

/**
 * Database Manager Configuration
 */
export interface DatabaseManagerConfig {
  /**
   * Platform database options
   */
  platformOptions?: PlatformClientOptions;

  /**
   * Shared Trials database options
   */
  sharedTrialsOptions?: SharedTrialsClientOptions;

  /**
   * Enable automatic cleanup on process exit
   * Default: true
   */
  autoCleanup?: boolean;
}

/**
 * Tenant lookup result from Platform database
 */
interface TenantLookup {
  id: string;
  databaseTier: 'SHARED_TRIALS' | 'SHARED_PAID' | 'ENTERPRISE_DEDICATED';
  status: 'ACTIVE' | 'SUSPENDED' | 'TRIAL_EXPIRED';
}

/**
 * Database Connection Manager
 *
 * Singleton class that orchestrates database connections across
 * Platform and Shared databases with dynamic routing.
 *
 * Responsibilities:
 * - Route queries to appropriate database based on data scope
 * - Manage tenant resolution and validation
 * - Handle connection lifecycle and cleanup
 * - Provide unified health check interface
 *
 * @example
 * ```typescript
 * // Initialize manager (optional, auto-initialized on first use)
 * DatabaseManager.initialize({
 *   platformOptions: { enableLogging: true },
 *   sharedTrialsOptions: { maxIdleTime: 600000 }
 * });
 *
 * // Get databases
 * const platformDb = DatabaseManager.getPlatformDatabase();
 * const tenantDb = await DatabaseManager.getTenantDatabase(tenantId);
 *
 * // Cleanup on shutdown
 * await DatabaseManager.shutdown();
 * ```
 */
export class DatabaseManager {
  private static config: DatabaseManagerConfig = {
    autoCleanup: true,
  };
  private static initialized = false;

  /**
   * Initialize Database Manager with configuration
   *
   * Optional: Manager auto-initializes on first use with default config.
   * Call this to customize configuration.
   *
   * @param config - Manager configuration
   */
  static initialize(config: DatabaseManagerConfig = {}): void {
    this.config = {
      ...this.config,
      ...config,
    };

    // Register cleanup handlers if auto-cleanup enabled
    if (this.config.autoCleanup && !this.initialized) {
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());
      process.on('beforeExit', () => this.shutdown());
    }

    this.initialized = true;
  }

  /**
   * Get Platform database client
   *
   * Returns singleton PrismaClient for Platform database.
   * Use for global operations: OAuth, API keys, tenant registry.
   *
   * @returns PlatformPrismaClient instance
   * @throws Error if PLATFORM_DATABASE_URL not set
   *
   * @example
   * ```typescript
   * const platformDb = DatabaseManager.getPlatformDatabase();
   * const tenant = await platformDb.tenant.findUnique({
   *   where: { id: tenantId }
   * });
   * const apiKey = await platformDb.apiKey.findFirst({
   *   where: { userId, active: true }
   * });
   * ```
   */
  static getPlatformDatabase(): PlatformPrismaClient {
    if (!this.initialized) {
      this.initialize();
    }

    return getPlatformClient(this.config.platformOptions);
  }

  /**
   * Get Shared Trials database client for specific tenant
   *
   * Returns PrismaClient with RLS middleware for tenant-scoped data.
   * Use for tenant operations: projects, users, portfolios.
   *
   * @param tenantId - Tenant UUID
   * @returns Promise<SharedPrismaClient> with RLS enforcement
   * @throws RLSContextError if tenant_id invalid
   * @throws Error if SHARED_DATABASE_URL not set
   *
   * @example
   * ```typescript
   * const tenantDb = await DatabaseManager.getTenantDatabase(tenantId);
   * const projects = await tenantDb.project.findMany();
   * const users = await tenantDb.user.findMany();
   * ```
   */
  static async getTenantDatabase(
    tenantId: string
  ): Promise<SharedPrismaClient> {
    if (!this.initialized) {
      this.initialize();
    }

    // Validate tenant exists and is active
    await this.validateTenant(tenantId);

    return getSharedTrialsClient(tenantId, this.config.sharedTrialsOptions);
  }

  /**
   * Get database for specific user
   *
   * Resolves user's tenant and returns appropriate database client.
   *
   * Workflow:
   * 1. Query Platform DB for user → tenant mapping
   * 2. Validate tenant is active
   * 3. Return tenant-scoped database client
   *
   * @param userId - User UUID
   * @returns Promise<SharedPrismaClient> with RLS for user's tenant
   * @throws Error if user not found or tenant inactive
   *
   * @example
   * ```typescript
   * // In middleware
   * const userId = req.user.id;
   * const userDb = await DatabaseManager.getDatabaseForUser(userId);
   * const projects = await userDb.project.findMany();
   * ```
   */
  static async getDatabaseForUser(userId: string): Promise<SharedPrismaClient> {
    const platformDb = this.getPlatformDatabase();

    // Look up user's tenant from Platform database
    const user = await platformDb.user.findUnique({
      where: { id: userId },
      select: { tenantId: true },
    });

    if (!user || !user.tenantId) {
      throw new Error(`User ${userId} not found or not associated with tenant`);
    }

    return this.getTenantDatabase(user.tenantId);
  }

  /**
   * Validate tenant exists and is active
   *
   * @param tenantId - Tenant UUID
   * @throws Error if tenant not found or inactive
   */
  private static async validateTenant(tenantId: string): Promise<TenantLookup> {
    validateTenantId(tenantId);

    const platformDb = this.getPlatformDatabase();

    const tenant = await platformDb.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        databaseTier: true,
        status: true,
      },
    });

    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    if (tenant.status === 'SUSPENDED') {
      throw new Error(`Tenant ${tenantId} is suspended`);
    }

    if (tenant.status === 'TRIAL_EXPIRED') {
      throw new Error(`Tenant ${tenantId} trial has expired`);
    }

    // For now, only support SHARED_TRIALS tier
    // Future: Add routing for SHARED_PAID and ENTERPRISE_DEDICATED
    if (tenant.databaseTier !== 'SHARED_TRIALS') {
      throw new Error(
        `Tenant ${tenantId} database tier ${tenant.databaseTier} not yet supported. ` +
          `Currently only SHARED_TRIALS tier is implemented.`
      );
    }

    return tenant as TenantLookup;
  }

  /**
   * Close tenant database connection
   *
   * Removes tenant client from pool and disconnects.
   *
   * @param tenantId - Tenant UUID
   */
  static async closeTenantDatabase(tenantId: string): Promise<void> {
    await closeSharedTrialsClient(tenantId);
  }

  /**
   * Health check for all databases
   *
   * Tests connectivity for Platform database and optionally a tenant database.
   *
   * @param options - Health check options
   * @returns Health status for each database
   *
   * @example
   * ```typescript
   * // Kubernetes readiness probe
   * app.get('/health/ready', async (req, res) => {
   *   try {
   *     const health = await DatabaseManager.healthCheck({
   *       includeTenantCheck: true,
   *       testTenantId: 'test-tenant-uuid'
   *     });
   *     res.status(200).json(health);
   *   } catch (error) {
   *     res.status(503).json({ error: error.message });
   *   }
   * });
   * ```
   */
  static async healthCheck(options?: {
    includeTenantCheck?: boolean;
    testTenantId?: string;
  }): Promise<{
    platform: { status: 'healthy' | 'unhealthy'; message?: string };
    sharedTrials?: { status: 'healthy' | 'unhealthy'; message?: string };
  }> {
    const result: {
      platform: { status: 'healthy' | 'unhealthy'; message?: string };
      sharedTrials?: { status: 'healthy' | 'unhealthy'; message?: string };
    } = {
      platform: { status: 'healthy' },
    };

    // Check Platform database
    try {
      await checkPlatformHealth();
      result.platform = { status: 'healthy' };
    } catch (error) {
      result.platform = {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    // Check Shared Trials database (optional)
    if (options?.includeTenantCheck && options?.testTenantId) {
      try {
        await checkSharedTrialsHealth(options.testTenantId);
        result.sharedTrials = { status: 'healthy' };
      } catch (error) {
        result.sharedTrials = {
          status: 'unhealthy',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }

    return result;
  }

  /**
   * Get connection pool statistics
   *
   * Returns current state of database connections.
   *
   * @returns Pool statistics
   *
   * @example
   * ```typescript
   * // Monitoring endpoint
   * app.get('/metrics/database', (req, res) => {
   *   const stats = DatabaseManager.getPoolStats();
   *   res.json(stats);
   * });
   * ```
   */
  static getPoolStats(): {
    platform: { initialized: boolean };
    sharedTrials: {
      activeClients: number;
      tenantIds: string[];
      lastAccessTimes: Record<string, number>;
    };
  } {
    return {
      platform: {
        initialized: isPlatformClientInitialized(),
      },
      sharedTrials: getClientPoolStats(),
    };
  }

  /**
   * Graceful shutdown of all database connections
   *
   * Closes all tenant clients and Platform client.
   * Call this during application shutdown.
   *
   * @returns Promise that resolves when all connections closed
   *
   * @example
   * ```typescript
   * // Express graceful shutdown
   * const server = app.listen(3000);
   *
   * process.on('SIGTERM', async () => {
   *   server.close();
   *   await DatabaseManager.shutdown();
   *   process.exit(0);
   * });
   * ```
   */
  static async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      // Close all tenant clients
      await closeAllSharedTrialsClients();

      // Close platform client
      await closePlatformClient();

      if (process.env.NODE_ENV !== 'production') {
        console.log('[Database Manager] Shutdown complete');
      }
    } catch (error) {
      console.error('[Database Manager] Error during shutdown:', error);
      throw error;
    }
  }

  /**
   * Check if a tenant database is initialized
   *
   * @param tenantId - Tenant UUID
   * @returns true if client exists in pool
   */
  static isTenantDatabaseInitialized(tenantId: string): boolean {
    return isSharedTrialsClientInitialized(tenantId);
  }
}

/**
 * Re-export error types for convenience
 */
export { RLSContextError } from '../middleware/rls-context.js';

/**
 * Re-export client types
 */
export type { PlatformPrismaClient, SharedPrismaClient };
