/**
 * Tenant Context Service - Multi-Tenant Foundation (MT-M1)
 *
 * Provides tenant isolation for database operations supporting:
 * - Tenant context management (AsyncLocalStorage for request-scoped context)
 * - RLS session variable injection for PostgreSQL
 * - Tenant-scoped query helpers
 * - PIPEDA compliance support for data isolation
 */

import { AsyncLocalStorage } from 'async_hooks';
import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger.js';

/**
 * Tenant context data stored in AsyncLocalStorage
 */
export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  userId?: string;
  isPlatformAdmin?: boolean;
}

/**
 * Result of tenant validation
 */
export interface TenantValidationResult {
  valid: boolean;
  tenantId?: string;
  tenantSlug?: string;
  status?: string;
  error?: string;
}

/**
 * Options for tenant-scoped operations
 */
export interface TenantScopedOptions {
  /** Skip tenant check (for platform admin operations) */
  bypassTenantCheck?: boolean;
  /** Custom tenant ID override */
  tenantIdOverride?: string;
}

// AsyncLocalStorage for request-scoped tenant context
const tenantContextStorage = new AsyncLocalStorage<TenantContext>();

/**
 * Tenant Context Service
 * Manages multi-tenant data isolation
 */
export class TenantContextService {
  private pool: Pool | null = null;

  constructor(pool?: Pool) {
    this.pool = pool || null;
  }

  /**
   * Set the database pool for tenant operations
   */
  setPool(pool: Pool): void {
    this.pool = pool;
  }

  /**
   * Run a function within a tenant context
   * All database operations within the callback will be tenant-scoped
   */
  async runWithTenant<T>(
    context: TenantContext,
    callback: () => Promise<T>
  ): Promise<T> {
    return tenantContextStorage.run(context, callback);
  }

  /**
   * Get the current tenant context from AsyncLocalStorage
   */
  getCurrentContext(): TenantContext | undefined {
    return tenantContextStorage.getStore();
  }

  /**
   * Get the current tenant ID (throws if not in tenant context)
   */
  getCurrentTenantId(): string {
    const context = this.getCurrentContext();
    if (!context?.tenantId) {
      throw new TenantContextError('No tenant context available');
    }
    return context.tenantId;
  }

  /**
   * Get the current tenant ID or null (safe version)
   */
  getCurrentTenantIdOrNull(): string | null {
    return this.getCurrentContext()?.tenantId || null;
  }

  /**
   * Check if current context is a platform admin
   */
  isPlatformAdmin(): boolean {
    return this.getCurrentContext()?.isPlatformAdmin === true;
  }

  /**
   * Validate a tenant exists and is active
   */
  async validateTenant(tenantIdOrSlug: string): Promise<TenantValidationResult> {
    if (!this.pool) {
      return { valid: false, error: 'Database pool not configured' };
    }

    try {
      // Check if input is UUID (tenant ID) or slug
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        tenantIdOrSlug
      );

      const query = isUuid
        ? 'SELECT id, slug, status FROM tenants WHERE id = $1'
        : 'SELECT id, slug, status FROM tenants WHERE slug = $1';

      const result = await this.pool.query(query, [tenantIdOrSlug]);

      if (result.rows.length === 0) {
        return { valid: false, error: 'Tenant not found' };
      }

      const tenant = result.rows[0];

      // Check tenant status
      if (tenant.status !== 'ACTIVE' && tenant.status !== 'TRIAL') {
        return {
          valid: false,
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          status: tenant.status,
          error: `Tenant is ${tenant.status.toLowerCase()}`,
        };
      }

      return {
        valid: true,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        status: tenant.status,
      };
    } catch (error) {
      logger.error('Tenant validation failed', { error, tenantIdOrSlug });
      return { valid: false, error: 'Tenant validation failed' };
    }
  }

  /**
   * Execute a query with RLS tenant context
   * Sets the session variable for Row-Level Security
   */
  async queryWithTenantContext<T>(
    query: string,
    params: any[] = [],
    options: TenantScopedOptions = {}
  ): Promise<T[]> {
    if (!this.pool) {
      throw new TenantContextError('Database pool not configured');
    }

    const tenantId = options.tenantIdOverride || this.getCurrentTenantIdOrNull();

    // Platform admins can bypass tenant check
    if (!tenantId && !options.bypassTenantCheck && !this.isPlatformAdmin()) {
      throw new TenantContextError('Tenant context required for this operation');
    }

    const client = await this.pool.connect();
    try {
      // Set RLS session variables
      if (tenantId) {
        await client.query(
          "SELECT set_config('app.current_tenant_id', $1, true)",
          [tenantId]
        );
      }

      // Set platform admin flag for RLS bypass
      const isPlatformAdmin = this.isPlatformAdmin();
      await client.query(
        "SELECT set_config('app.is_platform_admin', $1, true)",
        [isPlatformAdmin ? 'true' : 'false']
      );

      const result = await client.query(query, params);
      return result.rows as T[];
    } finally {
      client.release();
    }
  }

  /**
   * Execute a transaction with tenant context
   */
  async transactionWithTenantContext<T>(
    callback: (client: PoolClient) => Promise<T>,
    options: TenantScopedOptions = {}
  ): Promise<T> {
    if (!this.pool) {
      throw new TenantContextError('Database pool not configured');
    }

    const tenantId = options.tenantIdOverride || this.getCurrentTenantIdOrNull();

    if (!tenantId && !options.bypassTenantCheck && !this.isPlatformAdmin()) {
      throw new TenantContextError('Tenant context required for this operation');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Set RLS session variables
      if (tenantId) {
        await client.query(
          "SELECT set_config('app.current_tenant_id', $1, true)",
          [tenantId]
        );
      }

      // Set platform admin flag for RLS bypass
      const isPlatformAdmin = this.isPlatformAdmin();
      await client.query(
        "SELECT set_config('app.is_platform_admin', $1, true)",
        [isPlatformAdmin ? 'true' : 'false']
      );

      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Add tenant_id condition to a WHERE clause
   */
  buildTenantCondition(
    tableAlias?: string,
    paramIndex: number = 1
  ): { condition: string; param: string } {
    const tenantId = this.getCurrentTenantId();
    const column = tableAlias ? `${tableAlias}.tenant_id` : 'tenant_id';
    return {
      condition: `${column} = $${paramIndex}`,
      param: tenantId,
    };
  }

  /**
   * Create a tenant-scoped SELECT query builder
   */
  buildTenantScopedQuery(
    table: string,
    columns: string[] = ['*'],
    additionalConditions: string = ''
  ): { query: string; params: any[] } {
    const tenantId = this.getCurrentTenantId();
    const columnList = columns.join(', ');
    const whereClause = additionalConditions
      ? `WHERE tenant_id = $1 AND ${additionalConditions}`
      : 'WHERE tenant_id = $1';

    return {
      query: `SELECT ${columnList} FROM ${table} ${whereClause}`,
      params: [tenantId],
    };
  }
}

/**
 * Custom error for tenant context issues
 */
export class TenantContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantContextError';
  }
}

