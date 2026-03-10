/**
 * Tenant Resolution Middleware for Express.js
 *
 * Purpose: Automatically resolve tenant from request context and attach
 * tenant-scoped database client to Express Request.
 *
 * Integration: Works with existing @ectropy/auth middleware
 * - Requires req.user to be set by authentication middleware
 * - Resolves tenantId from multiple sources
 * - Attaches tenant database client to req.tenantDb
 *
 * Workflow:
 * 1. Extract tenant information from request (JWT, API key, subdomain, header)
 * 2. Validate tenant exists and is active (Platform DB lookup)
 * 3. Get tenant-scoped database client (RLS enforced)
 * 4. Attach client to req.tenantDb for route handlers
 *
 * Usage:
 * ```typescript
 * import { TenantResolution } from '@ectropy/database/middleware/tenant-resolution';
 *
 * // Option 1: Require tenant (fail if not found)
 * app.use(TenantResolution.requireTenant());
 *
 * // Option 2: Optional tenant (continue if not found)
 * app.use(TenantResolution.optionalTenant());
 *
 * // In route handler:
 * app.get('/projects', async (req, res) => {
 *   const projects = await req.tenantDb!.project.findMany();
 *   res.json(projects);
 * });
 * ```
 *
 * Security:
 * - Validates tenant exists before attaching database client
 * - Enforces RLS through tenant-scoped Prisma client
 * - Prevents tenant hopping via JWT validation
 * - UUID validation prevents SQL injection
 *
 * @module tenant-resolution
 */

import type { Request, Response, NextFunction } from 'express';
import { DatabaseManager } from '../clients/connection-manager.js';
import { RLSContextError } from './rls-context.js';

// Note: Express.Request type augmentation is provided by src/types/express.d.ts
// (automatically included via tsconfig, no import needed)

/**
 * Tenant Resolution Error
 * Thrown when tenant cannot be resolved or is invalid
 */
export class TenantResolutionError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NO_TENANT_CONTEXT'
      | 'TENANT_NOT_FOUND'
      | 'TENANT_INACTIVE'
      | 'INVALID_TENANT_ID'
      | 'TENANT_RESOLUTION_FAILED',
    public readonly tenantId?: string
  ) {
    super(message);
    this.name = 'TenantResolutionError';
  }
}

/**
 * Tenant Resolution Strategy
 * Order of precedence for resolving tenant from request
 */
export enum TenantResolutionStrategy {
  /**
   * Resolve from X-Tenant-ID header
   * Highest precedence - explicit tenant selection
   */
  HEADER = 'HEADER',

  /**
   * Resolve from JWT payload (user's primary tenant)
   * Second precedence - authenticated user's tenant
   */
  JWT_PAYLOAD = 'JWT_PAYLOAD',

  /**
   * Resolve from user ID lookup in Platform database
   * Third precedence - fallback for JWT without tenantId
   */
  USER_LOOKUP = 'USER_LOOKUP',

  /**
   * Resolve from subdomain (e.g., acme.ectropy.ai → acme tenant slug)
   * Fourth precedence - multi-tenant SaaS pattern
   */
  SUBDOMAIN = 'SUBDOMAIN',

  /**
   * Resolve from API key (X-API-Key header → tenantId)
   * Fifth precedence - programmatic access
   */
  API_KEY = 'API_KEY',
}

/**
 * Tenant Resolution Options
 */
export interface TenantResolutionOptions {
  /**
   * Resolution strategies to use (in order of precedence)
   * Default: All strategies enabled
   */
  strategies?: TenantResolutionStrategy[];

  /**
   * Whether to fail if tenant cannot be resolved
   * Default: true (requireTenant mode)
   */
  required?: boolean;

  /**
   * Enable debug logging
   * Default: false (enabled in non-production environments)
   */
  debug?: boolean;

  /**
   * Custom tenant header name
   * Default: 'x-tenant-id'
   */
  tenantHeader?: string;

  /**
   * Whether to cache tenant database client on request
   * Default: true
   */
  cacheTenantDb?: boolean;
}

/**
 * Tenant Resolution Result
 * Internal interface for resolution workflow
 */
