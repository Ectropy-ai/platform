/**
 * Tenant Context Service Unit Tests
 *
 * Tests multi-tenant data isolation, RLS policy enforcement,
 * AsyncLocalStorage context management, and tenant validation.
 *
 * Addresses ROOT CAUSES: #125 (RLS), Multi-tenant foundation (MT-M1)
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { Pool, PoolClient } from 'pg';
import {
  TenantContextService,
  TenantContext,
  TenantContextError,
  getTenantContextService,
  initializeTenantContext,
  createTenantMiddleware,
  extractTenantFromHost,
} from '../tenant-context.service.js';

// ==============================================================================
// Mocks
// ==============================================================================

const mockPoolClient: Partial<PoolClient> = {
  query: vi.fn(),
  release: vi.fn(),
};

const mockPool: Partial<Pool> = {
  connect: vi.fn().mockResolvedValue(mockPoolClient),
  query: vi.fn(),
  end: vi.fn(),
};

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// ==============================================================================
// Test Helpers
// ==============================================================================

const validTenantContext: TenantContext = {
  tenantId: 'tenant-123',
  tenantSlug: 'acme-corp',
  userId: 'user-456',
  isPlatformAdmin: false,
};

const adminTenantContext: TenantContext = {
  tenantId: 'tenant-admin',
  tenantSlug: 'platform-admin',
  userId: 'admin-789',
  isPlatformAdmin: true,
};

// ==============================================================================
// Test Suite
// ==============================================================================

describe('TenantContextService', () => {
  let service: TenantContextService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TenantContextService(mockPool as Pool);
  });

  // ============================================================================
  // Context Management Tests
  // ============================================================================

  describe('Context Management', () => {
    test('should store and retrieve tenant context', async () => {
      await service.runWithTenant(validTenantContext, async () => {
        const context = service.getCurrentContext();
        expect(context).toEqual(validTenantContext);
      });
    });

    test('should return undefined when no context is set', () => {
      const context = service.getCurrentContext();
      expect(context).toBeUndefined();
    });

    test('should throw error when getting tenant ID without context', () => {
      expect(() => service.getCurrentTenantId()).toThrow(TenantContextError);
      expect(() => service.getCurrentTenantId()).toThrow(
        'No tenant context available'
      );
    });

    test('should return null safely when no context', () => {
      const tenantId = service.getCurrentTenantIdOrNull();
      expect(tenantId).toBeNull();
    });

    test('should return tenant ID when context exists', async () => {
      await service.runWithTenant(validTenantContext, async () => {
        const tenantId = service.getCurrentTenantId();
        expect(tenantId).toBe('tenant-123');
      });
    });

    test('should identify platform admin correctly', async () => {
      await service.runWithTenant(adminTenantContext, async () => {
        expect(service.isPlatformAdmin()).toBe(true);
      });

      await service.runWithTenant(validTenantContext, async () => {
        expect(service.isPlatformAdmin()).toBe(false);
      });
    });

    test('should isolate context between async operations', async () => {
      const context1: TenantContext = {
        tenantId: 'tenant-1',
        tenantSlug: 'tenant-one',
      };
      const context2: TenantContext = {
        tenantId: 'tenant-2',
        tenantSlug: 'tenant-two',
      };

      const results = await Promise.all([
        service.runWithTenant(context1, async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return service.getCurrentTenantId();
        }),
        service.runWithTenant(context2, async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return service.getCurrentTenantId();
        }),
      ]);

      expect(results[0]).toBe('tenant-1');
      expect(results[1]).toBe('tenant-2');
    });
  });

  // ============================================================================
  // Tenant Validation Tests
  // ============================================================================

  describe('Tenant Validation', () => {
    test('should validate active tenant by ID', async () => {
      (mockPool.query as any).mockResolvedValueOnce({
        rows: [
          {
            id: 'tenant-123',
            slug: 'acme-corp',
            status: 'ACTIVE',
          },
        ],
      });

      const result = await service.validateTenant('tenant-123');

      expect(result.valid).toBe(true);
      expect(result.tenantId).toBe('tenant-123');
      expect(result.tenantSlug).toBe('acme-corp');
      expect(result.status).toBe('ACTIVE');
    });

    test('should validate trial tenant by slug', async () => {
      (mockPool.query as any).mockResolvedValueOnce({
        rows: [
          {
            id: 'tenant-456',
            slug: 'trial-company',
            status: 'TRIAL',
          },
        ],
      });

      const result = await service.validateTenant('trial-company');

      expect(result.valid).toBe(true);
      expect(result.tenantId).toBe('tenant-456');
      expect(result.status).toBe('TRIAL');
    });

    test('should reject non-existent tenant', async () => {
      (mockPool.query as any).mockResolvedValueOnce({ rows: [] });

      const result = await service.validateTenant('non-existent');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Tenant not found');
    });

    test('should reject suspended tenant', async () => {
      (mockPool.query as any).mockResolvedValueOnce({
        rows: [
          {
            id: 'tenant-789',
            slug: 'suspended-corp',
            status: 'SUSPENDED',
          },
        ],
      });

      const result = await service.validateTenant('tenant-789');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Tenant is suspended');
      expect(result.status).toBe('SUSPENDED');
    });

    test('should reject cancelled tenant', async () => {
      (mockPool.query as any).mockResolvedValueOnce({
        rows: [
          {
            id: 'tenant-cancelled',
            slug: 'cancelled-corp',
            status: 'CANCELLED',
          },
        ],
      });

      const result = await service.validateTenant('tenant-cancelled');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Tenant is cancelled');
    });

    test('should handle validation errors gracefully', async () => {
      (mockPool.query as any).mockRejectedValueOnce(
        new Error('Database connection failed')
      );

      const result = await service.validateTenant('tenant-123');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Tenant validation failed');
    });

    test('should return error when pool not configured', async () => {
      const serviceWithoutPool = new TenantContextService();

      const result = await serviceWithoutPool.validateTenant('tenant-123');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Database pool not configured');
    });
  });

  // ============================================================================
  // RLS Query Execution Tests (ROOT CAUSE #125)
  // ============================================================================

  describe('RLS Query Execution', () => {
    test('should set RLS session variables before query', async () => {
      (mockPoolClient.query as any).mockResolvedValue({ rows: [] });

      await service.runWithTenant(validTenantContext, async () => {
        await service.queryWithTenantContext('SELECT * FROM projects');
      });

      // Should set tenant ID
      expect(mockPoolClient.query).toHaveBeenCalledWith(
        "SELECT set_config('app.current_tenant_id', $1, true)",
        ['tenant-123']
      );

      // Should set platform admin flag
      expect(mockPoolClient.query).toHaveBeenCalledWith(
        "SELECT set_config('app.is_platform_admin', $1, true)",
        ['false']
      );

      // Should execute the actual query
      expect(mockPoolClient.query).toHaveBeenCalledWith(
        'SELECT * FROM projects',
        []
      );
    });

    test('should set platform admin flag for admin users', async () => {
      (mockPoolClient.query as any).mockResolvedValue({ rows: [] });

      await service.runWithTenant(adminTenantContext, async () => {
        await service.queryWithTenantContext('SELECT * FROM all_projects');
      });

      expect(mockPoolClient.query).toHaveBeenCalledWith(
        "SELECT set_config('app.is_platform_admin', $1, true)",
        ['true']
      );
    });

    test('should allow platform admin to bypass tenant check', async () => {
      (mockPoolClient.query as any).mockResolvedValue({ rows: [] });

      await service.runWithTenant(adminTenantContext, async () => {
        await service.queryWithTenantContext('SELECT * FROM all_tenants', [], {
          bypassTenantCheck: true,
        });
      });

      expect(mockPoolClient.query).toHaveBeenCalled();
    });

    test('should throw error when no tenant context and not admin', async () => {
      await expect(
        service.queryWithTenantContext('SELECT * FROM projects')
      ).rejects.toThrow('Tenant context required for this operation');
    });

    test('should allow tenant override via options', async () => {
      (mockPoolClient.query as any).mockResolvedValue({ rows: [] });

      await service.runWithTenant(validTenantContext, async () => {
        await service.queryWithTenantContext('SELECT * FROM projects', [], {
          tenantIdOverride: 'other-tenant-999',
        });
      });

      expect(mockPoolClient.query).toHaveBeenCalledWith(
        "SELECT set_config('app.current_tenant_id', $1, true)",
        ['other-tenant-999']
      );
    });

    test('should release client even if query fails', async () => {
      (mockPoolClient.query as any).mockRejectedValueOnce(
        new Error('Query failed')
      );

      await service.runWithTenant(validTenantContext, async () => {
        await expect(
          service.queryWithTenantContext('SELECT * FROM projects')
        ).rejects.toThrow('Query failed');
      });

      expect(mockPoolClient.release).toHaveBeenCalled();
    });

    test('should return query results correctly', async () => {
      const mockResults = [
        { id: 'proj-1', name: 'Project 1' },
        { id: 'proj-2', name: 'Project 2' },
      ];
      (mockPoolClient.query as any).mockResolvedValueOnce({ rows: [] }); // set_config
      (mockPoolClient.query as any).mockResolvedValueOnce({ rows: [] }); // set_config
      (mockPoolClient.query as any).mockResolvedValueOnce({
        rows: mockResults,
      }); // actual query

      await service.runWithTenant(validTenantContext, async () => {
        const results = await service.queryWithTenantContext(
          'SELECT * FROM projects'
        );
        expect(results).toEqual(mockResults);
      });
    });
  });

  // ============================================================================
  // Transaction Tests
  // ============================================================================

  describe('RLS Transaction Execution', () => {
    test('should execute transaction with tenant context', async () => {
      (mockPoolClient.query as any).mockResolvedValue({ rows: [] });

      await service.runWithTenant(validTenantContext, async () => {
        const result = await service.transactionWithTenantContext(
          async (client) => {
            await client.query('INSERT INTO projects VALUES ($1)', ['test']);
            return { success: true };
          }
        );

        expect(result.success).toBe(true);
      });

      expect(mockPoolClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockPoolClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockPoolClient.release).toHaveBeenCalled();
    });

    test('should rollback transaction on error', async () => {
      (mockPoolClient.query as any).mockResolvedValue({ rows: [] });
      (mockPoolClient.query as any)
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // set_config
        .mockResolvedValueOnce({ rows: [] }) // set_config
        .mockRejectedValueOnce(new Error('Insert failed')); // INSERT

      await service.runWithTenant(validTenantContext, async () => {
        await expect(
          service.transactionWithTenantContext(async (client) => {
            await client.query('INSERT INTO projects VALUES ($1)', ['test']);
          })
        ).rejects.toThrow('Insert failed');
      });

      expect(mockPoolClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockPoolClient.release).toHaveBeenCalled();
    });

    test('should set RLS variables in transaction', async () => {
      (mockPoolClient.query as any).mockResolvedValue({ rows: [] });

      await service.runWithTenant(validTenantContext, async () => {
        await service.transactionWithTenantContext(async (client) => {
          await client.query('UPDATE projects SET name = $1', ['Updated']);
        });
      });

      expect(mockPoolClient.query).toHaveBeenCalledWith(
        "SELECT set_config('app.current_tenant_id', $1, true)",
        ['tenant-123']
      );
    });

    test('should require tenant context for transaction', async () => {
      await expect(
        service.transactionWithTenantContext(async () => {
          return { test: true };
        })
      ).rejects.toThrow('Tenant context required for this operation');
    });
  });

  // ============================================================================
  // Query Builder Tests
  // ============================================================================

  describe('Query Builder Helpers', () => {
    test('should build tenant condition', async () => {
      await service.runWithTenant(validTenantContext, async () => {
        const { condition, param } = service.buildTenantCondition();

        expect(condition).toBe('tenant_id = $1');
        expect(param).toBe('tenant-123');
      });
    });

    test('should build tenant condition with table alias', async () => {
      await service.runWithTenant(validTenantContext, async () => {
        const { condition, param } = service.buildTenantCondition('p', 2);

        expect(condition).toBe('p.tenant_id = $2');
        expect(param).toBe('tenant-123');
      });
    });

    test('should build tenant-scoped SELECT query', async () => {
      await service.runWithTenant(validTenantContext, async () => {
        const { query, params } = service.buildTenantScopedQuery('projects', [
          'id',
          'name',
        ]);

        expect(query).toBe(
          'SELECT id, name FROM projects WHERE tenant_id = $1'
        );
        expect(params).toEqual(['tenant-123']);
      });
    });

    test('should build query with additional conditions', async () => {
      await service.runWithTenant(validTenantContext, async () => {
        const { query, params } = service.buildTenantScopedQuery(
          'projects',
          ['*'],
          "status = 'active'"
        );

        expect(query).toBe(
          "SELECT * FROM projects WHERE tenant_id = $1 AND status = 'active'"
        );
        expect(params).toEqual(['tenant-123']);
      });
    });

    test('should default to SELECT * when no columns specified', async () => {
      await service.runWithTenant(validTenantContext, async () => {
        const { query } = service.buildTenantScopedQuery('projects');

        expect(query).toBe('SELECT * FROM projects WHERE tenant_id = $1');
      });
    });
  });

  // ============================================================================
  // Singleton & Initialization Tests
  // ============================================================================

  describe('Singleton & Initialization', () => {
    test('should create singleton instance', () => {
      const service1 = getTenantContextService();
      const service2 = getTenantContextService();

      expect(service1).toBe(service2);
    });

    test('should initialize service with pool', () => {
      const pool = mockPool as Pool;
      const service = initializeTenantContext(pool);

      expect(service).toBeInstanceOf(TenantContextService);
    });

    test('should allow setting pool after construction', () => {
      const serviceWithoutPool = new TenantContextService();
      const pool = mockPool as Pool;

      serviceWithoutPool.setPool(pool);

      // Should not throw after pool is set
      expect(() => serviceWithoutPool.getCurrentContext()).not.toThrow();
    });
  });

  // ============================================================================
  // Middleware Tests
  // ============================================================================

  describe('Express Middleware', () => {
    test('should create tenant middleware', () => {
      const middleware = createTenantMiddleware(service);

      expect(middleware).toBeInstanceOf(Function);
      expect(middleware.length).toBe(3); // req, res, next
    });

    test('should extract tenant from header', async () => {
      (mockPool.query as any).mockResolvedValueOnce({
        rows: [
          {
            id: 'tenant-123',
            slug: 'acme-corp',
            status: 'ACTIVE',
          },
        ],
      });

      const middleware = createTenantMiddleware(service);
      const req: any = {
        headers: { 'x-tenant-id': 'tenant-123' },
        hostname: 'api.example.com',
      };
      const res: any = {};
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should extract tenant from user object', async () => {
      (mockPool.query as any).mockResolvedValueOnce({
        rows: [
          {
            id: 'tenant-456',
            slug: 'user-company',
            status: 'ACTIVE',
          },
        ],
      });

      const middleware = createTenantMiddleware(service);
      const req: any = {
        headers: {},
        user: { tenantId: 'tenant-456', id: 'user-123' },
        hostname: 'api.example.com',
      };
      const res: any = {};
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should allow request without tenant for public routes', async () => {
      const middleware = createTenantMiddleware(service);
      const req: any = {
        headers: {},
        hostname: 'api.example.com',
      };
      const res: any = {};
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should reject invalid tenant', async () => {
      (mockPool.query as any).mockResolvedValueOnce({ rows: [] });

      const middleware = createTenantMiddleware(service);
      const req: any = {
        headers: { 'x-tenant-id': 'invalid-tenant' },
        hostname: 'api.example.com',
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Tenant access denied',
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    test('should handle middleware errors', async () => {
      (mockPool.query as any).mockRejectedValueOnce(
        new Error('Database error')
      );

      const middleware = createTenantMiddleware(service);
      const req: any = {
        headers: { 'x-tenant-id': 'tenant-123' },
        hostname: 'api.example.com',
      };
      const res: any = {};
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('Error Handling', () => {
    test('should throw TenantContextError with correct message', () => {
      const error = new TenantContextError('Test error message');

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('TenantContextError');
      expect(error.message).toBe('Test error message');
    });

    test('should handle database pool not configured error', async () => {
      const serviceWithoutPool = new TenantContextService();

      await expect(
        serviceWithoutPool.queryWithTenantContext('SELECT 1')
      ).rejects.toThrow('Database pool not configured');
    });

    test('should handle missing tenant context appropriately', async () => {
      expect(() => service.buildTenantCondition()).toThrow(TenantContextError);

      expect(() => service.buildTenantScopedQuery('projects')).toThrow(
        TenantContextError
      );
    });
  });

  // ============================================================================
  // Subdomain Extraction Tests (Multi-Tenant Routing)
  // ============================================================================

  describe('extractTenantFromHost', () => {
    test('should extract tenant from staging flat subdomain', () => {
      expect(extractTenantFromHost('acme--staging.ectropy.ai')).toBe('acme');
    });

    test('should extract tenant with hyphens from staging subdomain', () => {
      expect(extractTenantFromHost('acme-construction--staging.ectropy.ai')).toBe('acme-construction');
    });

    test('should extract tenant from production subdomain', () => {
      expect(extractTenantFromHost('acme.ectropy.ai')).toBe('acme');
    });

    test('should extract tenant with hyphens from production subdomain', () => {
      expect(extractTenantFromHost('acme-construction.ectropy.ai')).toBe('acme-construction');
    });

    test('should return null for reserved subdomains', () => {
      expect(extractTenantFromHost('staging.ectropy.ai')).toBeNull();
      expect(extractTenantFromHost('www.ectropy.ai')).toBeNull();
      expect(extractTenantFromHost('api.ectropy.ai')).toBeNull();
      expect(extractTenantFromHost('console.ectropy.ai')).toBeNull();
      expect(extractTenantFromHost('dev.ectropy.ai')).toBeNull();
      expect(extractTenantFromHost('test.ectropy.ai')).toBeNull();
      expect(extractTenantFromHost('demo.ectropy.ai')).toBeNull();
      expect(extractTenantFromHost('app.ectropy.ai')).toBeNull();
    });

    test('should return null for non-ectropy domains', () => {
      expect(extractTenantFromHost('acme.example.com')).toBeNull();
      expect(extractTenantFromHost('acme.other.io')).toBeNull();
    });

    test('should return null for bare domain', () => {
      expect(extractTenantFromHost('ectropy.ai')).toBeNull();
    });

    test('should return null for localhost', () => {
      expect(extractTenantFromHost('localhost')).toBeNull();
    });

    test('should return null for empty hostname', () => {
      expect(extractTenantFromHost('')).toBeNull();
    });
  });
});
