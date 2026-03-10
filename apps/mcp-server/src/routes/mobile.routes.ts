/**
 * Mobile Integration Routes (DL-M5)
 *
 * REST API endpoints for mobile app integration including
 * location tracking, voxel entry, decision surface, and acknowledgments.
 *
 * @module routes/mobile
 * @version 1.0.0
 */

import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '../../../../libs/shared/utils/src/logger.js';
import {
  MobileServiceOrchestrator,
  createMobileOrchestrator,
  type LocationUpdate,
  type AcknowledgmentRequest,
  type DecisionQueryContext,
  type VoxelSession,
} from '../services/mobile/index.js';

// ==============================================================================
// Types
// ==============================================================================

interface MobileRoutesConfig {
  prisma?: any;
  orchestrator?: MobileServiceOrchestrator;
}

// Use Omit to avoid conflict with Express.Request.user type from passport
interface AuthenticatedRequest extends Omit<Request, 'user'> {
  user?: {
    id: string;
    tenantId?: string;
    isPlatformAdmin?: boolean;
  };
  tenantId?: string;
  projectId?: string;
}

// ==============================================================================
// Helper Functions
// ==============================================================================

/**
 * Async handler wrapper
 */
function asyncHandler(
  fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as AuthenticatedRequest, res, next)).catch(next);
  };
}

/**
 * Create standard response
 */
