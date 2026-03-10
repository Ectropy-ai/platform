/**
 * ==============================================================================
 * USER MANAGEMENT ADMIN ROUTES (M3.3)
 * ==============================================================================
 * Platform admin endpoints for user authorization and management
 * Milestone: User Management M3 (API Endpoints Layer)
 * Purpose: Enable platform admins to manage user authorization
 * ==============================================================================
 */

import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { PrismaClient } from '@prisma/client';
import {
  logger,
  asyncHandler,
  createResponse,
  ValidationError,
  NotFoundError,
  AuthorizationError,
} from '@ectropy/shared/utils';
import {
  UserAuthorizationService,
  UserManagementError,
  UserManagementErrorCode,
} from '../services/user-management/index.js';

// Import Express type augmentation
import '../../../../libs/shared/types/src/express.js';

// ==============================================================================
// Route Configuration
// ==============================================================================

export interface UserManagementAdminRoutesConfig {
  prisma: PrismaClient;
}

// ==============================================================================
// User Management Admin Routes Class
// ==============================================================================

/**
 * User Management Admin Routes - Platform admin operations
 *
 * Security:
 * - Platform admin role required for all endpoints
 * - Audit trail for all authorization changes
 * - Database-driven authorization (replaces AUTHORIZED_USERS env var)
 *
 * Endpoints:
 * - GET  /api/admin/user-management/users       List users with authorization status
 * - POST /api/admin/user-management/users/:id/authorize  Authorize user
 * - POST /api/admin/user-management/users/:id/revoke     Revoke user authorization
 */
export class UserManagementAdminRoutes {
  private router: Router;
  private authorizationService: UserAuthorizationService;
  private prisma: PrismaClient;

  constructor(config: UserManagementAdminRoutesConfig) {
    this.router = Router();
    this.prisma = config.prisma;

    // Initialize service
    this.authorizationService = new UserAuthorizationService(config.prisma);

    this.setupRoutes();
  }

  /**
   * Get configured router
   */
  getRouter(): Router {
    return this.router;
  }

  /**
   * Setup all routes with platform admin middleware
   */
  private setupRoutes(): void {
    // Platform admin middleware for all routes
    this.router.use(this.ensurePlatformAdmin.bind(this));

    // GET /api/admin/user-management/users - List users
    this.router.get(
      '/users',
      [
        query('isAuthorized')
          .optional()
          .isBoolean()
          .withMessage('isAuthorized must be boolean'),
        query('search')
          .optional()
          .trim()
          .isLength({ min: 2 })
          .withMessage('Search must be at least 2 characters'),
        query('limit')
          .optional()
          .isInt({ min: 1, max: 100 })
          .withMessage('Limit must be between 1 and 100'),
        query('offset')
          .optional()
          .isInt({ min: 0 })
          .withMessage('Offset must be >= 0'),
      ],
      asyncHandler(this.listUsers.bind(this))
    );

    // POST /api/admin/user-management/users/:id/authorize - Authorize user
    this.router.post(
      '/users/:id/authorize',
      [
        param('id').isUUID().withMessage('Invalid user ID'),
        body('reason')
          .optional()
          .trim()
          .isLength({ max: 500 })
          .withMessage('Reason must not exceed 500 characters'),
      ],
      asyncHandler(this.authorizeUser.bind(this))
    );

    // POST /api/admin/user-management/users/:id/revoke - Revoke authorization
    this.router.post(
      '/users/:id/revoke',
      [
        param('id').isUUID().withMessage('Invalid user ID'),
        body('reason')
          .optional()
          .trim()
          .isLength({ max: 500 })
          .withMessage('Reason must not exceed 500 characters'),
      ],
      asyncHandler(this.revokeAuthorization.bind(this))
    );
  }

  // ===========================================================================
  // Middleware
  // ===========================================================================

