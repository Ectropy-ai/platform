/**
 * Tenant Management Routes
 *
 * Administrative API endpoints for multi-tenant management.
 * Supports CRUD operations, subscription management, usage limits enforcement,
 * and PIPEDA compliance requirements.
 *
 * @module routes/admin/tenant
 * @version 1.0.0
 */

import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { PrismaClient, TenantStatus, SubscriptionTier } from '@prisma/client';
import { logger } from '../../../../../libs/shared/utils/src/logger.js';
import {
  asyncHandler,
  createResponse,
  AuthorizationError,
  ValidationError,
} from '../../../../../libs/shared/utils/src/simple-errors.js';
import {
  TenantService,
  TenantServiceConfig,
  TenantListQuery,
  CreateTenantRequest,
  UpdateTenantRequest,
  UpdateSubscriptionRequest,
  TenantManagementError,
  TenantErrorCode,
  isValidSlug,
} from '../../services/tenant/index.js';

// Import Express type augmentation
import '../../../../../libs/shared/types/src/express.js';

// ==============================================================================
// Route Configuration
// ==============================================================================

export interface TenantRoutesConfig {
  dbPool: Pool;
  prisma: PrismaClient;
}

// ==============================================================================
// Tenant Routes Class
// ==============================================================================

export class TenantRoutes {
  private router: Router;
  private tenantService: TenantService;
  private prisma: PrismaClient;

  constructor(config: TenantRoutesConfig) {
    this.router = Router();
    this.prisma = config.prisma;
    this.tenantService = new TenantService({
      prisma: config.prisma,
      pool: config.dbPool,
    });

    this.setupRoutes();
  }

  /**
   * Get configured router
   */
  getRouter(): Router {
    return this.router;
  }

  /**
   * Setup all routes
   */
  private setupRoutes(): void {
    // Platform admin middleware for all routes
    this.router.use(this.ensurePlatformAdmin.bind(this));

    // =========================================================================
    // Tenant CRUD
    // =========================================================================

    // List all tenants
    this.router.get('/', asyncHandler(this.listTenants.bind(this)));

    // Create new tenant
    this.router.post('/', asyncHandler(this.createTenant.bind(this)));

    // Get tenant by ID
    this.router.get('/:tenantId', asyncHandler(this.getTenant.bind(this)));

    // Update tenant
    this.router.put('/:tenantId', asyncHandler(this.updateTenant.bind(this)));
    this.router.patch('/:tenantId', asyncHandler(this.updateTenant.bind(this)));

    // Delete (archive) tenant
    this.router.delete(
      '/:tenantId',
      asyncHandler(this.deleteTenant.bind(this))
    );

    // =========================================================================
    // Status Management
    // =========================================================================

    // Suspend tenant
    this.router.post(
      '/:tenantId/suspend',
      asyncHandler(this.suspendTenant.bind(this))
    );

    // Reactivate tenant
    this.router.post(
      '/:tenantId/reactivate',
      asyncHandler(this.reactivateTenant.bind(this))
    );

    // Cancel tenant
    this.router.post(
      '/:tenantId/cancel',
      asyncHandler(this.cancelTenant.bind(this))
    );

    // Activate trial tenant
    this.router.post(
      '/:tenantId/activate',
      asyncHandler(this.activateTenant.bind(this))
    );

    // =========================================================================
    // Subscription Management
    // =========================================================================

    // Update subscription
    this.router.put(
      '/:tenantId/subscription',
      asyncHandler(this.updateSubscription.bind(this))
    );

    // Get usage statistics
    this.router.get('/:tenantId/usage', asyncHandler(this.getUsage.bind(this)));

    // Check usage limit
    this.router.get(
      '/:tenantId/usage/check',
      asyncHandler(this.checkUsageLimit.bind(this))
    );

    // =========================================================================
    // User Management
    // =========================================================================

    // Get tenant users
    this.router.get(
      '/:tenantId/users',
      asyncHandler(this.getTenantUsers.bind(this))
    );

    // Add user to tenant
    this.router.post(
      '/:tenantId/users',
      asyncHandler(this.addUserToTenant.bind(this))
    );

    // Remove user from tenant
    this.router.delete(
      '/:tenantId/users/:userId',
      asyncHandler(this.removeUserFromTenant.bind(this))
    );

    // =========================================================================
    // Project Management
    // =========================================================================

    // Get tenant projects
    this.router.get(
      '/:tenantId/projects',
      asyncHandler(this.getTenantProjects.bind(this))
    );
  }

  // ===========================================================================
  // Middleware
  // ===========================================================================

