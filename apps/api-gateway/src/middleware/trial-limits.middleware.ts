/**
 * Trial Limits Enforcement Middleware
 *
 * Phase 5.3 - Trial Tenant Provisioning Flow
 * Deliverable: Tenant limits enforcement
 *
 * Enforces tenant-tier limits on:
 * - Max projects (3 trial, 25 paid_shared, unlimited enterprise)
 * - Max users (5 trial, 50 paid_shared, unlimited enterprise)
 * - Max storage (1GB trial, 10GB paid_shared, unlimited enterprise)
 *
 * Security:
 * - Tenant-scoped checks (user.tenant_id)
 * - Enforced before resource creation
 * - Clear upgrade path for users
 */

import { Request, Response, NextFunction } from 'express';
import { getPrismaClient } from '../database/prisma.js';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

/**
 * Extended Express Request with authenticated user
 */
type AuthenticatedRequest = Request & {
  user?: {
    id: string;
    email: string;
    tenant_id?: string | null;
    is_platform_admin?: boolean;
  };
};

/**
 * Tenant limits structure
 */
interface TenantLimits {
  tenantId: string;
  maxProjects: number;
  maxUsers: number;
  maxStorageGb: number;
  currentProjects: number;
  currentUsers: number;
  currentStorageGb: number;
  tier: string;
  // Phase 10: Trial expiration tracking
  trialEndsAt?: Date | null;
  trialStartedAt?: Date | null;
  daysRemaining?: number | null;
  isTrialExpired?: boolean;
}

/**
 * Check if user is platform admin (bypasses all limits)
 */
function isPlatformAdmin(req: AuthenticatedRequest): boolean {
  return req.user?.is_platform_admin === true;
}

/**
 * Get tenant limits and current usage
 *
 * @param tenantId Tenant UUID
 * @returns Tenant limits and current usage
 */
async function getTenantLimits(tenantId: string): Promise<TenantLimits | null> {
  try {
    // STAGING FIX: Use single-database Prisma client instead of DatabaseManager
    const prisma = getPrismaClient();

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        max_projects: true,
        max_users: true,
        max_storage_gb: true,
        subscription_tier: true,
        trial_ends_at: true,
        created_at: true,
        _count: {
          select: {
            projects: true,
            users: true,
          },
        },
      },
    });

    if (!tenant) {
      return null;
    }

    // Temporary: Set to 0 until FileUpload storage tracking is enabled
    const currentStorageGb = 0;

    // Phase 10: Calculate trial expiration details
    let daysRemaining: number | null = null;
    let isTrialExpired = false;

    if (tenant.trial_ends_at) {
      const now = new Date();
      const trialEnds = new Date(tenant.trial_ends_at);
      const timeDiff = trialEnds.getTime() - now.getTime();
      daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
      isTrialExpired = daysRemaining <= 0;
    }

    return {
      tenantId: tenant.id,
      maxProjects: tenant.max_projects,
      maxUsers: tenant.max_users,
      maxStorageGb: tenant.max_storage_gb,
      currentProjects: tenant._count.projects,
      currentUsers: tenant._count.users,
      currentStorageGb,
      tier: tenant.subscription_tier || 'FREE',
      trialEndsAt: tenant.trial_ends_at,
      trialStartedAt: tenant.created_at,
      daysRemaining,
      isTrialExpired,
    };
  } catch (error) {
    logger.error('[LIMITS] Error fetching tenant limits', {
      tenantId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Check Project Creation Limit
 *
 * Middleware to enforce max_projects limit before creating a new project
 *
 * Usage:
 * app.post('/api/projects', checkProjectLimit, createProjectHandler);
 */
export async function checkProjectLimit(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Skip if user not authenticated
    if (!req.user || !req.user.tenant_id) {
      return next();
    }

    // Platform admins bypass limits
    if (isPlatformAdmin(req)) {
      logger.debug('[LIMITS] Platform admin - skipping project limit check', {
        userId: req.user.id,
      });
      return next();
    }

    const limits = await getTenantLimits(req.user.tenant_id);

    if (!limits) {
      logger.error('[LIMITS] Tenant not found for project limit check', {
        userId: req.user.id,
        tenantId: req.user.tenant_id,
      });
      res.status(500).json({
        error: 'Tenant not found',
        message:
          'Your organization could not be found. Please contact support.',
      });
      return;
    }

    // Check if at or over limit
    if (limits.currentProjects >= limits.maxProjects) {
      logger.warn('[LIMITS] Project limit reached', {
        userId: req.user.id,
        tenantId: limits.tenantId,
        currentProjects: limits.currentProjects,
        maxProjects: limits.maxProjects,
        tier: limits.tier,
      });

      res.status(402).json({
        error: 'Trial limit reached',
        message: `Your ${limits.tier.toLowerCase()} plan allows ${limits.maxProjects} project${limits.maxProjects === 1 ? '' : 's'}. Upgrade to create more projects.`,
        upgrade_url: '/billing/upgrade',
        limit_type: 'projects',
        current_usage: limits.currentProjects,
        limit: limits.maxProjects,
        tier: limits.tier,
      });
      return;
    }

    logger.debug('[LIMITS] Project limit check passed', {
      userId: req.user.id,
      tenantId: limits.tenantId,
      currentProjects: limits.currentProjects,
      maxProjects: limits.maxProjects,
    });

    next();
  } catch (error) {
    logger.error('[LIMITS] Project limit check error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      userId: req.user?.id,
    });

    // Don't block requests on middleware errors
    next();
  }
}

/**
 * Check User Invitation Limit
 *
 * Middleware to enforce max_users limit before inviting a new user
 *
 * Usage:
 * app.post('/api/invitations', checkUserLimit, createInvitationHandler);
 */
export async function checkUserLimit(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Skip if user not authenticated
    if (!req.user || !req.user.tenant_id) {
      return next();
    }

    // Platform admins bypass limits
    if (isPlatformAdmin(req)) {
      logger.debug('[LIMITS] Platform admin - skipping user limit check', {
        userId: req.user.id,
      });
      return next();
    }

    const limits = await getTenantLimits(req.user.tenant_id);

    if (!limits) {
      logger.error('[LIMITS] Tenant not found for user limit check', {
        userId: req.user.id,
        tenantId: req.user.tenant_id,
      });
      res.status(500).json({
        error: 'Tenant not found',
        message:
          'Your organization could not be found. Please contact support.',
      });
      return;
    }

    // Check if at or over limit
    if (limits.currentUsers >= limits.maxUsers) {
      logger.warn('[LIMITS] User limit reached', {
        userId: req.user.id,
        tenantId: limits.tenantId,
        currentUsers: limits.currentUsers,
        maxUsers: limits.maxUsers,
        tier: limits.tier,
      });

      res.status(402).json({
        error: 'Trial limit reached',
        message: `Your ${limits.tier.toLowerCase()} plan allows ${limits.maxUsers} user${limits.maxUsers === 1 ? '' : 's'}. Upgrade to invite more team members.`,
        upgrade_url: '/billing/upgrade',
        limit_type: 'users',
        current_usage: limits.currentUsers,
        limit: limits.maxUsers,
        tier: limits.tier,
      });
      return;
    }

    logger.debug('[LIMITS] User limit check passed', {
      userId: req.user.id,
      tenantId: limits.tenantId,
      currentUsers: limits.currentUsers,
      maxUsers: limits.maxUsers,
    });

    next();
  } catch (error) {
    logger.error('[LIMITS] User limit check error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      userId: req.user?.id,
    });

    // Don't block requests on middleware errors
    next();
  }
}

