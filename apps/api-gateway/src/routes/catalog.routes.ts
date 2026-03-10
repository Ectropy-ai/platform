/**
 * Model Catalog API Routes
 * Phase 4 - Model Catalog API & Portfolio Foundation
 *
 * Database: Platform Prisma schema (model_catalog table in ectropy_platform)
 * Client: @prisma/client-platform via @ectropy/database getPlatformClient()
 *
 * Five Why: model_catalog is seeded in the platform database (seed-platform.cjs),
 * NOT the main database. Previous implementation used getPrismaClient() (main DB)
 * which caused 500 errors because the table was empty/missing in main.
 *
 * Endpoints:
 * - GET /api/catalog/models - List all active building types from model_catalog table
 */

import { Router, Request, Response } from 'express';
import type { Router as ExpressRouter } from 'express';
import { getPlatformClient } from '@ectropy/database/clients/platform-client';

const router: ExpressRouter = Router();

/**
 * GET /api/catalog/models
 * Returns all active building types from the model catalog
 *
 * Authentication: None (public endpoint)
 * Database: Platform Prisma schema (model_catalog table)
 *
 * Response:
 * {
 *   success: true,
 *   data: [
 *     {
 *       id: "uuid",
 *       buildingType: "residential-single-family",
 *       displayName: "Single Family Home",
 *       description: "2-story residential house",
 *       iconUrl: null,
 *       ifcFilePath: "test-data/AC20-FZK-Haus.ifc",
 *       speckleStreamId: null,
 *       speckleObjectId: null,
 *       metadata: { floors: 2, bedrooms: 4 },
 *       elementCount: null,
 *       estimatedBudgetUsd: 850000,
 *       isActive: true
 *     }
 *   ]
 * }
 */
router.get('/models', async (req: Request, res: Response) => {
  try {
    const platformDb = getPlatformClient();

    // Query all active building types from platform database model_catalog table
    const models = await platformDb.modelCatalog.findMany({
      where: { isActive: true },
      orderBy: { buildingType: 'asc' }
    });

    res.json({
      success: true,
      data: models
    });
  } catch (error) {
    console.error('Error fetching model catalog:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch model catalog',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
