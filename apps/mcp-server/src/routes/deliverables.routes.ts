/**
 * Deliverables API Routes
 * Endpoints for MCP-driven development lifecycle
 */

import { Router, type Request, type Response } from 'express';
import { EvidenceGeneratorService } from '../services/evidence-generator.js';
import { DeliverableValidatorService } from '../services/deliverable-validator.js';
import type {
  DeliverableSubmission,
  DeliverableStatusResponse,
  DependencyStatus,
  DeliverableStatus,
} from '../types/deliverable.js';
import { promises as fs } from 'fs';
import path from 'path';

export const deliverablesRouter: Router = Router();

const evidenceGenerator = new EvidenceGeneratorService();
const deliverableValidator = new DeliverableValidatorService();

/**
 * POST /api/mcp/deliverables/submit
 * Submit completed work on a deliverable for validation and evidence generation
 */
deliverablesRouter.post('/submit', async (req, res) => {
  try {
    const submission: DeliverableSubmission = req.body;

    // Validate required fields
    if (
      !submission.deliverableId ||
      !submission.developer ||
      !submission.workCompleted ||
      !submission.evidence
    ) {
      return res.status(400).json({
        success: false,
        error:
          'Missing required fields: deliverableId, developer, workCompleted, evidence',
      });
    }

    console.log(
      `[Deliverables API] Received submission for ${submission.deliverableId}`
    );

    // Step 1: Validate submission
    const validationResult =
      await deliverableValidator.validateSubmission(submission);

    if (!validationResult.approved) {
      console.log(
        `[Deliverables API] Validation failed for ${submission.deliverableId}`
      );
      return res.status(400).json({
        success: false,
        approved: false,
        validation: validationResult,
        message:
          'Deliverable validation failed. Please address feedback and resubmit.',
      });
    }

    console.log(
      `[Deliverables API] Validation passed for ${submission.deliverableId}`
    );

    // Step 2: Generate evidence session
    const evidenceResult =
      await evidenceGenerator.generateEvidenceSession(submission);

    if (!evidenceResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Evidence generation failed',
        details: evidenceResult.error,
      });
    }

    console.log(
      `[Deliverables API] Evidence generated: ${evidenceResult.sessionId}`
    );

    // Step 3: Return success response
    return res.json({
      success: true,
      approved: true,
      validation: validationResult,
      evidence: {
        sessionId: evidenceResult.sessionId,
        sessionPath: evidenceResult.sessionPath,
        filesGenerated: evidenceResult.filesGenerated,
      },
      mcpUpdates: evidenceResult.mcpUpdates,
      message: `✅ Deliverable ${submission.deliverableId} approved and evidence auto-generated!`,
    });
  } catch (error) {
    console.error('[Deliverables API] Submit error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/mcp/deliverables/validate
 * Validate a deliverable submission without generating evidence
 * Useful for pre-submission checks
 */
deliverablesRouter.post('/validate', async (req, res) => {
  try {
    const submission: DeliverableSubmission = req.body;

    if (!submission.deliverableId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: deliverableId',
      });
    }

    console.log(`[Deliverables API] Validating ${submission.deliverableId}`);

    const validationResult =
      await deliverableValidator.validateSubmission(submission);

    return res.json({
      success: true,
      validation: validationResult,
      message: validationResult.approved
        ? '✅ Validation passed - ready for submission'
        : '❌ Validation failed - see feedback',
    });
  } catch (error) {
    console.error('[Deliverables API] Validate error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/mcp/deliverables/:id/status
 * Get status of a deliverable
 */
deliverablesRouter.get('/:id/status', async (req, res) => {
  try {
    const deliverableId = req.params.id;

    console.log(`[Deliverables API] Getting status for ${deliverableId}`);

    // Load roadmap
    const roadmapPath = path.resolve(
      process.env.DATA_PATH || '/app/data',
      'roadmap-platform.json'
    );
    const roadmap = JSON.parse(await fs.readFile(roadmapPath, 'utf-8'));

    // Find deliverable
    let deliverable: any = null;
    let phase: any = null;

    for (const p of roadmap.phases) {
      const d = p.deliverables?.find((d: any) => d.id === deliverableId);
      if (d) {
        deliverable = d;
        phase = p;
        break;
      }
    }

    if (!deliverable) {
      return res.status(404).json({
        success: false,
        error: 'Deliverable not found',
        deliverableId,
      });
    }

    // Get dependency statuses - using imported DependencyStatus type
    const dependencyStatuses: DependencyStatus[] = [];
    for (const depId of deliverable.dependencies || []) {
      for (const p of roadmap.phases) {
        const dep = p.deliverables?.find((d: any) => d.id === depId);
        if (dep) {
          dependencyStatuses.push({
            deliverableId: depId,
            name: dep.name || depId,
            status: (dep.status || 'pending') as DeliverableStatus,
            blocking: true,
          });
          break;
        }
      }
    }

    const response: DeliverableStatusResponse = {
      id: deliverable.id,
      name: deliverable.name,
      description: deliverable.description,
      status: deliverable.status || 'pending',
      assignedTo: deliverable.assignedTo,
      phase: phase.id,
      priority: deliverable.priority || 'medium',
      estimatedEffort: deliverable.estimatedEffort || 'Unknown',
      dependencies: dependencyStatuses,
      acceptanceCriteria: deliverable.acceptanceCriteria || [],
      blockers: deliverable.blockers,
      evidenceSessions: deliverable.evidence || [],
      createdAt: deliverable.createdAt,
      updatedAt: deliverable.updatedAt,
      completedAt: deliverable.completedDate,
    };

    return res.json({
      success: true,
      deliverable: response,
    });
  } catch (error) {
    console.error('[Deliverables API] Status error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/mcp/deliverables
 * List all deliverables with optional filtering
 */
deliverablesRouter.get('/', async (req, res) => {
  try {
    const { phase, status, priority } = req.query;

    console.log('[Deliverables API] Listing deliverables', {
      phase,
      status,
      priority,
    });

    // Load roadmap
    const roadmapPath = path.resolve(
      process.env.DATA_PATH || '/app/data',
      'roadmap-platform.json'
    );
    const roadmap = JSON.parse(await fs.readFile(roadmapPath, 'utf-8'));

    const deliverables: any[] = [];

    for (const p of roadmap.phases) {
      if (phase && p.id !== phase) {
        continue;
      }

      for (const d of p.deliverables || []) {
        if (status && d.status !== status) {
          continue;
        }
        if (priority && d.priority !== priority) {
          continue;
        }

        deliverables.push({
          id: d.id,
          name: d.name,
          phase: p.id,
          status: d.status || 'pending',
          priority: d.priority || 'medium',
          estimatedEffort: d.estimatedEffort,
          assignedTo: d.assignedTo,
        });
      }
    }

    res.json({
      success: true,
      count: deliverables.length,
      deliverables,
    });
  } catch (error) {
    console.error('[Deliverables API] List error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/mcp/deliverables/next
 * Get next recommended deliverable to work on
 * Prioritizes: critical blockers → unmet dependencies → highest priority pending
 */
deliverablesRouter.get('/next', async (req, res) => {
  try {
    const { phase, developer } = req.query;

    console.log('[Deliverables API] Finding next deliverable', {
      phase,
      developer,
    });

    // Load roadmap
    const roadmapPath = path.resolve(
      process.env.DATA_PATH || '/app/data',
      'roadmap-platform.json'
    );
    const roadmap = JSON.parse(await fs.readFile(roadmapPath, 'utf-8'));

    // Collect all pending deliverables with their context
    const candidates: any[] = [];

    for (const p of roadmap.phases) {
      if (phase && p.id !== phase) {
        continue;
      }

      for (const d of p.deliverables || []) {
        if (d.status === 'pending' || d.status === 'in_progress') {
          // Check dependencies
          const depsMet = (d.dependencies || []).every((depId: string) => {
            for (const phase of roadmap.phases) {
              const dep = phase.deliverables?.find((d: any) => d.id === depId);
              if (dep && dep.status === 'completed') {
                return true;
              }
            }
            return false;
          });

          candidates.push({
            id: d.id,
            name: d.name,
            phase: p.id,
            priority: d.priority || 'medium',
            estimatedEffort: d.estimatedEffort,
            dependenciesMet: depsMet,
            blockers: d.blockers || [],
          });
        }
      }
    }

    if (candidates.length === 0) {
      return res.json({
        success: true,
        message: 'No pending deliverables found',
        deliverable: null,
      });
    }

    // Prioritize: critical + deps met > high + deps met > medium + deps met
    const priorityOrder: Record<string, number> = {
      critical: 3,
      high: 2,
      medium: 1,
      low: 0,
    };
    candidates.sort((a, b) => {
      if (a.dependenciesMet !== b.dependenciesMet) {
        return a.dependenciesMet ? -1 : 1;
      }
      return (
        (priorityOrder[b.priority as string] || 0) -
        (priorityOrder[a.priority as string] || 0)
      );
    });

    const next = candidates[0];

    return res.json({
      success: true,
      message: `Recommended next deliverable: ${next.name}`,
      deliverable: next,
    });
  } catch (error) {
    console.error('[Deliverables API] Next deliverable error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
