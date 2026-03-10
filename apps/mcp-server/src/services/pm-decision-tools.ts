/**
 * PM Decision MCP Tools
 *
 * MCP tool definitions and handlers for the PM decision lifecycle system.
 * These tools enable AI agents to interact with construction decisions,
 * voxels, consequences, and inspections.
 *
 * Tools Implemented (21 total, 17 spec-aligned):
 * - Decision Management (6): capture, route, approve, reject, escalate, query_history
 * - Authority & Graph (3): get_authority_graph, find_decision_authority, validate_authority_level
 * - Voxel Operations (3): attach_decision_to_voxel, get_voxel_decisions, navigate_decision_surface
 * - Tolerance Management (2): apply_tolerance_override, query_tolerance_overrides
 * - Consequence & Inspection (3): track_consequence, request_inspection, complete_inspection
 * - Legacy (4): query_voxels_by_status, link_consequence_to_decision, query_consequences_by_voxel, propose_schedule_change
 *
 * @see .roadmap/features/decision-lifecycle/interfaces.json
 * @version 2.0.0
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { DATA_CONFIG } from '../config/data-paths.config.js';

import type {
  PMDecision,
  PMDecisionStatus,
  Consequence,
  ConsequenceCategory,
  ConsequenceSeverity,
  ConsequenceStatus,
  Inspection,
  InspectionType,
  InspectionStatus,
  InspectionOutcome,
  InspectionFinding,
  ScheduleProposal,
  PMURN,
  AuthorityLevel,
  PMDecisionsCollection,
  ConsequencesCollection,
  InspectionsCollection,
  PMToolResult,
  CaptureDecisionInput,
  RouteDecisionInput,
  ApproveDecisionInput,
  RejectDecisionInput,
  EscalateDecisionInput,
  QueryDecisionHistoryInput,
  GetVoxelDecisionsInput,
  TrackConsequenceInput,
  RequestInspectionInput,
  ProposeScheduleChangeInput,
  AuthorityThresholds,
  FindDecisionAuthorityResult,
  ValidateAuthorityResult,
  // New M2 types
  ToleranceOverride,
  ToleranceOverridesCollection,
  ToleranceType,
  ToleranceValue,
  VoxelAlert,
  Voxel,
  VoxelsCollection,
  VoxelStatus,
  NavigateDecisionSurfaceInput,
  ApplyToleranceOverrideInput,
  QueryToleranceOverridesInput,
  CompleteInspectionInput,
  GraphNode,
  GraphEdge,
} from '../types/pm.types.js';

import {
  buildURN,
  buildFileURN,
  generateDecisionId,
  generateConsequenceId,
  generateInspectionId,
  generateProposalId,
  generateToleranceOverrideId,
  createGraphMetadata,
  addOutEdge,
  parseURN,
  setIdCounter,
} from './pm-urn.utils.js';

import {
  calculateRequiredAuthority,
  validateAuthorityLevel as validateAuthLevel,
  routeDecision as routeDecisionLogic,
  findDecisionAuthority as findAuthority,
  getAuthorityCascade,
  getNextAuthority,
} from './pm-authority.service.js';

import {
  USFEventType,
  emitUSFEvent,
  extractQualityMetricsFromFindings,
  type InspectionCompletionEvent,
  type DecisionOutcomeEvent,
} from './usf-event-handler.service.js';

import {
  calculateProjectedUSFImpact,
  getUSFProviderRecommendations,
  getUSFEscalationRecommendation,
  getUSFDecisionContext,
  calculateUSFAuthorityAdjustment,
  type ProjectedUSFImpact,
  type USFProviderRecommendation,
  type USFEscalationRecommendation,
} from './usf-decision.service.js';

// ============================================================================
// Storage Helpers
// ============================================================================

function getRepoRoot(): string {
  return DATA_CONFIG.paths.repoRoot;
}

function getProjectDataDir(projectId: string): string {
  return join(getRepoRoot(), '.roadmap', 'projects', projectId);
}

function getDecisionsPath(projectId: string): string {
  return join(getProjectDataDir(projectId), 'decisions.json');
}

function getConsequencesPath(projectId: string): string {
  return join(getProjectDataDir(projectId), 'consequences.json');
}

function getInspectionsPath(projectId: string): string {
  return join(getProjectDataDir(projectId), 'inspections.json');
}

function getToleranceOverridesPath(projectId: string): string {
  return join(getProjectDataDir(projectId), 'tolerance-overrides.json');
}

function getVoxelsPath(projectId: string): string {
  return join(getProjectDataDir(projectId), 'voxels.json');
}

function ensureProjectDir(projectId: string): void {
  const dir = getProjectDataDir(projectId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ============================================================================
// Collection Loaders/Savers
// ============================================================================

export function loadDecisions(projectId: string): PMDecisionsCollection {
  const path = getDecisionsPath(projectId);

  if (!existsSync(path)) {
    const initial: PMDecisionsCollection = {
      $schema: 'https://luhtech.dev/schemas/pm/decisions-collection.json',
      $id: buildFileURN(projectId, 'decisions'),
      schemaVersion: '3.0.0',
      meta: {
        projectId,
        sourceOfTruth: `.roadmap/projects/${projectId}/decisions.json`,
        lastUpdated: new Date().toISOString(),
        totalDecisions: 0,
      },
      indexes: {
        byStatus: {} as Record<PMDecisionStatus, string[]>,
        byVoxel: {},
        byAuthorityLevel: {},
      },
      decisions: [],
    };
    ensureProjectDir(projectId);
    writeFileSync(path, JSON.stringify(initial, null, 2));
    return initial;
  }

  const collection = JSON.parse(readFileSync(path, 'utf-8'));
  if (collection.decisions.length > 0) {
    const maxId = Math.max(
      ...collection.decisions.map((d: PMDecision) => {
        const match = d.decisionId.match(/DEC-\d{4}-(\d{4})$/);
        return match ? parseInt(match[1], 10) : 0;
      })
    );
    setIdCounter('decision', maxId);
  }
  return collection;
}

function saveDecisions(
  projectId: string,
  collection: PMDecisionsCollection
): void {
  const path = getDecisionsPath(projectId);
  collection.meta.lastUpdated = new Date().toISOString();
  collection.meta.totalDecisions = collection.decisions.length;

  // Rebuild indexes
  const byStatus: Record<string, string[]> = {};
  const byVoxel: Record<string, string[]> = {};
  const byAuthorityLevel: Record<string, string[]> = {};

  for (const d of collection.decisions) {
    if (!byStatus[d.status]) {
      byStatus[d.status] = [];
    }
    byStatus[d.status].push(d.decisionId);

    const voxelId = parseURN(d.voxelRef)?.identifier;
    if (voxelId) {
      if (!byVoxel[voxelId]) {
        byVoxel[voxelId] = [];
      }
      byVoxel[voxelId].push(d.decisionId);
    }

    const level = d.authorityLevel.required.toString();
    if (!byAuthorityLevel[level]) {
      byAuthorityLevel[level] = [];
    }
    byAuthorityLevel[level].push(d.decisionId);
  }

  collection.indexes = {
    byStatus,
    byVoxel,
    byAuthorityLevel,
  } as PMDecisionsCollection['indexes'];
  ensureProjectDir(projectId);
  writeFileSync(path, JSON.stringify(collection, null, 2));
}

function loadConsequences(projectId: string): ConsequencesCollection {
  const path = getConsequencesPath(projectId);
  if (!existsSync(path)) {
    const initial: ConsequencesCollection = {
      $schema: 'https://luhtech.dev/schemas/pm/consequences-collection.json',
      $id: buildFileURN(projectId, 'consequences'),
      schemaVersion: '3.0.0',
      meta: {
        projectId,
        sourceOfTruth: `.roadmap/projects/${projectId}/consequences.json`,
        lastUpdated: new Date().toISOString(),
        totalConsequences: 0,
      },
      indexes: {
        byStatus: {} as Record<ConsequenceStatus, string[]>,
        byCategory: {} as Record<ConsequenceCategory, string[]>,
        bySeverity: {} as Record<ConsequenceSeverity, string[]>,
      },
      consequences: [],
    };
    ensureProjectDir(projectId);
    writeFileSync(path, JSON.stringify(initial, null, 2));
    return initial;
  }
  const collection = JSON.parse(readFileSync(path, 'utf-8'));
  if (collection.consequences.length > 0) {
    const maxId = Math.max(
      ...collection.consequences.map((c: Consequence) => {
        const match = c.consequenceId.match(/CONSQ-\d{4}-(\d{4})$/);
        return match ? parseInt(match[1], 10) : 0;
      })
    );
    setIdCounter('consequence', maxId);
  }
  return collection;
}

function saveConsequences(
  projectId: string,
  collection: ConsequencesCollection
): void {
  const path = getConsequencesPath(projectId);
  collection.meta.lastUpdated = new Date().toISOString();
  collection.meta.totalConsequences = collection.consequences.length;
  ensureProjectDir(projectId);
  writeFileSync(path, JSON.stringify(collection, null, 2));
}

function loadInspections(projectId: string): InspectionsCollection {
  const path = getInspectionsPath(projectId);
  if (!existsSync(path)) {
    const initial: InspectionsCollection = {
      $schema: 'https://luhtech.dev/schemas/pm/inspections-collection.json',
      $id: buildFileURN(projectId, 'inspections'),
      schemaVersion: '3.0.0',
      meta: {
        projectId,
        sourceOfTruth: `.roadmap/projects/${projectId}/inspections.json`,
        lastUpdated: new Date().toISOString(),
        totalInspections: 0,
      },
      indexes: {
        byStatus: {} as Record<InspectionStatus, string[]>,
        byType: {} as Record<InspectionType, string[]>,
        byVoxel: {},
      },
      inspections: [],
    };
    ensureProjectDir(projectId);
    writeFileSync(path, JSON.stringify(initial, null, 2));
    return initial;
  }
  const collection = JSON.parse(readFileSync(path, 'utf-8'));
  if (collection.inspections.length > 0) {
    const maxId = Math.max(
      ...collection.inspections.map((i: Inspection) => {
        const match = i.inspectionId.match(/INSP-\d{4}-(\d{4})$/);
        return match ? parseInt(match[1], 10) : 0;
      })
    );
    setIdCounter('inspection', maxId);
  }
  return collection;
}

function saveInspections(
  projectId: string,
  collection: InspectionsCollection
): void {
  const path = getInspectionsPath(projectId);
  collection.meta.lastUpdated = new Date().toISOString();
  collection.meta.totalInspections = collection.inspections.length;
  ensureProjectDir(projectId);
  writeFileSync(path, JSON.stringify(collection, null, 2));
}

// --- Tolerance Overrides Storage (NEW M2) ---

function loadToleranceOverrides(
  projectId: string
): ToleranceOverridesCollection {
  const path = getToleranceOverridesPath(projectId);

  if (!existsSync(path)) {
    const initial: ToleranceOverridesCollection = {
      $schema:
        'https://luhtech.dev/schemas/pm/tolerance-overrides-collection.json',
      $id: buildFileURN(projectId, 'tolerance-overrides'),
      schemaVersion: '3.0.0',
      meta: {
        projectId,
        sourceOfTruth: `.roadmap/projects/${projectId}/tolerance-overrides.json`,
        lastUpdated: new Date().toISOString(),
        totalOverrides: 0,
      },
      indexes: {
        byType: {} as Record<ToleranceType, string[]>,
        byVoxel: {},
        byStatus: {},
      },
      overrides: [],
    };
    ensureProjectDir(projectId);
    writeFileSync(path, JSON.stringify(initial, null, 2));
    return initial;
  }

  const collection = JSON.parse(readFileSync(path, 'utf-8'));
  if (collection.overrides.length > 0) {
    const maxId = Math.max(
      ...collection.overrides.map((o: ToleranceOverride) => {
        const match = o.overrideId.match(/TOL-\d{4}-(\d{4})$/);
        return match ? parseInt(match[1], 10) : 0;
      })
    );
    setIdCounter('tolerance-override', maxId);
  }
  return collection;
}

function saveToleranceOverrides(
  projectId: string,
  collection: ToleranceOverridesCollection
): void {
  const path = getToleranceOverridesPath(projectId);
  collection.meta.lastUpdated = new Date().toISOString();
  collection.meta.totalOverrides = collection.overrides.length;

  // Rebuild indexes
  const byType: Record<string, string[]> = {};
  const byVoxel: Record<string, string[]> = {};
  const byStatus: Record<string, string[]> = {};

  for (const o of collection.overrides) {
    if (!byType[o.toleranceType]) {
      byType[o.toleranceType] = [];
    }
    byType[o.toleranceType].push(o.overrideId);

    const voxelId = parseURN(o.voxelRef)?.identifier;
    if (voxelId) {
      if (!byVoxel[voxelId]) {
        byVoxel[voxelId] = [];
      }
      byVoxel[voxelId].push(o.overrideId);
    }

    if (!byStatus[o.status]) {
      byStatus[o.status] = [];
    }
    byStatus[o.status].push(o.overrideId);
  }

  collection.indexes = {
    byType,
    byVoxel,
    byStatus,
  } as ToleranceOverridesCollection['indexes'];
  ensureProjectDir(projectId);
  writeFileSync(path, JSON.stringify(collection, null, 2));
}

// --- Voxels Storage (NEW M2) ---

function loadVoxels(projectId: string): VoxelsCollection {
  const path = getVoxelsPath(projectId);

  if (!existsSync(path)) {
    const initial: VoxelsCollection = {
      $schema: 'https://luhtech.dev/schemas/pm/voxels-collection.json',
      $id: buildFileURN(projectId, 'voxels'),
      schemaVersion: '3.0.0',
      meta: {
        projectId,
        sourceOfTruth: `.roadmap/projects/${projectId}/voxels.json`,
        lastUpdated: new Date().toISOString(),
        totalVoxels: 0,
      },
      indexes: {
        byStatus: {} as Record<VoxelStatus, string[]>,
        byLevel: {},
        byZone: {},
      },
      voxels: [],
    };
    ensureProjectDir(projectId);
    writeFileSync(path, JSON.stringify(initial, null, 2));
    return initial;
  }

  return JSON.parse(readFileSync(path, 'utf-8'));
}

function saveVoxels(projectId: string, collection: VoxelsCollection): void {
  const path = getVoxelsPath(projectId);
  collection.meta.lastUpdated = new Date().toISOString();
  collection.meta.totalVoxels = collection.voxels.length;
  ensureProjectDir(projectId);
  writeFileSync(path, JSON.stringify(collection, null, 2));
}

// ============================================================================
// Tool Definition Interface
// ============================================================================

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    required: string[];
    properties: Record<string, unknown>;
  };
  handler: (args: Record<string, unknown>) => Promise<PMToolResult<unknown>>;
}

// ============================================================================
// Decision Management Tools (6)
// ============================================================================

const captureDecisionTool: MCPToolDefinition = {
  name: 'capture_decision',
  description: 'Create a new PM decision attached to a voxel location',
  inputSchema: {
    type: 'object',
    required: ['projectId', 'voxelId', 'title', 'type'],
    properties: {
      projectId: { type: 'string', description: 'Project identifier' },
      voxelId: {
        type: 'string',
        pattern: '^VOX-[A-Z0-9-]+$',
        description: 'Voxel ID',
      },
      title: { type: 'string', minLength: 5, maxLength: 200 },
      type: {
        enum: ['APPROVAL', 'REJECTION', 'DEFERRAL', 'ESCALATION', 'PROPOSAL'],
      },
      description: { type: 'string', maxLength: 5000 },
      budgetImpact: { type: 'number', description: 'USD' },
      scheduleImpactHours: { type: 'number' },
      varianceInches: { type: 'number' },
      isSafetyIssue: { type: 'boolean', default: false },
      isDesignChange: { type: 'boolean', default: false },
      requestedBy: { type: 'string' },
    },
  },
  handler: async (args): Promise<PMToolResult<PMDecision>> => {
    const startTime = Date.now();
    try {
      const input = args as unknown as CaptureDecisionInput;
      const requiredAuthority = calculateRequiredAuthority({
        budgetImpact: input.budgetImpact,
        scheduleImpactHours: input.scheduleImpactHours,
        varianceInches: input.varianceInches,
        isSafetyIssue: input.isSafetyIssue,
        isDesignChange: input.isDesignChange,
      });

      const decisionId = generateDecisionId();
      const decisionURN = buildURN(input.projectId, 'pm-decision', decisionId);
      const voxelURN = buildURN(input.projectId, 'voxel', input.voxelId);
      const now = new Date().toISOString();

      const decision: PMDecision = {
        $id: decisionURN,
        $schema: 'https://luhtech.dev/schemas/pm/decision.schema.json',
        schemaVersion: '3.0.0',
        meta: {
          projectId: input.projectId,
          sourceOfTruth: `.roadmap/projects/${input.projectId}/decisions.json`,
          lastUpdated: now,
          syncStatus: { syncDirection: 'v3-is-source-of-truth' },
        },
        decisionId,
        title: input.title,
        description: input.description,
        type: input.type,
        status: 'PENDING',
        authorityLevel: {
          required: requiredAuthority,
          current: 0 as AuthorityLevel,
        },
        voxelRef: voxelURN,
        voxelContext: { voxelId: input.voxelId },
        budgetImpact: input.budgetImpact
          ? { estimated: input.budgetImpact, currency: 'USD' }
          : undefined,
        scheduleImpact: input.scheduleImpactHours
          ? {
              delayDays: Math.ceil(input.scheduleImpactHours / 24),
              criticalPath: input.scheduleImpactHours > 168,
            }
          : undefined,
        participants: input.requestedBy
          ? {
              requestedBy: buildURN(
                input.projectId,
                'participant',
                input.requestedBy
              ),
            }
          : undefined,
        createdAt: now,
        updatedAt: now,
        graphMetadata: createGraphMetadata(
          [voxelURN],
          [],
          [
            {
              from: voxelURN,
              to: decisionURN,
              type: 'contains',
              label: 'Decision attached to voxel',
            },
          ]
        ),
      };

      // Phase 4: Calculate projected USF impact
      const usfProjection = calculateProjectedUSFImpact(decision);

      // Add USF impact to decision if significant
      if (usfProjection.severity !== 'minor') {
        decision.usfImpact = usfProjection.impact;

        // Adjust authority level if USF impact is significant
        const usfAuthorityAdjustment =
          calculateUSFAuthorityAdjustment(decision);
        if (usfAuthorityAdjustment.adjustment > 0) {
          decision.authorityLevel.required = Math.min(
            6,
            requiredAuthority + usfAuthorityAdjustment.adjustment
          ) as AuthorityLevel;
        }
      }

      const collection = loadDecisions(input.projectId);
      collection.decisions.push(decision);
      saveDecisions(input.projectId, collection);

      // Phase 4: Log USF impact if significant
      if (usfProjection.severity !== 'minor') {
        console.log(
          `[USF] Decision ${decisionId} captured with ${usfProjection.severity} USF impact. ` +
            `Authority adjusted from ${requiredAuthority} to ${decision.authorityLevel.required}.`
        );
      }

      return {
        success: true,
        data: decision,
        metadata: {
          duration: Date.now() - startTime,
          timestamp: now,
          usfProjection, // Phase 4: Include USF projection in metadata
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'CAPTURE_DECISION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    }
  },
};

const routeDecisionTool: MCPToolDefinition = {
  name: 'route_decision',
  description: 'Route a decision to the appropriate authority level',
  inputSchema: {
    type: 'object',
    required: ['projectId', 'decisionId'],
    properties: {
      projectId: { type: 'string' },
      decisionId: { type: 'string', pattern: '^DEC-\\d{4}-\\d{4}$' },
      targetAuthorityLevel: { type: 'number', minimum: 0, maximum: 6 },
      note: { type: 'string' },
    },
  },
  handler: async (args): Promise<PMToolResult<PMDecision>> => {
    const startTime = Date.now();
    try {
      const input = args as unknown as RouteDecisionInput;
      const collection = loadDecisions(input.projectId);
      const idx = collection.decisions.findIndex(
        (d) => d.decisionId === input.decisionId
      );
      if (idx === -1) {
        return {
          success: false,
          error: {
            code: 'DECISION_NOT_FOUND',
            message: `Decision ${input.decisionId} not found`,
          },
          metadata: {
            duration: Date.now() - startTime,
            timestamp: new Date().toISOString(),
          },
        };
      }

      const decision = collection.decisions[idx];
      const routing = routeDecisionLogic(
        decision,
        decision.authorityLevel.current
      );

      // Phase 4: Get USF escalation recommendation
      const usfEscalation = getUSFEscalationRecommendation(
        decision,
        decision.authorityLevel.current
      );

      // Use USF-recommended authority if higher than routing
      const targetAuthority = Math.max(
        input.targetAuthorityLevel ?? routing.targetLevel,
        usfEscalation.shouldEscalate ? usfEscalation.recommendedAuthority : 0
      ) as AuthorityLevel;

      decision.authorityLevel.current = targetAuthority;
      decision.updatedAt = new Date().toISOString();
      collection.decisions[idx] = decision;
      saveDecisions(input.projectId, collection);

      // Phase 4: Get USF provider recommendations
      const providerRecommendations = getUSFProviderRecommendations(
        input.projectId,
        {
          minQuality: 0.75,
          budgetAmount: decision.budgetImpact?.estimated,
        },
        3
      );

      // Log USF escalation if triggered
      if (usfEscalation.shouldEscalate) {
        console.log(
          `[USF] Decision ${input.decisionId} routing adjusted for USF impact. ` +
            `Authority: ${targetAuthority}. Reasons: ${usfEscalation.reasons.join('; ')}`
        );
      }

      return {
        success: true,
        data: decision,
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          usfEscalation, // Phase 4: Include USF escalation recommendation
          providerRecommendations: providerRecommendations.map((r) => ({
            providerUrn: r.providerUrn,
            matchScore: r.matchScore,
            reason: r.reason,
            recommendedTier: r.recommendedTier,
            riskLevel: r.riskLevel,
          })),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'ROUTE_DECISION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    }
  },
};

const approveDecisionTool: MCPToolDefinition = {
  name: 'approve_decision',
  description: 'Approve a PM decision',
  inputSchema: {
    type: 'object',
    required: ['projectId', 'decisionId', 'approverId'],
    properties: {
      projectId: { type: 'string' },
      decisionId: { type: 'string', pattern: '^DEC-\\d{4}-\\d{4}$' },
      approverId: { type: 'string' },
      comment: { type: 'string' },
    },
  },
  handler: async (args): Promise<PMToolResult<PMDecision>> => {
    const startTime = Date.now();
    try {
      const input = args as unknown as ApproveDecisionInput;
      const collection = loadDecisions(input.projectId);
      const idx = collection.decisions.findIndex(
        (d) => d.decisionId === input.decisionId
      );
      if (idx === -1) {
        return {
          success: false,
          error: {
            code: 'DECISION_NOT_FOUND',
            message: `Decision ${input.decisionId} not found`,
          },
          metadata: {
            duration: Date.now() - startTime,
            timestamp: new Date().toISOString(),
          },
        };
      }

      const decision = collection.decisions[idx];
      if (decision.status === 'APPROVED') {
        return {
          success: false,
          error: {
            code: 'ALREADY_APPROVED',
            message: `Decision ${input.decisionId} is already approved`,
          },
          metadata: {
            duration: Date.now() - startTime,
            timestamp: new Date().toISOString(),
          },
        };
      }

      const now = new Date().toISOString();
      const approverURN = buildURN(
        input.projectId,
        'participant',
        input.approverId
      );
      decision.status = 'APPROVED';
      decision.updatedAt = now;
      decision.participants = {
        ...decision.participants,
        approvedBy: approverURN,
      };
      decision.graphMetadata = addOutEdge(decision.graphMetadata, approverURN);

      // Phase 4: Calculate final USF impact for approved decision
      const usfProjection = calculateProjectedUSFImpact(decision);
      if (!decision.usfImpact) {
        decision.usfImpact = usfProjection.impact;
      }

      collection.decisions[idx] = decision;
      saveDecisions(input.projectId, collection);

      // Phase 4: Emit USF decision outcome event
      let usfEventResults;
      try {
        const usfEvent: DecisionOutcomeEvent = {
          type: USFEventType.DECISION_APPROVED,
          timestamp: now,
          projectId: input.projectId,
          sourceUrn: decision.$id,
          decisionId: input.decisionId,
          decision,
          usfImpact: {
            qualityImpact: usfProjection.impact.qualityImpact,
            costImpact: usfProjection.impact.costImpact,
            scheduleImpact: usfProjection.impact.scheduleImpact,
            impactReason: usfProjection.impact.impactReason,
          },
        };

        usfEventResults = await emitUSFEvent(usfEvent);
        console.log(
          `[USF] Decision ${input.decisionId} approved. USF impact: ` +
            `Q=${(usfProjection.impact.qualityImpact * 100).toFixed(1)}%, ` +
            `C=${(usfProjection.impact.costImpact * 100).toFixed(1)}%, ` +
            `S=${(usfProjection.impact.scheduleImpact * 100).toFixed(1)}%`
        );
      } catch (usfError) {
        console.warn(
          `[USF] Failed to emit decision approval event: ${usfError instanceof Error ? usfError.message : 'Unknown error'}`
        );
      }

      return {
        success: true,
        data: decision,
        metadata: {
          duration: Date.now() - startTime,
          timestamp: now,
          usfProjection,
          usfEventResults,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'APPROVE_DECISION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    }
  },
};

const rejectDecisionTool: MCPToolDefinition = {
  name: 'reject_decision',
  description: 'Reject a PM decision with rationale',
  inputSchema: {
    type: 'object',
    required: ['projectId', 'decisionId', 'rejectorId', 'reason'],
    properties: {
      projectId: { type: 'string' },
      decisionId: { type: 'string', pattern: '^DEC-\\d{4}-\\d{4}$' },
      rejectorId: { type: 'string' },
      reason: { type: 'string', minLength: 10 },
    },
  },
  handler: async (args): Promise<PMToolResult<PMDecision>> => {
    const startTime = Date.now();
    try {
      const input = args as unknown as RejectDecisionInput;
      const collection = loadDecisions(input.projectId);
      const idx = collection.decisions.findIndex(
        (d) => d.decisionId === input.decisionId
      );
      if (idx === -1) {
        return {
          success: false,
          error: {
            code: 'DECISION_NOT_FOUND',
            message: `Decision ${input.decisionId} not found`,
          },
          metadata: {
            duration: Date.now() - startTime,
            timestamp: new Date().toISOString(),
          },
        };
      }

      const decision = collection.decisions[idx];
      const now = new Date().toISOString();
      const rejectorURN = buildURN(
        input.projectId,
        'participant',
        input.rejectorId
      );
      decision.status = 'REJECTED';
      decision.updatedAt = now;
      decision.description = `${decision.description || ''}\n\n**Rejection Reason:** ${input.reason}`;
      decision.participants = {
        ...decision.participants,
        rejectedBy: rejectorURN,
      };
      decision.graphMetadata = addOutEdge(decision.graphMetadata, rejectorURN);

      // Phase 4: Calculate USF impact for rejected decision
      const usfProjection = calculateProjectedUSFImpact(decision);
      if (!decision.usfImpact) {
        decision.usfImpact = usfProjection.impact;
      }

      collection.decisions[idx] = decision;
      saveDecisions(input.projectId, collection);

      // Phase 4: Emit USF decision rejection event
      let usfEventResults;
      try {
        const usfEvent: DecisionOutcomeEvent = {
          type: USFEventType.DECISION_REJECTED,
          timestamp: now,
          projectId: input.projectId,
          sourceUrn: decision.$id,
          decisionId: input.decisionId,
          decision,
          usfImpact: {
            qualityImpact: usfProjection.impact.qualityImpact,
            costImpact: usfProjection.impact.costImpact,
            scheduleImpact: usfProjection.impact.scheduleImpact,
            impactReason: `Rejected: ${input.reason}`,
          },
        };

        usfEventResults = await emitUSFEvent(usfEvent);
        console.log(
          `[USF] Decision ${input.decisionId} rejected. USF impact recorded.`
        );
      } catch (usfError) {
        console.warn(
          `[USF] Failed to emit decision rejection event: ${usfError instanceof Error ? usfError.message : 'Unknown error'}`
        );
      }

      return {
        success: true,
        data: decision,
        metadata: {
          duration: Date.now() - startTime,
          timestamp: now,
          usfProjection,
          usfEventResults,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'REJECT_DECISION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    }
  },
};

const escalateDecisionTool: MCPToolDefinition = {
  name: 'escalate_decision',
  description: 'Escalate a decision to higher authority',
  inputSchema: {
    type: 'object',
    required: ['projectId', 'decisionId', 'escalatedBy', 'reason'],
    properties: {
      projectId: { type: 'string' },
      decisionId: { type: 'string', pattern: '^DEC-\\d{4}-\\d{4}$' },
      escalatedBy: { type: 'string' },
      targetLevel: { type: 'number', minimum: 0, maximum: 6 },
      reason: { type: 'string', minLength: 10 },
    },
  },
  handler: async (args): Promise<PMToolResult<PMDecision>> => {
    const startTime = Date.now();
    try {
      const input = args as unknown as EscalateDecisionInput;
      const collection = loadDecisions(input.projectId);
      const idx = collection.decisions.findIndex(
        (d) => d.decisionId === input.decisionId
      );
      if (idx === -1) {
        return {
          success: false,
          error: {
            code: 'DECISION_NOT_FOUND',
            message: `Decision ${input.decisionId} not found`,
          },
          metadata: {
            duration: Date.now() - startTime,
            timestamp: new Date().toISOString(),
          },
        };
      }

      const decision = collection.decisions[idx];
      const currentLevel = decision.authorityLevel.current;
      const targetLevel =
        input.targetLevel ?? getNextAuthority(currentLevel) ?? currentLevel;
      if (targetLevel <= currentLevel) {
        return {
          success: false,
          error: {
            code: 'INVALID_ESCALATION',
            message: 'Cannot escalate to same or lower level',
          },
          metadata: {
            duration: Date.now() - startTime,
            timestamp: new Date().toISOString(),
          },
        };
      }

      const now = new Date().toISOString();
      const escalatorURN = buildURN(
        input.projectId,
        'participant',
        input.escalatedBy
      );
      decision.type = 'ESCALATION';
      decision.authorityLevel.current = targetLevel as AuthorityLevel;
      decision.updatedAt = now;
      decision.description = `${decision.description || ''}\n\n**Escalation Reason:** ${input.reason}`;
      decision.participants = {
        ...decision.participants,
        escalatedTo: escalatorURN,
      };
      decision.graphMetadata = addOutEdge(decision.graphMetadata, escalatorURN);
      collection.decisions[idx] = decision;
      saveDecisions(input.projectId, collection);

      return {
        success: true,
        data: decision,
        metadata: { duration: Date.now() - startTime, timestamp: now },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'ESCALATE_DECISION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    }
  },
};

const queryDecisionHistoryTool: MCPToolDefinition = {
  name: 'query_decision_history',
  description: 'Query decisions by voxel, project, status, or authority level',
  inputSchema: {
    type: 'object',
    required: ['projectId'],
    properties: {
      projectId: { type: 'string' },
      voxelId: { type: 'string' },
      status: {
        enum: ['PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED', 'EXPIRED'],
      },
      authorityLevel: { type: 'number', minimum: 0, maximum: 6 },
      fromDate: { type: 'string', format: 'date-time' },
      toDate: { type: 'string', format: 'date-time' },
      limit: { type: 'number', default: 50 },
    },
  },
  handler: async (args): Promise<PMToolResult<PMDecision[]>> => {
    const startTime = Date.now();
    try {
      const input = args as unknown as QueryDecisionHistoryInput;
      const collection = loadDecisions(input.projectId);
      let results = collection.decisions;

      if (input.voxelId) {
        const voxelUrn = buildURN(input.projectId, 'voxel', input.voxelId);
        results = results.filter((d) => d.voxelRef === voxelUrn);
      }
      if (input.status) {
        results = results.filter((d) => d.status === input.status);
      }
      if (input.authorityLevel !== undefined) {
        results = results.filter(
          (d) => d.authorityLevel.required === input.authorityLevel
        );
      }
      if (input.fromDate) {
        results = results.filter(
          (d) => new Date(d.createdAt) >= new Date(input.fromDate!)
        );
      }
      if (input.toDate) {
        results = results.filter(
          (d) => new Date(d.createdAt) <= new Date(input.toDate!)
        );
      }
      results = results.slice(0, input.limit ?? 50);

      return {
        success: true,
        data: results,
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'QUERY_DECISION_HISTORY_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    }
  },
};

// ============================================================================
// Authority & Graph Tools (3)
// ============================================================================

const getAuthorityGraphTool: MCPToolDefinition = {
  name: 'get_authority_graph',
  description: 'Get the authority cascade configuration',
  inputSchema: {
    type: 'object',
    required: [],
    properties: { projectId: { type: 'string' } },
  },
  handler: async (): Promise<
    PMToolResult<{ levels: AuthorityThresholds[] }>
  > => {
    const startTime = Date.now();
    try {
      return {
        success: true,
        data: { levels: getAuthorityCascade() },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'GET_AUTHORITY_GRAPH_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    }
  },
};

const findDecisionAuthorityTool: MCPToolDefinition = {
  name: 'find_decision_authority',
  description: 'Calculate required authority level for given impacts',
  inputSchema: {
    type: 'object',
    required: [],
    properties: {
      budgetImpact: { type: 'number' },
      scheduleImpactHours: { type: 'number' },
      varianceInches: { type: 'number' },
      isSafetyIssue: { type: 'boolean' },
      isDesignChange: { type: 'boolean' },
    },
  },
  handler: async (args): Promise<PMToolResult<FindDecisionAuthorityResult>> => {
    const startTime = Date.now();
    try {
      const result = findAuthority(args as Parameters<typeof findAuthority>[0]);
      return {
        success: true,
        data: result,
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'FIND_DECISION_AUTHORITY_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    }
  },
};

const validateAuthorityLevelTool: MCPToolDefinition = {
  name: 'validate_authority_level',
  description: 'Validate if a participant can approve a decision',
  inputSchema: {
    type: 'object',
    required: ['participantLevel', 'requiredLevel'],
    properties: {
      participantLevel: { type: 'number', minimum: 0, maximum: 6 },
      requiredLevel: { type: 'number', minimum: 0, maximum: 6 },
    },
  },
  handler: async (args): Promise<PMToolResult<ValidateAuthorityResult>> => {
    const startTime = Date.now();
    try {
      const { participantLevel, requiredLevel } = args as {
        participantLevel: AuthorityLevel;
        requiredLevel: AuthorityLevel;
      };
      const result = validateAuthLevel(participantLevel, requiredLevel);
      return {
        success: true,
        data: result,
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'VALIDATE_AUTHORITY_LEVEL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    }
  },
};

// ============================================================================
// Voxel Operations Tools (3)
// ============================================================================

const attachDecisionToVoxelTool: MCPToolDefinition = {
  name: 'attach_decision_to_voxel',
  description: 'Link an existing decision to a different voxel',
  inputSchema: {
    type: 'object',
    required: ['projectId', 'decisionId', 'voxelId'],
    properties: {
      projectId: { type: 'string' },
      decisionId: { type: 'string', pattern: '^DEC-\\d{4}-\\d{4}$' },
      voxelId: { type: 'string', pattern: '^VOX-[A-Z0-9-]+$' },
    },
  },
  handler: async (args): Promise<PMToolResult<PMDecision>> => {
    const startTime = Date.now();
    try {
      const { projectId, decisionId, voxelId } = args as {
        projectId: string;
        decisionId: string;
        voxelId: string;
      };
      const collection = loadDecisions(projectId);
      const idx = collection.decisions.findIndex(
        (d) => d.decisionId === decisionId
      );
      if (idx === -1) {
        return {
          success: false,
          error: {
            code: 'DECISION_NOT_FOUND',
            message: `Decision ${decisionId} not found`,
          },
          metadata: {
            duration: Date.now() - startTime,
            timestamp: new Date().toISOString(),
          },
        };
      }

      const decision = collection.decisions[idx];
      const newVoxelURN = buildURN(projectId, 'voxel', voxelId);
      decision.voxelRef = newVoxelURN;
      decision.voxelContext = { voxelId };
      decision.updatedAt = new Date().toISOString();
      decision.graphMetadata.inEdges = [newVoxelURN];
      collection.decisions[idx] = decision;
      saveDecisions(projectId, collection);

      return {
        success: true,
        data: decision,
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'ATTACH_DECISION_TO_VOXEL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    }
  },
};

const getVoxelDecisionsTool: MCPToolDefinition = {
  name: 'get_voxel_decisions',
  description: 'Get all decisions attached to a voxel',
  inputSchema: {
    type: 'object',
    required: ['projectId', 'voxelId'],
    properties: {
      projectId: { type: 'string' },
      voxelId: { type: 'string', pattern: '^VOX-[A-Z0-9-]+$' },
      status: {
        enum: ['PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED', 'EXPIRED'],
      },
    },
  },
  handler: async (args): Promise<PMToolResult<PMDecision[]>> => {
    const startTime = Date.now();
    try {
      const input = args as unknown as GetVoxelDecisionsInput;
      const collection = loadDecisions(input.projectId);
      const voxelUrn = buildURN(input.projectId, 'voxel', input.voxelId);
      let results = collection.decisions.filter((d) => d.voxelRef === voxelUrn);
      if (input.status) {
        results = results.filter((d) => d.status === input.status);
      }

      return {
        success: true,
        data: results,
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'GET_VOXEL_DECISIONS_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    }
  },
};

// NEW M2: navigate_decision_surface
const navigateDecisionSurfaceTool: MCPToolDefinition = {
  name: 'navigate_decision_surface',
  description:
    'Navigate the decision surface from a starting voxel, finding connected decisions and alerts',
  inputSchema: {
    type: 'object',
    required: ['projectId', 'startVoxelId'],
    properties: {
      projectId: { type: 'string', description: 'Project identifier' },
      startVoxelId: {
        type: 'string',
        pattern: '^VOX-[A-Z0-9-]+$',
        description: 'Starting voxel ID',
      },
      direction: {
        type: 'string',
        enum: ['up', 'down', 'north', 'south', 'east', 'west', 'adjacent'],
        default: 'adjacent',
        description: 'Navigation direction',
      },
      maxDepth: {
        type: 'number',
        minimum: 1,
        maximum: 10,
        default: 3,
        description: 'Maximum traversal depth',
      },
      filterTrades: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by trade types',
      },
    },
  },
  handler: async (
    args
  ): Promise<
    PMToolResult<{
      path: Array<{ urn: PMURN; voxelId: string }>;
      decisions: PMDecision[];
      alerts: VoxelAlert[];
      graph: { nodes: GraphNode[]; edges: GraphEdge[] };
    }>
  > => {
    const startTime = Date.now();
    try {
      const input = args as unknown as NavigateDecisionSurfaceInput;
      const decisionsCollection = loadDecisions(input.projectId);
      const voxelsCollection = loadVoxels(input.projectId);

      const maxDepth = input.maxDepth ?? 3;

      // Build traversal path
      const visited = new Set<string>();
      const path: Array<{ urn: PMURN; voxelId: string }> = [];
      const collectedDecisions: PMDecision[] = [];
      const alerts: VoxelAlert[] = [];
      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];

      // BFS traversal
      const queue: Array<{ voxelId: string; depth: number }> = [
        { voxelId: input.startVoxelId, depth: 0 },
      ];

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current.voxelId) || current.depth > maxDepth) {
          continue;
        }

        visited.add(current.voxelId);
        const voxelURN = buildURN(input.projectId, 'voxel', current.voxelId);
        path.push({ urn: voxelURN, voxelId: current.voxelId });

        // Add node to graph
        nodes.push({
          urn: voxelURN,
          nodeType: 'voxel',
          label: current.voxelId,
        });

        // Find decisions for this voxel
        const voxelDecisions = decisionsCollection.decisions.filter(
          (d) => d.voxelRef === voxelURN
        );

        // Filter by trades if specified
        const filteredDecisions = input.filterTrades?.length
          ? voxelDecisions.filter((d) => {
              const trade = d.voxelContext?.system;
              return trade && input.filterTrades!.includes(trade);
            })
          : voxelDecisions;

        collectedDecisions.push(...filteredDecisions);

        // Add decision nodes and edges
        for (const decision of filteredDecisions) {
          nodes.push({
            urn: decision.$id,
            nodeType: 'pm-decision',
            label: decision.title,
            data: { status: decision.status, type: decision.type },
          });
          edges.push({
            from: voxelURN,
            to: decision.$id,
            type: 'contains',
            label: 'contains decision',
          });

          // Create alerts for pending decisions
          if (decision.status === 'PENDING') {
            alerts.push({
              alertId: `alert-${decision.decisionId}`,
              voxelUrn: voxelURN,
              decisionUrn: decision.$id,
              alertType: 'DECISION_PENDING',
              severity:
                decision.authorityLevel.required >= 3 ? 'HIGH' : 'MEDIUM',
              message: `Pending decision: ${decision.title}`,
              createdAt: new Date().toISOString(),
            });
          }
        }

        // Find adjacent voxels for next iteration
        const currentVoxel = voxelsCollection.voxels.find(
          (v) => v.voxelId === current.voxelId
        );
        if (currentVoxel?.adjacentVoxels && current.depth < maxDepth) {
          for (const adjURN of currentVoxel.adjacentVoxels) {
            const adjId = parseURN(adjURN)?.identifier;
            if (adjId && !visited.has(adjId)) {
              queue.push({ voxelId: adjId, depth: current.depth + 1 });
              edges.push({
                from: voxelURN,
                to: adjURN,
                type: 'adjacent-to',
                label: 'adjacent',
              });
            }
          }
        }
      }

      return {
        success: true,
        data: {
          path,
          decisions: collectedDecisions,
          alerts,
          graph: { nodes, edges },
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NAVIGATE_DECISION_SURFACE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    }
  },
};

// Legacy: query_voxels_by_status (kept for backward compatibility)
const queryVoxelsByStatusTool: MCPToolDefinition = {
  name: 'query_voxels_by_status',
  description:
    'Query voxels by completion status (returns voxel IDs from decisions)',
  inputSchema: {
    type: 'object',
    required: ['projectId'],
    properties: {
      projectId: { type: 'string' },
      status: { enum: ['PENDING', 'APPROVED', 'REJECTED'] },
      level: { type: 'string' },
      zone: { type: 'string' },
    },
  },
  handler: async (args): Promise<PMToolResult<string[]>> => {
    const startTime = Date.now();
    try {
      const { projectId, status } = args as {
        projectId: string;
        status?: PMDecisionStatus;
      };
      const collection = loadDecisions(projectId);
      let decisions = collection.decisions;
      if (status) {
        decisions = decisions.filter((d) => d.status === status);
      }

      const voxelIds = [
        ...new Set(
          decisions.map((d) => parseURN(d.voxelRef)?.identifier).filter(Boolean)
        ),
      ] as string[];
      return {
        success: true,
        data: voxelIds,
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'QUERY_VOXELS_BY_STATUS_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    }
  },
};

// ============================================================================
// Tolerance Management Tools (2) - NEW M2
// ============================================================================

const applyToleranceOverrideTool: MCPToolDefinition = {
  name: 'apply_tolerance_override',
  description:
    'Create a pre-approved tolerance variance for a voxel location. Requires authority level 2+.',
  inputSchema: {
    type: 'object',
    required: [
      'projectId',
      'voxelId',
      'toleranceType',
      'standardValue',
      'approvedValue',
      'rationale',
      'sourceDecisionId',
    ],
    properties: {
      projectId: { type: 'string', description: 'Project identifier' },
      voxelId: {
        type: 'string',
        pattern: '^VOX-[A-Z0-9-]+$',
        description: 'Voxel ID',
      },
      toleranceType: {
        type: 'string',
        enum: [
          'WALL_FLATNESS',
          'CEILING_HEIGHT',
          'FLOOR_LEVEL',
          'PROTRUSION',
          'GAP',
          'ALIGNMENT',
          'FINISH_QUALITY',
          'EQUIPMENT_CLEARANCE',
          'PIPE_SLOPE',
          'DUCT_SIZE',
        ],
        description: 'Type of tolerance override',
      },
      standardValue: {
        type: 'object',
        properties: {
          value: { type: 'number' },
          unit: { type: 'string' },
          tolerance: { type: 'number' },
        },
        required: ['value', 'unit', 'tolerance'],
        description: 'Standard specification value',
      },
      approvedValue: {
        type: 'object',
        properties: {
          value: { type: 'number' },
          unit: { type: 'string' },
          tolerance: { type: 'number' },
        },
        required: ['value', 'unit', 'tolerance'],
        description: 'Approved variance value',
      },
      rationale: {
        type: 'string',
        minLength: 10,
        description: 'Justification for variance',
      },
      sourceDecisionId: {
        type: 'string',
        pattern: '^DEC-\\d{4}-\\d{4}$',
        description: 'Source decision ID',
      },
      applicableTrades: {
        type: 'array',
        items: { type: 'string' },
        description: 'Applicable trade types',
      },
      expiresAt: {
        type: 'string',
        format: 'date-time',
        description: 'Optional expiration date',
      },
    },
  },
  handler: async (
    args
  ): Promise<
    PMToolResult<{
      override: ToleranceOverride;
      voxel: Voxel;
      alertsCreated: VoxelAlert[];
    }>
  > => {
    const startTime = Date.now();
    try {
      const input = args as unknown as ApplyToleranceOverrideInput;

      // Authority validation: requires level 2+ (SUPERINTENDENT or higher)
      // In production, this would check the caller's authority level

      const overrideId = generateToleranceOverrideId();
      const overrideURN = buildURN(
        input.projectId,
        'tolerance-override',
        overrideId
      );
      const voxelURN = buildURN(input.projectId, 'voxel', input.voxelId);
      const decisionURN = buildURN(
        input.projectId,
        'pm-decision',
        input.sourceDecisionId
      );
      const now = new Date().toISOString();

      const override: ToleranceOverride = {
        $id: overrideURN,
        $schema:
          'https://luhtech.dev/schemas/pm/tolerance-override.schema.json',
        schemaVersion: '3.0.0',
        overrideId,
        toleranceType: input.toleranceType,
        voxelRef: voxelURN,
        standardValue: input.standardValue,
        approvedValue: input.approvedValue,
        rationale: input.rationale,
        sourceDecision: decisionURN,
        applicableTrades: input.applicableTrades,
        expiresAt: input.expiresAt,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
        graphMetadata: createGraphMetadata(
          [decisionURN, voxelURN],
          [],
          [
            {
              from: decisionURN,
              to: overrideURN,
              type: 'triggers',
              label: 'Decision created tolerance override',
            },
            {
              from: overrideURN,
              to: voxelURN,
              type: 'affects',
              label: 'Override applies to voxel',
            },
          ]
        ),
      };

      // Save override
      const overridesCollection = loadToleranceOverrides(input.projectId);
      overridesCollection.overrides.push(override);
      saveToleranceOverrides(input.projectId, overridesCollection);

      // Load or create voxel
      const voxelsCollection = loadVoxels(input.projectId);
      let voxel = voxelsCollection.voxels.find(
        (v) => v.voxelId === input.voxelId
      );

      if (!voxel) {
        // Create placeholder voxel
        voxel = {
          $id: voxelURN,
          $schema: 'https://luhtech.dev/schemas/pm/voxel.schema.json',
          schemaVersion: '3.0.0',
          voxelId: input.voxelId,
          coordinates: { x: 0, y: 0, z: 0 },
          status: 'IN_PROGRESS',
          graphMetadata: createGraphMetadata([overrideURN], []),
        };
        voxelsCollection.voxels.push(voxel);
      } else {
        // Update existing voxel
        voxel.graphMetadata.inEdges.push(overrideURN);
      }
      saveVoxels(input.projectId, voxelsCollection);

      // Create alert for the override
      const alertsCreated: VoxelAlert[] = [
        {
          alertId: `alert-tol-${overrideId}`,
          voxelUrn: voxelURN,
          decisionUrn: decisionURN,
          alertType: 'TOLERANCE_EXCEEDED',
          severity: 'MEDIUM',
          message: `Tolerance override applied: ${input.toleranceType} - ${input.rationale.substring(0, 50)}...`,
          createdAt: now,
        },
      ];

      return {
        success: true,
        data: {
          override,
          voxel,
          alertsCreated,
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: now,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'APPLY_TOLERANCE_OVERRIDE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    }
  },
};

const queryToleranceOverridesTool: MCPToolDefinition = {
  name: 'query_tolerance_overrides',
  description: 'Query tolerance overrides by voxel, type, trade, or status',
  inputSchema: {
    type: 'object',
    required: ['projectId'],
    properties: {
      projectId: { type: 'string', description: 'Project identifier' },
      voxelId: {
        type: 'string',
        pattern: '^VOX-[A-Z0-9-]+$',
        description: 'Filter by voxel ID',
      },
      toleranceType: {
        type: 'string',
        enum: [
          'WALL_FLATNESS',
          'CEILING_HEIGHT',
          'FLOOR_LEVEL',
          'PROTRUSION',
          'GAP',
          'ALIGNMENT',
          'FINISH_QUALITY',
          'EQUIPMENT_CLEARANCE',
          'PIPE_SLOPE',
          'DUCT_SIZE',
        ],
        description: 'Filter by tolerance type',
      },
      applicableTrade: {
        type: 'string',
        description: 'Filter by applicable trade',
      },
      includeExpired: {
        type: 'boolean',
        default: false,
        description: 'Include expired overrides',
      },
    },
  },
  handler: async (
    args
  ): Promise<
    PMToolResult<{
      overrides: ToleranceOverride[];
      total: number;
      byType: Record<ToleranceType, number>;
    }>
  > => {
    const startTime = Date.now();
    try {
      const input = args as unknown as QueryToleranceOverridesInput;
      const collection = loadToleranceOverrides(input.projectId);
      let results = collection.overrides;

      // Filter by voxel
      if (input.voxelId) {
        const voxelURN = buildURN(input.projectId, 'voxel', input.voxelId);
        results = results.filter((o) => o.voxelRef === voxelURN);
      }

      // Filter by tolerance type
      if (input.toleranceType) {
        results = results.filter(
          (o) => o.toleranceType === input.toleranceType
        );
      }

      // Filter by trade
      if (input.applicableTrade) {
        results = results.filter((o) =>
          o.applicableTrades?.includes(input.applicableTrade!)
        );
      }

      // Filter expired unless explicitly included
      if (!input.includeExpired) {
        const now = new Date();
        results = results.filter((o) => {
          if (o.status === 'EXPIRED' || o.status === 'REVOKED') {
            return false;
          }
          if (o.expiresAt && new Date(o.expiresAt) < now) {
            return false;
          }
          return true;
        });
      }

      // Calculate counts by type
      const byType: Record<string, number> = {};
      for (const o of results) {
        byType[o.toleranceType] = (byType[o.toleranceType] || 0) + 1;
      }

      return {
        success: true,
        data: {
          overrides: results,
          total: results.length,
          byType: byType as Record<ToleranceType, number>,
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'QUERY_TOLERANCE_OVERRIDES_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    }
  },
};

// ============================================================================
// Consequence & Inspection Tools (3)
// ============================================================================

const trackConsequenceTool: MCPToolDefinition = {
  name: 'track_consequence',
  description: 'Create a consequence record linked to a decision',
  inputSchema: {
    type: 'object',
    required: ['projectId', 'decisionId', 'category', 'severity'],
    properties: {
      projectId: { type: 'string' },
      decisionId: { type: 'string', pattern: '^DEC-\\d{4}-\\d{4}$' },
      category: {
        enum: [
          'SCHEDULE_DELAY',
          'COST_INCREASE',
          'SAFETY_RISK',
          'QUALITY_IMPACT',
          'SCOPE_CHANGE',
          'REWORK_REQUIRED',
          'RESOURCE_CONFLICT',
          'PERMIT_REQUIRED',
          'DESIGN_CHANGE',
          'WARRANTY_IMPACT',
          'COORDINATION_CONFLICT',
          'TOLERANCE_VARIANCE',
          'MATERIAL_MISMATCH',
          'ACCESS_ISSUE',
          'REGULATORY_CONCERN',
        ],
      },
      severity: { enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
      description: { type: 'string' },
      budgetAmount: { type: 'number' },
      scheduleDelayDays: { type: 'number' },
      affectedVoxelIds: { type: 'array', items: { type: 'string' } },
      mitigationPlan: { type: 'string' },
    },
  },
  handler: async (args): Promise<PMToolResult<Consequence>> => {
    const startTime = Date.now();
    try {
      const input = args as unknown as TrackConsequenceInput;
      const consequenceId = generateConsequenceId();
      const consequenceURN = buildURN(
        input.projectId,
        'consequence',
        consequenceId
      );
      const decisionURN = buildURN(
        input.projectId,
        'pm-decision',
        input.decisionId
      );
      const now = new Date().toISOString();

      const consequence: Consequence = {
        $id: consequenceURN,
        $schema: 'https://luhtech.dev/schemas/pm/consequence.schema.json',
        schemaVersion: '3.0.0',
        consequenceId,
        category: input.category,
        severity: input.severity,
        status: 'IDENTIFIED',
        description: input.description,
        sourceDecision: decisionURN,
        affectedVoxels: input.affectedVoxelIds?.map((v) =>
          buildURN(input.projectId, 'voxel', v)
        ),
        budgetImpact: input.budgetAmount
          ? { amount: input.budgetAmount, currency: 'USD', isConfirmed: false }
          : undefined,
        scheduleImpact: input.scheduleDelayDays
          ? { delayDays: input.scheduleDelayDays }
          : undefined,
        mitigationPlan: input.mitigationPlan,
        createdAt: now,
        updatedAt: now,
        graphMetadata: createGraphMetadata(
          [decisionURN],
          [],
          [
            {
              from: decisionURN,
              to: consequenceURN,
              type: 'triggers',
              label: 'Decision triggered consequence',
            },
          ]
        ),
      };

      const collection = loadConsequences(input.projectId);
      collection.consequences.push(consequence);
      saveConsequences(input.projectId, collection);

      // Update decision with consequence reference
      const decisionsCollection = loadDecisions(input.projectId);
      const decisionIdx = decisionsCollection.decisions.findIndex(
        (d) => d.decisionId === input.decisionId
      );
      if (decisionIdx !== -1) {
        const decision = decisionsCollection.decisions[decisionIdx];
        decision.consequences = [
          ...(decision.consequences || []),
          consequenceURN,
        ];
        decision.graphMetadata = addOutEdge(
          decision.graphMetadata,
          consequenceURN
        );
        decisionsCollection.decisions[decisionIdx] = decision;
        saveDecisions(input.projectId, decisionsCollection);
      }

      return {
        success: true,
        data: consequence,
        metadata: { duration: Date.now() - startTime, timestamp: now },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'TRACK_CONSEQUENCE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    }
  },
};

const requestInspectionTool: MCPToolDefinition = {
  name: 'request_inspection',
  description: 'Request an inspection for a voxel or decision',
  inputSchema: {
    type: 'object',
    required: ['projectId', 'voxelId', 'inspectionType', 'scheduledDate'],
    properties: {
      projectId: { type: 'string' },
      voxelId: { type: 'string', pattern: '^VOX-[A-Z0-9-]+$' },
      decisionId: { type: 'string', pattern: '^DEC-\\d{4}-\\d{4}$' },
      inspectionType: {
        enum: [
          'ROUGH_IN',
          'COVER_UP',
          'FINAL',
          'SAFETY',
          'QUALITY',
          'SPECIAL',
          'REGULATORY',
        ],
      },
      scheduledDate: { type: 'string', format: 'date-time' },
      notes: { type: 'string' },
    },
  },
  handler: async (args): Promise<PMToolResult<Inspection>> => {
    const startTime = Date.now();
    try {
      const input = args as unknown as RequestInspectionInput;

      // Support both voxelId (legacy) and voxelIds (new) input
      const voxelId = input.voxelId ?? input.voxelIds?.[0];
      if (!voxelId) {
        return {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'voxelId is required',
          },
          metadata: {
            duration: Date.now() - startTime,
            timestamp: new Date().toISOString(),
          },
        };
      }

      const inspectionId = generateInspectionId();
      const inspectionURN = buildURN(
        input.projectId,
        'inspection',
        inspectionId
      );
      const voxelURN = buildURN(input.projectId, 'voxel', voxelId);
      const decisionURN = input.decisionId
        ? buildURN(input.projectId, 'pm-decision', input.decisionId)
        : undefined;
      const now = new Date().toISOString();

      const inspection: Inspection = {
        $id: inspectionURN,
        $schema: 'https://luhtech.dev/schemas/pm/inspection.schema.json',
        schemaVersion: '3.0.0',
        inspectionId,
        type: input.inspectionType,
        status: 'SCHEDULED',
        voxelRef: voxelURN,
        decisionRef: decisionURN,
        scheduledDate: input.scheduledDate,
        findings: input.notes,
        createdAt: now,
        updatedAt: now,
        graphMetadata: createGraphMetadata(
          decisionURN ? [voxelURN, decisionURN] : [voxelURN],
          [],
          [
            {
              from: voxelURN,
              to: inspectionURN,
              type: 'validates',
              label: 'Inspection validates voxel',
            },
          ]
        ),
      };

      const collection = loadInspections(input.projectId);
      collection.inspections.push(inspection);
      saveInspections(input.projectId, collection);

      return {
        success: true,
        data: inspection,
        metadata: { duration: Date.now() - startTime, timestamp: now },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'REQUEST_INSPECTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    }
  },
};

// NEW M2: complete_inspection
const completeInspectionTool: MCPToolDefinition = {
  name: 'complete_inspection',
  description:
    'Record inspection results, validate/fail decisions, and create consequences. Requires authority level 2+.',
  inputSchema: {
    type: 'object',
    required: [
      'projectId',
      'inspectionId',
      'inspectorId',
      'outcome',
      'findings',
    ],
    properties: {
      projectId: { type: 'string', description: 'Project identifier' },
      inspectionId: {
        type: 'string',
        pattern: '^INSP-\\d{4}-\\d{4}$',
        description: 'Inspection ID',
      },
      inspectorId: { type: 'string', description: 'Inspector participant ID' },
      outcome: {
        type: 'string',
        enum: ['PASSED', 'FAILED', 'CONDITIONAL'],
        description: 'Inspection outcome',
      },
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            findingId: { type: 'string' },
            description: { type: 'string' },
            severity: { type: 'string', enum: ['MINOR', 'MAJOR', 'CRITICAL'] },
            location: { type: 'string' },
            photo: { type: 'string' },
            requiresCorrection: { type: 'boolean' },
            correctionDeadline: { type: 'string', format: 'date-time' },
          },
          required: [
            'findingId',
            'description',
            'severity',
            'requiresCorrection',
          ],
        },
        description: 'Inspection findings',
      },
      decisionsValidated: {
        type: 'array',
        items: { type: 'string' },
        description: 'Decision IDs validated by inspection',
      },
      decisionsFailed: {
        type: 'array',
        items: { type: 'string' },
        description: 'Decision IDs failed by inspection',
      },
      evidence: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['photo', 'document', 'video'] },
            uri: { type: 'string' },
          },
        },
        description: 'Evidence attachments',
      },
      conditions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Conditions for conditional pass',
      },
      reinspectionRequired: {
        type: 'boolean',
        default: false,
        description: 'Whether reinspection is required',
      },
      workPacketUrn: {
        type: 'string',
        description:
          'USF work packet URN to update with inspection results (Phase 3 USF Integration)',
      },
    },
  },
  handler: async (
    args
  ): Promise<
    PMToolResult<{
      inspection: Inspection;
      validatedDecisions: PMDecision[];
      failedDecisions: PMDecision[];
      consequencesCreated: Consequence[];
      decisionsTriggered: PMDecision[];
      graphEdges: GraphEdge[];
      usfEventResults?: unknown; // Phase 3 USF Integration
    }>
  > => {
    const startTime = Date.now();
    try {
      const input = args as unknown as CompleteInspectionInput;
      const now = new Date().toISOString();

      // Load inspection
      const inspectionsCollection = loadInspections(input.projectId);
      const inspectionIdx = inspectionsCollection.inspections.findIndex(
        (i) => i.inspectionId === input.inspectionId
      );

      if (inspectionIdx === -1) {
        return {
          success: false,
          error: {
            code: 'INSPECTION_NOT_FOUND',
            message: `Inspection ${input.inspectionId} not found`,
          },
          metadata: {
            duration: Date.now() - startTime,
            timestamp: now,
          },
        };
      }

      const inspection = inspectionsCollection.inspections[inspectionIdx];
      const inspectorURN = buildURN(
        input.projectId,
        'participant',
        input.inspectorId
      );

      // Update inspection
      inspection.status =
        input.outcome === 'PASSED'
          ? 'PASSED'
          : input.outcome === 'FAILED'
            ? 'FAILED'
            : 'CONDITIONAL';
      inspection.outcome = input.outcome;
      inspection.completedDate = now;
      inspection.inspector = inspectorURN;
      inspection.findings = input.findings;
      inspection.conditions = input.conditions;
      inspection.reinspectionRequired = input.reinspectionRequired;
      inspection.decisionsValidated = input.decisionsValidated?.map((id) =>
        buildURN(input.projectId, 'pm-decision', id)
      );
      inspection.decisionsFailed = input.decisionsFailed?.map((id) =>
        buildURN(input.projectId, 'pm-decision', id)
      );
      inspection.evidence = input.evidence?.map((e) => ({
        ...e,
        timestamp: now,
      }));
      inspection.updatedAt = now;

      // Update graph metadata
      inspection.graphMetadata.outEdges.push(inspectorURN);

      inspectionsCollection.inspections[inspectionIdx] = inspection;
      saveInspections(input.projectId, inspectionsCollection);

      // Process decisions
      const decisionsCollection = loadDecisions(input.projectId);
      const validatedDecisions: PMDecision[] = [];
      const failedDecisions: PMDecision[] = [];
      const consequencesCreated: Consequence[] = [];
      const graphEdges: GraphEdge[] = [];

      // Validate decisions
      if (input.decisionsValidated) {
        for (const decisionId of input.decisionsValidated) {
          const idx = decisionsCollection.decisions.findIndex(
            (d) => d.decisionId === decisionId
          );
          if (idx !== -1) {
            const decision = decisionsCollection.decisions[idx];
            decision.status = 'APPROVED';
            decision.updatedAt = now;
            decision.graphMetadata.inEdges.push(inspection.$id);
            decisionsCollection.decisions[idx] = decision;
            validatedDecisions.push(decision);

            graphEdges.push({
              from: inspection.$id,
              to: decision.$id,
              type: 'validates',
              label: 'Inspection validated decision',
            });
          }
        }
      }

      // Fail decisions and create consequences
      if (input.decisionsFailed) {
        for (const decisionId of input.decisionsFailed) {
          const idx = decisionsCollection.decisions.findIndex(
            (d) => d.decisionId === decisionId
          );
          if (idx !== -1) {
            const decision = decisionsCollection.decisions[idx];
            decision.status = 'REJECTED';
            decision.updatedAt = now;
            decision.graphMetadata.inEdges.push(inspection.$id);
            decisionsCollection.decisions[idx] = decision;
            failedDecisions.push(decision);

            graphEdges.push({
              from: inspection.$id,
              to: decision.$id,
              type: 'validates',
              label: 'Inspection failed decision',
            });

            // Create consequence for failed inspection
            const consequenceId = generateConsequenceId();
            const consequenceURN = buildURN(
              input.projectId,
              'consequence',
              consequenceId
            );

            const consequence: Consequence = {
              $id: consequenceURN,
              $schema: 'https://luhtech.dev/schemas/pm/consequence.schema.json',
              schemaVersion: '3.0.0',
              consequenceId,
              category: 'REWORK_REQUIRED',
              severity: 'HIGH',
              status: 'IDENTIFIED',
              description: `Inspection ${input.inspectionId} failed: ${decision.title}`,
              sourceDecision: decision.$id,
              createdAt: now,
              updatedAt: now,
              graphMetadata: createGraphMetadata(
                [decision.$id, inspection.$id],
                [],
                [
                  {
                    from: inspection.$id,
                    to: consequenceURN,
                    type: 'triggers',
                    label: 'Failed inspection triggered consequence',
                  },
                ]
              ),
            };

            consequencesCreated.push(consequence);
            graphEdges.push({
              from: inspection.$id,
              to: consequenceURN,
              type: 'triggers',
              label: 'Inspection created consequence',
            });
          }
        }
      }

      saveDecisions(input.projectId, decisionsCollection);

      // Save consequences
      if (consequencesCreated.length > 0) {
        const consequencesCollection = loadConsequences(input.projectId);
        consequencesCollection.consequences.push(...consequencesCreated);
        saveConsequences(input.projectId, consequencesCollection);
      }

      // Phase 3 USF Integration: Emit inspection completion event
      let usfEventResults;
      if (input.workPacketUrn || inspection.voxelRef) {
        try {
          // Extract quality metrics from findings
          const qualityMetrics = extractQualityMetricsFromFindings(
            input.findings
          );

          const usfEvent: InspectionCompletionEvent = {
            type: USFEventType.INSPECTION_COMPLETED,
            timestamp: now,
            projectId: input.projectId,
            sourceUrn: inspection.$id,
            inspectionId: input.inspectionId,
            inspection,
            outcome: input.outcome as 'PASSED' | 'FAILED' | 'CONDITIONAL',
            findings: input.findings,
            qualityMetrics,
            linkedWorkPacketUrn: input.workPacketUrn as PMURN | undefined,
            linkedVoxelUrns: inspection.voxelRef
              ? [inspection.voxelRef]
              : undefined,
          };

          usfEventResults = await emitUSFEvent(usfEvent);
          console.log(
            `[USF] Inspection ${input.inspectionId} completion event emitted. ` +
              `Quality metrics: FPY=${qualityMetrics.firstPassYield.toFixed(2)}, ` +
              `Defects=${qualityMetrics.defectCount}`
          );
        } catch (usfError) {
          // USF event emission should not fail the inspection completion
          console.warn(
            `[USF] Failed to emit inspection completion event: ${usfError instanceof Error ? usfError.message : 'Unknown error'}`
          );
        }
      }

      return {
        success: true,
        data: {
          inspection,
          validatedDecisions,
          failedDecisions,
          consequencesCreated,
          decisionsTriggered: [], // Could trigger follow-up decisions
          graphEdges,
          usfEventResults, // Phase 3: Include USF event results
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: now,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'COMPLETE_INSPECTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    }
  },
};

// ============================================================================
// Legacy Consequence Tools (kept for backward compatibility)
// ============================================================================

const linkConsequenceToDecisionTool: MCPToolDefinition = {
  name: 'link_consequence_to_decision',
  description: 'Link an existing consequence to an additional decision',
  inputSchema: {
    type: 'object',
    required: ['projectId', 'consequenceId', 'decisionId'],
    properties: {
      projectId: { type: 'string' },
      consequenceId: { type: 'string', pattern: '^CONSQ-\\d{4}-\\d{4}$' },
      decisionId: { type: 'string', pattern: '^DEC-\\d{4}-\\d{4}$' },
    },
  },
  handler: async (args): Promise<PMToolResult<Consequence>> => {
    const startTime = Date.now();
    try {
      const { projectId, consequenceId, decisionId } = args as {
        projectId: string;
        consequenceId: string;
        decisionId: string;
      };
      const collection = loadConsequences(projectId);
      const idx = collection.consequences.findIndex(
        (c) => c.consequenceId === consequenceId
      );
      if (idx === -1) {
        return {
          success: false,
          error: {
            code: 'CONSEQUENCE_NOT_FOUND',
            message: `Consequence ${consequenceId} not found`,
          },
          metadata: {
            duration: Date.now() - startTime,
            timestamp: new Date().toISOString(),
          },
        };
      }

      const consequence = collection.consequences[idx];
      const decisionURN = buildURN(projectId, 'pm-decision', decisionId);
      consequence.graphMetadata.inEdges = [
        ...new Set([...consequence.graphMetadata.inEdges, decisionURN]),
      ];
      consequence.updatedAt = new Date().toISOString();
      collection.consequences[idx] = consequence;
      saveConsequences(projectId, collection);

      return {
        success: true,
        data: consequence,
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'LINK_CONSEQUENCE_TO_DECISION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    }
  },
};

const queryConsequencesByVoxelTool: MCPToolDefinition = {
  name: 'query_consequences_by_voxel',
  description: 'Get consequences affecting a voxel area',
  inputSchema: {
    type: 'object',
    required: ['projectId', 'voxelId'],
    properties: {
      projectId: { type: 'string' },
      voxelId: { type: 'string', pattern: '^VOX-[A-Z0-9-]+$' },
    },
  },
  handler: async (args): Promise<PMToolResult<Consequence[]>> => {
    const startTime = Date.now();
    try {
      const { projectId, voxelId } = args as {
        projectId: string;
        voxelId: string;
      };
      const collection = loadConsequences(projectId);
      const voxelURN = buildURN(projectId, 'voxel', voxelId);
      const results = collection.consequences.filter((c) =>
        c.affectedVoxels?.includes(voxelURN)
      );

      return {
        success: true,
        data: results,
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'QUERY_CONSEQUENCES_BY_VOXEL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    }
  },
};

// ============================================================================
// Legacy Schedule Tools (kept for backward compatibility)
// ============================================================================

const proposeScheduleChangeTool: MCPToolDefinition = {
  name: 'propose_schedule_change',
  description: 'Create a schedule modification proposal linked to a decision',
  inputSchema: {
    type: 'object',
    required: [
      'projectId',
      'decisionId',
      'proposerId',
      'lookAheadDays',
      'changes',
    ],
    properties: {
      projectId: { type: 'string' },
      decisionId: { type: 'string', pattern: '^DEC-\\d{4}-\\d{4}$' },
      proposerId: { type: 'string' },
      lookAheadDays: { type: 'number', minimum: 1, maximum: 90 },
      changes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            activityId: { type: 'string' },
            activityName: { type: 'string' },
            proposedStart: { type: 'string' },
            proposedEnd: { type: 'string' },
            reason: { type: 'string' },
          },
        },
      },
    },
  },
  handler: async (args): Promise<PMToolResult<ScheduleProposal>> => {
    const startTime = Date.now();
    try {
      const input = args as unknown as ProposeScheduleChangeInput;
      const proposalId = generateProposalId();
      const proposalURN = buildURN(
        input.projectId,
        'schedule-proposal',
        proposalId
      );
      const decisionURN = buildURN(
        input.projectId,
        'pm-decision',
        input.decisionId
      );
      const proposerURN = buildURN(
        input.projectId,
        'participant',
        input.proposerId
      );
      const now = new Date().toISOString();

      const proposal: ScheduleProposal = {
        $id: proposalURN,
        $schema: 'https://luhtech.dev/schemas/pm/schedule-proposal.schema.json',
        schemaVersion: '3.0.0',
        proposalId,
        status: 'DRAFT',
        sourceDecision: decisionURN,
        proposedBy: proposerURN,
        lookAheadDays: input.lookAheadDays,
        changes: input.changes,
        createdAt: now,
        updatedAt: now,
        graphMetadata: createGraphMetadata(
          [decisionURN],
          [],
          [
            {
              from: decisionURN,
              to: proposalURN,
              type: 'proposes',
              label: 'Decision proposes schedule change',
            },
          ]
        ),
      };

      // Note: In a full implementation, we'd save to a proposals collection
      // For now, we return the proposal directly

      return {
        success: true,
        data: proposal,
        metadata: { duration: Date.now() - startTime, timestamp: now },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'PROPOSE_SCHEDULE_CHANGE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    }
  },
};

// ============================================================================
// Tool Registry
// ============================================================================

export const pmDecisionTools: MCPToolDefinition[] = [
  // Decision Management (6)
  captureDecisionTool,
  routeDecisionTool,
  approveDecisionTool,
  rejectDecisionTool,
  escalateDecisionTool,
  queryDecisionHistoryTool,
  // Authority & Graph (3)
  getAuthorityGraphTool,
  findDecisionAuthorityTool,
  validateAuthorityLevelTool,
  // Voxel Operations (3) - includes NEW navigate_decision_surface
  attachDecisionToVoxelTool,
  getVoxelDecisionsTool,
  navigateDecisionSurfaceTool,
  // Tolerance Management (2) - NEW M2
  applyToleranceOverrideTool,
  queryToleranceOverridesTool,
  // Consequence & Inspection (3) - includes NEW complete_inspection
  trackConsequenceTool,
  requestInspectionTool,
  completeInspectionTool,
  // Legacy tools (kept for backward compatibility)
  queryVoxelsByStatusTool,
  linkConsequenceToDecisionTool,
  queryConsequencesByVoxelTool,
  proposeScheduleChangeTool,
];

export function getToolByName(name: string): MCPToolDefinition | undefined {
  return pmDecisionTools.find((tool) => tool.name === name);
}

export function getToolNames(): string[] {
  return pmDecisionTools.map((tool) => tool.name);
}

export function registerPMTools(server: {
  registerTool: (tool: MCPToolDefinition) => void;
}): void {
  for (const tool of pmDecisionTools) {
    server.registerTool(tool);
  }
}

export default pmDecisionTools;