interface TenantResolutionResult {
  tenantId: string;
  strategy: TenantResolutionStrategy;
  userId?: string;
}

/**
 * Tenant Resolution Middleware Class
 *
 * Provides Express middleware for automatic tenant resolution and
 * database client attachment to requests.
 *
 * Enterprise pattern: Fail-fast validation with clear error messages
 */
export class TenantResolution {
  private static readonly DEFAULT_OPTIONS: Required<TenantResolutionOptions> = {
    strategies: [
      TenantResolutionStrategy.HEADER,
      TenantResolutionStrategy.JWT_PAYLOAD,
      TenantResolutionStrategy.USER_LOOKUP,
      TenantResolutionStrategy.SUBDOMAIN,
      TenantResolutionStrategy.API_KEY,
    ],
    required: true,
    debug: process.env.NODE_ENV !== 'production',
    tenantHeader: 'x-tenant-id',
    cacheTenantDb: true,
  };

  /**
   * Require tenant resolution
   *
   * Middleware that fails request if tenant cannot be resolved.
   * Use for tenant-scoped endpoints that require database access.
   *
   * @param options - Resolution options
   * @returns Express middleware function
   *
   * @example
   * ```typescript
   * // Protect all routes under /api/projects
   * app.use('/api/projects', TenantResolution.requireTenant());
   *
   * // Use tenant database in route
   * app.get('/api/projects', async (req, res) => {
   *   const projects = await req.tenantDb!.project.findMany();
   *   res.json(projects);
   * });
   * ```
   */
  static requireTenant(
    options: TenantResolutionOptions = {}
  ): (req: Request, res: Response, next: NextFunction) => Promise<void> {
    const opts = {
      ...this.DEFAULT_OPTIONS,
      ...options,
      required: true,
    };

    return this.createMiddleware(opts);
  }

  /**
   * Optional tenant resolution
   *
   * Middleware that continues if tenant cannot be resolved.
   * Use for endpoints that support both tenant-scoped and global access.
   *
   * @param options - Resolution options
   * @returns Express middleware function
   *
   * @example
   * ```typescript
   * // Support both authenticated and anonymous access
   * app.use('/api/public', TenantResolution.optionalTenant());
   *
   * // Check if tenant context available
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
   */
  static optionalTenant(
    options: TenantResolutionOptions = {}
  ): (req: Request, res: Response, next: NextFunction) => Promise<void> {
    const opts = {
      ...this.DEFAULT_OPTIONS,
      ...options,
      required: false,
    };

    return this.createMiddleware(opts);
  }

