/**
 * Trial Expiration Middleware
 *
 * Phase 5.2 - Trial Tenant Provisioning Flow
 * Deliverable: Trial expiration check middleware
 *
 * Checks if trial tenant has expired and returns 402 Payment Required
 * Allows upgrade to paid tier via billing portal
 *
 * Security:
 * - Tenant-scoped check (user.tenant_id)
 * - Only enforced for trial tier tenants
 * - Clear upgrade path for users
 */

import { Request, Response, NextFunction } from 'express';
import { DatabaseManager } from '@ectropy/database';
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
 * Trial Expiration Middleware
 *
 * Logic:
 * 1. Skip if user not authenticated
 * 2. Skip if platform admin (cross-tenant access)
 * 3. Query tenant to check trial status
 * 4. If trial expired: Return 402 Payment Required
 * 5. Otherwise: Continue request
 *
 * @param req Express request with authenticated user
 * @param res Express response
 * @param next Express next function
 */
export async function checkTrialExpiration(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Skip if user not authenticated
    if (!req.user) {
      return next();
    }

    // Platform admins bypass trial checks (cross-tenant access)
    if (req.user.is_platform_admin) {
      logger.debug('[TRIAL] Platform admin - skipping trial check', {
        userId: req.user.id,
      });
      return next();
    }

    // Skip if user has no tenant (shouldn't happen, but defensive)
    if (!req.user.tenant_id) {
      logger.warn('[TRIAL] User has no tenant_id', {
        userId: req.user.id,
        email: req.user.email,
      });
      return next();
    }

    // Query tenant to check trial status - Get tenant-scoped database client from Phase 3 DatabaseManager
    const sharedDb = await DatabaseManager.getTenantDatabase(
      req.user.tenant_id
    );

    const tenant = await sharedDb.tenant.findUnique({
      where: { id: req.user.tenant_id },
      select: {
        id: true,
        slug: true,
        status: true,
        subscriptionTier: true,
        trialEndsAt: true,
      },
    });

    if (!tenant) {
      logger.error('[TRIAL] Tenant not found', {
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

    // Check if tenant is trial tier
    const isTrial =
      tenant.subscriptionTier === 'FREE' && tenant.status === 'TRIAL';

    if (!isTrial) {
      // Not a trial tenant, skip expiration check
      logger.debug('[TRIAL] Not a trial tenant - skipping expiration check', {
        userId: req.user.id,
        tenantId: tenant.id,
        tier: tenant.subscriptionTier,
        status: tenant.status,
      });
      return next();
    }

    // Phase 10: Check trial expiration (trialEndsAt field is now available in schema.shared.prisma)
    if (tenant.trialEndsAt && tenant.trialEndsAt < new Date()) {
      logger.warn('[TRIAL] Trial expired', {
        userId: req.user.id,
        tenantId: tenant.id,
        expiresAt: tenant.trialEndsAt.toISOString(),
      });

      res.status(402).json({
        error: 'Trial expired',
        message:
          'Your free trial has expired. Upgrade to continue using Ectropy.',
        upgrade_url: '/billing/upgrade',
        expires_at: tenant.trialEndsAt.toISOString(),
        tenant_slug: tenant.slug,
      });
      return;
    }

    logger.debug('[TRIAL] Trial active', {
      userId: req.user.id,
      tenantId: tenant.id,
      tier: tenant.subscriptionTier,
    });

    // Trial is active, continue request
    next();
  } catch (error) {
    logger.error('[TRIAL] Trial expiration check error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      userId: req.user?.id,
    });

    // Don't block requests on middleware errors
    next();
  }
}

/**
 * Trial Expiration Middleware Factory
 *
 * Returns middleware function that can be used in Express routes
 *
 * Usage:
 * import { trialExpirationMiddleware } from './middleware/trial-expiration.middleware';
 * app.use('/api', trialExpirationMiddleware);
 *
 * Or for specific routes:
 * app.post('/api/projects', trialExpirationMiddleware, createProject);
 */
export const trialExpirationMiddleware = checkTrialExpiration;

export default trialExpirationMiddleware;
