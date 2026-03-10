/**
 * External Integrations Routes - API Gateway
 *
 * Business-Tools Integration: Server-to-server API endpoints for n8n workflows
 * Strategic Alignment: Unified User System v2 (business-tools CRM → Ectropy platform)
 *
 * Purpose: Enable automated user provisioning from business-tools CRM to Ectropy platform
 * Authentication: API key (scope-based authorization)
 *
 * Endpoints:
 * - POST /api/admin/authorize-user   - Email-based user lookup + authorization
 * - GET  /api/admin/demo-users       - List demo users (simplified, no pagination)
 * - POST /api/admin/users/:userId/revoke - Revoke user authorization
 * - GET  /api/admin/health           - Lightweight health check
 *
 * Pattern: Scope-based authorization using API key middleware from Milestone 1
 * Pattern: Email-based user lookup (business-tools doesn't track Ectropy user IDs)
 * Pattern: Simplified responses for n8n workflow consumption
 */

import express, { type Request, type Response, type Router } from 'express';
import { logger } from '../../../../libs/shared/utils/src/logger.js';
import {
  asyncHandler,
  createResponse,
} from '../../../../libs/shared/utils/src/simple-errors.js';
import { getPrismaClient } from '../database/prisma.js';
import { apiKeyMiddleware } from '../middleware/api-key.middleware.js';

// Import Express type augmentation for req.user and req.apiKey
import '../../../../libs/shared/types/src/express.js';

/**
 * External Integrations Routes Configuration
 */
export interface ExternalIntegrationsRoutesConfig {
  // Future: Add Redis, audit logger, etc. as needed
}

/**
 * External Integrations Routes Handler
 * Implements business-tools n8n workflow integration endpoints
 */
export class ExternalIntegrationsRoutes {
  private router: Router;
  private prisma: ReturnType<typeof getPrismaClient>;

  constructor(_config: ExternalIntegrationsRoutesConfig = {}) {
    this.router = express.Router();
    this.prisma = getPrismaClient();

    this.setupRoutes();
  }

  /**
   * Setup all external integration routes with API key authentication
   */
  private setupRoutes(): void {
    // POST /api/admin/authorize-user - Authorize user by email
    this.router.post(
      '/authorize-user',
      apiKeyMiddleware.authenticate(['authorize_user', '*']),
      asyncHandler(this.authorizeUser.bind(this))
    );

    // GET /api/admin/demo-users - List demo users
    this.router.get(
      '/demo-users',
      apiKeyMiddleware.dualAuth(['list_users', '*']),
      asyncHandler(this.getDemoUsers.bind(this))
    );

    // POST /api/admin/users/:userId/revoke - Revoke user authorization
    this.router.post(
      '/users/:userId/revoke',
      apiKeyMiddleware.authenticate(['revoke_user', '*']),
      asyncHandler(this.revokeUser.bind(this))
    );

    // GET /api/admin/health - Health check
    this.router.get(
      '/health',
      apiKeyMiddleware.dualAuth(['health_check', '*']),
      asyncHandler(this.healthCheck.bind(this))
    );
  }