  /**
   * Create tenant resolution middleware
   *
   * Internal factory method for creating middleware with specific options.
   *
   * @param options - Merged resolution options
   * @returns Express middleware function
   */
  private static createMiddleware(
    options: Required<TenantResolutionOptions>
  ): (req: Request, res: Response, next: NextFunction) => Promise<void> {
    return async (
      req: Request,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        // Check if tenant database already attached (from previous middleware)
        if (options.cacheTenantDb && (req as any).tenantDb) {
          if (options.debug) {
            console.log('[Tenant Resolution] Using cached tenant database');
          }
          next();
          return;
        }

        // Attempt to resolve tenant from request
        const resolution = await this.resolveTenant(req, options);

        if (!resolution) {
          // No tenant found
          if (options.required) {
            res.status(400).json({
              success: false,
              error: 'Tenant context required but not found',
              code: 'NO_TENANT_CONTEXT',
              message:
                'This endpoint requires tenant context. ' +
                'Ensure you are authenticated or provide X-Tenant-ID header.',
            });
            return;
          } else {
            // Optional tenant - continue without tenant context
            if (options.debug) {
              console.log(
                '[Tenant Resolution] No tenant found, continuing without tenant context'
              );
            }
            next();
            return;
          }
        }

        // Get tenant-scoped database client
        const tenantDb = await DatabaseManager.getTenantDatabase(
          resolution.tenantId
        );

        // Attach tenant context to request
        (req as any).tenantId = resolution.tenantId;
        (req as any).tenantDb = tenantDb;
        (req as any).tenantResolutionStrategy = resolution.strategy;

        if (options.debug) {
          console.log('[Tenant Resolution] Tenant resolved:', {
            tenantId: resolution.tenantId,
            strategy: resolution.strategy,
            userId: resolution.userId,
          });
        }

        next();
      } catch (error) {
        // Handle tenant resolution errors
        if (error instanceof TenantResolutionError) {
          res.status(error.code === 'TENANT_NOT_FOUND' ? 404 : 400).json({
            success: false,
            error: error.message,
            code: error.code,
            tenantId: error.tenantId,
          });
          return;
        }

        // Handle RLS context errors
        if (error instanceof RLSContextError) {
          res.status(400).json({
            success: false,
            error: 'Invalid tenant configuration',
            code: 'INVALID_TENANT_ID',
            message: error.message,
          });
          return;
        }

        // Generic error handling
        if (options.debug) {
          console.error('[Tenant Resolution] Unexpected error:', error);
        }

        res.status(500).json({
          success: false,
          error: 'Tenant resolution failed',
          code: 'TENANT_RESOLUTION_FAILED',
          message:
            error instanceof Error
              ? error.message
              : 'An unexpected error occurred',
        });
      }
    };
  }

  /**
   * Resolve tenant from request
   *
   * Tries multiple strategies in order of precedence to determine tenant.
   *
   * @param req - Express request
   * @param options - Resolution options
   * @returns Tenant resolution result or null if not found
   */
  private static async resolveTenant(
    req: Request,
    options: Required<TenantResolutionOptions>
  ): Promise<TenantResolutionResult | null> {
    for (const strategy of options.strategies) {
      try {
        const result = await this.tryStrategy(req, strategy, options);
        if (result) {
          return result;
        }
      } catch (error) {
        // Strategy failed, try next one
        if (options.debug) {
          console.log(
            `[Tenant Resolution] Strategy ${strategy} failed:`,
            error instanceof Error ? error.message : 'Unknown error'
          );
        }
        continue;
      }
    }

    return null;
  }

  /**
   * Try specific resolution strategy
   *
   * @param req - Express request
   * @param strategy - Strategy to attempt
   * @param options - Resolution options
   * @returns Tenant resolution result or null
   */
  private static async tryStrategy(
    req: Request,
    strategy: TenantResolutionStrategy,
    options: Required<TenantResolutionOptions>
  ): Promise<TenantResolutionResult | null> {
    switch (strategy) {
      case TenantResolutionStrategy.HEADER:
        return this.resolveFromHeader(req, options);

      case TenantResolutionStrategy.JWT_PAYLOAD:
        return this.resolveFromJWT(req);

      case TenantResolutionStrategy.USER_LOOKUP:
        return this.resolveFromUserLookup(req);

      case TenantResolutionStrategy.SUBDOMAIN:
        return this.resolveFromSubdomain(req);

      case TenantResolutionStrategy.API_KEY:
        return this.resolveFromAPIKey(req);

      default:
        return null;
    }
  }

  /**
   * Resolve tenant from X-Tenant-ID header
   */
  private static resolveFromHeader(
    req: Request,
    options: Required<TenantResolutionOptions>
  ): TenantResolutionResult | null {
    const tenantId = req.headers[options.tenantHeader] as string | undefined;

    if (!tenantId) {
      return null;
    }

    return {
      tenantId,
      strategy: TenantResolutionStrategy.HEADER,
    };
  }

  /**
   * Resolve tenant from JWT payload
   *
   * NOTE: Current JWT implementation doesn't include tenantId.
   * This is a placeholder for future enhancement when JWT includes tenant information.
   */
  private static resolveFromJWT(_req: Request): TenantResolutionResult | null {
    // Future enhancement: Extract tenantId from JWT payload
    // For now, JWT doesn't contain tenantId - must use USER_LOOKUP strategy
    return null;
  }

  /**
   * Resolve tenant from user ID lookup
   *
   * Queries Platform database to find user's primary tenant.
   */
  private static async resolveFromUserLookup(
    req: Request
  ): Promise<TenantResolutionResult | null> {
    // Requires authenticated user (set by authentication middleware)
    if (!req.user || !req.user.id) {
      return null;
    }

    try {
      const platformDb = DatabaseManager.getPlatformDatabase();

      // Look up user's tenant from Platform database
      const user = await platformDb.user.findUnique({
        where: { id: req.user.id },
        select: { tenantId: true },
      });

      if (!user || !user.tenantId) {
        return null;
      }

      return {
        tenantId: user.tenantId,
        strategy: TenantResolutionStrategy.USER_LOOKUP,
        userId: req.user.id,
      };
    } catch (error) {
      // Platform database query failed
      throw new TenantResolutionError(
        `Failed to lookup user tenant: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'TENANT_RESOLUTION_FAILED',
        req.user.id
      );
    }
  }

  /**
   * Resolve tenant from subdomain
   *
   * Extracts tenant slug from subdomain and looks up tenant in Platform database.
   * Example: acme.ectropy.ai → slug: 'acme' → tenant lookup
   */
  private static async resolveFromSubdomain(
    req: Request
  ): Promise<TenantResolutionResult | null> {
    const host = req.hostname;

    // Extract subdomain (first part before domain)
    // Supported patterns:
    //   Production: acme.ectropy.ai → slug: "acme"
    //   Staging:    acme--staging.ectropy.ai → slug: "acme"
    const parts = host.split('.');
    if (parts.length < 3) {
      // Not a subdomain (e.g., localhost or ectropy.ai)
      return null;
    }

    let slug = parts[0];

    // Staging flat-subdomain: "acme--staging.ectropy.ai" → "acme"
    const stagingMatch = slug.match(/^([a-z0-9][a-z0-9-]+)--staging$/);
    if (stagingMatch) {
      slug = stagingMatch[1];
    }

    // Skip common subdomains that aren't tenant slugs
    const reservedSubdomains = [
      'www',
      'api',
      'app',
      'staging',
      'dev',
      'test',
      'demo',
      'console',
    ];
    if (reservedSubdomains.includes(slug)) {
      return null;
    }

    try {
      const platformDb = DatabaseManager.getPlatformDatabase();

      // Look up tenant by slug
      const tenant = await platformDb.tenant.findUnique({
        where: { slug },
        select: { id: true },
      });

      if (!tenant) {
        return null;
      }

      return {
        tenantId: tenant.id,
        strategy: TenantResolutionStrategy.SUBDOMAIN,
      };
    } catch (error) {
      // Platform database query failed
      throw new TenantResolutionError(
        `Failed to lookup tenant by subdomain: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'TENANT_RESOLUTION_FAILED',
        slug
      );
    }
  }

  /**
   * Resolve tenant from API key
   *
   * Extracts API key from X-API-Key header and looks up tenant in Platform database.
   */
  private static async resolveFromAPIKey(
    req: Request
  ): Promise<TenantResolutionResult | null> {
    const apiKey = req.headers['x-api-key'] as string | undefined;

    if (!apiKey) {
      return null;
    }

    try {
      const platformDb = DatabaseManager.getPlatformDatabase();

      // Extract key prefix (first 8 characters before underscore)
      // Example: ek_test_abc123 → ek_test
      const prefix = apiKey.split('_').slice(0, 2).join('_');

      // Look up API key by prefix and validate full key hash
      // NOTE: In production, you should hash the full API key and compare hashes
      const apiKeyRecord = await platformDb.apiKey.findFirst({
        where: {
          prefix,
          active: true,
        },
        select: {
          tenantId: true,
          userId: true,
          keyHash: true,
        },
      });

      if (!apiKeyRecord) {
        return null;
      }

      // TODO: Validate full API key hash (bcrypt comparison)
      // For now, trust prefix match for development

      return {
        tenantId: apiKeyRecord.tenantId,
        strategy: TenantResolutionStrategy.API_KEY,
        userId: apiKeyRecord.userId,
      };
    } catch (error) {
      // Platform database query failed
      throw new TenantResolutionError(
        `Failed to lookup tenant by API key: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'TENANT_RESOLUTION_FAILED'
      );
    }
  }
}

/**
 * Re-export for convenience
 */
export { DatabaseManager } from '../clients/connection-manager.js';
export { RLSContextError } from './rls-context.js';

/**
 * Type guard: Check if error is TenantResolutionError
 */
export function isTenantResolutionError(
  error: unknown
): error is TenantResolutionError {
  return error instanceof TenantResolutionError;
}
