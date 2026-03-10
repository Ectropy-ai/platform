/**
 * ==============================================================================
 * ECTROPY CONSOLE API ROUTES
 * ==============================================================================
 * Backend API endpoints for the Ectropy Employee Console.
 * Provides tenant management, cross-tenant user management, and system health.
 *
 * Access: Platform admin only (is_platform_admin = true)
 * Base Path: /api/console
 *
 * Migration Note: Will move to ectropy-business repository post-split.
 * ==============================================================================
 */

import { Router, Request, Response, NextFunction } from 'express';
import { query, param, body, validationResult } from 'express-validator';
import { PrismaClient, TenantStatus, SubscriptionTier } from '@prisma/client';
import {
  logger,
  asyncHandler,
  createResponse,
  ValidationError,
  AuthorizationError,
} from '@ectropy/shared/utils';
import { emailService } from '../../services/email.service.js';

// Import Express type augmentation
import '../../../../../libs/shared/types/src/express.js';

// ==============================================================================
// Types
// ==============================================================================

export interface ConsoleRoutesConfig {
  prisma: PrismaClient;
}

// ==============================================================================
// Console Routes Class
// ==============================================================================

export class ConsoleRoutes {
  private router: Router;
  private prisma: PrismaClient;

  constructor(config: ConsoleRoutesConfig) {
    this.router = Router();
    this.prisma = config.prisma;
    this.setupRoutes();
  }

  getRouter(): Router {
    return this.router;
  }

  private setupRoutes(): void {
    // Platform admin middleware for all routes
    this.router.use(this.ensurePlatformAdmin.bind(this));

    // Tenant routes
    this.router.get(
      '/tenants',
      [
        query('search').optional().trim(),
        query('status')
          .optional()
          .isIn(['TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED']),
        query('tier')
          .optional()
          .isIn(['FREE', 'BASIC', 'PROFESSIONAL', 'ENTERPRISE']),
        query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
        query('offset').optional().isInt({ min: 0 }).toInt(),
      ],
      asyncHandler(this.listTenants.bind(this))
    );

    this.router.get(
      '/tenants/:id',
      [param('id').isUUID()],
      asyncHandler(this.getTenant.bind(this))
    );

    this.router.post(
      '/tenants',
      [
        body('name').trim().isLength({ min: 2, max: 255 }),
        body('slug')
          .trim()
          .isLength({ min: 3, max: 100 })
          .matches(/^[a-z0-9-]+$/),
        body('primaryEmail').isEmail(),
        body('subscriptionTier')
          .optional()
          .isIn(['FREE', 'BASIC', 'PROFESSIONAL', 'ENTERPRISE']),
        body('billingEmail').optional().isEmail(),
      ],
      asyncHandler(this.createTenant.bind(this))
    );

    this.router.put(
      '/tenants/:id',
      [
        param('id').isUUID(),
        body('name').optional().trim().isLength({ min: 2, max: 255 }),
        body('primaryEmail').optional().isEmail(),
        body('subscriptionTier')
          .optional()
          .isIn(['FREE', 'BASIC', 'PROFESSIONAL', 'ENTERPRISE']),
      ],
      asyncHandler(this.updateTenant.bind(this))
    );

    this.router.post(
      '/tenants/:id/suspend',
      [
        param('id').isUUID(),
        body('reason').trim().isLength({ min: 1, max: 500 }),
      ],
      asyncHandler(this.suspendTenant.bind(this))
    );

    this.router.post(
      '/tenants/:id/activate',
      [param('id').isUUID()],
      asyncHandler(this.activateTenant.bind(this))
    );

    // User routes (cross-tenant)
    this.router.get(
      '/users',
      [
        query('search').optional().trim(),
        query('isAuthorized').optional().isBoolean().toBoolean(),
        query('tenantId').optional().isUUID(),
        query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
        query('offset').optional().isInt({ min: 0 }).toInt(),
      ],
      asyncHandler(this.listUsers.bind(this))
    );

    this.router.get(
      '/users/:id',
      [param('id').isUUID()],
      asyncHandler(this.getUser.bind(this))
    );

    this.router.post(
      '/users/:id/authorize',
      [
        param('id').isUUID(),
        body('reason').optional().trim().isLength({ max: 500 }),
      ],
      asyncHandler(this.authorizeUser.bind(this))
    );

    this.router.post(
      '/users/:id/revoke',
      [
        param('id').isUUID(),
        body('reason').trim().isLength({ min: 1, max: 500 }),
      ],
      asyncHandler(this.revokeUser.bind(this))
    );

    this.router.post(
      '/users/invite',
      [
        body('email').isEmail().normalizeEmail(),
        body('fullName').optional().trim().isLength({ min: 1, max: 255 }),
        body('role').isIn([
          'owner',
          'architect',
          'contractor',
          'engineer',
          'consultant',
          'inspector',
          'site_manager',
          'admin',
        ]),
        body('tenantId').optional().isUUID(),
        body('sendEmail').optional().isBoolean(),
        body('reason').optional().trim().isLength({ max: 500 }),
      ],
      asyncHandler(this.inviteUser.bind(this))
    );

    // =========================================================================
    // Demo Provisioning Routes (2026-02-24)
    // Unified demo provisioning: authorize + create tenant + add demo project
    // =========================================================================

    this.router.post(
      '/users/:id/provision-demo',
      [
        param('id').isUUID(),
        body('buildingType')
          .isIn([
            'residential-single-family',
            'residential-multi-family',
            'commercial-office',
            'commercial-large',
          ])
          .withMessage('Invalid building type'),
        body('projectName').optional().trim().isLength({ min: 1, max: 255 }),
        body('sendWelcomeEmail').optional().isBoolean(),
      ],
      asyncHandler(this.provisionDemo.bind(this))
    );

    // Demo cleanup endpoint
    this.router.delete(
      '/demo/cleanup',
      [
        body('olderThanDays').optional().isInt({ min: 1, max: 365 }).toInt(),
        body('dryRun').optional().isBoolean(),
      ],
      asyncHandler(this.cleanupDemos.bind(this))
    );

    // Health routes
    this.router.get('/health', asyncHandler(this.getSystemHealth.bind(this)));
    this.router.get('/metrics', asyncHandler(this.getMetrics.bind(this)));
  }

