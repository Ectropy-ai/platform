/**
 * Tenant Usage Routes (User-Facing)
 * Phase 8.3 - Integrate Usage Widget into Dashboard
 *
 * Provides tenant usage information for the current authenticated user's tenant.
 * Unlike admin/tenant.routes.ts, these endpoints are accessible to all authenticated users.
 */

import { Router, Request, Response } from 'express';
import { logger } from '../../../../libs/shared/utils/src/logger.js';
import {
  asyncHandler,
  createResponse,
} from '../../../../libs/shared/utils/src/simple-errors.js';
import { getTenantUsageSummary } from '../middleware/trial-limits.middleware.js';
import { ensureAuthenticated } from '../auth/passport.config.js';
import { getPrismaClient } from '../database/prisma.js';

// Import Express type augmentation
import '../../../../libs/shared/types/src/express.js';

// =============================================================================
// TYPES
// =============================================================================

type AuthenticatedRequest = Request & {
  user?: {
    id: string;
    email: string;
    tenant_id?: string | null;
    is_platform_admin?: boolean;
  };
};

// =============================================================================
// TENANT USAGE ROUTES
// =============================================================================

const router: Router = Router();

/**
 * GET /api/tenant/usage - Get current user's tenant usage
 *
 * Returns usage and limits for the authenticated user's tenant
 */
router.get(
  '/usage',
  ensureAuthenticated,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user;

    if (!user) {
      return res
        .status(401)
        .json(createResponse.error('Authentication required', 'UNAUTHORIZED'));
    }

    if (!user.tenant_id) {
      if (user.is_platform_admin) {
        // Platform admins see aggregate usage across all tenants
        const prisma = getPrismaClient();
        const [tenantCount, projectCount, userCount] = await Promise.all([
          prisma.tenant.count(),
          prisma.project.count(),
          prisma.user.count(),
        ]);

        logger.debug('[TENANT_USAGE] Platform admin aggregate usage', {
          userId: user.id,
          tenantCount,
          projectCount,
          userCount,
        });

        return res.json(
          createResponse.success({
            tenantId: 'platform',
            tier: 'PLATFORM_ADMIN',
            maxProjects: 999999,
            currentProjects: projectCount,
            maxUsers: 999999,
            currentUsers: userCount,
            maxStorageGb: 999999,
            currentStorageGb: 0,
            tenantCount,
          })
        );
      }

      logger.warn('[TENANT_USAGE] User has no tenant_id', {
        userId: user.id,
      });
      return res
        .status(404)
        .json(
          createResponse.error(
            'User is not associated with a tenant',
            'NO_TENANT'
          )
        );
    }

    // Get usage summary from trial limits middleware
    const usage = await getTenantUsageSummary(user.tenant_id);

    if (!usage) {
      logger.error('[TENANT_USAGE] Tenant not found', {
        userId: user.id,
        tenantId: user.tenant_id,
      });
      return res
        .status(404)
        .json(createResponse.error('Tenant not found', 'TENANT_NOT_FOUND'));
    }

    logger.debug('[TENANT_USAGE] Retrieved usage summary', {
      userId: user.id,
      tenantId: user.tenant_id,
      currentProjects: usage.currentProjects,
      maxProjects: usage.maxProjects,
    });

    res.json(createResponse.success(usage));
  })
);

export default router;
