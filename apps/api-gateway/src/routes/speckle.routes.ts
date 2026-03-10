import {
  Router,
  Request,
  Response,
  type Router as ExpressRouter,
} from 'express';
import multer from 'multer';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { z } from 'zod';
import { SpeckleIntegrationService } from '@ectropy/speckle-integration';
import { SpeckleClient } from '@ectropy/shared/integrations';
import { IFCProcessingService } from '@ectropy/ifc-processing';
import { pool } from '../database/connection';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

// ENTERPRISE: Import centralized User type - no local interface declarations
import type { User } from '@ectropy/shared/types';

// ENTERPRISE: Input validation schemas using Zod
const ProjectIdSchema = z.string().uuid().or(z.string().min(1).max(128));
const TemplateIdsSchema = z.array(z.string().uuid()).optional();
const IFCImportOptionsSchema = z.object({
  filterByTemplate: z.enum(['true', 'false']).optional(),
  templateIds: z.string().optional(), // JSON string, parsed separately
});

/**
 * Safely parse JSON with validation
 * ENTERPRISE: Prevents JSON.parse DoS and prototype pollution
 */
function safeJSONParse<T>(
  jsonString: string,
  schema: z.ZodSchema<T>
): T | null {
  try {
    const parsed = JSON.parse(jsonString);
    const validated = schema.safeParse(parsed);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1000 * 1024 * 1024 }, // 1000MB (matches Speckle FILE_SIZE_LIMIT_MB)
});

/**
 * ENTERPRISE FIX (2026-01-14): Dependency Injection Interface for Speckle Services
 * PATTERN: Constructor injection for testability and loose coupling
 * REPLACES: Module-level singleton caching that prevented mock configuration in tests
 */
export interface SpeckleServiceDependencies {
  speckleService?: SpeckleIntegrationService;
  ifcProcessor?: IFCProcessingService;
}

/**
 * Create default service instances for production use
 * ENTERPRISE: Factory pattern for lazy initialization with proper error handling
 */
function createDefaultServices(): Required<SpeckleServiceDependencies> {
  const config = {
    serverUrl: process.env.SPECKLE_SERVER_URL || 'http://localhost:8080',
    token: process.env.SPECKLE_SERVER_TOKEN || '',
  };

  if (!config.token) {
    logger.warn(
      'SPECKLE_SERVER_TOKEN not configured - Speckle integration may fail'
    );
  }

  const speckleService = new SpeckleIntegrationService(pool, config);
  const ifcProcessor = new IFCProcessingService(pool);

  // ENTERPRISE CORE RESOLVE: Attach IFC processor for proper 3D geometry rendering
  // Without this, IFC files are uploaded as raw documents that won't render in viewer
  speckleService.setIFCProcessor(ifcProcessor);
  logger.info(
    '[SpeckleRoutes] IFC processor attached - 3D geometry uploads enabled'
  );

  return { speckleService, ifcProcessor };
}

/**
 * ENTERPRISE FIX (2026-01-14): Factory function for creating Speckle router with dependency injection
 * PATTERN: Replaces module-level Router export with factory for proper test isolation
 *
 * @param dependencies - Optional service dependencies for testing
 * @returns Express router with Speckle routes configured
 *
 * @example Production usage:
 * ```typescript
 * const speckleRouter = createSpeckleRouter();
 * app.use('/api/speckle', speckleRouter);
 * ```
 *
 * @example Test usage with mocks:
 * ```typescript
 * const mockService = { ensureStreamExists: vi.fn() };
 * const router = createSpeckleRouter({ speckleService: mockService });
 * ```
 */
