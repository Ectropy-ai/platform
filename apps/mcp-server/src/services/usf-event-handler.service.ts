/**
 * USF Event Handler Service
 *
 * Event-driven service connecting voxel lifecycle, inspection results,
 * and decision outcomes to USF (Universal Service Factors) tracking.
 *
 * Phase 3: Voxel Integration
 * - Voxel completion → USF work packet completion
 * - Inspection results → USF quality score updates
 * - Decision outcomes → USF impact tracking
 *
 * @see .roadmap/schemas/usf/usf-profile.schema.json
 * @see .roadmap/schemas/usf/usf-work-packet.schema.json
 * @version 1.0.0
 */

import type {
  PMURN,
  USFFactors,
  USFWorkPacket,
  USFProfile,
  PMDecision,
  Inspection,
  InspectionFinding,
  Voxel,
  USFPricingTier,
} from '../types/pm.types.js';

import {
  usf_complete_work_packet,
  usf_create_work_packet,
} from './usf-tools.js';

import {
  calculateQualityScore,
  calculateCostScore,
  calculateSpeedScore,
  calculateComposite,
  DEFAULT_USF_WEIGHTS,
  type QualityMetrics,
  type SpeedMetrics,
} from './usf.service.js';

// ============================================================================
// Event Types
// ============================================================================

/**
 * USF Event Types for event-driven updates
 */
export enum USFEventType {
  // Voxel lifecycle events
  VOXEL_STARTED = 'usf:voxel:started',
  VOXEL_COMPLETED = 'usf:voxel:completed',
  VOXEL_BLOCKED = 'usf:voxel:blocked',

  // Inspection events
  INSPECTION_SCHEDULED = 'usf:inspection:scheduled',
  INSPECTION_COMPLETED = 'usf:inspection:completed',
  INSPECTION_FAILED = 'usf:inspection:failed',

  // Decision events
  DECISION_APPROVED = 'usf:decision:approved',
  DECISION_REJECTED = 'usf:decision:rejected',

  // Work packet lifecycle
  WORK_PACKET_CREATED = 'usf:work-packet:created',
  WORK_PACKET_IN_PROGRESS = 'usf:work-packet:in-progress',
  WORK_PACKET_COMPLETED = 'usf:work-packet:completed',

  // Profile updates
  PROFILE_UPDATED = 'usf:profile:updated',
}

/**
 * Base event interface
 */
export interface USFEvent {
  type: USFEventType;
  timestamp: string;
  projectId: string;
  sourceUrn: PMURN;
  metadata?: Record<string, unknown>;
}

/**
 * Voxel completion event data
 */
export interface VoxelCompletionEvent extends USFEvent {
  type: USFEventType.VOXEL_COMPLETED;
  voxelId: string;
  voxel: Voxel;
  workPacketUrn?: PMURN;
  laborData?: {
    estimatedHours: number;
    actualHours: number;
    assignedTrade?: string;
    assignedCrew?: string;
  };
  costData?: {
    estimated: number;
    actual: number;
    currency: string;
  };
  scheduleData?: {
    plannedStart?: string;
    plannedEnd?: string;
    actualStart?: string;
    actualEnd?: string;
  };
}

/**
 * Inspection completion event data
 */
export interface InspectionCompletionEvent extends USFEvent {
  type: USFEventType.INSPECTION_COMPLETED;
  inspectionId: string;
  inspection: Inspection;
  outcome: 'PASSED' | 'FAILED' | 'CONDITIONAL';
  findings: InspectionFinding[];
  qualityMetrics: {
    firstPassYield: number;
    defectCount: number;
    reworkRequired: boolean;
    reworkHours: number;
  };
  linkedWorkPacketUrn?: PMURN;
  linkedVoxelUrns?: PMURN[];
}

/**
 * Decision outcome event data
 */
export interface DecisionOutcomeEvent extends USFEvent {
  type: USFEventType.DECISION_APPROVED | USFEventType.DECISION_REJECTED;
  decisionId: string;
  decision: PMDecision;
  usfImpact?: {
    qualityImpact: number;
    costImpact: number;
    scheduleImpact: number;
    impactReason: string;
  };
}

/**
 * USF event handler result
 */
export interface USFEventResult {
  success: boolean;
  event: USFEvent;
  workPacketUpdated?: PMURN;
  profilesUpdated?: PMURN[];
  usfScores?: USFFactors & { composite: number };
  error?: {
    code: string;
    message: string;
  };
}

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Handle voxel completion - trigger USF work packet completion
 *
 * When a voxel transitions to COMPLETE status:
 * 1. Find linked USF work packet
 * 2. Calculate actual metrics from voxel data
 * 3. Complete work packet and update provider profiles
 */