  /**
   * Ensure request is from platform admin
   */
  private async ensurePlatformAdmin(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthorizationError('Authentication required');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { is_platform_admin: true },
    });

    if (!user?.is_platform_admin) {
      logger.warn('[UserManagementAdminRoutes] Unauthorized access attempt', {
        userId,
        path: req.path,
      });
      throw new AuthorizationError('Platform admin access required');
    }

    next();
  }

  // ===========================================================================
  // Route Handlers
  // ===========================================================================

  /**
   * GET /api/admin/user-management/users
   * List users with authorization status and filtering
   */
  private async listUsers(
    req: Request,
    res: Response,
    _next?: NextFunction
  ): Promise<void> {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid query parameters');
    }

    const { isAuthorized, search, limit = 50, offset = 0 } = req.query;

    logger.debug('[UserManagementAdminRoutes] Listing users', {
      isAuthorized,
      search,
      limit,
      offset,
    });

    // Build query
    const where: any = {};

    if (typeof isAuthorized !== 'undefined') {
      where.is_authorized = isAuthorized === 'true';
    }

    if (search) {
      where.OR = [
        { email: { contains: search as string, mode: 'insensitive' } },
        { full_name: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        take: Number(limit),
        skip: Number(offset),
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          email: true,
          full_name: true,
          role: true,
          is_authorized: true,
          is_platform_admin: true,
          authorized_at: true,
          is_active: true,
          tenant: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          created_at: true,
          last_login: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    res.json(
      createResponse.success({
        users: users.map((user) => ({
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          isAuthorized: user.is_authorized,
          isPlatformAdmin: user.is_platform_admin,
          authorizedAt: user.authorized_at,
          isActive: user.is_active,
          tenant: user.tenant,
          createdAt: user.created_at,
          lastLogin: user.last_login,
        })),
        pagination: {
          total,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: Number(offset) + users.length < total,
        },
      })
    );
  }

  /**
   * POST /api/admin/user-management/users/:id/authorize
   * Authorize user for platform access
   */
  private async authorizeUser(
    req: Request,
    res: Response,
    _next?: NextFunction
  ): Promise<void> {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid user ID or reason');
    }

    const { id } = req.params;
    const { reason } = req.body;
    const authorizedBy = req.user?.id;

    logger.info('[UserManagementAdminRoutes] Authorizing user', {
      userId: id,
      authorizedBy,
      reason,
    });

    // Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { email: true, is_authorized: true },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (user.is_authorized) {
      res
        .status(409)
        .json(
          createResponse.error(
            'User is already authorized',
            'ALREADY_AUTHORIZED'
          )
        );
      return;
    }

    // Authorize user
    await this.authorizationService.authorizeUser({
      userId: id,
      authorizedBy: authorizedBy!,
      reason,
    });

    res.json(
      createResponse.success(
        {
          userId: id,
          email: user.email,
          authorized: true,
          authorizedAt: new Date(),
        },
        'User authorized successfully'
      )
    );
  }

  /**
   * POST /api/admin/user-management/users/:id/revoke
   * Revoke user authorization
   */
  private async revokeAuthorization(
    req: Request,
    res: Response,
    _next?: NextFunction
  ): Promise<void> {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid user ID or reason');
    }

    const { id } = req.params;
    const { reason } = req.body;
    const revokedBy = req.user?.id;

    logger.info('[UserManagementAdminRoutes] Revoking user authorization', {
      userId: id,
      revokedBy,
      reason,
    });

    // Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { email: true, is_authorized: true, is_platform_admin: true },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (!user.is_authorized) {
      res
        .status(409)
        .json(
          createResponse.error(
            'User is not currently authorized',
            'NOT_AUTHORIZED'
          )
        );
      return;
    }

    // Prevent revoking platform admin authorization
    if (user.is_platform_admin) {
      throw new AuthorizationError(
        'Cannot revoke authorization for platform admins'
      );
    }

    // Revoke authorization
    await this.authorizationService.revokeAuthorization({
      userId: id,
      revokedBy: revokedBy!,
      reason,
    });

    res.json(
      createResponse.success(
        {
          userId: id,
          email: user.email,
          authorized: false,
          revokedAt: new Date(),
        },
        'User authorization revoked successfully'
      )
    );
  }
}