/**
 * Check Storage Limit
 *
 * Middleware to enforce max_storage_gb limit before file upload
 *
 * Usage:
 * app.post('/api/projects/:id/upload', checkStorageLimit, uploadHandler);
 */
export async function checkStorageLimit(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Skip if user not authenticated
    if (!req.user || !req.user.tenant_id) {
      return next();
    }

    // Platform admins bypass limits
    if (isPlatformAdmin(req)) {
      logger.debug('[LIMITS] Platform admin - skipping storage limit check', {
        userId: req.user.id,
      });
      return next();
    }

    const limits = await getTenantLimits(req.user.tenant_id);

    if (!limits) {
      logger.error('[LIMITS] Tenant not found for storage limit check', {
        userId: req.user.id,
        tenantId: req.user.tenant_id,
      });
      res.status(500).json({
        error: 'Tenant not found',
        message:
          'Your organization could not be found. Please contact support.',
      });
      return;
    }

    // Phase 10.2: Get upload size from request (populated by multer middleware)
    let uploadSizeBytes = 0;

    // Check for single file upload (req.file)
    if ((req as any).file?.size) {
      uploadSizeBytes = (req as any).file.size;
    }
    // Check for multiple file uploads (req.files as array)
    else if (Array.isArray((req as any).files)) {
      uploadSizeBytes = (req as any).files.reduce(
        (total: number, file: any) => total + (file.size || 0),
        0
      );
    }
    // Check for multiple file uploads (req.files as object)
    else if ((req as any).files && typeof (req as any).files === 'object') {
      uploadSizeBytes = (Object.values((req as any).files) as any[]).reduce(
        (total: number, fileArray: any) => {
          if (Array.isArray(fileArray)) {
            return (
              total +
              fileArray.reduce(
                (sum: number, file: any) => sum + (file.size || 0),
                0
              )
            );
          }
          return total + (fileArray.size || 0);
        },
        0
      );
    }

    // Convert bytes to GB
    const uploadSizeGb = uploadSizeBytes / (1024 * 1024 * 1024);

    // Check if upload would exceed limit
    const newTotalStorageGb = limits.currentStorageGb + uploadSizeGb;
    if (newTotalStorageGb > limits.maxStorageGb) {
      logger.warn('[LIMITS] Storage limit would be exceeded', {
        userId: req.user.id,
        tenantId: limits.tenantId,
        currentStorageGb: limits.currentStorageGb,
        uploadSizeGb,
        maxStorageGb: limits.maxStorageGb,
        tier: limits.tier,
      });

      res.status(402).json({
        error: 'Trial limit reached',
        message: `Your ${limits.tier.toLowerCase()} plan allows ${limits.maxStorageGb}GB storage. Upgrade to increase storage capacity.`,
        upgrade_url: '/billing/upgrade',
        limit_type: 'storage',
        current_usage: limits.currentStorageGb,
        limit: limits.maxStorageGb,
        tier: limits.tier,
      });
      return;
    }

    logger.debug('[LIMITS] Storage limit check passed', {
      userId: req.user.id,
      tenantId: limits.tenantId,
      currentStorageGb: limits.currentStorageGb,
      maxStorageGb: limits.maxStorageGb,
    });

    next();
  } catch (error) {
    logger.error('[LIMITS] Storage limit check error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      userId: req.user?.id,
    });

    // Don't block requests on middleware errors
    next();
  }
}

/**
 * Get Tenant Usage Summary
 *
 * Returns current usage and limits for a tenant
 * Useful for dashboard display of remaining quota
 *
 * @param tenantId Tenant UUID
 * @returns Usage summary with limits and current usage
 */
export async function getTenantUsageSummary(
  tenantId: string
): Promise<TenantLimits | null> {
  return getTenantLimits(tenantId);
}

export default {
  checkProjectLimit,
  checkUserLimit,
  checkStorageLimit,
  getTenantUsageSummary,
};