function createResponse<T>(data: T) {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create error response
 */
function createErrorResponse(error: string, code?: string) {
  return {
    success: false,
    error,
    code,
    timestamp: new Date().toISOString(),
  };
}

// ==============================================================================
// Mobile Routes Class
// ==============================================================================

export class MobileRoutes {
  private router: Router;
  private orchestrator: MobileServiceOrchestrator;

  constructor(config: MobileRoutesConfig) {
    this.router = Router();

    // Create or use provided orchestrator
    this.orchestrator =
      config.orchestrator || createMobileOrchestrator({ prisma: config.prisma });

    this.setupRoutes();
  }

  /**
   * Get configured router
   */
  getRouter(): Router {
    return this.router;
  }

  /**
   * Setup all routes
   */
  private setupRoutes(): void {
    // =========================================================================
    // Location & Geofencing
    // =========================================================================

    // POST /mobile/location - Submit location update
    this.router.post('/location', asyncHandler(this.submitLocation.bind(this)));

    // GET /mobile/session - Get current voxel session
    this.router.get('/session', asyncHandler(this.getSession.bind(this)));

    // DELETE /mobile/session - End current voxel session
    this.router.delete('/session', asyncHandler(this.endSession.bind(this)));

    // GET /mobile/sessions/project/:projectId - Get active sessions for project
    this.router.get(
      '/sessions/project/:projectId',
      asyncHandler(this.getProjectSessions.bind(this))
    );

    // =========================================================================
    // Decision Surface
    // =========================================================================

    // GET /mobile/voxel/:voxelId/surface - Get decision surface for voxel
    this.router.get(
      '/voxel/:voxelId/surface',
      asyncHandler(this.getDecisionSurface.bind(this))
    );

    // GET /mobile/voxel/:voxelId/decisions - Get decisions for voxel
    this.router.get(
      '/voxel/:voxelId/decisions',
      asyncHandler(this.getVoxelDecisions.bind(this))
    );

    // GET /mobile/voxel/:voxelId/preapprovals - Get pre-approvals for voxel
    this.router.get(
      '/voxel/:voxelId/preapprovals',
      asyncHandler(this.getVoxelPreApprovals.bind(this))
    );

    // GET /mobile/voxel/:voxelId/tolerances - Get tolerance overrides for voxel
    this.router.get(
      '/voxel/:voxelId/tolerances',
      asyncHandler(this.getVoxelTolerances.bind(this))
    );

    // =========================================================================
    // Acknowledgments
    // =========================================================================

    // POST /mobile/acknowledgment - Submit decision acknowledgment
    this.router.post(
      '/acknowledgment',
      asyncHandler(this.submitAcknowledgment.bind(this))
    );

    // GET /mobile/acknowledgments/pending - Get pending acknowledgments
    this.router.get(
      '/acknowledgments/pending',
      asyncHandler(this.getPendingAcknowledgments.bind(this))
    );

    // GET /mobile/acknowledgments/history - Get acknowledgment history
    this.router.get(
      '/acknowledgments/history',
      asyncHandler(this.getAcknowledgmentHistory.bind(this))
    );

    // =========================================================================
    // Decision Queries
    // =========================================================================

    // POST /mobile/query - Process natural language decision query
    this.router.post('/query', asyncHandler(this.processQuery.bind(this)));

    // =========================================================================
    // Status & Health
    // =========================================================================

    // GET /mobile/status - Get mobile service status
    this.router.get('/status', asyncHandler(this.getStatus.bind(this)));
  }

  // ===========================================================================
  // Location Handlers
  // ===========================================================================

  /**
   * POST /mobile/location - Submit location update
   */
  private async submitLocation(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json(createErrorResponse('Authentication required'));
      return;
    }

    const {
      deviceId,
      projectId,
      latitude,
      longitude,
      altitude,
      accuracy,
      source = 'GPS',
      uwbCoordinates,
    } = req.body;

    if (!projectId) {
      res.status(400).json(createErrorResponse('projectId is required'));
      return;
    }

    if (!latitude || !longitude) {
      if (!uwbCoordinates) {
        res.status(400).json(createErrorResponse('Location coordinates required'));
        return;
      }
    }

    const location: LocationUpdate = {
      userId,
      deviceId: deviceId || `device-${userId}`,
      projectId,
      tenantId: req.tenantId || req.user?.tenantId || 'default',
      timestamp: new Date().toISOString(),
      gps: latitude
        ? {
            latitude,
            longitude,
            altitude,
            accuracy,
          }
        : undefined,
      uwb: uwbCoordinates,
      source,
    };

    const detection = await this.orchestrator.processLocationUpdate(location);

    logger.debug('Location update processed', {
      userId,
      projectId,
      detected: detection.detected,
      voxelId: detection.voxelId,
    });

    res.json(
      createResponse({
        detection,
        session: detection.detected
          ? this.orchestrator.getActiveSession(userId)
          : null,
      })
    );
  }

  /**
   * GET /mobile/session - Get current voxel session
   */
  private async getSession(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json(createErrorResponse('Authentication required'));
      return;
    }

    const session = this.orchestrator.getActiveSession(userId);

    res.json(
      createResponse({
        active: !!session,
        session: session || null,
      })
    );
  }

  /**
   * DELETE /mobile/session - End current voxel session
   */
  private async endSession(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json(createErrorResponse('Authentication required'));
      return;
    }

    await this.orchestrator.geofence.forceEndSession(userId);

    res.json(
      createResponse({
        ended: true,
      })
    );
  }

  /**
   * GET /mobile/sessions/project/:projectId - Get active sessions for project
   */
  private async getProjectSessions(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    const { projectId } = req.params;

    const sessions = this.orchestrator.geofence.getActiveSessionsForProject(projectId);

    res.json(
      createResponse({
        projectId,
        sessions,
        count: sessions.length,
      })
    );
  }

  // ===========================================================================
  // Decision Surface Handlers
  // ===========================================================================

  /**
   * GET /mobile/voxel/:voxelId/surface - Get decision surface for voxel
   */
  private async getDecisionSurface(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json(createErrorResponse('Authentication required'));
      return;
    }

    const { voxelId } = req.params;

    // Use decision query service to get surface
    const context: DecisionQueryContext = {
      userId,
      projectId: req.projectId || '',
      tenantId: req.tenantId || req.user?.tenantId || '',
      authorityLevel: 0, // Would get from participant
      currentVoxelId: voxelId,
    };

    const result = await this.orchestrator.processDecisionQuery('decisions', context);

    res.json(
      createResponse({
        voxelId,
        surface: {
          decisions: result.decisions || [],
          alerts: [],
          toleranceOverrides: [],
          preApprovals: [],
          requiresAcknowledgment: result.acknowledgmentRequired || false,
        },
        deepLink: result.deepLink,
      })
    );
  }

  /**
   * GET /mobile/voxel/:voxelId/decisions - Get decisions for voxel
   */
  private async getVoxelDecisions(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    const { voxelId } = req.params;
    const { status, limit = 20, offset = 0 } = req.query;

    // Would query prisma for decisions attached to voxel
    res.json(
      createResponse({
        voxelId,
        decisions: [],
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
          total: 0,
        },
      })
    );
  }

  /**
   * GET /mobile/voxel/:voxelId/preapprovals - Get pre-approvals for voxel
   */
  private async getVoxelPreApprovals(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    const { voxelId } = req.params;

    // Would query prisma for active pre-approvals
    res.json(
      createResponse({
        voxelId,
        preApprovals: [],
        count: 0,
      })
    );
  }

  /**
   * GET /mobile/voxel/:voxelId/tolerances - Get tolerance overrides for voxel
   */
  private async getVoxelTolerances(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    const { voxelId } = req.params;

    // Would query prisma for tolerance overrides
    res.json(
      createResponse({
        voxelId,
        toleranceOverrides: [],
        count: 0,
      })
    );
  }

  // ===========================================================================
  // Acknowledgment Handlers
  // ===========================================================================

  /**
   * POST /mobile/acknowledgment - Submit decision acknowledgment
   */
  private async submitAcknowledgment(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json(createErrorResponse('Authentication required'));
      return;
    }

    const {
      decisionId,
      decisionUrn,
      voxelId,
      projectId,
      location,
      deviceInfo,
      signature,
      notes,
    } = req.body;

    if (!decisionId || !voxelId || !projectId) {
      res.status(400).json(
        createErrorResponse('decisionId, voxelId, and projectId are required')
      );
      return;
    }

    const request: AcknowledgmentRequest = {
      decisionId,
      decisionUrn: decisionUrn || `urn:ectropy:decision:${decisionId}`,
      userId,
      voxelId,
      projectId,
      tenantId: req.tenantId || req.user?.tenantId || '',
      location: location || {
        userId,
        deviceId: deviceInfo?.deviceId || 'unknown',
        projectId,
        tenantId: req.tenantId || '',
        timestamp: new Date().toISOString(),
        source: 'MANUAL',
      },
      deviceInfo: deviceInfo || {
        deviceId: 'unknown',
        platform: 'WEB',
      },
      signature,
      notes,
      timestamp: new Date().toISOString(),
    };

    const result = await this.orchestrator.processAcknowledgment(request);

    if (result.success) {
      res.status(201).json(
        createResponse({
          acknowledgment: result.acknowledgment,
        })
      );
    } else {
      res.status(400).json(createErrorResponse(result.error || 'Acknowledgment failed'));
    }
  }

  /**
   * GET /mobile/acknowledgments/pending - Get pending acknowledgments
   */
  private async getPendingAcknowledgments(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json(createErrorResponse('Authentication required'));
      return;
    }

    const projectId = (req.query.projectId as string) || req.projectId || '';

    const pending = await this.orchestrator.acknowledgment.getPendingAcknowledgments(
      userId,
      projectId
    );

    res.json(
      createResponse({
        pending,
        count: pending.length,
      })
    );
  }

  /**
   * GET /mobile/acknowledgments/history - Get acknowledgment history
   */
  private async getAcknowledgmentHistory(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json(createErrorResponse('Authentication required'));
      return;
    }

    const { projectId, limit = 50, offset = 0 } = req.query;

    const history = await this.orchestrator.acknowledgment.getAcknowledgmentHistory(
      userId,
      {
        projectId: projectId as string,
        limit: Number(limit),
        offset: Number(offset),
      }
    );

    res.json(
      createResponse({
        history,
        count: history.length,
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
        },
      })
    );
  }

  // ===========================================================================
  // Decision Query Handlers
  // ===========================================================================

  /**
   * POST /mobile/query - Process natural language decision query
   */
  private async processQuery(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json(createErrorResponse('Authentication required'));
      return;
    }

    const { query, projectId, voxelId, authorityLevel = 0 } = req.body;

    if (!query) {
      res.status(400).json(createErrorResponse('query is required'));
      return;
    }

    const context: DecisionQueryContext = {
      userId,
      projectId: projectId || req.projectId || '',
      tenantId: req.tenantId || req.user?.tenantId || '',
      authorityLevel,
      currentVoxelId: voxelId,
    };

    const result = await this.orchestrator.processDecisionQuery(query, context);

    res.json(createResponse(result));
  }

  // ===========================================================================
  // Status Handlers
  // ===========================================================================

  /**
   * GET /mobile/status - Get mobile service status
   */
  private async getStatus(_req: AuthenticatedRequest, res: Response): Promise<void> {
    const stats = this.orchestrator.getStatistics();

    res.json(
      createResponse({
        status: 'operational',
        services: {
          geofence: {
            activeSessions: stats.geofence.activeSessionCount,
            cachedProjects: stats.geofence.cachedProjectCount,
          },
          notifications: {
            totalUsers: stats.notification.totalUsers,
            totalNotifications: stats.notification.totalNotifications,
          },
          acknowledgments: {
            pendingReminders: stats.acknowledgment.pendingReminders,
          },
        },
        timestamp: new Date().toISOString(),
      })
    );
  }
}

// ==============================================================================
// Factory Function
// ==============================================================================

/**
 * Create mobile routes
 */
export function createMobileRoutes(config: MobileRoutesConfig): Router {
  const routes = new MobileRoutes(config);
  return routes.getRouter();
}

export default MobileRoutes;
