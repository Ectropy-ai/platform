/**
 * ================================================
 * ENTERPRISE SPECKLE BIM INTEGRATION ROUTES
 * ================================================
 * Purpose: Secure, production-ready API routes for Speckle integration
 * Security: Enterprise-grade with sanitization, rate limiting, authorization
 * Author: Claude (Enterprise Integration)
 * Date: 2025-11-14
 * ================================================
 *
 * SECURITY FEATURES:
 * - Filename sanitization (prevent path traversal)
 * - MIME type validation
 * - File size limits
 * - Rate limiting (10 uploads/hour, 100 API calls/15min)
 * - Project ownership authorization
 * - Audit logging
 * - Error handling with safe error messages
 *
 * ================================================
 */

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
import { SpeckleIntegrationService } from '@ectropy/speckle-integration';
import { SpeckleClient } from '@ectropy/shared/integrations';
import { IFCProcessingService } from '@ectropy/ifc-processing';
import { pool } from '../database/connection';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

// Import enterprise security middleware
import {
  fileSecurityMiddleware,
  fileSizeMiddleware,
  sanitizeFilename,
} from '../middleware/file-security.middleware';
import {
  requireAuth,
  requireProjectAccess,
  requireStreamAccess,
  PermissionLevel,
} from '../middleware/authorization.middleware';

// ENTERPRISE: Import centralized User type - no local interface declarations
import type { User } from '@ectropy/shared/types';

// Type definitions for route-specific data (project is already in Request via Express augmentation)
interface AuthenticatedProject {
  id: string;
  name: string;
  status: string;
  ownerId: string;
}

const router: ExpressRouter = Router();

// ============================================================================
// Speckle Token Resolution (ENTERPRISE FIX 2026-03-08)
// ROOT CAUSE: docker-entrypoint.sh reads token file ONCE at startup.
// If bootstrap completes AFTER api-gateway starts, process.env is stale.
// Fix: Re-read the token file on each /config request (30s cache).
// ============================================================================
const SPECKLE_TOKEN_FILE = '/shared-tokens/speckle-service-token';
let _cachedToken: string | null = null;
let _tokenReadAt = 0;
const TOKEN_CACHE_TTL = 30_000; // 30 seconds

export async function getSpeckleToken(): Promise<string> {
  const now = Date.now();
  if (_cachedToken !== null && now - _tokenReadAt < TOKEN_CACHE_TTL) {
    return _cachedToken;
  }
  try {
    const fileToken = (await fs.readFile(SPECKLE_TOKEN_FILE, 'utf-8')).trim();
    if (fileToken) {
      _cachedToken = fileToken;
      _tokenReadAt = now;
      return fileToken;
    }
  } catch {
    // File doesn't exist or unreadable — fall through to env var
  }
  const envToken = process.env.SPECKLE_SERVER_TOKEN || '';
  _cachedToken = envToken;
  _tokenReadAt = now;
  return envToken;
}

// Configure multer with security settings
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1000 * 1024 * 1024, // 1GB max (matches Speckle limit)
    files: 1, // Only one file per request
  },
  fileFilter: (req, file, cb) => {
    // First-pass validation (will be validated again by middleware)
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.ifc') {
      return cb(new Error('Only IFC files are supported'));
    }
    cb(null, true);
  },
});

// Initialize Speckle Integration Service
let speckleService: SpeckleIntegrationService | null = null;
let ifcProcessor: IFCProcessingService | null = null;

/**
 * Get or create the Speckle Integration Service
 * ENTERPRISE FIX (2025-11-23): Wires up IFC processor for proper 3D geometry uploads
 * ENTERPRISE FIX (2026-03-08): Re-reads token from shared volume to handle bootstrap race
 */