export function createSpeckleRouter(
  dependencies?: SpeckleServiceDependencies
): ExpressRouter {
  // Use injected dependencies or create defaults for production
  const { speckleService, ifcProcessor } = dependencies
    ? {
        speckleService:
          dependencies.speckleService || createDefaultServices().speckleService,
        ifcProcessor:
          dependencies.ifcProcessor || createDefaultServices().ifcProcessor,
      }
    : createDefaultServices();

  const router: ExpressRouter = Router();

  /**
   * POST /api/speckle/projects/:projectId/initialize
   * Initialize a construction project with Speckle integration
   */
  router.post(
    '/projects/:projectId/initialize',
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      // ENTERPRISE: Validate projectId parameter
      const projectIdValidation = ProjectIdSchema.safeParse(
        req.params.projectId
      );
      if (!projectIdValidation.success) {
        return res.status(400).json({
          error: 'Invalid projectId format',
          details: projectIdValidation.error.issues,
        });
      }

      try {
        const projectId = projectIdValidation.data;
        const service = speckleService;

        const streamId = await service.initializeProject(projectId);

        res.json({
          success: true,
          projectId,
          streamId,
          message: 'Project initialized with Speckle stream',
        });
      } catch (error) {
        logger.error('Failed to initialize project:', error);
        res.status(500).json({
          error: 'Failed to initialize project',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * POST /api/speckle/projects/:projectId/import-ifc
   * Import IFC file to Speckle and sync to database
   */
  router.post(
    '/projects/:projectId/import-ifc',
    upload.single('file'),
    async (req: Request, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      // ENTERPRISE: Validate projectId parameter
      const projectIdValidation = ProjectIdSchema.safeParse(
        req.params.projectId
      );
      if (!projectIdValidation.success) {
        return res.status(400).json({
          error: 'Invalid projectId format',
          details: projectIdValidation.error.issues,
        });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      // Validate file type
      if (!req.file.originalname.toLowerCase().endsWith('.ifc')) {
        return res.status(400).json({ error: 'Only IFC files are supported' });
      }

      // ENTERPRISE: Validate request body options
      const bodyValidation = IFCImportOptionsSchema.safeParse(req.body);
      if (!bodyValidation.success) {
        return res.status(400).json({
          error: 'Invalid request body',
          details: bodyValidation.error.issues,
        });
      }

      // ENTERPRISE: Safe JSON parse for templateIds with schema validation
      let templateIds: string[] | undefined;
      if (bodyValidation.data.templateIds) {
        templateIds =
          safeJSONParse(bodyValidation.data.templateIds, TemplateIdsSchema) ??
          undefined;
        if (bodyValidation.data.templateIds && !templateIds) {
          return res.status(400).json({
            error: 'Invalid templateIds format',
            details: 'templateIds must be a valid JSON array of UUID strings',
          });
        }
      }

      let tempFilePath: string | null = null;

      try {
        const projectId = projectIdValidation.data;
        const service = speckleService;

        // Save buffer to temporary file (Speckle needs file path)
        const tempDir = os.tmpdir();
        tempFilePath = path.join(
          tempDir,
          `ifc-upload-${Date.now()}-${req.file.originalname}`
        );
        await fs.writeFile(tempFilePath, req.file.buffer);

        // Import to Speckle
        const result = await service.importIFCFile(projectId, tempFilePath, {
          filterByTemplate: bodyValidation.data.filterByTemplate === 'true',
          templateIds,
        });

        res.json({
          success: result.success,
          projectId,
          elementsProcessed: result.objectsProcessed, // Frontend expects elementsProcessed
          elementsImported: result.objectsSuccessful, // Frontend expects elementsImported
          objectsProcessed: result.objectsProcessed, // Keep for backward compatibility
          objectsSuccessful: result.objectsSuccessful,
          objectsFailed: result.objectsFailed,
          speckleStreamId: result.streamId, // Frontend expects speckleStreamId for URL update
          errors: result.errors,
          uploadedFile: req.file.originalname, // Include filename for display
          message: result.success
            ? `Successfully imported ${result.objectsSuccessful} objects`
            : `Import completed with ${result.objectsFailed} failures`,
        });
      } catch (error) {
        logger.error('IFC import failed:', error);
        res.status(500).json({
          error: 'IFC import failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        // Clean up temporary file
        if (tempFilePath) {
          try {
            await fs.unlink(tempFilePath);
          } catch (err) {
            logger.error('Failed to delete temporary file:', err);
          }
        }
      }
    }
  );

  /**
   * POST /api/speckle/projects/:projectId/export
   * Export construction elements to Speckle
   */
  router.post(
    '/projects/:projectId/export',
    async (req: Request, res: Response) => {
      // ENTERPRISE: user property is globally augmented via Express namespace
      const authReq = req;
      if (!authReq.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      try {
        const { projectId } = req.params;
        const { elementIds } = req.body;
        const service = speckleService;

        const result = await service.exportElementsToSpeckle(
          projectId,
          elementIds
        );

        res.json({
          success: result.success,
          projectId,
          objectsProcessed: result.objectsProcessed,
          objectsSuccessful: result.objectsSuccessful,
          objectsFailed: result.objectsFailed,
          errors: result.errors,
          message: result.success
            ? `Successfully exported ${result.objectsSuccessful} elements`
            : `Export completed with ${result.objectsFailed} failures`,
        });
      } catch (error) {
        logger.error('Export failed:', error);
        res.status(500).json({
          error: 'Export failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /api/speckle/projects/:projectId/streams
   * Get all Speckle streams for a project
   */
  router.get(
    '/projects/:projectId/streams',
    async (req: Request, res: Response) => {
      // ENTERPRISE: user property is globally augmented via Express namespace
      const authReq = req;
      if (!authReq.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      try {
        const { projectId } = req.params;
        const service = speckleService;

        const streams = await service.getProjectStreams(projectId);

        res.json({
          success: true,
          projectId,
          streams,
          count: streams.length,
        });
      } catch (error) {
        logger.error('Failed to fetch streams:', error);
        res.status(500).json({
          error: 'Failed to fetch streams',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /api/speckle/streams/:streamId
   * Get information about a specific stream
   */
  router.get('/streams/:streamId', async (req: Request, res: Response) => {
    // ENTERPRISE: user property is globally augmented via Express namespace
    const authReq = req;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { streamId } = req.params;
      const service = speckleService;

      const stream = await service.getStream(streamId);

      res.json({
        success: true,
        stream,
      });
    } catch (error) {
      logger.error('Failed to fetch stream:', error);
      res.status(500).json({
        error: 'Failed to fetch stream',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * DELETE /api/speckle/projects/:projectId/stream
   * Delete the Speckle stream for a project
   */
  router.delete(
    '/projects/:projectId/stream',
    async (req: Request, res: Response) => {
      // ENTERPRISE: user property is globally augmented via Express namespace
      const authReq = req;
      if (!authReq.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      try {
        const { projectId } = req.params;
        const service = speckleService;

        const deleted = await service.deleteProjectStream(projectId);

        res.json({
          success: true,
          projectId,
          deleted,
          message: deleted
            ? 'Stream deleted successfully'
            : 'No stream found for project',
        });
      } catch (error) {
        logger.error('Failed to delete stream:', error);
        res.status(500).json({
          error: 'Failed to delete stream',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // ============================================================================
  // LEGACY ENDPOINTS (for backward compatibility)
  // ============================================================================
  // These use SpeckleClient for user-level operations

  /**
   * POST /api/speckle/upload (LEGACY)
   * @deprecated Use /projects/:projectId/import-ifc instead
   */
  router.post(
    '/upload',
    upload.single('file'),
    async (req: Request, res: Response) => {
      // ENTERPRISE: user property is globally augmented via Express namespace
      const authReq = req;
      if (!authReq.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      try {
        const speckle = new SpeckleClient();
        const result = await speckle.uploadIFC(
          authReq.user.email,
          req.file.buffer,
          req.file.originalname
        );

        res.json({
          success: true,
          streamId: result.streamId,
          commitId: result.commitId,
          warning:
            'This endpoint is deprecated. Use /projects/:projectId/import-ifc instead.',
        });
      } catch (error) {
        logger.error('Upload failed:', error);
        res.status(500).json({ error: 'Upload failed' });
      }
    }
  );

  /**
   * GET /api/speckle/streams (LEGACY)
   * @deprecated Use /projects/:projectId/streams instead
   */
  router.get('/streams', async (req: Request, res: Response) => {
    // ENTERPRISE: user property is globally augmented via Express namespace
    const authReq = req;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const speckle = new SpeckleClient();
      const streams = await speckle.getUserStreams(authReq.user.email);

      res.json({
        streams,
        warning:
          'This endpoint is deprecated. Use /projects/:projectId/streams instead.',
      });
    } catch (error) {
      logger.error('Failed to fetch streams:', error);
      res.status(500).json({ error: 'Failed to fetch streams' });
    }
  });

  // Return configured router from factory
  return router;
}

// ENTERPRISE FIX (2026-01-14): Default export for backward compatibility
// Lazy evaluation ensures production code works while allowing test mocks to initialize
// Tests import { createSpeckleRouter } and call it with mocks
// Production imports default and gets router with real services
let defaultRouter: ExpressRouter | null = null;
export default new Proxy({} as ExpressRouter, {
  get(_target, prop) {
    if (!defaultRouter) {
      defaultRouter = createSpeckleRouter();
    }
    return (defaultRouter as any)[prop];
  },
});