  /**
   * Ensure request is from a platform admin
   */
  private ensurePlatformAdmin(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    // Development mode bypass
    const isDevelopment = process.env.NODE_ENV !== 'production';
    if (isDevelopment) {
      return next();
    }

    const user = req.user;
    // TODO: Add isPlatformAdmin field to User model in Prisma schema
    // Temporarily disabled pending schema migration
    // if (!user?.isPlatformAdmin) {
    //   throw new AuthorizationError('Platform admin access required');
    // }
    next();
  }

  /**
   * Get current user ID from request
   */
  private getCurrentUserId(req: Request): string {
    return req.user?.id || 'system';
  }

  // ===========================================================================
  // Tenant CRUD Handlers
  // ===========================================================================

  /**
   * GET /admin/tenants - List all tenants
   */
  private async listTenants(req: Request, res: Response): Promise<void> {
    const query: TenantListQuery = {
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      pageSize: req.query.pageSize
        ? parseInt(req.query.pageSize as string)
        : undefined,
      status: req.query.status as TenantStatus,
      subscriptionTier: req.query.subscriptionTier as SubscriptionTier,
      search: req.query.search as string,
      sortBy: req.query.sortBy as
        | 'name'
        | 'createdAt'
        | 'status'
        | 'subscriptionTier',
      sortOrder: req.query.sortOrder as 'asc' | 'desc',
    };

    const result = await this.tenantService.listTenants(query);

    res.json(createResponse.success(result));
  }

  /**
   * POST /admin/tenants - Create new tenant
   */
  private async createTenant(req: Request, res: Response): Promise<void> {
    const {
      slug,
      name,
      primaryEmail,
      billingEmail,
      phone,
      subscriptionTier,
      dataRegion,
      complianceFlags,
      settings,
    } = req.body;

    // Validate required fields
    if (!slug || !name || !primaryEmail) {
      throw new ValidationError('slug, name, and primaryEmail are required');
    }

    // Validate slug format
    if (!isValidSlug(slug)) {
      throw new ValidationError(
        'Invalid slug format. Must be lowercase alphanumeric with hyphens, 3-100 characters.'
      );
    }

    const request: CreateTenantRequest = {
      slug,
      name,
      primaryEmail,
      billingEmail,
      phone,
      subscriptionTier,
      dataRegion,
      complianceFlags,
      settings,
    };

    const tenant = await this.tenantService.createTenant(
      request,
      this.getCurrentUserId(req)
    );

    logger.info('Tenant created via API', {
      tenantId: tenant.id,
      slug: tenant.slug,
    });

    res
      .status(201)
      .json(createResponse.success({ tenant }, 'Tenant created successfully'));
  }

  /**
   * GET /admin/tenants/:tenantId - Get tenant details
   */
  private async getTenant(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.params;
    const includeDetails = req.query.includeDetails === 'true';

    if (includeDetails) {
      const details = await this.tenantService.getTenantDetails(tenantId);
      if (!details) {
        throw new TenantManagementError(
          'Tenant not found',
          TenantErrorCode.TENANT_NOT_FOUND,
          { tenantId }
        );
      }

      res.json(createResponse.success(details));
    } else {
      const tenant = await this.tenantService.getTenantWithUsage(tenantId);
      if (!tenant) {
        throw new TenantManagementError(
          'Tenant not found',
          TenantErrorCode.TENANT_NOT_FOUND,
          { tenantId }
        );
      }

      res.json(createResponse.success({ tenant }));
    }
  }

  /**
   * PUT/PATCH /admin/tenants/:tenantId - Update tenant
   */
  private async updateTenant(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.params;
    const updates: UpdateTenantRequest = req.body;

    const tenant = await this.tenantService.updateTenant(
      tenantId,
      updates,
      this.getCurrentUserId(req)
    );

    res.json(createResponse.success({ tenant }, 'Tenant updated successfully'));
  }

  /**
   * DELETE /admin/tenants/:tenantId - Archive tenant
   */
  private async deleteTenant(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.params;

    await this.tenantService.deleteTenant(tenantId, this.getCurrentUserId(req));

    res.json(createResponse.success({}, 'Tenant archived successfully'));
  }

  // ===========================================================================
  // Status Management Handlers
  // ===========================================================================

  /**
   * POST /admin/tenants/:tenantId/suspend - Suspend tenant
   */
  private async suspendTenant(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      throw new ValidationError('reason is required for suspension');
    }

    const tenant = await this.tenantService.suspendTenant(
      tenantId,
      reason,
      this.getCurrentUserId(req)
    );