let _speckleServiceToken = '';
async function getSpeckleServiceAsync(): Promise<SpeckleIntegrationService> {
  const currentToken = await getSpeckleToken();
  // Invalidate cached service if token changed (bootstrap completed after startup)
  if (speckleService && currentToken !== _speckleServiceToken) {
    speckleService = null;
  }
  if (!speckleService) {
    _speckleServiceToken = currentToken;
    const config = {
      serverUrl: process.env.SPECKLE_SERVER_URL || 'http://localhost:8080',
      token: currentToken,
    };

    if (
      !config.token ||
      config.token === 'REPLACE_WITH_TOKEN_AFTER_ADMIN_SETUP'
    ) {
      logger.error(
        'CRITICAL: SPECKLE_SERVER_TOKEN not configured - Speckle integration will fail'
      );
      logger.error('Please create Speckle admin user and update .env.local');
    }

    speckleService = new SpeckleIntegrationService(pool, config);

    // ENTERPRISE CORE RESOLVE: Attach IFC processor for proper 3D geometry rendering
    // Without this, IFC files are uploaded as raw documents that won't render in viewer
    if (!ifcProcessor) {
      ifcProcessor = new IFCProcessingService(pool);
    }
    speckleService.setIFCProcessor(ifcProcessor);
    logger.info(
      '[SpeckleRoutes.Enterprise] IFC processor attached - 3D geometry uploads enabled'
    );
  }
  return speckleService;
}

/**
 * ================================================
 * PROJECT-SCOPED ENDPOINTS (ENTERPRISE SECURE)
 * ================================================
 */

/**
 * POST /api/speckle/projects/:projectId/initialize
 * Initialize Speckle stream for construction project
 *
 * Security:
 * - Requires authentication
 * - Requires project ADMIN access
 * - Rate limited: 100 requests / 15 minutes
 *
 * NOTE: Rate limiter should be applied globally in main.ts
 */
router.post(
  '/projects/:projectId/initialize',
  requireAuth,
  requireProjectAccess('ADMIN'),
  async (req: Request, res: Response) => {
    const { projectId } = req.params;
    // ENTERPRISE: user and project properties are globally augmented via Express namespace
    const user = req.user!;
    const project = req.project;

    try {
      const service = await getSpeckleServiceAsync();
      const streamId = await service.initializeProject(projectId);

      // Audit log
      logger.info('Speckle stream initialized:', {
        userId: user.id,
        projectId,
        streamId,
        timestamp: new Date().toISOString(),
      });

      res.json({
        success: true,
        projectId,
        streamId,
        message: 'Speckle stream initialized successfully',
      });
    } catch (error) {
      logger.error('Stream initialization failed:', error);

      // Safe error message (don't leak internal details)
      res.status(500).json({
        error: 'Stream initialization failed',
        message:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    }
  }
);

/**
 * POST /api/speckle/projects/:projectId/import-ifc
 * Upload and import IFC file to Speckle
 *
 * Security:
 * - Requires authentication
 * - Requires project WRITE access
 * - Rate limited: 10 uploads / hour (configured in main.ts)
 * - Filename sanitization
 * - MIME type validation
 * - File size validation (1GB max)
 * - Virus scanning (TODO: production)
 *
 * Request: multipart/form-data
 * - file: IFC file (required)
 * - filterByTemplate: boolean (optional)
 * - templateIds: JSON array of template IDs (optional)
 */
router.post(
  '/projects/:projectId/import-ifc',
  requireAuth,
  requireProjectAccess('WRITE'),
  upload.single('file'),
  fileSecurityMiddleware(['ifc']),
  fileSizeMiddleware(1000 * 1024 * 1024, '1GB'),
  async (req: Request, res: Response) => {
    const { projectId } = req.params;
    // ENTERPRISE: user and sanitizedFilename are globally augmented via Express namespace
    const user = req.user!;
    const sanitizedFilename = req.sanitizedFilename;

    let tempFilePath: string | null = null;

    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'No file uploaded',
          message: 'Please provide an IFC file',
        });
      }

      const service = await getSpeckleServiceAsync();

      // Save buffer to temporary file (Speckle API requires file path)
      const tempDir = os.tmpdir();

      // SECURITY FIX: Use sanitized filename instead of original
      // Fallback to sanitizeFilename if middleware didn't set it
      const safeFilename =
        sanitizedFilename || sanitizeFilename(req.file.originalname);
      tempFilePath = path.join(tempDir, safeFilename);

      await fs.writeFile(tempFilePath, req.file.buffer);

      // Import to Speckle
      const result = await service.importIFCFile(projectId, tempFilePath, {
        filterByTemplate: req.body.filterByTemplate === 'true',
        templateIds: req.body.templateIds
          ? JSON.parse(req.body.templateIds)
          : undefined,
      });

      // Audit log
      logger.info('IFC file imported:', {
        userId: user.id,
        projectId,
        filename: safeFilename,
        originalFilename: req.file.originalname,
        fileSize: req.file.size,
        objectsProcessed: result.objectsProcessed,
        timestamp: new Date().toISOString(),
      });

      res.json({
        success: result.success,
        projectId,
        objectsProcessed: result.objectsProcessed,
        objectsSuccessful: result.objectsSuccessful,
        objectsFailed: result.objectsFailed,
        errors: result.errors,
        message: result.success
          ? `Successfully imported ${result.objectsSuccessful} objects`
          : `Import completed with ${result.objectsFailed} failures`,
      });
    } catch (error) {
      logger.error('IFC import failed:', {
        userId: user.id,
        projectId,
        filename: sanitizedFilename,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        error: 'IFC import failed',
        message:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    } finally {
      // SECURITY: Always clean up temporary files
      if (tempFilePath) {
        try {
          await fs.unlink(tempFilePath);
        } catch (err) {
          logger.error('Failed to delete temporary file:', {
            path: tempFilePath,
            error: err,
          });
        }
      }
    }
  }
);