  /**
   * POST /api/admin/authorize-user
   *
   * Authorize a user by email (email-based lookup, business-tools doesn't track Ectropy IDs)
   *
   * Request body:
   * - email: string (required) - User email to authorize
   * - reason: string (required) - Reason for authorization (audit trail)
   *
   * Response:
   * - success: boolean
   * - user: { id, email, full_name, is_authorized, authorized_at }
   * - message: string
   */
  private async authorizeUser(req: Request, res: Response): Promise<void> {
    const { email, reason } = req.body;

    // Validate required fields
    if (!email || typeof email !== 'string') {
      res.status(400).json({
        error: 'Email is required',
        code: 'MISSING_EMAIL',
      });
      return;
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      res.status(400).json({
        error: 'Reason is required for audit trail',
        code: 'MISSING_REASON',
      });
      return;
    }

    // Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: {
        id: true,
        email: true,
        full_name: true,
        is_authorized: true,
        authorized_at: true,
        is_platform_admin: true,
      },
    });

    if (!user) {
      res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND',
        email,
      });
      return;
    }

    // Check if already authorized
    if (user.is_authorized) {
      res.status(200).json(
        createResponse.success({
          message: 'User already authorized',
          user: {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            is_authorized: user.is_authorized,
            authorized_at: user.authorized_at?.toISOString() || null,
            is_platform_admin: user.is_platform_admin,
          },
          alreadyAuthorized: true,
        })
      );
      return;
    }

    // Authorize user
    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        is_authorized: true,
        authorized_at: new Date(),
        updated_at: new Date(),
      },
      select: {
        id: true,
        email: true,
        full_name: true,
        is_authorized: true,
        authorized_at: true,
        is_platform_admin: true,
      },
    });

    logger.info('[External Integrations] User authorized', {
      userId: updatedUser.id,
      email: updatedUser.email,
      authorizedBy: req.apiKey?.name || req.user?.email || 'unknown',
      reason: reason.trim(),
    });

    res.status(200).json(
      createResponse.success({
        message: 'User authorized successfully',
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          full_name: updatedUser.full_name,
          is_authorized: updatedUser.is_authorized,
          authorized_at: updatedUser.authorized_at?.toISOString() || null,
          is_platform_admin: updatedUser.is_platform_admin,
        },
        alreadyAuthorized: false,
      })
    );
  }

  /**
   * GET /api/admin/demo-users
   *
   * List demo users (simplified, no pagination)
   * Returns users with "demo" in their name/email or users created in last 30 days
   *
   * Query parameters:
   * - limit: number (optional, default: 50, max: 200)
   *
   * Response:
   * - success: boolean
   * - users: Array<{ id, email, full_name, is_authorized, created_at }>
   * - total: number
   */
  private async getDemoUsers(req: Request, res: Response): Promise<void> {
    const limit = Math.min(
      Number(req.query.limit) || 50,
      200 // Max limit
    );

    // Get users created in last 30 days or with "demo" in name/email
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const users = await this.prisma.user.findMany({
      where: {
        OR: [
          { created_at: { gte: thirtyDaysAgo } },
          { email: { contains: 'demo', mode: 'insensitive' } },
          { full_name: { contains: 'demo', mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        email: true,
        full_name: true,
        is_authorized: true,
        created_at: true,
        is_platform_admin: true,
      },
      orderBy: { created_at: 'desc' },
      take: limit,
    });

    logger.debug('[External Integrations] Demo users listed', {
      count: users.length,
      limit,
      requestedBy: req.apiKey?.name || req.user?.email || 'unknown',
    });

    res.status(200).json(
      createResponse.success({
        users: users.map((user) => ({
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          is_authorized: user.is_authorized,
          is_platform_admin: user.is_platform_admin,
          created_at: user.created_at.toISOString(),
        })),
        total: users.length,
      })
    );
  }

  /**
   * POST /api/admin/users/:userId/revoke
   *
   * Revoke user authorization
   *
   * Request body:
   * - reason: string (required) - Reason for revocation (audit trail)
   *
   * Response:
   * - success: boolean
   * - user: { id, email, full_name, is_authorized, revoked_at }
   * - message: string
   */
  private async revokeUser(req: Request, res: Response): Promise<void> {
    const { userId } = req.params;
    const { reason } = req.body;

    // Validate required fields
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      res.status(400).json({
        error: 'Reason is required for audit trail',
        code: 'MISSING_REASON',
      });
      return;
    }

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        full_name: true,
        is_authorized: true,
        is_platform_admin: true,
      },
    });

    if (!user) {
      res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND',
        userId,
      });
      return;
    }

    // Prevent revoking platform admins (@luh.tech users)
    if (user.is_platform_admin) {
      res.status(403).json({
        error: 'Cannot revoke platform admin authorization',
        code: 'CANNOT_REVOKE_PLATFORM_ADMIN',
        userId,
      });
      return;
    }

    // Check if already revoked
    if (!user.is_authorized) {
      res.status(200).json(
        createResponse.success({
          message: 'User authorization already revoked',
          user: {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            is_authorized: user.is_authorized,
            is_platform_admin: user.is_platform_admin,
          },
          alreadyRevoked: true,
        })
      );
      return;
    }

    // Revoke authorization
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        is_authorized: false,
        updated_at: new Date(),
      },
      select: {
        id: true,
        email: true,
        full_name: true,
        is_authorized: true,
        is_platform_admin: true,
        updated_at: true,
      },
    });

    logger.info('[External Integrations] User authorization revoked', {
      userId: updatedUser.id,
      email: updatedUser.email,
      revokedBy: req.apiKey?.name || req.user?.email || 'unknown',
      reason: reason.trim(),
    });

    res.status(200).json(
      createResponse.success({
        message: 'User authorization revoked successfully',
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          full_name: updatedUser.full_name,
          is_authorized: updatedUser.is_authorized,
          is_platform_admin: updatedUser.is_platform_admin,
          revoked_at: updatedUser.updated_at.toISOString(),
        },
        alreadyRevoked: false,
      })
    );
  }

  /**
   * GET /api/admin/health
   *
   * Lightweight health check for external integrations
   *
   * Response:
   * - success: boolean
   * - status: string ('healthy')
   * - timestamp: string (ISO 8601)
   * - database: boolean (Prisma connection status)
   */
  private async healthCheck(_req: Request, res: Response): Promise<void> {
    let databaseHealthy = false;

    try {
      // Simple database check - execute a lightweight query
      await this.prisma.$queryRaw`SELECT 1`;
      databaseHealthy = true;
    } catch (error) {
      logger.error('[External Integrations] Health check - database error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    const status = databaseHealthy ? 'healthy' : 'degraded';

    res.status(databaseHealthy ? 200 : 503).json(
      createResponse.success({
        status,
        timestamp: new Date().toISOString(),
        database: databaseHealthy,
      })
    );
  }

  /**
   * Get the configured router
   */
  public getRouter(): Router {
    return this.router;
  }
}