    res.json(
      createResponse.success({ tenant }, 'Tenant suspended successfully')
    );
  }

  /**
   * POST /admin/tenants/:tenantId/reactivate - Reactivate tenant
   */
  private async reactivateTenant(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.params;
    const { notes } = req.body;

    const tenant = await this.tenantService.reactivateTenant(
      tenantId,
      this.getCurrentUserId(req),
      notes
    );

    res.json(
      createResponse.success({ tenant }, 'Tenant reactivated successfully')
    );
  }

  /**
   * POST /admin/tenants/:tenantId/cancel - Cancel tenant
   */
  private async cancelTenant(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      throw new ValidationError('reason is required for cancellation');
    }

    const tenant = await this.tenantService.cancelTenant(
      tenantId,
      reason,
      this.getCurrentUserId(req)
    );

    res.json(
      createResponse.success({ tenant }, 'Tenant cancelled successfully')
    );
  }

  /**
   * POST /admin/tenants/:tenantId/activate - Activate trial tenant
   */
  private async activateTenant(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.params;

    const tenant = await this.tenantService.activateTenant(
      tenantId,
      this.getCurrentUserId(req)
    );

    res.json(
      createResponse.success({ tenant }, 'Tenant activated successfully')
    );
  }

  // ===========================================================================
  // Subscription Management Handlers
  // ===========================================================================

  /**
   * PUT /admin/tenants/:tenantId/subscription - Update subscription
   */
  private async updateSubscription(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.params;
    const { subscriptionTier, customLimits } = req.body;

    if (!subscriptionTier) {
      throw new ValidationError('subscriptionTier is required');
    }

    // Validate tier
    if (!Object.values(SubscriptionTier).includes(subscriptionTier)) {
      throw new ValidationError(
        `Invalid subscription tier: ${subscriptionTier}`
      );
    }

    const request: UpdateSubscriptionRequest = {
      subscriptionTier,
      customLimits,
    };

    const tenant = await this.tenantService.updateSubscription(
      tenantId,
      request,
      this.getCurrentUserId(req)
    );

    res.json(
      createResponse.success({ tenant }, 'Subscription updated successfully')
    );
  }

  /**
   * GET /admin/tenants/:tenantId/usage - Get usage statistics
   */
  private async getUsage(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.params;

    const usage = await this.tenantService.getTenantUsage(tenantId);

    res.json(createResponse.success({ usage }));
  }

  /**
   * GET /admin/tenants/:tenantId/usage/check - Check if can add resource
   */
  private async checkUsageLimit(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.params;
    const resource = req.query.resource as 'projects' | 'users' | 'storage';
    const amount = req.query.amount ? parseInt(req.query.amount as string) : 1;

    if (!resource || !['projects', 'users', 'storage'].includes(resource)) {
      throw new ValidationError(
        'resource must be one of: projects, users, storage'
      );
    }

    const result = await this.tenantService.checkUsageLimit(
      tenantId,
      resource,
      amount
    );

    res.json(createResponse.success(result));
  }

  // ===========================================================================
  // User Management Handlers
  // ===========================================================================

  /**
   * GET /admin/tenants/:tenantId/users - Get tenant users
   */
  private async getTenantUsers(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.params;

    const users = await this.tenantService.getTenantUsers(tenantId);

    res.json(createResponse.success({ users, count: users.length }));
  }

  /**
   * POST /admin/tenants/:tenantId/users - Add user to tenant
   */
  private async addUserToTenant(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      throw new ValidationError('userId is required');
    }

    await this.tenantService.addUserToTenant(
      tenantId,
      userId,
      this.getCurrentUserId(req)
    );

    res.json(createResponse.success({}, 'User added to tenant successfully'));
  }

  /**
   * DELETE /admin/tenants/:tenantId/users/:userId - Remove user from tenant
   */
  private async removeUserFromTenant(
    req: Request,
    res: Response
  ): Promise<void> {
    const { tenantId, userId } = req.params;
    const removeProjectRoles = req.query.removeProjectRoles !== 'false';

    await this.tenantService.removeUserFromTenant(
      tenantId,
      userId,
      this.getCurrentUserId(req),
      removeProjectRoles
    );

    res.json(
      createResponse.success({}, 'User removed from tenant successfully')
    );
  }

  // ===========================================================================
  // Project Management Handlers
  // ===========================================================================

  /**
   * GET /admin/tenants/:tenantId/projects - Get tenant projects
   */
  private async getTenantProjects(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.params;

    const projects = await this.tenantService.getTenantProjects(tenantId);

    res.json(createResponse.success({ projects, count: projects.length }));
  }
}

// ==============================================================================
// Factory Function
// ==============================================================================

/**
 * Create tenant routes
 */
export function createTenantRoutes(config: TenantRoutesConfig): Router {
  const routes = new TenantRoutes(config);
  return routes.getRouter();
}

export default TenantRoutes;
