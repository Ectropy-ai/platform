/**
 * Shared Trials Database Client Factory
 *
 * Purpose: Create per-tenant Prisma clients with automatic RLS enforcement
 *
 * Database: Shared Trials Database (ectropy_shared_trials)
 * Schema: prisma/schema.shared.prisma → @prisma/client-shared
 *
 * Data Scope: Tenant-scoped data (RLS enforced)
 * - Projects, Users, Portfolios
 * - Speckle streams, Construction elements
 * - Budget items, RFIs, Audit logs
 *
 * Pattern: Per-tenant client instances with connection pooling
 *
 * Security: RLS middleware REQUIRED - All queries automatically scoped to tenant_id
 *
 * Usage:
 * ```typescript
 * import { getSharedTrialsClient, closeSharedTrialsClient } from '@ectropy/database/clients/shared-trials-client';
 *
 * // Get client for specific tenant
 * const tenantDb = await getSharedTrialsClient('550e8400-e29b-41d4-a716-446655440000');
 *
 * // All queries automatically scoped to this tenant
 * const projects = await tenantDb.project.findMany(); // Only this tenant's projects
 * const users = await tenantDb.user.findMany(); // Only this tenant's users
 *
 * // Close client when done (e.g., end of request)
 * await closeSharedTrialsClient('550e8400-e29b-41d4-a716-446655440000');
 * ```
 *
 * @module shared-trials-client
 */

import { PrismaClient as SharedPrismaClient } from '@prisma/client-shared';
import { Pool } from 'pg';
import {
  validateTenantId,
} from '../middleware/rls-context.js';

/**
 * Client pool: Map of tenant_id → PrismaClient with RLS middleware
 * Each tenant gets its own client instance with automatic tenant context
 */
const clientPool = new Map<string, SharedPrismaClient>();

/**
 * PostgreSQL connection pool for RLS context setting
 * Used for $queryRaw to set tenant context before Prisma queries
 */
const pgPool = new Map<string, Pool>();

/**
 * Shared Trials Client Configuration Options
 */
export interface SharedTrialsClientOptions {
  /**
   * Custom database URL (optional)
   * Default: Uses SHARED_DATABASE_URL from environment
   */
  databaseUrl?: string;

  /**
   * Enable query logging
   * Default: false in production, true in development
   */
  enableLogging?: boolean;

  /**
   * Custom log levels
   * Default: ['error', 'warn']
   */
  logLevels?: Array<'query' | 'info' | 'warn' | 'error'>;

  /**
   * Maximum idle time for client before auto-cleanup (ms)
   * Default: 300000 (5 minutes)
   * Set to 0 to disable auto-cleanup
   */
  maxIdleTime?: number;
}

/**
 * Default configuration for Shared Trials clients
 */
const DEFAULT_OPTIONS: Required<
  Omit<SharedTrialsClientOptions, 'databaseUrl'>
> = {
  enableLogging: process.env.NODE_ENV !== 'production',
  logLevels:
    process.env.NODE_ENV === 'production'
      ? ['error', 'warn']
      : ['query', 'info', 'warn', 'error'],
  maxIdleTime: 5 * 60 * 1000, // 5 minutes
};

/**
 * Track last access time for each client (for auto-cleanup)
 */
const lastAccessTime = new Map<string, number>();

/**
 * Get Shared Trials database client for specific tenant
 *
 * Returns a PrismaClient instance with RLS middleware that automatically
 * sets tenant context for all queries. Clients are pooled per tenant_id
 * and reused across requests.
 *
 * Lifecycle:
 * - First call for tenant: Creates new PrismaClient with RLS middleware
 * - Subsequent calls: Returns existing client from pool
 * - Auto-cleanup: Clients idle for maxIdleTime are automatically closed
 * - Manual cleanup: Call closeSharedTrialsClient(tenantId)
 *
 * Environment Variables:
 * - SHARED_DATABASE_URL: PostgreSQL connection string (required)
 *
 * @param tenantId - Tenant UUID for RLS scoping
 * @param options - Optional configuration
 * @returns Promise<SharedPrismaClient> with RLS middleware
 * @throws RLSContextError if tenant_id is invalid
 * @throws Error if SHARED_DATABASE_URL not set
 *
 * @example
 * ```typescript
 * // Basic usage
 * const tenantDb = await getSharedTrialsClient('550e8400-e29b-41d4-a716-446655440000');
 * const projects = await tenantDb.project.findMany();
 *
 * // With custom options
 * const tenantDb = await getSharedTrialsClient(
 *   '550e8400-e29b-41d4-a716-446655440000',
 *   {
 *     enableLogging: true,
 *     rlsOptions: { debug: true }
 *   }
 * );
 * ```
 */
