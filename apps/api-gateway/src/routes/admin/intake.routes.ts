/**
 * @fileoverview Admin intake routes — project provisioning endpoints.
 *
 * POST /api/admin/provision-project       — PILOT bundle provisioning
 * POST /api/admin/provision-demo-user     — DEMO bundle (extends existing)
 * POST /api/admin/projects/:id/refresh-seppa-context — Stage 7 re-run
 *
 * Mounted at /api/admin in main.ts.
 *
 * @see apps/api-gateway/src/intake/intake-pipeline.ts
 * @see INTAKE-ARCHITECTURE-2026-03-27.md
 */

import express, { type Request, type Response, type Router } from 'express';
import { logger } from '../../../../../libs/shared/utils/src/logger.js';
import {
  asyncHandler,
  createResponse,
} from '../../../../../libs/shared/utils/src/simple-errors.js';
import { getPrismaClient } from '../../database/prisma.js';
import { apiKeyMiddleware } from '../../middleware/api-key.middleware.js';
import { IntakePipeline, refreshSeppaContext } from '../../intake/intake-pipeline.js';

// Import Express type augmentation for req.user
import '../../../../../libs/shared/types/src/express.js';

export function createIntakeRoutes(): Router {
  const router = express.Router();

  /**
   * POST /api/admin/provision-project
   *
   * Provisions a new project from a bundle descriptor in DO Spaces.
   * Runs the full IntakePipeline (stages 1-3 + 7 for PILOT bundles).
   *
   * Auth: API key (scope: provision_project) OR platform admin session.
   *
   * Body: { bundle_id: string, bundle_version: string, slug?: string }
   * Response 201: { success, project_id, tenant_id, bundle_type, stages, duration_ms }
   * Response 400: { success: false, error: string }
   * Response 500: { success: false, error: string, failed_stage: string }
   */
  router.post(
    '/provision-project',
    apiKeyMiddleware.dualAuth(['provision_project', '*']),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      // Platform admin guard for session-based auth
      if (!req.apiKey && !req.user?.is_platform_admin) {
        res.status(403).json(createResponse.error('Platform admin access required'));
        return;
      }

      const { bundle_id, bundle_version, slug } = req.body;

      if (!bundle_id || !bundle_version) {
        res.status(400).json(
          createResponse.error('Missing required fields: bundle_id, bundle_version'),
        );
        return;
      }

      logger.info(`[intake] Provisioning project from bundle=${bundle_id}@${bundle_version}`);

      const prisma = getPrismaClient();
      const pipeline = new IntakePipeline(prisma, { verbose: true });
      const result = await pipeline.run(bundle_id, bundle_version);

      if (!result.success) {
        const status = result.failedStageId ? 500 : 400;
        res.status(status).json({
          success: false,
          error: result.error ?? 'Pipeline failed',
          failed_stage: result.failedStageId ?? null,
          bundle_id: result.bundleId,
          bundle_version: result.bundleVersion,
          stages: result.stages,
          duration_ms: result.totalDurationMs,
        });
        return;
      }

      res.status(201).json({
        success: true,
        project_id: result.projectId,
        tenant_id: result.tenantId,
        bundle_id: result.bundleId,
        bundle_version: result.bundleVersion,
        bundle_type: result.bundleType,
        stages: result.stages,
        duration_ms: result.totalDurationMs,
        url: slug ? `https://${slug}.job.site` : null,
      });
    }),
  );

  /**
   * POST /api/admin/projects/:id/refresh-seppa-context
   *
   * Manually re-runs Stage 7 against live project data.
   * Use before demo sessions to ensure SEPPA context is current.
   *
   * Auth: API key (scope: provision_project) OR platform admin session.
   *
   * Body: {} (empty)
   * Response 200: { success, project_id, idempotency_key }
   * Response 404: { success: false, error: "Project not found" }
   * Response 500: { success: false, error: string }
   */
  router.post(
    '/projects/:id/refresh-seppa-context',
    apiKeyMiddleware.dualAuth(['provision_project', '*']),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      if (!req.apiKey && !req.user?.is_platform_admin) {
        res.status(403).json(createResponse.error('Platform admin access required'));
        return;
      }

      const projectId = req.params.id;

      if (!projectId || !/^[0-9a-f-]{36}$/i.test(projectId)) {
        res.status(400).json(createResponse.error('Invalid project ID'));
        return;
      }

      logger.info(`[intake] Refreshing SEPPA context for project=${projectId}`);

      const prisma = getPrismaClient();
      const result = await refreshSeppaContext(projectId, prisma);

      if (!result.success) {
        const status = result.error?.includes('not found') ? 404 : 500;
        res.status(status).json({
          success: false,
          error: result.error,
          project_id: projectId,
        });
        return;
      }

      res.status(200).json({
        success: true,
        project_id: projectId,
        idempotency_key: result.idempotencyKey,
      });
    }),
  );

  return router;
}