  // ===========================================================================
  // Middleware
  // ===========================================================================

  private async ensurePlatformAdmin(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const user = req.user;

    if (!user) {
      throw new AuthorizationError('Authentication required');
    }

    // Check platform admin status
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { is_platform_admin: true },
    });

    if (!dbUser?.is_platform_admin) {
      logger.warn('[Console] Unauthorized access attempt', {
        userId: user.id,
        email: user.email,
      });
      throw new AuthorizationError('Platform admin access required');
    }

    next();
  }

  // ===========================================================================
  // Tenant Handlers
  // ===========================================================================

  private async listTenants(req: Request, res: Response): Promise<void> {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid query parameters');
    }

    const { search, status, tier, limit = 25, offset = 0 } = req.query;

    // Build where clause
    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { slug: { contains: search as string, mode: 'insensitive' } },
        { primary_email: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    if (status) {
      where.status = status as TenantStatus;
    }

    if (tier) {
      where.subscription_tier = tier as SubscriptionTier;
    }

    // Fetch tenants with counts
    const [tenants, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        include: {
          _count: {
            select: {
              users: true,
              projects: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
        take: Number(limit),
        skip: Number(offset),
      }),
      this.prisma.tenant.count({ where }),
    ]);

    // Transform response
    const transformedTenants = tenants.map((tenant) => ({
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      status: tenant.status,
      subscriptionTier: tenant.subscription_tier,
      primaryEmail: tenant.primary_email,
      usage: {
        userCount: tenant._count.users,
        projectCount: tenant._count.projects,
        storageUsedGb: 0, // TODO: Calculate actual storage
      },
      limits: {
        maxUsers: tenant.max_users,
        maxProjects: tenant.max_projects,
        maxStorageGb: tenant.max_storage_gb,
      },
      createdAt: tenant.created_at.toISOString(),
      trialEndsAt: tenant.trial_ends_at?.toISOString() || null,
      suspendedAt: tenant.suspended_at?.toISOString() || null,
    }));

    res.json(
      createResponse.success({
        tenants: transformedTenants,
        pagination: {
          total,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: Number(offset) + tenants.length < total,
        },
      })
    );
  }

  private async getTenant(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            projects: true,
          },
        },
        users: {
          take: 10,
          orderBy: { created_at: 'desc' },
          select: {
            id: true,
            email: true,
            full_name: true,
            role: true,
            is_authorized: true,
          },
        },
      },
    });

    if (!tenant) {
      res.status(404).json(createResponse.error('Tenant not found'));
      return;
    }

    res.json(
      createResponse.success({
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        status: tenant.status,
        subscriptionTier: tenant.subscription_tier,
        primaryEmail: tenant.primary_email,
        billingEmail: tenant.billing_email,
        usage: {
          userCount: tenant._count.users,
          projectCount: tenant._count.projects,
          storageUsedGb: 0,
        },
        limits: {
          maxUsers: tenant.max_users,
          maxProjects: tenant.max_projects,
          maxStorageGb: tenant.max_storage_gb,
        },
        recentUsers: tenant.users,
        createdAt: tenant.created_at.toISOString(),
        trialEndsAt: tenant.trial_ends_at?.toISOString() || null,
        suspendedAt: tenant.suspended_at?.toISOString() || null,
      })
    );
  }

  private async createTenant(req: Request, res: Response): Promise<void> {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid tenant data');
    }

    const {
      name,
      slug,
      primaryEmail,
      subscriptionTier = 'FREE',
      billingEmail,
    } = req.body;

    // Check slug uniqueness
    const existing = await this.prisma.tenant.findUnique({
      where: { slug },
    });

    if (existing) {
      res
        .status(409)
        .json(
          createResponse.error(`Tenant with slug '${slug}' already exists`)
        );
      return;
    }

    // Get tier limits
    const tierLimits: Record<
      string,
      { users: number; projects: number; storage: number }
    > = {
      FREE: { users: 5, projects: 1, storage: 5 },
      BASIC: { users: 25, projects: 5, storage: 25 },
      PROFESSIONAL: { users: 100, projects: 25, storage: 100 },
      ENTERPRISE: { users: 9999, projects: 9999, storage: 9999 },
    };

    const limits = tierLimits[subscriptionTier] || tierLimits.FREE;

    // Create tenant
    const tenant = await this.prisma.tenant.create({
      data: {
        name,
        slug,
        status: 'TRIAL',
        subscription_tier: subscriptionTier as SubscriptionTier,
        primary_email: primaryEmail,
        billing_email: billingEmail || primaryEmail,
        max_users: limits.users,
        max_projects: limits.projects,
        max_storage_gb: limits.storage,
        data_region: 'us-west-2',
        trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
      },
    });

    logger.info('[Console] Tenant created', {
      tenantId: tenant.id,
      slug: tenant.slug,
      createdBy: req.user?.id,
    });

    res.status(201).json(
      createResponse.success({
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        status: tenant.status,
        subscriptionTier: tenant.subscription_tier,
        primaryEmail: tenant.primary_email,
        createdAt: tenant.created_at.toISOString(),
      })
    );
  }

  private async updateTenant(req: Request, res: Response): Promise<void> {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid tenant data');
    }

    const { id } = req.params;
    const updates: any = {};

    if (req.body.name) {
      updates.name = req.body.name;
    }
    if (req.body.primaryEmail) {
      updates.primary_email = req.body.primaryEmail;
    }
    if (req.body.subscriptionTier) {
      updates.subscription_tier = req.body.subscriptionTier;
      // Update limits based on new tier
      const tierLimits: Record<
        string,
        { users: number; projects: number; storage: number }
      > = {
        FREE: { users: 5, projects: 1, storage: 5 },
        BASIC: { users: 25, projects: 5, storage: 25 },
        PROFESSIONAL: { users: 100, projects: 25, storage: 100 },
        ENTERPRISE: { users: 9999, projects: 9999, storage: 9999 },
      };
      const limits = tierLimits[req.body.subscriptionTier];
      if (limits) {
        updates.max_users = limits.users;
        updates.max_projects = limits.projects;
        updates.max_storage_gb = limits.storage;
      }
    }

    const tenant = await this.prisma.tenant.update({
      where: { id },
      data: updates,
    });

    logger.info('[Console] Tenant updated', {
      tenantId: id,
      updates: Object.keys(updates),
      updatedBy: req.user?.id,
    });

    res.json(
      createResponse.success({
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        status: tenant.status,
        subscriptionTier: tenant.subscription_tier,
        primaryEmail: tenant.primary_email,
      })
    );
  }

  private async suspendTenant(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { reason } = req.body;

    const tenant = await this.prisma.tenant.update({
      where: { id },
      data: {
        status: 'SUSPENDED',
        suspended_at: new Date(),
      },
    });

    logger.info('[Console] Tenant suspended', {
      tenantId: id,
      reason,
      suspendedBy: req.user?.id,
    });

    res.json(createResponse.success({ id: tenant.id, status: tenant.status }));
  }

  private async activateTenant(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    const tenant = await this.prisma.tenant.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        suspended_at: null,
      },
    });

    logger.info('[Console] Tenant activated', {
      tenantId: id,
      activatedBy: req.user?.id,
    });

    res.json(createResponse.success({ id: tenant.id, status: tenant.status }));
  }

  // ===========================================================================
  // User Handlers
  // ===========================================================================

  private async listUsers(req: Request, res: Response): Promise<void> {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid query parameters');
    }

    const {
      search,
      isAuthorized,
      tenantId,
      limit = 25,
      offset = 0,
    } = req.query;

    // Build where clause
    const where: any = {};

    if (search) {
      where.OR = [
        { email: { contains: search as string, mode: 'insensitive' } },
        { full_name: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    if (isAuthorized !== undefined) {
      where.is_authorized = isAuthorized;
    }

    if (tenantId) {
      where.tenant_id = tenantId;
    }

    // Fetch users
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
        take: Number(limit),
        skip: Number(offset),
      }),
      this.prisma.user.count({ where }),
    ]);

    // Transform response
    const transformedUsers = users.map((user) => ({
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      roles: user.roles || [user.role],
      isAuthorized: user.is_authorized,
      isPlatformAdmin: user.is_platform_admin,
      authorizedAt: user.authorized_at?.toISOString() || null,
      tenant: user.tenant
        ? {
            id: user.tenant.id,
            name: user.tenant.name,
            slug: user.tenant.slug,
          }
        : null,
      createdAt: user.created_at.toISOString(),
      lastLogin: user.last_login?.toISOString() || null,
    }));

    res.json(
      createResponse.success({
        users: transformedUsers,
        pagination: {
          total,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: Number(offset) + users.length < total,
        },
      })
    );
  }

  private async getUser(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!user) {
      res.status(404).json(createResponse.error('User not found'));
      return;
    }

    res.json(
      createResponse.success({
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        roles: user.roles || [user.role],
        isAuthorized: user.is_authorized,
        isPlatformAdmin: user.is_platform_admin,
        authorizedAt: user.authorized_at?.toISOString() || null,
        tenant: user.tenant,
        createdAt: user.created_at.toISOString(),
        lastLogin: user.last_login?.toISOString() || null,
      })
    );
  }

  private async authorizeUser(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user?.id;

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        is_authorized: true,
        authorized_at: new Date(),
        authorized_by: adminId, // SOLUTION_001: Complete audit trail
      },
      include: {
        tenant: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    logger.info('[Console] User authorized', {
      userId: id,
      email: user.email,
      reason,
      authorizedBy: adminId,
    });

    res.json(
      createResponse.success({
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        isAuthorized: user.is_authorized,
        authorizedAt: user.authorized_at?.toISOString(),
        tenant: user.tenant,
      })
    );
  }

  private async revokeUser(req: Request, res: Response): Promise<void> {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Reason is required');
    }

    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user?.id;

    // Check if trying to revoke a platform admin
    const targetUser = await this.prisma.user.findUnique({
      where: { id },
      select: { is_platform_admin: true, email: true },
    });

    if (targetUser?.is_platform_admin) {
      res
        .status(403)
        .json(
          createResponse.error('Cannot revoke platform admin authorization')
        );
      return;
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        is_authorized: false,
        authorized_at: null,
      },
      include: {
        tenant: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    logger.info('[Console] User authorization revoked', {
      userId: id,
      email: user.email,
      reason,
      revokedBy: adminId,
    });

    res.json(
      createResponse.success({
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        isAuthorized: user.is_authorized,
        tenant: user.tenant,
      })
    );
  }

  private async inviteUser(req: Request, res: Response): Promise<void> {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid invitation data');
    }

    const {
      email,
      fullName,
      role,
      tenantId,
      sendEmail = true,
      reason,
    } = req.body;
    const adminId = req.user?.id;

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      include: {
        tenant: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    if (existingUser) {
      // User exists - just authorize if not already
      if (!existingUser.is_authorized) {
        const updatedUser = await this.prisma.user.update({
          where: { id: existingUser.id },
          data: {
            is_authorized: true,
            authorized_at: new Date(),
            tenant_id: tenantId || existingUser.tenant_id,
          },
          include: {
            tenant: {
              select: { id: true, name: true, slug: true },
            },
          },
        });

        logger.info('[Console] Existing user authorized via invite', {
          userId: updatedUser.id,
          email: updatedUser.email,
          authorizedBy: adminId,
          reason,
        });

        res.json(
          createResponse.success({
            id: updatedUser.id,
            email: updatedUser.email,
            fullName: updatedUser.full_name,
            role: updatedUser.role,
            isAuthorized: updatedUser.is_authorized,
            tenant: updatedUser.tenant,
            invitationSent: false,
            createdAt: updatedUser.created_at.toISOString(),
          })
        );
        return;
      }

      res
        .status(409)
        .json(
          createResponse.error(`User ${email} already exists and is authorized`)
        );
      return;
    }

    // Validate tenant if provided
    if (tenantId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
      });

      if (!tenant) {
        res.status(404).json(createResponse.error('Tenant not found'));
        return;
      }

      // Check tenant user limit
      const userCount = await this.prisma.user.count({
        where: { tenant_id: tenantId },
      });

      if (userCount >= tenant.max_users) {
        res
          .status(400)
          .json(
            createResponse.error(
              `Tenant has reached maximum user limit (${tenant.max_users})`
            )
          );
        return;
      }
    }

    // Create new user with pre-authorization
    const newUser = await this.prisma.user.create({
      data: {
        email,
        full_name: fullName || null,
        role,
        roles: [role],
        is_authorized: true, // Pre-authorized by platform admin
        authorized_at: new Date(),
        tenant_id: tenantId || null,
        // User will complete registration via OAuth on first login
      },
      include: {
        tenant: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    // Create invitation record for tracking
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const invitationToken = crypto.randomUUID();
    await this.prisma.userInvitation.create({
      data: {
        email,
        tenant_id: tenantId || null,
        role,
        invited_by: adminId!,
        token: invitationToken,
        expires_at: expiresAt,
        status: 'PENDING',
      },
    });

    // Send invitation email if requested
    let invitationSent = false;
    if (sendEmail) {
      try {
        // Get admin name for the invitation email
        const admin = await this.prisma.user.findUnique({
          where: { id: adminId! },
          select: { full_name: true, email: true },
        });
        const inviterName = admin?.full_name || admin?.email || 'Ectropy Admin';
        const tenantName = newUser.tenant?.name || 'Ectropy';

        const emailResult = await emailService.sendUserInvitation(
          email,
          inviterName,
          tenantName,
          invitationToken,
          role
        );
        invitationSent = emailResult.success;

        if (!emailResult.success) {
          logger.warn('[Console] Failed to send invitation email', {
            email,
            error: emailResult.error,
          });
        }
      } catch (emailError) {
        logger.error('[Console] Error sending invitation email', {
          email,
          error: emailError instanceof Error ? emailError.message : 'Unknown error',
        });
        // Don't fail the request if email fails - user is still created
      }
    }

    logger.info('[Console] New user invited', {
      userId: newUser.id,
      email: newUser.email,
      tenantId,
      role,
      invitedBy: adminId,
      reason,
      emailSent: invitationSent,
    });

    res.status(201).json(
      createResponse.success({
        id: newUser.id,
        email: newUser.email,
        fullName: newUser.full_name,
        role: newUser.role,
        isAuthorized: newUser.is_authorized,
        tenant: newUser.tenant,
        invitationSent,
        createdAt: newUser.created_at.toISOString(),
      })
    );
  }

  // ===========================================================================
  // Health Handlers
  // ===========================================================================

  private async getSystemHealth(req: Request, res: Response): Promise<void> {
    // Get real metrics from system
    const startTime = Date.now();

    // Check database
    let dbStatus = 'healthy';
    let dbResponseTime = 0;
    try {
      const dbStart = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      dbResponseTime = Date.now() - dbStart;
    } catch {
      dbStatus = 'critical';
    }

    // Get counts for basic metrics
    const [tenantCount, userCount] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.user.count(),
    ]);

    // System metrics (would integrate with actual monitoring in production)
    const os = await import('os');
    const cpuUsage = os.loadavg()[0] * 10; // Rough approximation
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memoryUsage = ((totalMem - freeMem) / totalMem) * 100;

    res.json(
      createResponse.success({
        overall: dbStatus === 'healthy' ? 'healthy' : 'degraded',
        services: {
          apiGateway: {
            name: 'API Gateway',
            status: 'healthy',
            responseTimeMs: Date.now() - startTime,
            lastChecked: new Date().toISOString(),
          },
          mcpServer: {
            name: 'MCP Server',
            status: 'healthy', // Would check actual MCP health
            responseTimeMs: null,
            lastChecked: new Date().toISOString(),
          },
          database: {
            name: 'Database',
            status: dbStatus,
            responseTimeMs: dbResponseTime,
            lastChecked: new Date().toISOString(),
          },
          redis: {
            name: 'Redis',
            status: 'healthy', // Would check actual Redis health
            responseTimeMs: null,
            lastChecked: new Date().toISOString(),
          },
          speckle: {
            name: 'Speckle BIM',
            status: 'healthy', // Would check actual Speckle health
            responseTimeMs: null,
            lastChecked: new Date().toISOString(),
          },
        },
        metrics: {
          requestsPerMinute: 0, // Would integrate with Prometheus
          errorRate: 0,
          p95LatencyMs: 0,
          activeConnections: 0,
          cpuUsagePercent: Math.min(Math.round(cpuUsage), 100),
          memoryUsagePercent: Math.round(memoryUsage),
          diskUsagePercent: 0, // Would check actual disk usage
        },
        alerts: {
          critical: 0,
          warning: 0,
          info: 0,
        },
        timestamp: new Date().toISOString(),
      })
    );
  }

  private async getMetrics(req: Request, res: Response): Promise<void> {
    // Return raw metrics for custom dashboards
    const os = await import('os');

    res.json(
      createResponse.success({
        cpu_usage: os.loadavg()[0] * 10,
        memory_total: os.totalmem(),
        memory_free: os.freemem(),
        memory_used_percent:
          ((os.totalmem() - os.freemem()) / os.totalmem()) * 100,
        uptime_seconds: os.uptime(),
        timestamp: Date.now(),
      })
    );
  }

  // ===========================================================================
  // Demo Provisioning Handlers (2026-02-24)
  // ===========================================================================

  // Static building type catalog (eliminates need for cross-database query)
  // In production, this would be synced from the platform database's ModelCatalog
  private static readonly BUILDING_TYPE_CATALOG: Record<
    string,
    { displayName: string; description: string; estimatedBudget: number }
  > = {
    'residential-single-family': {
      displayName: 'Single Family Residential',
      description: 'Demo project: Modern single-family home with BIM model',
      estimatedBudget: 250000,
    },
    'residential-multi-family': {
      displayName: 'Multi-Family Residential',
      description: 'Demo project: Multi-unit residential building with BIM model',
      estimatedBudget: 2000000,
    },
    'commercial-office': {
      displayName: 'Commercial Office',
      description: 'Demo project: Commercial office building with BIM model',
      estimatedBudget: 5000000,
    },
    'commercial-large': {
      displayName: 'Large Commercial',
      description: 'Demo project: Large commercial complex with BIM model',
      estimatedBudget: 15000000,
    },
  };

  /**
   * Unified demo provisioning endpoint
   *
   * This endpoint combines multiple operations into one:
   * 1. Authorize user (if not already authorized)
   * 2. Create trial tenant (if user doesn't have one)
   * 3. Create demo project
   *
   * SOLUTION_002: All database operations wrapped in $transaction() for atomicity.
   * If any step fails, the entire operation rolls back to prevent orphaned records.
   *
   * This streamlines the demo setup process for admins, reducing
   * multiple clicks to a single action.
   */
  private async provisionDemo(req: Request, res: Response): Promise<void> {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid provisioning data');
    }

    const { id } = req.params;
    const { buildingType, projectName, sendWelcomeEmail = true } = req.body;
    const adminId = req.user?.id;

    logger.info('[Console] Starting demo provisioning', {
      userId: id,
      buildingType,
      provisionedBy: adminId,
    });

    // Validate building type exists before starting transaction
    const catalogEntry = ConsoleRoutes.BUILDING_TYPE_CATALOG[buildingType];
    if (!catalogEntry) {
      res.status(404).json(
        createResponse.error(`Building type '${buildingType}' not found in catalog`)
      );
      return;
    }

    // Check user exists before starting transaction
    const existingUser = await this.prisma.user.findUnique({
      where: { id },
      include: {
        tenant: {
          select: { id: true, name: true, slug: true, status: true },
        },
      },
    });

    if (!existingUser) {
      res.status(404).json(createResponse.error('User not found'));
      return;
    }

    // SOLUTION_002: Interactive transaction for atomic demo provisioning
    // All database operations are wrapped - if any fail, entire operation rolls back
    const result = await this.prisma.$transaction(async (tx) => {
      const provisioningResults = {
        userAuthorized: false,
        tenantCreated: false,
        projectCreated: false,
      };

      let user = existingUser;
      let tenantId = user.tenant_id;
      let tenantSlug = user.tenant?.slug;

      // Step 1: Authorize user if not already authorized
      if (!user.is_authorized) {
        user = await tx.user.update({
          where: { id },
          data: {
            is_authorized: true,
            authorized_at: new Date(),
            authorized_by: adminId, // Consistent with SOLUTION_001
          },
          include: {
            tenant: {
              select: { id: true, name: true, slug: true, status: true },
            },
          },
        });
        provisioningResults.userAuthorized = true;

        logger.info('[Console] User authorized during demo provisioning', {
          userId: id,
          email: user.email,
          authorizedBy: adminId,
        });
      }

      // Step 2: Create trial tenant if user doesn't have one
      if (!tenantId) {
        // Generate tenant slug from user email
        const emailPrefix = user.email.split('@')[0].replace(/[^a-z0-9]/gi, '-');
        tenantSlug = `${emailPrefix}-demo-${Date.now().toString(36)}`;

        const newTenant = await tx.tenant.create({
          data: {
            slug: tenantSlug,
            name: `${user.full_name || user.email}'s Demo`,
            status: 'TRIAL' as TenantStatus,
            subscription_tier: 'FREE' as SubscriptionTier,
            primary_email: user.email,
            max_projects: 3,
            max_users: 5,
            max_storage_gb: 1,
            data_region: 'us-west-2',
          },
        });

        // Update user with new tenant
        user = await tx.user.update({
          where: { id },
          data: { tenant_id: newTenant.id },
          include: {
            tenant: {
              select: { id: true, name: true, slug: true, status: true },
            },
          },
        });

        tenantId = newTenant.id;
        provisioningResults.tenantCreated = true;

        logger.info('[Console] Trial tenant created during demo provisioning', {
          userId: id,
          tenantId: newTenant.id,
          tenantSlug: newTenant.slug,
        });
      }

      // Step 3: Create demo project using main schema Project model
      const demoProjectName = projectName || `Demo: ${catalogEntry.displayName}`;

      const project = await tx.project.create({
        data: {
          tenant_id: tenantId!,
          owner_id: id, // User becomes project owner
          name: demoProjectName,
          description: `[DEMO] ${catalogEntry.description} | Building Type: ${buildingType}`,
          total_budget: catalogEntry.estimatedBudget,
          status: 'planning', // Main schema uses lowercase enum values
          currency: 'USD',
        },
      });

      // Step 4: Assign user as project owner role
      await tx.projectRole.create({
        data: {
          project_id: project.id,
          user_id: id,
          role: 'owner', // Main schema StakeholderRole uses lowercase
        },
      });

      provisioningResults.projectCreated = true;

      logger.info('[Console] Demo project created', {
        userId: id,
        projectId: project.id,
        buildingType,
        tenantId,
      });

      return {
        user,
        tenantId,
        tenantSlug,
        project,
        demoProjectName,
        provisioningResults,
      };
    });

    // Email sending is OUTSIDE the transaction (non-critical, non-blocking)
    let welcomeEmailSent = false;
    if (sendWelcomeEmail) {
      try {
        // SOLUTION_003: Use environment variable for correct URL per environment
        const frontendUrl = process.env.FRONTEND_URL || 'https://staging.ectropy.ai';
        const viewerUrl = `${frontendUrl}/viewer?project=${result.project.id}`;
        const emailResult = await emailService.sendEmail({
          to: result.user.email,
          subject: `Your Ectropy Demo Project is Ready: ${result.demoProjectName}`,
          html: `
            <h1>Welcome to Ectropy!</h1>
            <p>Hi ${result.user.full_name || result.user.email.split('@')[0]},</p>
            <p>Your demo project <strong>${result.demoProjectName}</strong> has been created and is ready to explore.</p>
            <p><a href="${viewerUrl}" style="background-color: #1976d2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">View Your Project</a></p>
            <p>This demo includes a fully-loaded BIM model you can explore, analyze, and share.</p>
            <p>Best regards,<br>The Ectropy Team</p>
          `,
        });
        welcomeEmailSent = emailResult.success;
      } catch (emailError) {
        logger.warn('[Console] Failed to send welcome email', {
          userId: id,
          error: emailError instanceof Error ? emailError.message : 'Unknown error',
        });
      }
    }

    // Return comprehensive result
    res.status(201).json(
      createResponse.success({
        user: {
          id: result.user.id,
          email: result.user.email,
          fullName: result.user.full_name,
          isAuthorized: result.user.is_authorized,
        },
        tenant: {
          id: result.tenantId,
          slug: result.tenantSlug,
          name: result.user.tenant?.name,
        },
        project: {
          id: result.project.id,
          name: result.project.name,
          buildingType: buildingType,
          viewerUrl: `/viewer?project=${result.project.id}`,
        },
        provisioning: {
          ...result.provisioningResults,
          welcomeEmailSent,
        },
        message: 'Demo provisioned successfully',
      })
    );
  }

  /**
   * Cleanup old demo projects
   *
   * Removes demo projects older than specified days.
   * Demo projects are identified by description containing '[DEMO]' prefix.
   * Supports dry-run mode to preview what would be deleted.
   */
  private async cleanupDemos(req: Request, res: Response): Promise<void> {
    const { olderThanDays = 30, dryRun = true } = req.body;
    const adminId = req.user?.id;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    // Find demo projects older than cutoff
    // Demo projects are identified by description starting with '[DEMO]'
    const demoProjects = await this.prisma.project.findMany({
      where: {
        description: {
          startsWith: '[DEMO]',
        },
        created_at: {
          lt: cutoffDate,
        },
      },
      include: {
        tenant: {
          select: { id: true, name: true, slug: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const projectIds = demoProjects.map((p) => p.id);

    if (dryRun) {
      logger.info('[Console] Demo cleanup dry run', {
        demoCount: demoProjects.length,
        olderThanDays,
        adminId,
      });

      res.json(
        createResponse.success({
          dryRun: true,
          demosToDelete: demoProjects.length,
          cutoffDate: cutoffDate.toISOString(),
          demos: demoProjects.map((d) => ({
            id: d.id,
            name: d.name,
            createdAt: d.created_at.toISOString(),
            tenant: d.tenant?.name,
          })),
          message: `Would delete ${demoProjects.length} demo projects. Set dryRun=false to execute.`,
        })
      );
      return;
    }

    // Actually delete demos (cascade deletes roles via onDelete: Cascade)
    const deleteResults = await this.prisma.project.deleteMany({
      where: {
        id: {
          in: projectIds,
        },
      },
    });

    logger.info('[Console] Demo cleanup completed', {
      deletedCount: deleteResults.count,
      olderThanDays,
      adminId,
    });

    res.json(
      createResponse.success({
        dryRun: false,
        deletedCount: deleteResults.count,
        cutoffDate: cutoffDate.toISOString(),
        message: `Deleted ${deleteResults.count} demo projects`,
      })
    );
  }
}

export default ConsoleRoutes;