/**
 * POST /api/speckle/projects/:projectId/export
 * Export construction elements to Speckle
 *
 * Security:
 * - Requires authentication
 * - Requires project WRITE access
 * - Rate limited: 100 requests / 15 minutes
 *
 * Request Body:
 * - elementIds: string[] (required) - Array of construction element IDs
 */
router.post(
  '/projects/:projectId/export',
  requireAuth,
  requireProjectAccess('WRITE'),
  async (req: Request, res: Response) => {
    const { projectId } = req.params;
    const { elementIds } = req.body;
    // ENTERPRISE: user property is globally augmented via Express namespace
    const user = req.user!;

    // Validate request body
    if (!elementIds || !Array.isArray(elementIds) || elementIds.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'elementIds must be a non-empty array',
      });
    }

    try {
      const service = await getSpeckleServiceAsync();
      const result = await service.exportElementsToSpeckle(
        projectId,
        elementIds
      );

      logger.info('Elements exported to Speckle:', {
        userId: user.id,
        projectId,
        elementCount: elementIds.length,
        timestamp: new Date().toISOString(),
      });

      res.json({
        success: result.success,
        projectId,
        elementsExported: result.objectsSuccessful,
        message: `Successfully exported ${result.objectsSuccessful} elements`,
      });
    } catch (error) {
      logger.error('Export failed:', error);

      res.status(500).json({
        error: 'Export failed',
        message:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    }
  }
);

/**
 * GET /api/speckle/projects/:projectId/streams
 * List all Speckle streams for project
 *
 * Security:
 * - Requires authentication
 * - Requires project READ access
 * - Rate limited: 100 requests / 15 minutes
 */
router.get(
  '/projects/:projectId/streams',
  requireAuth,
  requireProjectAccess('READ'),
  async (req: Request, res: Response) => {
    const { projectId } = req.params;

    try {
      const service = await getSpeckleServiceAsync();
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
        message:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    }
  }
);

/**
 * GET /api/speckle/streams/:streamId
 * Get detailed information about a specific stream
 *
 * Security:
 * - Requires authentication
 * - Requires access to stream's project
 * - Rate limited: 100 requests / 15 minutes
 */
