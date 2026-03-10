/**
 * Roadmap Routes
 * Endpoints for strategic roadmap tracking and alignment
 */

import { Router, type Request, type Response, type Router as ExpressRouter } from 'express';
import { RoadmapService } from '../services/roadmap-service.js';
import { GitHubProjectsSync } from '../services/github-projects-sync.js';

export const roadmapRouter: ExpressRouter = Router();

const roadmapService = new RoadmapService();

/**
 * GET /api/mcp/roadmap
 * Get complete roadmap
 */
roadmapRouter.get('/roadmap', (req: Request, res: Response) => {
  try {
    const roadmap = roadmapService.getRoadmap();
    return res.json({ success: true, roadmap });
  } catch (error) {
    console.error('Error getting roadmap:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get roadmap',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/mcp/roadmap/business
 * Get business operations roadmap
 */
roadmapRouter.get('/roadmap/business', (req: Request, res: Response) => {
  try {
    const businessRoadmap = roadmapService.getBusinessRoadmap();
    return res.json({ success: true, roadmap: businessRoadmap });
  } catch (error) {
    console.error('Error getting business roadmap:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get business roadmap',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/mcp/roadmap/current
 * Get current active phase
 */
roadmapRouter.get('/roadmap/current', (req: Request, res: Response) => {
  try {
    const currentPhase = roadmapService.getCurrentPhase();

    if (!currentPhase) {
      return res.status(404).json({
        success: false,
        error: 'No current phase set',
      });
    }

    const roadmap = roadmapService.getRoadmap();
    const nextPhase = roadmapService.getNextPhase();
    
    // Extract phase number from id (e.g., "phase-4" -> 4)
    const phaseNumber = currentPhase.phase || 
      (currentPhase.id.match(/phase-(\d+)/) ? parseInt(currentPhase.id.match(/phase-(\d+)/)![1], 10) : 0);
    
    const nextPhaseNumber = nextPhase?.phase || 
      (nextPhase?.id.match(/phase-(\d+)/) ? parseInt(nextPhase.id.match(/phase-(\d+)/)![1], 10) : 0);
    
    // Format response according to specification
    const response = {
      currentPhase: {
        phase: phaseNumber,
        name: currentPhase.name,
        status: currentPhase.status === 'in-progress' ? 'active' as const : currentPhase.status,
        startDate: currentPhase.startDate?.toISOString(),
        targetDate: currentPhase.targetDate?.toISOString(),
        deliverables: currentPhase.deliverables.map(d => ({
          id: d.id,
          name: d.name,
          status: d.status === 'not-started' ? 'planned' as const : d.status,
          assignee: d.assignee || d.assignedTo,
        })),
        blockers: (currentPhase.blockers || []).map(b => ({
          description: b.description,
          severity: b.severity,
        })),
      },
      nextPhase: nextPhase ? {
        phase: nextPhaseNumber,
        name: nextPhase.name,
        plannedStart: nextPhase.startDate?.toISOString(),
      } : undefined,
      overallProgress: roadmap.overallProgress,
    };

    return res.json(response);
  } catch (error) {
    console.error('Error getting current phase:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get current phase',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/mcp/roadmap/check-alignment
 * Check if work plan aligns with current roadmap
 * 
 * Request body:
 * {
 *   "taskDescription": string,
 *   "proposedApproach": string,
 *   "filesImpacted": string[],
 *   "estimatedComplexity": "simple" | "moderate" | "complex",
 *   "requiresTests": boolean,
 *   "requiresDocumentation": boolean
 * }
 * 
 * Response (200):
 * {
 *   "success": true,
 *   "alignment": {
 *     "aligned": boolean,
 *     "currentPhase": RoadmapPhase,
 *     "workPlanMatchesPhase": boolean,
 *     "phaseProgress": number,
 *     "recommendations": string[],
 *     "blockers": string[]
 *   }
 * }
 */
roadmapRouter.post(
  '/roadmap/check-alignment',
  (req: Request, res: Response) => {
    try {
      const workPlan = req.body;

      // Validate required fields
      if (
        !workPlan.taskDescription ||
        !workPlan.proposedApproach ||
        !Array.isArray(workPlan.filesImpacted)
      ) {
        return res.status(400).json({
          success: false,
          error: 'Invalid work plan format',
        });
      }

      const alignment = roadmapService.checkAlignment(workPlan);
      return res.json({ success: true, alignment });
    } catch (error) {
      console.error('Error checking alignment:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to check alignment',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * POST /api/mcp/roadmap/update-deliverable
 * Update deliverable status with evidence
 * 
 * Request body:
 * {
 *   "phaseId": string,
 *   "deliverableId": string,
 *   "status": "not-started" | "in-progress" | "complete",
 *   "evidence": string[]  // Optional
 * }
 * 
 * Response (200):
 * {
 *   "success": true,
 *   "message": "Deliverable updated"
 * }
 */
roadmapRouter.post(
  '/roadmap/update-deliverable',
  (req: Request, res: Response) => {
    try {
      const { phaseId, deliverableId, status, evidence } = req.body;

      // Validate required fields
      if (!phaseId || !deliverableId || !status) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: phaseId, deliverableId, status',
        });
      }

      roadmapService.updateDeliverable(
        phaseId,
        deliverableId,
        status,
        evidence
      );

      return res.json({ success: true, message: 'Deliverable updated' });
    } catch (error) {
      console.error('Error updating deliverable:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to update deliverable',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * GET /api/mcp/roadmap/progress
 * Get overall progress dashboard
 */
roadmapRouter.get('/roadmap/progress', (req: Request, res: Response) => {
  try {
    const roadmap = roadmapService.getRoadmap();

    const dashboard = {
      overallProgress: roadmap.overallProgress,
      currentPhase: roadmap.currentPhase,
      phaseSummary: roadmap.phases.map((phase) => ({
        id: phase.id,
        name: phase.name,
        status: phase.status,
        progress: roadmapService.calculatePhaseProgress(phase),
        completedDeliverables: phase.deliverables.filter(
          (d) => d.status === 'complete'
        ).length,
        totalDeliverables: phase.deliverables.length,
      })),
      upcomingDeliverables: roadmapService.getUpcomingDeliverables(5),
      blockedPhases: roadmap.phases.filter((p) => p.status === 'blocked'),
    };

    return res.json({ success: true, dashboard });
  } catch (error) {
    console.error('Error getting progress:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get progress',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/mcp/roadmap/sync
 * Manually trigger sync from GitHub Projects
 * 
 * Response (200):
 * {
 *   "success": true,
 *   "message": "Roadmap synced from GitHub Projects",
 *   "timestamp": "2025-11-02T23:49:52.113Z",
 *   "changes": 5
 * }
 */
roadmapRouter.post('/roadmap/sync', async (req: Request, res: Response) => {
  try {
    console.log('🔄 Manual roadmap sync triggered');
    
    // Check if GitHub credentials are configured
    const token = process.env.GITHUB_PROJECT_TOKEN || process.env.GITHUB_TOKEN;
    const projectId = process.env.GITHUB_PROJECT_ID;

    if (!token || !projectId) {
      return res.status(503).json({
        success: false,
        error: 'GitHub Projects sync not configured',
        message: 'GITHUB_PROJECT_TOKEN and GITHUB_PROJECT_ID environment variables are required',
      });
    }

    const syncService = new GitHubProjectsSync();
    const result = await syncService.syncToLocal();
    
    if (result.success) {
      return res.json({
        success: true,
        message: result.message,
        timestamp: new Date().toISOString(),
        changes: result.changes,
      });
    } else {
      return res.status(500).json({
        success: false,
        error: 'Sync failed',
        message: result.message,
      });
    }
  } catch (error) {
    console.error('Error syncing roadmap:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to sync roadmap',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/mcp/roadmap/sync-status
 * Get sync status and configuration
 * 
 * Response (200):
 * {
 *   "lastUpdated": "2025-11-02T23:49:52.113Z",
 *   "source": "GitHub Projects",
 *   "syncMode": "one-way-read-only",
 *   "nextScheduledSync": "2 AM UTC daily",
 *   "configured": true
 * }
 */
roadmapRouter.get('/roadmap/sync-status', async (req: Request, res: Response) => {
  try {
    // Check if GitHub credentials are configured
    const token = process.env.GITHUB_PROJECT_TOKEN || process.env.GITHUB_TOKEN;
    const projectId = process.env.GITHUB_PROJECT_ID;
    const configured = !!(token && projectId);

    if (!configured) {
      return res.json({
        lastUpdated: null,
        source: 'GitHub Projects',
        syncMode: 'one-way-read-only',
        nextScheduledSync: '2 AM UTC daily',
        configured: false,
        message: 'GitHub Projects sync not configured. Set GITHUB_PROJECT_TOKEN and GITHUB_PROJECT_ID environment variables.',
      });
    }

    const syncService = new GitHubProjectsSync();
    const status = await syncService.getSyncStatus();
    
    return res.json({
      ...status,
      configured: true,
    });
  } catch (error) {
    console.error('Error getting sync status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get sync status',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
