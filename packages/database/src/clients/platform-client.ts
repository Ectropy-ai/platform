/**
 * Platform Database Client Wrapper
 *
 * Purpose: Singleton wrapper for Platform database Prisma client
 *
 * Database: Platform Database (ectropy_platform)
 * Schema: prisma/schema.platform.prisma → @prisma/client-platform
 *
 * Data Scope: Global data (no tenant scoping)
 * - OAuth connections (Google OAuth states, tokens)
 * - API keys and authentication
 * - Tenant registry (tenants table)
 * - User accounts (platform-level user data)
 *
 * Pattern: Singleton - Single PrismaClient instance shared across application
 *
 * Security: NO RLS enforcement (this is global data, not tenant-scoped)
 *
 * Usage:
 * ```typescript
 * import { getPlatformClient } from '@ectropy/database/clients/platform-client';
 *
 * const platformDb = getPlatformClient();
 * const tenant = await platformDb.tenant.findUnique({ where: { id: tenantId } });
 * const apiKey = await platformDb.apiKey.findFirst({ where: { userId } });
 * ```
 *
 * @module platform-client
 */

import { PrismaClient as PlatformPrismaClient } from '@prisma/client-platform';

/**
 * Singleton instance of Platform database client
 * Initialized on first access via getPlatformClient()
 */
let platformClient: PlatformPrismaClient | null = null;

/**
 * Platform Client Configuration Options
 */
export interface PlatformClientOptions {
  /**
   * Custom database URL (optional)
   * Default: Uses PLATFORM_DATABASE_URL from environment
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
}

/**
 * Default configuration for Platform client
 */
const DEFAULT_OPTIONS: Required<Omit<PlatformClientOptions, 'databaseUrl'>> = {
  enableLogging: process.env.NODE_ENV !== 'production',
  logLevels:
    process.env.NODE_ENV === 'production'
      ? ['error', 'warn']
      : ['query', 'info', 'warn', 'error'],
};

/**
 * Get Platform database client (singleton pattern)
 *
 * Returns a singleton PrismaClient instance for the Platform database.
 * The client is created on first access and reused for all subsequent calls.
 *
 * Lifecycle:
 * - First call: Creates new PrismaClient instance
 * - Subsequent calls: Returns existing instance
 * - Call closePlatformClient() to close and reset
 *
 * Environment Variables:
 * - PLATFORM_DATABASE_URL: PostgreSQL connection string (required)
 *
 * @param options - Optional configuration
 * @returns PlatformPrismaClient singleton instance
 * @throws Error if PLATFORM_DATABASE_URL not set
 *
 * @example
 * ```typescript
 * // Basic usage
 * const platformDb = getPlatformClient();
 * const tenants = await platformDb.tenant.findMany();
 *
 * // With custom options
 * const platformDb = getPlatformClient({
 *   enableLogging: true,
 *   logLevels: ['query', 'error']
 * });
 * ```
 */
export function getPlatformClient(
  options: PlatformClientOptions = {}
): PlatformPrismaClient {
  if (platformClient) {
    return platformClient;
  }

  // Validate database URL
  const databaseUrl = options.databaseUrl || process.env.PLATFORM_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'PLATFORM_DATABASE_URL environment variable is not set. ' +
        'Platform database client requires a valid PostgreSQL connection string.'
    );
  }

  // Merge options with defaults
  const config = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  // Create Prisma client with configuration
  platformClient = new PlatformPrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    log: config.enableLogging ? config.logLevels : [],
  });

  // Log initialization in development
  if (config.enableLogging) {
    console.log('[Platform Client] Initialized singleton instance');
  }

  return platformClient;
}

/**
 * Close Platform database client and reset singleton
 *
 * Disconnects the Prisma client and resets the singleton instance.
 * Use this for graceful shutdown or testing scenarios.
 *
 * Note: After calling this, the next call to getPlatformClient()
 * will create a new instance.
 *
 * @returns Promise that resolves when client is disconnected
 *
 * @example
 * ```typescript
 * // Graceful shutdown
 * process.on('SIGTERM', async () => {
 *   await closePlatformClient();
 *   process.exit(0);
 * });
 *
 * // Testing cleanup
 * afterAll(async () => {
 *   await closePlatformClient();
 * });
 * ```
 */
export async function closePlatformClient(): Promise<void> {
  if (platformClient) {
    await platformClient.$disconnect();
    platformClient = null;

    if (process.env.NODE_ENV !== 'production') {
      console.log('[Platform Client] Disconnected and reset singleton');
    }
  }
}

/**
 * Health check for Platform database connection
 *
 * Tests database connectivity by executing a simple query.
 * Useful for readiness checks in containerized environments.
 *
 * @returns Promise<true> if connection is healthy
 * @throws Error if connection fails
 *
 * @example
 * ```typescript
 * // Health check endpoint
 * app.get('/health', async (req, res) => {
 *   try {
 *     await checkPlatformHealth();
 *     res.status(200).json({ status: 'healthy' });
 *   } catch (error) {
 *     res.status(503).json({ status: 'unhealthy', error });
 *   }
 * });
 * ```
 */
export async function checkPlatformHealth(): Promise<true> {
  const client = getPlatformClient();

  try {
    // Simple query to test connection
    await client.$queryRaw`SELECT 1 as health_check`;
    return true;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Platform database health check failed: ${error.message}`
      );
    }
    throw new Error('Platform database health check failed');
  }
}

/**
 * Get current connection state
 *
 * @returns true if client is initialized, false otherwise
 *
 * @example
 * ```typescript
 * if (isPlatformClientInitialized()) {
 *   console.log('Platform client is ready');
 * }
 * ```
 */
export function isPlatformClientInitialized(): boolean {
  return platformClient !== null;
}

/**
 * Type export for Platform Prisma Client
 * Use this for type annotations in consuming code
 */
export type { PlatformPrismaClient };

/**
 * Re-export Prisma types for convenience
 * This allows consumers to import types without direct Prisma dependency
 */
export type {
  Tenant,
  User,
  ApiKey,
  OAuthConnection,
  Prisma,
} from '@prisma/client-platform';