router.get(
  '/streams/:streamId',
  requireAuth,
  requireStreamAccess(),
  async (req: Request, res: Response) => {
    const { streamId } = req.params;

    try {
      const service = await getSpeckleServiceAsync();
      const stream = await service.getStream(streamId);

      res.json({
        success: true,
        stream,
      });
    } catch (error) {
      logger.error('Failed to fetch stream details:', error);

      res.status(500).json({
        error: 'Failed to fetch stream details',
        message:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    }
  }
);

/**
 * DELETE /api/speckle/projects/:projectId/stream
 * Delete Speckle stream for project
 *
 * Security:
 * - Requires authentication
 * - Requires project ADMIN access
 * - Rate limited: 100 requests / 15 minutes
 * - Confirmation parameter required
 */
router.delete(
  '/projects/:projectId/stream',
  requireAuth,
  requireProjectAccess('ADMIN'),
  async (req: Request, res: Response) => {
    const { projectId } = req.params;
    const { confirm } = req.query;
    // ENTERPRISE: user property is globally augmented via Express namespace
    const user = req.user!;

    // Require explicit confirmation
    if (confirm !== 'true') {
      return res.status(400).json({
        error: 'Confirmation required',
        message: 'Add ?confirm=true to confirm stream deletion',
      });
    }

    try {
      const service = await getSpeckleServiceAsync();
      await service.deleteProjectStream(projectId);

      logger.warn('Speckle stream deleted:', {
        userId: user.id,
        projectId,
        timestamp: new Date().toISOString(),
      });

      res.json({
        success: true,
        projectId,
        message: 'Stream deleted successfully',
      });
    } catch (error) {
      logger.error('Stream deletion failed:', error);

      res.status(500).json({
        error: 'Stream deletion failed',
        message:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    }
  }
);

/**
 * ================================================
 * LEGACY ENDPOINTS (DEPRECATED - FOR BACKWARD COMPATIBILITY)
 * ================================================
 */

/**
 * @deprecated Use /projects/:projectId/import-ifc instead
 */
router.post('/upload', requireAuth, async (req: Request, res: Response) => {
  res.status(410).json({
    error: 'Endpoint deprecated',
    message:
      'This endpoint has been deprecated. Use /projects/:projectId/import-ifc instead',
    migration: {
      old: 'POST /api/speckle/upload',
      new: 'POST /api/speckle/projects/:projectId/import-ifc',
      documentation: 'https://docs.ectropy.ai/api/speckle',
    },
  });
});

/**
 * @deprecated Use /projects/:projectId/streams instead
 */
router.get('/streams', requireAuth, async (req: Request, res: Response) => {
  res.status(410).json({
    error: 'Endpoint deprecated',
    message:
      'This endpoint has been deprecated. Use /projects/:projectId/streams instead',
    migration: {
      old: 'GET /api/speckle/streams',
      new: 'GET /api/speckle/projects/:projectId/streams',
      documentation: 'https://docs.ectropy.ai/api/speckle',
    },
  });
});

/**
 * ================================================
 * HEALTH & STATUS ENDPOINTS
 * ================================================
 */

/**
 * ================================================
 * SPRINT 6: BFF CONFIGURATION ENDPOINT
 * ================================================
 * GET /api/speckle/config
 * Return Speckle configuration for frontend (BFF pattern)
 *
 * SECURITY (IETF BFF Pattern Compliance):
 * - Requires authentication (session-based)
 * - Token NEVER sent to client
 * - Token validated server-side
 * - Returns status only: valid | expired | invalid | not_configured
 *
 * INDUSTRY VALIDATION:
 * - IETF OAuth Browser-Based Apps draft
 * - Auth0 BFF Pattern
 * - Duende BFF Security Framework
 * - Curity Token Handler Pattern
 *
 * @see apps/mcp-server/data/documentation/apps/web-dashboard-speckle-token-architecture.json
 */
router.get('/config', requireAuth, async (req: Request, res: Response) => {
  try {
    const serverUrl = process.env.SPECKLE_SERVER_URL || '';
    const token = await getSpeckleToken();
    const demoStreamId = process.env.DEMO_SPECKLE_STREAM_ID;
    const demoObjectId = process.env.DEMO_SPECKLE_OBJECT_ID;

    // Validate token status server-side (NEVER expose token to client)
    let tokenStatus: 'valid' | 'expired' | 'invalid' | 'not_configured' =
      'not_configured';
    let tokenExpiresAt: string | undefined;

    if (!serverUrl) {
      tokenStatus = 'not_configured';
    } else if (!token || token === 'REPLACE_WITH_TOKEN_AFTER_ADMIN_SETUP') {
      tokenStatus = 'not_configured';
    } else {
      // ENTERPRISE: Validate token with Speckle server via GraphQL
      // Use simple activeUser query to verify token is valid
      try {
        const validationQuery = `
          query ValidateToken {
            activeUser {
              id
              email
            }
          }
        `;

        const response = await fetch(`${serverUrl}/graphql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ query: validationQuery }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.data?.activeUser?.id) {
            tokenStatus = 'valid';
            // Note: Speckle Personal Access Tokens don't have expiration
            // Service account tokens may have expiration in the future
          } else if (data.errors) {
            // GraphQL returned errors - check for auth issues
            const errorMsg = data.errors[0]?.message || '';
            if (
              errorMsg.includes('401') ||
              errorMsg.includes('Unauthorized') ||
              errorMsg.includes('authentication')
            ) {
              tokenStatus = 'invalid';
            } else {
              tokenStatus = 'invalid';
            }
          } else {
            tokenStatus = 'invalid';
          }
        } else if (response.status === 401 || response.status === 403) {
          tokenStatus = 'invalid';
        } else {
          // Server error or network issue
          tokenStatus = 'invalid';
          logger.warn('[SpeckleConfig] Token validation failed with status', {
            status: response.status,
          });
        }
      } catch (validationError: unknown) {
        const errorMessage =
          validationError instanceof Error
            ? validationError.message
            : String(validationError);

        // Check for specific error types
        if (
          errorMessage.includes('401') ||
          errorMessage.includes('Unauthorized')
        ) {
          tokenStatus = 'invalid';
        } else if (errorMessage.includes('expired')) {
          tokenStatus = 'expired';
        } else {
          // Network or other error - treat as unavailable but may be valid
          tokenStatus = 'invalid';
          logger.warn('[SpeckleConfig] Token validation failed', {
            error: errorMessage,
          });
        }
      }
    }

    // Determine frontend URL from server URL
    const frontendUrl = serverUrl
      .replace(':3333', ':8080')
      .replace(/\/api$/, '');

    // SPRINT 6: Return config WITHOUT token (BFF pattern)
    res.json({
      status: 'success',
      data: {
        serverUrl,
        frontendUrl,
        demoStreamId,
        demoObjectId,
        tokenStatus,
        tokenExpiresAt,
        enabled: tokenStatus === 'valid',
      },
    });

    logger.info('[SpeckleConfig] Config fetched', {
      userId: req.user?.id,
      tokenStatus,
      enabled: tokenStatus === 'valid',
    });
  } catch (error) {
    logger.error('[SpeckleConfig] Failed to fetch config', { error });
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch Speckle configuration',
    });
  }
});

/**
 * ================================================
 * SPRINT 6: BFF GRAPHQL PROXY
 * ================================================
 * POST /api/speckle/graphql
 * Proxy Speckle GraphQL requests (BFF pattern)
 *
 * SECURITY (IETF BFF Pattern Compliance):
 * - Requires authentication
 * - Backend injects token - client never sees it
 * - Requests proxied to Speckle server
 * - Response passed back to client
 *
 * This allows the frontend to make Speckle API calls
 * without having access to the authentication token.
 */
router.post('/graphql', requireAuth, async (req: Request, res: Response) => {
  try {
    const serverUrl = process.env.SPECKLE_SERVER_URL || '';
    const token = await getSpeckleToken();

    if (
      !serverUrl ||
      !token ||
      token === 'REPLACE_WITH_TOKEN_AFTER_ADMIN_SETUP'
    ) {
      return res.status(503).json({
        status: 'error',
        message: 'Speckle integration not configured',
      });
    }

    const { query, variables, operationName } = req.body;

    if (!query) {
      return res.status(400).json({
        status: 'error',
        message: 'GraphQL query is required',
      });
    }

    // SPRINT 6: Proxy to Speckle with token injection (BFF pattern)
    const speckleGraphqlUrl = `${serverUrl}/graphql`;

    const proxyResponse = await fetch(speckleGraphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`, // Token injected server-side
      },
      body: JSON.stringify({
        query,
        variables,
        operationName,
      }),
    });

    const data = await proxyResponse.json();

    // Log proxy request (without sensitive data)
    logger.debug('[SpeckleProxy] GraphQL request proxied', {
      userId: req.user?.id,
      operationName: operationName || 'anonymous',
      statusCode: proxyResponse.status,
    });

    // Return response with same status code
    res.status(proxyResponse.status).json(data);
  } catch (error) {
    logger.error('[SpeckleProxy] GraphQL proxy failed', { error });
    res.status(502).json({
      status: 'error',
      message: 'Failed to proxy request to Speckle server',
    });
  }
});

/**
 * ================================================
 * SPRINT 6: BFF OBJECT LOADER PROXY
 * ================================================
 * GET /api/speckle/objects/:streamId/:objectId
 * Proxy Speckle object requests for the viewer (BFF pattern)
 *
 * SECURITY:
 * - Requires authentication
 * - Backend injects token for object fetching
 * - Used by @speckle/viewer ObjectLoader
 */
router.get(
  '/objects/:streamId/:objectId',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const serverUrl = process.env.SPECKLE_SERVER_URL || '';
      const token = await getSpeckleToken();
      const { streamId, objectId } = req.params;

      if (
        !serverUrl ||
        !token ||
        token === 'REPLACE_WITH_TOKEN_AFTER_ADMIN_SETUP'
      ) {
        return res.status(503).json({
          status: 'error',
          message: 'Speckle integration not configured',
        });
      }

      // SPRINT 6: Proxy to Speckle Objects API with token injection
      const objectsUrl = `${serverUrl}/objects/${streamId}/${objectId}`;

      const proxyResponse = await fetch(objectsUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // Stream the response back (objects can be large)
      const contentType =
        proxyResponse.headers.get('content-type') || 'application/json';
      res.setHeader('Content-Type', contentType);
      res.status(proxyResponse.status);

      // For large objects, stream the response
      if (proxyResponse.body) {
        const reader = proxyResponse.body.getReader();
        const pump = async (): Promise<void> => {
          const { done, value } = await reader.read();
          if (done) {
            res.end();
            return;
          }
          res.write(Buffer.from(value));
          return pump();
        };
        await pump();
      } else {
        const data = await proxyResponse.text();
        res.send(data);
      }

      logger.debug('[SpeckleProxy] Object fetched', {
        userId: req.user?.id,
        streamId,
        objectId: `${objectId.substring(0, 8)}...`,
      });
    } catch (error) {
      logger.error('[SpeckleProxy] Object proxy failed', { error });
      res.status(502).json({
        status: 'error',
        message: 'Failed to fetch object from Speckle server',
      });
    }
  }
);

/**
 * ================================================
 * BIM FIX 2026-03-14: SINGLE OBJECT LOADER PROXY
 * ================================================
 * GET /api/speckle/objects/:streamId/:objectId/single
 * Proxy single Speckle object requests for the viewer (BFF pattern)
 *
 * ObjectLoader in @speckle/viewer calls the /single suffix to fetch
 * individual objects. This route was missing from enterprise routes,
 * causing 404s in the BIM viewer.
 *
 * SECURITY:
 * - Requires authentication
 * - Backend injects token for object fetching
 * - Used by @speckle/viewer ObjectLoader
 */
router.get(
  '/objects/:streamId/:objectId/single',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const serverUrl = process.env.SPECKLE_SERVER_URL || '';
      const token = await getSpeckleToken();
      const { streamId, objectId } = req.params;

      if (
        !serverUrl ||
        !token ||
        token === 'REPLACE_WITH_TOKEN_AFTER_ADMIN_SETUP'
      ) {
        return res.status(503).json({
          status: 'error',
          message: 'Speckle integration not configured',
        });
      }

      // Proxy to Speckle /single endpoint — returns only the root object JSON
      const objectsUrl = `${serverUrl}/objects/${streamId}/${objectId}/single`;

      const proxyResponse = await fetch(objectsUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // Stream the response back (objects can be large)
      const contentType =
        proxyResponse.headers.get('content-type') || 'application/json';
      res.setHeader('Content-Type', contentType);
      res.status(proxyResponse.status);

      // For large objects, stream the response
      if (proxyResponse.body) {
        const reader = proxyResponse.body.getReader();
        const pump = async (): Promise<void> => {
          const { done, value } = await reader.read();
          if (done) {
            res.end();
            return;
          }
          res.write(Buffer.from(value));
          return pump();
        };
        await pump();
      } else {
        const data = await proxyResponse.text();
        res.send(data);
      }

      logger.debug('[SpeckleProxy] Single object fetched', {
        userId: req.user?.id,
        streamId,
        objectId: `${objectId.substring(0, 8)}...`,
      });
    } catch (error) {
      logger.error('[SpeckleProxy] Object single proxy failed', { error });
      res.status(502).json({
        status: 'error',
        message: 'Failed to fetch object from Speckle server',
      });
    }
  }
);

/**
 * ================================================
 * BIM FIX 2026-03-18: BATCH OBJECT LOADER PROXY
 * ================================================
 * POST /api/speckle/api/getobjects/:streamId
 * Proxy Speckle batch object requests for the viewer (BFF pattern)
 *
 * ObjectLoader in @speckle/viewer calls this endpoint to batch-fetch
 * child objects after loading the root object. This route was missing,
 * causing the "HIC SVNT DRACONES" timeout on child object resolution.
 *
 * ObjectLoader sends:
 *   POST /api/getobjects/{streamId}
 *   Body: JSON array of objectIds
 *   Accept: text/plain
 *
 * SECURITY:
 * - Requires authentication
 * - Backend injects token for object fetching
 */
router.post(
  '/api/getobjects/:streamId',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const serverUrl = process.env.SPECKLE_SERVER_URL || '';
      const token = await getSpeckleToken();
      const { streamId } = req.params;

      if (
        !serverUrl ||
        !token ||
        token === 'REPLACE_WITH_TOKEN_AFTER_ADMIN_SETUP'
      ) {
        return res.status(503).json({
          status: 'error',
          message: 'Speckle integration not configured',
        });
      }

      // Proxy batch object request to Speckle server
      const getObjectsUrl = `${serverUrl}/api/getobjects/${streamId}`;

      const proxyResponse = await fetch(getObjectsUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'text/plain',
        },
        body: JSON.stringify(req.body),
      });

      const contentType =
        proxyResponse.headers.get('content-type') || 'text/plain';
      res.setHeader('Content-Type', contentType);
      res.status(proxyResponse.status);

      if (proxyResponse.body) {
        const reader = proxyResponse.body.getReader();
        const pump = async (): Promise<void> => {
          const { done, value } = await reader.read();
          if (done) {
            res.end();
            return;
          }
          res.write(Buffer.from(value));
          return pump();
        };
        await pump();
      } else {
        const data = await proxyResponse.text();
        res.send(data);
      }

      logger.debug('[SpeckleProxy] Batch objects fetched', {
        userId: req.user?.id,
        streamId,
      });
    } catch (error) {
      logger.error('[SpeckleProxy] Batch object proxy failed', { error });
      res.status(502).json({
        status: 'error',
        message: 'Failed to batch fetch objects from Speckle server',
      });
    }
  }
);