export async function handleVoxelCompletion(
  event: VoxelCompletionEvent
): Promise<USFEventResult> {
  const { projectId, voxelId, voxel, laborData, costData, scheduleData, workPacketUrn } = event;

  try {
    // If no work packet linked, we may need to create one
    if (!workPacketUrn) {
      console.log(`[USF Event] Voxel ${voxelId} completed without linked work packet`);
      return {
        success: true,
        event,
        error: {
          code: 'NO_WORK_PACKET',
          message: 'Voxel completed but no USF work packet was linked',
        },
      };
    }

    // Calculate quality score from voxel inspection status
    let qualityScore = 0.85; // Default if no inspection data
    if (voxel.inspectionStatus) {
      if (voxel.inspectionStatus.finalInspection?.status === 'PASSED') {
        qualityScore = 0.95;
      } else if (voxel.inspectionStatus.roughInspection?.status === 'PASSED') {
        qualityScore = 0.9;
      } else if (voxel.inspectionStatus.finalInspection?.status === 'CONDITIONAL') {
        qualityScore = 0.75;
      } else if (voxel.inspectionStatus.finalInspection?.status === 'FAILED') {
        qualityScore = 0.5;
      }
    }

    // Calculate actuals from voxel data
    const actuals = {
      qualityScore,
      defectCount: 0, // Would come from inspection findings
      reworkHours: 0,
      actualCost: costData?.actual || costData?.estimated || 0,
      actualDurationHours: laborData?.actualHours || laborData?.estimatedHours || 0,
    };

    // Calculate actual duration from schedule if available
    if (scheduleData?.actualStart && scheduleData?.actualEnd) {
      const start = new Date(scheduleData.actualStart);
      const end = new Date(scheduleData.actualEnd);
      actuals.actualDurationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    }

    // Complete the work packet
    const result = await usf_complete_work_packet({
      workPacketUrn,
      actuals,
      evidence: [
        {
          type: 'document',
          uri: voxel.$id,
          description: `Voxel completion evidence for ${voxelId}`,
        },
      ],
    });

    if (!result.success) {
      return {
        success: false,
        event,
        error: result.error,
      };
    }

    return {
      success: true,
      event,
      workPacketUpdated: workPacketUrn,
      profilesUpdated: result.data?.profilesUpdated?.map((p) => p.providerUrn as PMURN),
      usfScores: result.data?.usfResults,
    };
  } catch (error) {
    return {
      success: false,
      event,
      error: {
        code: 'VOXEL_COMPLETION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

/**
 * Handle inspection completion - update USF quality scores
 *
 * When an inspection is completed:
 * 1. Calculate quality metrics from findings
 * 2. Update linked work packet with quality data
 * 3. Trigger profile updates for providers
 */
export async function handleInspectionCompletion(
  event: InspectionCompletionEvent
): Promise<USFEventResult> {
  const { projectId, inspection, outcome, findings, qualityMetrics, linkedWorkPacketUrn } = event;

  try {
    // Calculate quality score from inspection results
    const calculatedQuality = calculateQualityScore({
      firstPassYield: qualityMetrics.firstPassYield,
      defectCount: qualityMetrics.defectCount,
      reworkHours: qualityMetrics.reworkHours,
      plannedHours: 8, // Default, should come from work packet
      compliancePassed: outcome === 'PASSED',
    });

    // If no work packet linked, log and return
    if (!linkedWorkPacketUrn) {
      console.log(
        `[USF Event] Inspection ${event.inspectionId} completed without linked work packet. ` +
          `Quality score: ${calculatedQuality.toFixed(3)}`
      );
      return {
        success: true,
        event,
        usfScores: {
          quality: calculatedQuality,
          cost: 0.7, // Unknown without work packet
          speed: 0.7, // Unknown without work packet
          composite: calculatedQuality * 0.4 + 0.7 * 0.6, // Quality weighted
        },
      };
    }

    // Count defects by severity for impact calculation
    const criticalDefects = findings.filter((f) => f.severity === 'CRITICAL').length;
    const majorDefects = findings.filter((f) => f.severity === 'MAJOR').length;
    const minorDefects = findings.filter((f) => f.severity === 'MINOR').length;

    // Calculate rework hours estimate from defects
    const estimatedRework = criticalDefects * 8 + majorDefects * 4 + minorDefects * 1;

    // Complete work packet with inspection data
    const result = await usf_complete_work_packet({
      workPacketUrn: linkedWorkPacketUrn,
      actuals: {
        qualityScore: calculatedQuality,
        defectCount: findings.length,
        reworkHours: qualityMetrics.reworkHours || estimatedRework,
      },
      inspectionRef: inspection.$id,
      evidence: [
        {
          type: 'inspection-report',
          uri: inspection.$id,
          description: `Inspection ${event.inspectionId} - ${outcome}`,
        },
      ],
    });

    if (!result.success) {
      return {
        success: false,
        event,
        error: result.error,
      };
    }

    return {
      success: true,
      event,
      workPacketUpdated: linkedWorkPacketUrn,
      profilesUpdated: result.data?.profilesUpdated?.map((p) => p.providerUrn as PMURN),
      usfScores: result.data?.usfResults,
    };
  } catch (error) {
    return {
      success: false,
      event,
      error: {
        code: 'INSPECTION_COMPLETION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

/**
 * Handle decision outcome - track USF impact
 *
 * When a decision is approved/rejected:
 * 1. Calculate USF impact from decision data
 * 2. Record impact on linked work packets
 * 3. Update profiles if quality/cost/schedule affected
 */
export async function handleDecisionOutcome(
  event: DecisionOutcomeEvent
): Promise<USFEventResult> {
  const { projectId, decision, usfImpact } = event;

  try {
    // Calculate USF impact from decision
    const impact = usfImpact || calculateDecisionUSFImpact(decision);

    // Log the impact for tracking
    console.log(
      `[USF Event] Decision ${event.decisionId} ${event.type === USFEventType.DECISION_APPROVED ? 'approved' : 'rejected'}. ` +
        `USF Impact - Quality: ${impact.qualityImpact.toFixed(3)}, ` +
        `Cost: ${impact.costImpact.toFixed(3)}, ` +
        `Schedule: ${impact.scheduleImpact.toFixed(3)}`
    );

    return {
      success: true,
      event,
      usfScores: {
        quality: impact.qualityImpact,
        cost: impact.costImpact,
        speed: impact.scheduleImpact,
        composite: calculateComposite({
          quality: impact.qualityImpact,
          cost: impact.costImpact,
          speed: impact.scheduleImpact,
        }),
      },
    };
  } catch (error) {
    return {
      success: false,
      event,
      error: {
        code: 'DECISION_OUTCOME_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate USF impact from a decision
 */
export function calculateDecisionUSFImpact(decision: PMDecision): {
  qualityImpact: number;
  costImpact: number;
  scheduleImpact: number;
  impactReason: string;
} {
  let qualityImpact = 0;
  let costImpact = 0;
  let scheduleImpact = 0;
  const reasons: string[] = [];

  // Quality impact from decision type and consequences
  if (decision.type === 'REJECTION') {
    qualityImpact = -0.1; // Rejections often indicate quality issues
    reasons.push('Decision rejection affects quality score');
  }

  // Cost impact from budget
  if (decision.budgetImpact) {
    const budgetRatio = (decision.budgetImpact.estimated || 0) / 10000; // Normalize to $10k
    costImpact = -Math.min(budgetRatio * 0.2, 0.3); // Max -0.3 impact
    reasons.push(`Budget impact of $${decision.budgetImpact.estimated}`);
  }

  // Schedule impact from delay
  if (decision.scheduleImpact) {
    const delayDays = decision.scheduleImpact.delayDays || 0;
    const delayRatio = delayDays / 30; // Normalize to 30 days
    scheduleImpact = -Math.min(delayRatio * 0.2, 0.3); // Max -0.3 impact
    reasons.push(`Schedule delay of ${delayDays} days`);

    if (decision.scheduleImpact.criticalPath) {
      scheduleImpact *= 1.5; // Critical path delays have higher impact
      reasons.push('Critical path affected');
    }
  }

  // Approved decisions may have positive impacts
  if (decision.status === 'APPROVED') {
    // Positive adjustments for approved changes
    qualityImpact += 0.05;
    reasons.push('Approved decision processed');
  }

  return {
    qualityImpact: Math.max(-1, Math.min(1, qualityImpact)),
    costImpact: Math.max(-1, Math.min(1, costImpact)),
    scheduleImpact: Math.max(-1, Math.min(1, scheduleImpact)),
    impactReason: reasons.join('; '),
  };
}

/**
 * Create USF work packet from voxel data
 */
export async function createWorkPacketFromVoxel(
  projectId: string,
  voxel: Voxel,
  providerUrns: string[],
  pricingTier: USFPricingTier = 'standard'
): Promise<USFWorkPacket | null> {
  try {
    // Build labor allocation from providers
    const laborAllocation = providerUrns.map((urn, idx) => ({
      providerUrn: urn,
      allocationPercent: 100 / providerUrns.length,
      role: idx === 0 ? 'lead' : 'support',
      plannedHours: voxel.labor?.estimatedHours || 8,
    }));

    // Calculate targets from voxel data
    const targets = {
      qualityTarget: 0.85, // Default quality target
      budgetAmount: voxel.cost?.estimated || 1000,
      durationHours: voxel.labor?.estimatedHours || 8,
    };

    const result = await usf_create_work_packet({
      projectId,
      sourceRef: {
        type: 'voxel',
        urn: voxel.$id,
        externalId: voxel.voxelId,
      },
      description: `Work packet for voxel ${voxel.voxelId}`,
      workType: voxel.location?.system || 'general',
      laborAllocation,
      targets,
      pricingTier,
      voxelRefs: [voxel.$id],
    });

    return result.success ? result.data?.workPacket || null : null;
  } catch {
    return null;
  }
}

/**
 * Extract quality metrics from inspection findings
 */
export function extractQualityMetricsFromFindings(findings: InspectionFinding[]): {
  firstPassYield: number;
  defectCount: number;
  reworkRequired: boolean;
  reworkHours: number;
} {
  const defectCount = findings.length;
  const criticalCount = findings.filter((f) => f.severity === 'CRITICAL').length;
  const majorCount = findings.filter((f) => f.severity === 'MAJOR').length;
  const requiresCorrection = findings.filter((f) => f.requiresCorrection).length;

  // First pass yield: 1.0 if no defects, reduced for each defect
  const fpyPenalty = criticalCount * 0.2 + majorCount * 0.1 + (defectCount - criticalCount - majorCount) * 0.02;
  const firstPassYield = Math.max(0, 1 - fpyPenalty);

  // Estimate rework hours from findings
  const reworkHours = criticalCount * 8 + majorCount * 4 + (defectCount - criticalCount - majorCount) * 1;

  return {
    firstPassYield,
    defectCount,
    reworkRequired: requiresCorrection > 0,
    reworkHours,
  };
}

/**
 * Calculate labor hours from schedule data
 */
export function calculateActualHoursFromSchedule(
  plannedStart: string,
  plannedEnd: string,
  actualStart?: string,
  actualEnd?: string
): { plannedHours: number; actualHours: number } {
  const parseHours = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    return Math.max(0, (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60));
  };

  const plannedHours = parseHours(plannedStart, plannedEnd);
  const actualHours = actualStart && actualEnd ? parseHours(actualStart, actualEnd) : plannedHours;

  return { plannedHours, actualHours };
}

// ============================================================================
// Event Dispatcher
// ============================================================================

/**
 * Event listener registry
 */
type EventListener = (event: USFEvent) => Promise<USFEventResult>;
const eventListeners: Map<USFEventType, EventListener[]> = new Map();

/**
 * Register an event listener
 */
export function onUSFEvent(type: USFEventType, listener: EventListener): void {
  if (!eventListeners.has(type)) {
    eventListeners.set(type, []);
  }
  eventListeners.get(type)!.push(listener);
}

/**
 * Emit a USF event
 */
export async function emitUSFEvent(event: USFEvent): Promise<USFEventResult[]> {
  const listeners = eventListeners.get(event.type) || [];
  const results: USFEventResult[] = [];

  for (const listener of listeners) {
    try {
      const result = await listener(event);
      results.push(result);
    } catch (error) {
      results.push({
        success: false,
        event,
        error: {
          code: 'LISTENER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }

  return results;
}

/**
 * Initialize default event handlers
 */
export function initializeUSFEventHandlers(): void {
  // Register voxel completion handler
  onUSFEvent(USFEventType.VOXEL_COMPLETED, async (event) => {
    return handleVoxelCompletion(event as VoxelCompletionEvent);
  });

  // Register inspection completion handler
  onUSFEvent(USFEventType.INSPECTION_COMPLETED, async (event) => {
    return handleInspectionCompletion(event as InspectionCompletionEvent);
  });

  // Register decision outcome handlers
  onUSFEvent(USFEventType.DECISION_APPROVED, async (event) => {
    return handleDecisionOutcome(event as DecisionOutcomeEvent);
  });

  onUSFEvent(USFEventType.DECISION_REJECTED, async (event) => {
    return handleDecisionOutcome(event as DecisionOutcomeEvent);
  });

  console.log('[USF Events] Event handlers initialized');
}

// ============================================================================
// Service Export
// ============================================================================

export const USFEventHandlerService = {
  // Event types
  USFEventType,

  // Event handlers
  handleVoxelCompletion,
  handleInspectionCompletion,
  handleDecisionOutcome,

  // Helper functions
  calculateDecisionUSFImpact,
  createWorkPacketFromVoxel,
  extractQualityMetricsFromFindings,
  calculateActualHoursFromSchedule,

  // Event system
  onUSFEvent,
  emitUSFEvent,
  initializeUSFEventHandlers,
};

export default USFEventHandlerService;