// Singleton instance for convenience
let defaultService: TenantContextService | null = null;

/**
 * Get or create the default tenant context service
 */
export function getTenantContextService(): TenantContextService {
  if (!defaultService) {
    defaultService = new TenantContextService();
  }
  return defaultService;
}

/**
 * Initialize the tenant context service with a database pool
 */
export function initializeTenantContext(pool: Pool): TenantContextService {
  const service = getTenantContextService();
  service.setPool(pool);
  return service;
}

/**
 * Middleware helper for Express to set tenant context
 */
export function createTenantMiddleware(
  service: TenantContextService
): (req: any, res: any, next: any) => void {
  return async (req: any, res: any, next: any) => {
    try {
      // Extract tenant from header, subdomain, or token
      const tenantId =
        req.headers['x-tenant-id'] ||
        req.user?.tenantId ||
        extractTenantFromHost(req.hostname);

      if (!tenantId) {
        // No tenant context - could be platform admin or public route
        return next();
      }

      // Validate tenant
      const validation = await service.validateTenant(tenantId);
      if (!validation.valid) {
        return res.status(403).json({
          error: 'Tenant access denied',
          message: validation.error,
        });
      }

      // Create tenant context
      const context: TenantContext = {
        tenantId: validation.tenantId!,
        tenantSlug: validation.tenantSlug!,
        userId: req.user?.id,
        isPlatformAdmin: req.user?.isPlatformAdmin,
      };

      // Run the rest of the request in tenant context
      await service.runWithTenant(context, async () => {
        next();
      });
    } catch (error) {
      logger.error('Tenant middleware error', { error });
      next(error);
    }
  };
}

/**
 * Extract tenant slug from hostname (for subdomain-based tenancy)
 *
 * Supported patterns:
 *   Production: tenant-slug.ectropy.ai     → "tenant-slug"
 *   Staging:    tenant-slug--staging.ectropy.ai → "tenant-slug"
 */
function extractTenantFromHost(hostname: string): string | null {
  const parts = hostname.split('.');
  if (parts.length < 3) return null;

  // Verify ectropy.ai domain
  const domain = parts.slice(-2).join('.');
  if (domain !== 'ectropy.ai') return null;

  const subdomain = parts[0];

  // Staging flat-subdomain: "acme--staging" → "acme"
  const stagingMatch = subdomain.match(/^([a-z0-9][a-z0-9-]+)--staging$/);
  if (stagingMatch) return stagingMatch[1];

  // Production: direct subdomain (skip reserved)
  const reserved = ['www', 'api', 'app', 'staging', 'dev', 'test', 'demo', 'console'];
  if (reserved.includes(subdomain)) return null;

  return subdomain;
}

// Export all types and utilities
export {
  tenantContextStorage,
  extractTenantFromHost,
};
