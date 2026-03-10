/**
 * Portfolio API Routes
 * Phase 4 - Model Catalog API & Portfolio Foundation
 * Phase 5.3 - Trial Limits Enforcement
 *
 * STAGING FIX: Bridged to single-database Prisma client (getPrismaClient)
 * instead of undeployed multi-database DatabaseManager architecture.
 * Extracts userId/tenantId from authenticated session (req.user) instead of
 * hardcoded test values.
 *
 * Endpoints:
 * - POST /api/portfolio/copy-demo - Copy building from catalog to user's portfolio
 * - GET /api/portfolio/my-projects - Get user's portfolio projects
 */

import { Router, Request, Response } from 'express';
import { getPrismaClient } from '../database/prisma.js';
import { checkProjectLimit } from '../middleware/trial-limits.middleware.js';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

const router: Router = Router();

/**
 * Extract authenticated user from request
 * Returns userId and tenantId from Passport session
 */
function getAuthenticatedUser(
  req: Request
): { userId: string; tenantId: string } | null {
  const user = req.user as
    | { id?: string; tenant_id?: string | null }
    | undefined;
  if (!user?.id || !user?.tenant_id) {
    return null;
  }
  return { userId: user.id, tenantId: user.tenant_id };
}

/**
 * POST /api/portfolio/copy-demo
 * Copy a building from the catalog to the user's portfolio
 *
 * Authentication: Required (JWT/Passport session)
 * Limits: Enforces max_projects limit (Phase 5.3)
 * Database: Main Prisma schema (model_catalog + projects + user_portfolios)
 */
router.post(
  '/copy-demo',
  checkProjectLimit,
  async (req: Request, res: Response) => {
    try {
      const { building_type, project_name, description } = req.body;

      if (!building_type) {
        return res.status(400).json({
          success: false,
          error: 'building_type is required',
        });
      }

      // Extract user from authenticated session
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'You must be logged in with a tenant to copy demo projects',
        });
      }

      const { userId, tenantId } = authUser;
      const prisma = getPrismaClient();

      // Fetch catalog model
      const catalogModel = await prisma.modelCatalog.findUnique({
        where: { building_type },
      });

      // Create new project in tenant scope
      const project = await prisma.project.create({
        data: {
          tenant_id: tenantId,
          owner_id: userId,
          name: project_name || catalogModel?.display_name || building_type,
          description: description || catalogModel?.description || undefined,
          total_budget: catalogModel?.estimated_budget_usd || undefined,
          status: 'planning',
        },
      });

      // Create UserPortfolio entry
      await prisma.userPortfolio.create({
        data: {
          tenant_id: tenantId,
          user_id: userId,
          project_id: project.id,
          portfolio_type: 'demo',
          is_pinned: false,
        },
      });

      // Create ProjectRole entry (user is owner)
      await prisma.projectRole.create({
        data: {
          user_id: userId,
          project_id: project.id,
          role: 'owner',
          permissions: ['admin', 'read', 'write', 'delete', 'manage_members'],
          voting_power: 100,
        },
      });

      res.status(201).json({
        success: true,
        project: {
          id: project.id,
          name: project.name,
          catalogBuildingType: building_type,
          speckleStreamId: null,
          status: project.status,
          estimatedBudget: project.total_budget,
        },
        viewerUrl: `/viewer?project=${project.id}`,
        message: 'Demo project created successfully',
      });
    } catch (error) {
      logger.error('Error copying demo project:', error);

      // Check for duplicate portfolio entry
      if (
        error instanceof Error &&
        error.message.includes('Unique constraint')
      ) {
        return res.status(409).json({
          success: false,
          error: 'Duplicate portfolio entry',
          message: error.message,
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to copy demo project',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * GET /api/portfolio/my-projects
 * Get all projects in the user's portfolio
 *
 * Authentication: Required (JWT/Passport session)
 * Database: Main Prisma schema (user_portfolios + projects)
 */
router.get('/my-projects', async (req: Request, res: Response) => {
  try {
    // Extract user from authenticated session
    const authUser = getAuthenticatedUser(req);
    if (!authUser) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'You must be logged in to view your portfolio',
      });
    }

    const { userId } = authUser;
    const prisma = getPrismaClient();

    // Query user's portfolio with project details
    const portfolios = await prisma.userPortfolio.findMany({
      where: { user_id: userId },
      include: {
        project: {
          include: {
            speckle_streams: true,
          },
        },
      },
      orderBy: { added_at: 'desc' },
    });

    // Transform to response format
    const projects = portfolios.map((portfolio) => ({
      projectId: portfolio.project.id,
      name: portfolio.project.name,
      catalogBuildingType: null,
      portfolioType: portfolio.portfolio_type,
      addedAt: portfolio.added_at.toISOString(),
      isPinned: portfolio.is_pinned,
      speckleStreamId: portfolio.project.speckle_streams[0]?.stream_id || null,
      status: portfolio.project.status,
      estimatedBudget: portfolio.project.total_budget,
    }));

    res.json({
      success: true,
      data: projects,
    });
  } catch (error) {
    logger.error('Error fetching portfolio projects:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch portfolio projects',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