export async function getSharedTrialsClient(
  tenantId: string,
  options: SharedTrialsClientOptions = {}
): Promise<SharedPrismaClient> {
  // Validate tenant_id format (throws if invalid)
  validateTenantId(tenantId);

  // Check if client already exists in pool
  if (clientPool.has(tenantId)) {
    // Update last access time
    lastAccessTime.set(tenantId, Date.now());
    return clientPool.get(tenantId)!;
  }

  // Validate database URL
  const databaseUrl = options.databaseUrl || process.env.SHARED_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'SHARED_DATABASE_URL environment variable is not set. ' +
        'Shared Trials database client requires a valid PostgreSQL connection string.'
    );
  }

  // Merge options with defaults
  const config = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  // Create PostgreSQL pool for raw queries (RLS context setting)
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10, // Maximum 10 connections per tenant
    idleTimeoutMillis: config.maxIdleTime,
  });
  pgPool.set(tenantId, pool);

  // Create Prisma client with configuration
  const client = new SharedPrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    log: config.enableLogging ? config.logLevels : [],
  });

  // CRITICAL: Set tenant context in database before any queries
  // This ensures RLS policies can access app.current_tenant_id
  //
  // ENTERPRISE PATTERN: Direct SQL approach (not Prisma middleware)
  // - More explicit and traceable than middleware
  // - No dependency on Prisma middleware API changes
  // - PostgreSQL RLS policies work at database session level
  // - Clearer error handling and debugging
  await setTenantContext(client, tenantId);

  // Store client in pool
  clientPool.set(tenantId, client);
  lastAccessTime.set(tenantId, Date.now());

  // Log initialization in development
  if (config.enableLogging) {
    console.log(
      `[Shared Trials Client] Created client for tenant: ${tenantId}`
    );
  }

  // Schedule auto-cleanup if enabled
  if (config.maxIdleTime > 0) {
    scheduleCleanup(tenantId, config.maxIdleTime);
  }

  return client;
}

/**
 * Set tenant context in database session
 *
 * Executes SQL to set app.current_tenant_id for RLS policies.
 * This must be called before any tenant-scoped queries.
 *
 * @param client - Prisma client instance
 * @param tenantId - Tenant UUID
 */
async function setTenantContext(
  client: SharedPrismaClient,
  tenantId: string
): Promise<void> {
  try {
    // Set tenant context using PostgreSQL configuration parameter
    // This makes the tenant_id available to RLS policies via current_setting()
    await client.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, false)`;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to set tenant context for ${tenantId}: ${error.message}`
      );
    }
    throw new Error(`Failed to set tenant context for ${tenantId}`);
  }
}

/**
 * Close Shared Trials client for specific tenant
 *
 * Disconnects the Prisma client and removes it from the pool.
 * Use this for manual cleanup or when tenant session ends.
 *
 * @param tenantId - Tenant UUID
 * @returns Promise that resolves when client is disconnected
 *
 * @example
 * ```typescript
 * // End of request lifecycle
 * app.use(async (req, res, next) => {
 *   res.on('finish', async () => {
 *     if (req.tenantId) {
 *       await closeSharedTrialsClient(req.tenantId);
 *     }
 *   });
 *   next();
 * });
 * ```
 */
export async function closeSharedTrialsClient(tenantId: string): Promise<void> {
  const client = clientPool.get(tenantId);
  if (client) {
    await client.$disconnect();
    clientPool.delete(tenantId);
    lastAccessTime.delete(tenantId);

    // Close PostgreSQL pool
    const pool = pgPool.get(tenantId);
    if (pool) {
      await pool.end();
      pgPool.delete(tenantId);
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[Shared Trials Client] Closed client for tenant: ${tenantId}`
      );
    }
  }
}

/**
 * Close all Shared Trials clients
 *
 * Disconnects all tenant clients in the pool.
 * Use this for graceful shutdown.
 *
 * @returns Promise that resolves when all clients are disconnected
 *
 * @example
 * ```typescript
 * // Graceful shutdown
 * process.on('SIGTERM', async () => {
 *   await closeAllSharedTrialsClients();
 *   process.exit(0);
 * });
 * ```
 */
export async function closeAllSharedTrialsClients(): Promise<void> {
  const tenantIds = Array.from(clientPool.keys());

  await Promise.all(
    tenantIds.map((tenantId) => closeSharedTrialsClient(tenantId))
  );

  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[Shared Trials Client] Closed all clients (${tenantIds.length} tenants)`
    );
  }
}