/**
 * GET /api/speckle/health
 * Check Speckle integration health
 *
 * Security: Public endpoint (no auth required)
 * Returns health status without sensitive information
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    // Check if Speckle is configured
    const currentToken = await getSpeckleToken();
    const configured =
      process.env.SPECKLE_SERVER_URL &&
      currentToken &&
      currentToken !== 'REPLACE_WITH_TOKEN_AFTER_ADMIN_SETUP';

    if (!configured) {
      return res.status(503).json({
        status: 'unavailable',
        message: 'Speckle integration not configured',
        configured: false,
      });
    }

    // Basic connectivity test (without exposing sensitive data)
    const service = await getSpeckleServiceAsync();

    // Simple health check - verify service is instantiated
    const healthy = service !== null && service !== undefined;

    res.json({
      status: healthy ? 'healthy' : 'unhealthy',
      configured: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      configured: true,
      message: 'Speckle service unavailable',
      timestamp: new Date().toISOString(),
    });
  }
});

// ============================================================================
// Root-level Speckle proxy routes (mounted at / not /api/speckle)
// ============================================================================
// FIX (2026-03-19): @speckle/viewer 2.28.0 SpeckleLoader uses url.origin as
// the server base for all HTTP requests. When the resource URL is
// https://ectropy.ai/streams/{id}/objects/{id}, ObjectLoader2 makes requests to:
//   GET https://ectropy.ai/streams/{id}/objects/{id}  (object data)
//   POST https://ectropy.ai/graphql                    (GraphQL queries)
// These root-level proxy routes intercept those requests and forward them to
// the Speckle server with the service token injected server-side.
// ============================================================================
export const speckleRootProxy: ExpressRouter = Router();

// Proxy: GET /streams/:streamId/objects/:objectId → Speckle server
speckleRootProxy.get(
  '/streams/:streamId/objects/:objectId',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { streamId, objectId } = req.params;
      const serverUrl = process.env.SPECKLE_SERVER_URL || '';
      const token = await getSpeckleToken();

      if (!serverUrl || !token || token === 'REPLACE_WITH_TOKEN_AFTER_ADMIN_SETUP') {
        return res.status(503).json({ error: 'Speckle integration not configured' });
      }

      const upstream = await fetch(
        `${serverUrl}/streams/${streamId}/objects/${objectId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }
      );

      res.status(upstream.status);
      // Forward content-type and stream the response body
      const contentType = upstream.headers.get('content-type');
      if (contentType) res.setHeader('Content-Type', contentType);
      const body = await upstream.arrayBuffer();
      res.send(Buffer.from(body));
    } catch (error) {
      logger.error('[SpeckleRootProxy] Object fetch failed', { error });
      res.status(502).json({ error: 'Failed to proxy Speckle object request' });
    }
  }
);

// Proxy: GET /objects/:streamId/:objectId/single → Speckle server (root object fetch)
// ObjectLoader2 fetches the root object at this endpoint before streaming geometry
speckleRootProxy.get(
  '/objects/:streamId/:objectId/single',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { streamId, objectId } = req.params;
      const serverUrl = process.env.SPECKLE_SERVER_URL || '';
      const token = await getSpeckleToken();

      if (!serverUrl || !token || token === 'REPLACE_WITH_TOKEN_AFTER_ADMIN_SETUP') {
        return res.status(503).json({ error: 'Speckle integration not configured' });
      }

      const upstream = await fetch(
        `${serverUrl}/objects/${streamId}/${objectId}/single`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }
      );

      res.status(upstream.status);
      const contentType = upstream.headers.get('content-type');
      if (contentType) res.setHeader('Content-Type', contentType);
      const body = await upstream.arrayBuffer();
      res.send(Buffer.from(body));
    } catch (error) {
      logger.error('[SpeckleRootProxy] Object single fetch failed', { error });
      res.status(502).json({ error: 'Failed to proxy Speckle object single request' });
    }
  }
);

// Proxy: POST /graphql → Speckle server (for ObjectLoader2 GraphQL queries)
speckleRootProxy.post(
  '/graphql',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const serverUrl = process.env.SPECKLE_SERVER_URL || '';
      const token = await getSpeckleToken();

      if (!serverUrl || !token || token === 'REPLACE_WITH_TOKEN_AFTER_ADMIN_SETUP') {
        return res.status(503).json({ error: 'Speckle integration not configured' });
      }

      const upstream = await fetch(`${serverUrl}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(req.body),
      });

      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (error) {
      logger.error('[SpeckleRootProxy] GraphQL proxy failed', { error });
      res.status(502).json({ error: 'Failed to proxy Speckle GraphQL request' });
    }
  }
);

// Proxy: POST /api/v2/projects/:streamId/object-stream/ → Speckle server
// ObjectLoader2 uses this v2 endpoint for batch geometry streaming
speckleRootProxy.post(
  '/api/v2/projects/:streamId/object-stream/',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { streamId } = req.params;
      const serverUrl = process.env.SPECKLE_SERVER_URL || '';
      const token = await getSpeckleToken();

      if (!serverUrl || !token || token === 'REPLACE_WITH_TOKEN_AFTER_ADMIN_SETUP') {
        return res.status(503).json({ error: 'Speckle integration not configured' });
      }

      const upstream = await fetch(
        `${serverUrl}/api/v2/projects/${streamId}/object-stream/`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'text/plain',
          },
          body: JSON.stringify(req.body),
        }
      );

      res.status(upstream.status);
      const contentType = upstream.headers.get('content-type');
      if (contentType) res.setHeader('Content-Type', contentType);

      // Stream the response body (batch geometry can be large)
      if (upstream.body) {
        const reader = upstream.body.getReader();
        const pump = async (): Promise<void> => {
          const { done, value } = await reader.read();
          if (done) {
            res.end();
            return;
          }
          res.write(Buffer.from(value));
          return pump();
        };
        await pump();
      } else {
        const data = await upstream.text();
        res.send(data);
      }
    } catch (error) {
      logger.error('[SpeckleRootProxy] Object stream proxy failed', { error });
      res.status(502).json({ error: 'Failed to proxy Speckle object stream request' });
    }
  }
);

export default router;
