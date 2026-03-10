/**
 * Row-Level Security (RLS) Context for Prisma
 *
 * Purpose: Provide utilities for tenant context validation and RLS enforcement
 * for shared database queries.
 *
 * Database: Shared Trials Database (ectropy_shared_trials)
 *
 * Security: CRITICAL - Tenant isolation depends on setting app.current_tenant_id
 * before each query. Without this, RLS policies will block access or allow
 * cross-tenant data leakage.
 *
 * ARCHITECTURE DECISION (2026-02-10):
 * ✅ ENTERPRISE PATTERN: Direct SQL approach ($executeRaw)
 * ❌ DEPRECATED: Prisma middleware ($use API)
 *
 * Why Direct SQL is Superior:
 * - More explicit and traceable than middleware
 * - No dependency on Prisma middleware API changes (Prisma v6 deprecated $use)
 * - PostgreSQL RLS policies work at database session level
 * - Clearer error handling and debugging
 * - Fail-fast UUID validation before database call
 *
 * Recommended Usage (via DatabaseManager):
 * ```typescript
 * import { DatabaseManager } from '@ectropy/database';
 *
 * // Get tenant database - RLS context set automatically via direct SQL
 * const tenantDb = await DatabaseManager.getTenantDatabase(tenantId);
 * const projects = await tenantDb.project.findMany(); // Only sees tenant's projects
 * ```
 *
 * Advanced Usage (direct client):
 * ```typescript
 * import { getSharedTrialsClient } from '@ectropy/database/clients/shared-trials-client';
 *
 * // Client factory sets RLS context via direct SQL before returning client
 * const client = await getSharedTrialsClient(tenantId);
 * const projects = await client.project.findMany();
 * ```
 *
 * @module rls-context
 */

/**
 * Validate UUID format
 * Security: Prevents SQL injection via tenant_id parameter
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(uuid: string): boolean {
  return UUID_REGEX.test(uuid);
}

/**
 * RLS Context Error
 * Thrown when tenant context cannot be set or is invalid
 */
export class RLSContextError extends Error {
  constructor(
    message: string,
    public readonly tenantId?: string
  ) {
    super(message);
    this.name = 'RLSContextError';
  }
}

/**
 * Options for RLS middleware
 */
export interface RLSMiddlewareOptions {
  /**
   * Tenant ID for row-level security scoping
   * Must be valid UUID format
   */
  tenantId: string;

  /**
   * Whether to reset tenant context after query
   * Default: false (keep context for connection pooling)
   *
   * Note: Setting to true adds overhead (extra SQL command per query)
   * but ensures context doesn't leak if connection is reused
   */
  resetAfterQuery?: boolean;

  /**
   * Whether to log RLS context operations
   * Default: false
   * Useful for debugging but adds overhead
   */
  debug?: boolean;
}

/**
 * @deprecated Use direct SQL approach via getSharedTrialsClient() instead.
 *
 * This function is kept for reference but should not be used in production.
 * Prisma v6 deprecated the $use middleware API.
 *
 * See recommended approach in module documentation above.
 */
export function createRLSMiddleware(
  options: string | RLSMiddlewareOptions
): any {
  // Normalize options
  const opts: Required<RLSMiddlewareOptions> =
    typeof options === 'string'
      ? {
          tenantId: options,
          resetAfterQuery: false,
          debug: false,
        }
      : {
          tenantId: options.tenantId,
          resetAfterQuery: options.resetAfterQuery ?? false,
          debug: options.debug ?? false,
        };

  // Validate tenant_id format
  if (!opts.tenantId) {
    throw new RLSContextError('Tenant ID is required for RLS middleware');
  }

  if (!isValidUUID(opts.tenantId)) {
    throw new RLSContextError(
      `Invalid tenant ID format: ${opts.tenantId}. Expected UUID.`,
      opts.tenantId
    );
  }

  // Return Prisma middleware function
  return async (params: any, next: any) => {
    const { action, model } = params;

    // Debug logging
    if (opts.debug) {
      console.log('[RLS Middleware] Setting tenant context:', {
        tenantId: opts.tenantId,
        model,
        action,
      });
    }

    try {
      // Execute query with RLS context
      // Note: Prisma middleware doesn't have direct access to connection
      // We rely on the connection being properly scoped in the client factory
      const result = await next(params);

      // Debug logging
      if (opts.debug) {
        console.log('[RLS Middleware] Query completed successfully:', {
          tenantId: opts.tenantId,
          model,
          action,
        });
      }

      return result;
    } catch (error) {
      // Enhanced error with tenant context
      if (error instanceof Error) {
        // Check for RLS policy violation errors
        if (error.message.includes('app.current_tenant_id')) {
          throw new RLSContextError(
            `RLS policy violation: Tenant context not set. Ensure client was created with tenant_id.`,
            opts.tenantId
          );
        }

        // Re-throw with context
        if (opts.debug) {
          console.error('[RLS Middleware] Query failed:', {
            tenantId: opts.tenantId,
            model,
            action,
            error: error.message,
          });
        }
      }

      throw error;
    }
  };
}

/**
 * @deprecated Use direct SQL approach via getSharedTrialsClient() instead.
 *
 * This function is kept for reference but should not be used.
 * Prisma v6 deprecated the $use middleware API.
 */
export function createRLSMiddlewareForTesting(
  tenantId: string
): any {
  return createRLSMiddleware({
    tenantId,
    resetAfterQuery: true,
    debug: true,
  });
}

/**
 * Helper: Validate tenant_id before creating client
 *
 * Use this to fail fast if tenant_id is invalid, before creating
 * Prisma client instance.
 *
 * @param tenantId - Tenant ID to validate
 * @throws RLSContextError if tenant_id is invalid
 */
export function validateTenantId(
  tenantId: string | null | undefined
): asserts tenantId is string {
  if (!tenantId) {
    throw new RLSContextError(
      'Tenant ID is required for shared database operations'
    );
  }

  if (!isValidUUID(tenantId)) {
    throw new RLSContextError(
      `Invalid tenant ID format: ${tenantId}. Expected UUID.`,
      tenantId
    );
  }
}

/**
 * Type guard: Check if error is RLSContextError
 */
export function isRLSContextError(error: unknown): error is RLSContextError {
  return error instanceof RLSContextError;
}