/**
 * Schedule auto-cleanup for idle client
 *
 * @param tenantId - Tenant UUID
 * @param maxIdleTime - Maximum idle time in milliseconds
 */
function scheduleCleanup(tenantId: string, maxIdleTime: number): void {
  setTimeout(async () => {
    const lastAccess = lastAccessTime.get(tenantId);
    if (lastAccess && Date.now() - lastAccess >= maxIdleTime) {
      // Client has been idle for maxIdleTime, close it
      if (process.env.NODE_ENV !== 'production') {
        console.log(
          `[Shared Trials Client] Auto-cleanup: closing idle client for tenant ${tenantId}`
        );
      }
      await closeSharedTrialsClient(tenantId);
    } else {
      // Still active, schedule next cleanup check
      scheduleCleanup(tenantId, maxIdleTime);
    }
  }, maxIdleTime);
}

/**
 * Health check for Shared Trials database connection
 *
 * Tests database connectivity and RLS configuration by executing
 * a query with tenant context.
 *
 * @param tenantId - Tenant UUID for testing
 * @returns Promise<true> if connection and RLS are healthy
 * @throws Error if connection or RLS configuration fails
 *
 * @example
 * ```typescript
 * // Health check endpoint
 * app.get('/health/tenant/:tenantId', async (req, res) => {
 *   try {
 *     await checkSharedTrialsHealth(req.params.tenantId);
 *     res.status(200).json({ status: 'healthy' });
 *   } catch (error) {
 *     res.status(503).json({ status: 'unhealthy', error });
 *   }
 * });
 * ```
 */
export async function checkSharedTrialsHealth(tenantId: string): Promise<true> {
  validateTenantId(tenantId);

  try {
    const client = await getSharedTrialsClient(tenantId);

    // Test 1: Basic connectivity
    await client.$queryRaw`SELECT 1 as health_check`;

    // Test 2: RLS context is set
    const result = await client.$queryRaw<Array<{ current_tenant: string }>>`
      SELECT current_setting('app.current_tenant_id') as current_tenant
    `;

    if (result[0]?.current_tenant !== tenantId) {
      throw new Error(
        `RLS context mismatch: expected ${tenantId}, got ${result[0]?.current_tenant}`
      );
    }

    // Test 3: Can query tenant-scoped table
    await client.project.findMany({ take: 1 });

    return true;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Shared Trials database health check failed for tenant ${tenantId}: ${error.message}`
      );
    }
    throw new Error(
      `Shared Trials database health check failed for tenant ${tenantId}`
    );
  }
}

/**
 * Get current client pool statistics
 *
 * Useful for monitoring and debugging.
 *
 * @returns Pool statistics
 *
 * @example
 * ```typescript
 * const stats = getClientPoolStats();
 * console.log(`Active tenant clients: ${stats.activeClients}`);
 * console.log(`Tenants: ${stats.tenantIds.join(', ')}`);
 * ```
 */
export function getClientPoolStats(): {
  activeClients: number;
  tenantIds: string[];
  lastAccessTimes: Record<string, number>;
} {
  return {
    activeClients: clientPool.size,
    tenantIds: Array.from(clientPool.keys()),
    lastAccessTimes: Object.fromEntries(lastAccessTime),
  };
}

/**
 * Check if client exists in pool for specific tenant
 *
 * @param tenantId - Tenant UUID
 * @returns true if client is initialized
 */
export function isSharedTrialsClientInitialized(tenantId: string): boolean {
  return clientPool.has(tenantId);
}

/**
 * Type export for Shared Prisma Client
 * Use this for type annotations in consuming code
 */
export type { SharedPrismaClient };

/**
 * Re-export Prisma types for convenience
 * This allows consumers to import types without direct Prisma dependency
 */
export type {
  Project,
  User,
  UserPortfolio,
  ProjectRole,
  SpeckleStream,
  ConstructionElement,
  BudgetItem,
  Rfi,
  AuditLog,
  Tenant,
  Prisma,
} from '@prisma/client-shared';
