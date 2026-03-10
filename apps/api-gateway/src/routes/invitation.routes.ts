/**
 * ==============================================================================
 * INVITATION ROUTES (M3.2)
 * ==============================================================================
 * Team invitation and collaboration API endpoints
 * Milestone: User Management M3 (API Endpoints Layer)
 * Purpose: Enable secure team collaboration with 7-day token expiration
 * Phase 5.3: Trial limits enforcement for user invitations
 * ==============================================================================
 */

import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import {
  PrismaClient,
  InvitationStatus,
  StakeholderRole,
} from '@prisma/client';
import {
  logger,
  asyncHandler,
  createResponse,
  ValidationError,
  NotFoundError,
  AuthorizationError,
} from '@ectropy/shared/utils';
import {
  UserInvitationService,
  UserManagementError,
  UserManagementErrorCode,
} from '../services/user-management/index.js';
import { checkUserLimit } from '../middleware/trial-limits.middleware.js';

// Import Express type augmentation
import '../../../../libs/shared/types/src/express.js';

// ==============================================================================
// Route Configuration
// ==============================================================================

export interface InvitationRoutesConfig {
  prisma: PrismaClient;
  frontendUrl: string;
  invitationLinkPattern: string;
}

// ==============================================================================
// Invitation Routes Class
// ==============================================================================

/**
 * Invitation Routes - Team collaboration and user invitations
 *
 * Security:
 * - Cryptographically secure tokens (128-byte randomBytes)
 * - 7-day expiration policy
 * - Unique token constraint (database-enforced)
 * - Audit trail (invited_by, accepted_by, revoked_by)
 * - Tenant isolation enforced
 *
 * Endpoints:
 * - POST   /api/invitations            Create invitation
 * - POST   /api/invitations/:token/accept  Accept invitation
 * - GET    /api/invitations/pending    List pending invitations
 * - DELETE /api/invitations/:id        Revoke invitation
 */
export class InvitationRoutes {
  private router: Router;
  private invitationService: UserInvitationService;
  private prisma: PrismaClient;

  constructor(config: InvitationRoutesConfig) {
    this.router = Router();
    this.prisma = config.prisma;

    // Initialize service
    this.invitationService = new UserInvitationService(config.prisma, {
      frontendUrl: config.frontendUrl,
      invitationLinkPattern: config.invitationLinkPattern,
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
   * Setup all routes with validation middleware
   */
  private setupRoutes(): void {
    // POST /api/invitations - Create invitation
    // Phase 5.3: Enforces max_users limit before invitation
    this.router.post(
      '/',
      [
        body('email')
          .isEmail()
          .normalizeEmail()
          .withMessage('Valid email is required'),
        body('tenantId').isUUID().withMessage('Invalid tenant ID'),
        body('role')
          .isIn(Object.values(StakeholderRole))
          .withMessage('Invalid role'),
        body('invitedBy').isUUID().withMessage('Invalid inviter user ID'),
        body('message')
          .optional()
          .trim()
          .isLength({ max: 500 })
          .withMessage('Message must not exceed 500 characters'),
        body('expiresInDays')
          .optional()
          .isInt({ min: 1, max: 30 })
          .withMessage('Expiration must be between 1 and 30 days'),
      ],
      checkUserLimit,
      asyncHandler(this.createInvitation.bind(this))
    );

    // POST /api/invitations/:token/accept - Accept invitation
    this.router.post(
      '/:token/accept',
      [
        param('token')
          .isString()
          .isLength({ min: 128, max: 512 })
          .withMessage('Invalid invitation token format'),
        body('userInfo').optional().isObject(),
        body('userInfo.fullName')
          .optional()
          .trim()
          .isLength({ min: 2, max: 100 })
          .withMessage('Full name must be 2-100 characters'),
      ],
      asyncHandler(this.acceptInvitation.bind(this))
    );

    // GET /api/invitations/pending - List pending invitations
    this.router.get(
      '/pending',
      [
        query('tenantId').optional().isUUID().withMessage('Invalid tenant ID'),
        query('limit')
          .optional()
          .isInt({ min: 1, max: 100 })
          .withMessage('Limit must be between 1 and 100'),
        query('offset')
          .optional()
          .isInt({ min: 0 })
          .withMessage('Offset must be >= 0'),
      ],
      asyncHandler(this.listPendingInvitations.bind(this))
    );

    // DELETE /api/invitations/:id - Revoke invitation
    this.router.delete(
      '/:id',
      [
        param('id').isUUID().withMessage('Invalid invitation ID'),
        body('revokedBy').isUUID().withMessage('Invalid revoker user ID'),
        body('reason')
          .optional()
          .trim()
          .isLength({ max: 200 })
          .withMessage('Reason must not exceed 200 characters'),
      ],
      asyncHandler(this.revokeInvitation.bind(this))
    );
  }

  // ===========================================================================
  // Route Handlers
  // ===========================================================================

  /**
   * POST /api/invitations
   * Create and send team invitation
   */
  private async createInvitation(
    req: Request,
    res: Response,
    _next?: NextFunction
  ): Promise<void> {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(
        `Validation failed: ${errors
          .array()
          .map((e) => e.msg)
          .join(', ')}`
      );
    }

    const { email, tenantId, role, invitedBy, message, expiresInDays } =
      req.body;

    logger.info('[InvitationRoutes] Creating invitation', {
      email,
      tenantId,
      role,
      invitedBy,
    });

    try {
      // Verify inviter has permission (should have owner/admin role in tenant)
      const inviter = await this.prisma.tenantMember.findFirst({
        where: {
          tenant_id: tenantId,
          user_id: invitedBy,
          is_active: true,
          OR: [
            { role: StakeholderRole.owner },
            { role: StakeholderRole.admin },
          ],
        },
      });

      if (!inviter) {
        throw new AuthorizationError(
          'You do not have permission to invite users to this tenant'
        );
      }

      // Create invitation
      const invitation = await this.invitationService.createInvitation({
        email,
        tenantId,
        role,
        invitedBy,
        message,
        expiresInDays,
      });

      // Send invitation email
      await this.invitationService.sendInvitationEmail(invitation.id);

      res.status(201).json(
        createResponse.success(
          {
            invitationId: invitation.id,
            email: invitation.email,
            role: invitation.role,
            status: invitation.status,
            expiresAt: invitation.expiresAt,
            emailSent: true,
          },
          'Invitation sent successfully'
        )
      );
    } catch (error) {
      if (
        error instanceof UserManagementError &&
        error.code === UserManagementErrorCode.DUPLICATE_PENDING_INVITATION
      ) {
        res
          .status(409)
          .json(
            createResponse.error(
              'A pending invitation already exists for this email',
              UserManagementErrorCode.DUPLICATE_PENDING_INVITATION
            )
          );
        return;
      }

      throw error;
    }
  }

  /**
   * POST /api/invitations/:token/accept
   * Accept invitation and create user + tenant membership
   */
  private async acceptInvitation(
    req: Request,
    res: Response,
    _next?: NextFunction
  ): Promise<void> {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid invitation token or user info');
    }

    const { token } = req.params;
    const { userInfo } = req.body;

    logger.info('[InvitationRoutes] Accepting invitation', {
      tokenPrefix: token.substring(0, 8),
    });

    try {
      const result = await this.invitationService.acceptInvitation({
        token,
        userInfo: userInfo
          ? {
              fullName: userInfo.fullName,
            }
          : undefined,
      });

      logger.info('[InvitationRoutes] Invitation accepted successfully', {
        invitationId: result.invitationId,
        tenantId: result.tenantId,
        email: result.email,
      });

      res.json(
        createResponse.success(
          {
            invitationId: result.invitationId,
            tenantId: result.tenantId,
            email: result.email,
            role: result.role,
            accepted: true,
          },
          'Invitation accepted successfully. Welcome to the team!'
        )
      );
    } catch (error) {
      if (error instanceof UserManagementError) {
        let statusCode = 400;
        if (error.code === UserManagementErrorCode.INVITATION_NOT_FOUND) {
          statusCode = 404;
        } else if (
          error.code === UserManagementErrorCode.INVITATION_ALREADY_ACCEPTED
        ) {
          statusCode = 410;
        } else if (error.code === UserManagementErrorCode.INVITATION_EXPIRED) {
          statusCode = 410;
        } else if (error.code === UserManagementErrorCode.INVITATION_REVOKED) {
          statusCode = 410;
        }

        res
          .status(statusCode)
          .json(
            createResponse.error(error.message, error.code, error.metadata)
          );
        return;
      }

      throw error;
    }
  }

  /**
   * GET /api/invitations/pending
   * List pending invitations (optionally filtered by tenant)
   */
  private async listPendingInvitations(
    req: Request,
    res: Response,
    _next?: NextFunction
  ): Promise<void> {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid query parameters');
    }

    const { tenantId, limit = 50, offset = 0 } = req.query;

    logger.debug('[InvitationRoutes] Listing pending invitations', {
      tenantId,
      limit,
      offset,
    });

    // Build query
    const where: any = {
      status: InvitationStatus.PENDING,
      expires_at: { gt: new Date() }, // Only non-expired
    };

    if (tenantId) {
      // Verify user has access to this tenant
      const userId = req.user?.id;
      if (userId) {
        const membership = await this.prisma.tenantMember.findFirst({
          where: {
            tenant_id: tenantId as string,
            user_id: userId,
            is_active: true,
          },
        });

        if (!membership) {
          throw new AuthorizationError('You do not have access to this tenant');
        }
      }

      where.tenant_id = tenantId;
    }

    const [invitations, total] = await Promise.all([
      this.prisma.userInvitation.findMany({
        where,
        take: Number(limit),
        skip: Number(offset),
        orderBy: { created_at: 'desc' },
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          inviter: {
            select: {
              id: true,
              email: true,
              full_name: true,
            },
          },
        },
      }),
      this.prisma.userInvitation.count({ where }),
    ]);

    res.json(
      createResponse.success({
        invitations: invitations.map((inv) => ({
          id: inv.id,
          email: inv.email,
          role: inv.role,
          status: inv.status,
          tenant: inv.tenant,
          invitedBy: inv.inviter,
          message: inv.message,
          expiresAt: inv.expires_at,
          emailSentAt: inv.email_sent_at,
          createdAt: inv.created_at,
        })),
        pagination: {
          total,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: Number(offset) + invitations.length < total,
        },
      })
    );
  }

  /**
   * DELETE /api/invitations/:id
   * Revoke invitation (only by owner/admin)
   */
  private async revokeInvitation(
    req: Request,
    res: Response,
    _next?: NextFunction
  ): Promise<void> {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid invitation ID or revoker');
    }

    const { id } = req.params;
    const { revokedBy, reason } = req.body;

    logger.info('[InvitationRoutes] Revoking invitation', {
      invitationId: id,
      revokedBy,
    });

    // Verify invitation exists and get tenant
    const invitation = await this.prisma.userInvitation.findUnique({
      where: { id },
      select: { tenant_id: true, status: true },
    });

    if (!invitation) {
      throw new NotFoundError('Invitation not found');
    }

    // Verify revoker has permission
    const revoker = await this.prisma.tenantMember.findFirst({
      where: {
        tenant_id: invitation.tenant_id,
        user_id: revokedBy,
        is_active: true,
        OR: [{ role: StakeholderRole.owner }, { role: StakeholderRole.admin }],
      },
    });

    if (!revoker) {
      throw new AuthorizationError(
        'You do not have permission to revoke invitations for this tenant'
      );
    }

    // Check if already revoked or accepted
    if (invitation.status !== InvitationStatus.PENDING) {
      res
        .status(409)
        .json(
          createResponse.error(
            `Cannot revoke invitation with status: ${invitation.status}`,
            'INVALID_STATUS'
          )
        );
      return;
    }

    // Revoke invitation
    await this.invitationService.revokeInvitation({
      invitationId: id,
      revokedBy,
      reason,
    });

    res.json(
      createResponse.success(
        {
          invitationId: id,
          revoked: true,
        },
        'Invitation revoked successfully'
      )
    );
  }
}
