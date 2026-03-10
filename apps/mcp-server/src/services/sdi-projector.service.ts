/**
 * SDI Projector Service - DP-M4
 *
 * Projects the impact of proposed actions on Solution Density Index (SDI).
 * Provides forward-looking analysis for the Possibility Space (Engine 2).
 *
 * Core Capabilities:
 * - Project SDI impact of proposed actions
 * - Calculate cascading effects across zones
 * - Compute confidence intervals based on historical accuracy
 * - Classify projected states (critical/warning/healthy/abundant)
 *
 * Mathematical Foundation:
 * - SDI projection uses component-based delta estimation
 * - Cascading effects use zone dependency graph
 * - Confidence intervals based on historical projection accuracy
 *
 * @see .roadmap/features/dual-process-decision/FEATURE.json
 * @see .roadmap/features/dual-process-decision/interfaces.json
 * @version 1.0.0
 */

import {
  SDIClassification,
  type SDIComponents,
  type SDIThresholds,
  type EigenmodeVector,
} from '../types/dual-process.types.js';

import {
  computeSDIFromComponents,
  classifySDI,
} from './sdi-calculator.service.js';

/**
 * Default SDI thresholds (matching sdi-calculator.service.ts)
 */
export const DEFAULT_THRESHOLDS: SDIThresholds = {
  critical: 100,
  warning: 1000,
  healthy: 10000,
  abundant: 100000,
  isProjectSpecific: false,
};

// ============================================================================
// Types
// ============================================================================

/**
 * Proposed action for SDI projection
 */
export interface ProposedAction {
  actionType: string;
  targetUrn?: string;
  parameters?: Record<string, unknown>;
  estimatedDuration?: number; // hours
  estimatedCost?: number; // USD
  resourceImpact?: ResourceImpact;
  constraintImpact?: ConstraintImpact;
}

/**
 * How an action affects resources
 */
export interface ResourceImpact {
  laborHoursConsumed?: number;
  laborHoursFreed?: number;
  materialsConsumed?: string[];
  equipmentRequired?: string[];
  budgetConsumed?: number;
  budgetFreed?: number;
}

/**
 * How an action affects constraints
 */
export interface ConstraintImpact {
  constraintsAdded?: string[];
  constraintsRemoved?: string[];
  pathsOpened?: number;
  pathsClosed?: number;
}

/**
 * Cascading effect on another zone
 */
export interface CascadingEffect {
  affectedZone: string;
  sdiImpact: number; // Positive = improvement, negative = degradation
  probability: number; // 0-1
  effectType: 'direct' | 'indirect' | 'delayed';
  delayDays?: number;
}

/**
 * Confidence interval for projections
 */
export interface ConfidenceInterval {
  lower: number;
  upper: number;
  confidence: number; // 0-1, typically 0.95 for 95% CI
}

/**
 * Input for SDI projection
 */
export interface ProjectSDIInput {
  projectId: string;
  zoneId?: string;
  currentComponents: SDIComponents;
  proposedAction: ProposedAction;
  horizon?: number; // Days to project forward (default: 7)
  includeConfidence?: boolean;
  includeCascading?: boolean;
  zoneDependencies?: ZoneDependency[];
}

/**
 * Zone dependency for cascading effect calculation
 */
export interface ZoneDependency {
  sourceZone: string;
  targetZone: string;
  weight: number; // 0-1, strength of dependency
  effectType: 'direct' | 'indirect' | 'delayed';
  delayDays?: number;
}

/**
 * Output from SDI projection
 */
export interface SDIProjectionResult {
  currentSdi: number;
  projectedSdi: number;
  sdiDelta: number;
  sdiDeltaPercent: number;
  currentClassification: SDIClassification;
  projectedClassification: SDIClassification;
  confidenceInterval?: ConfidenceInterval;
  cascadingEffects?: CascadingEffect[];
  componentDeltas?: SDIComponentDeltas;
  projectionLatencyMs: number;
}

/**
 * Changes to SDI components
 */
export interface SDIComponentDeltas {
  viablePathCount: number;
  constraintCount: number;
  resourceSlackRatio: number;
  eigenmodeStability: number;
}

/**
 * Configuration for SDI projection
 */
export interface SDIProjectorConfig {
  defaultHorizonDays: number;
  confidenceLevel: number;
  historicalAccuracyWeight: number;
  cascadingDecayFactor: number; // How much effect diminishes per hop
  minCascadingProbability: number; // Threshold to include cascading effect
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default configuration for SDI projector
 */
export const DEFAULT_PROJECTOR_CONFIG: SDIProjectorConfig = {
  defaultHorizonDays: 7,
  confidenceLevel: 0.95,
  historicalAccuracyWeight: 0.3,
  cascadingDecayFactor: 0.7,
  minCascadingProbability: 0.1,
};

/**
 * Action type to component impact mapping
 * These are baseline estimates that can be calibrated per project
 */
const ACTION_IMPACT_BASELINES: Record<string, Partial<SDIComponentDeltas>> = {
  // Resource actions
  reallocate_resource: {
    viablePathCount: 2,
    resourceSlackRatio: -0.05,
  },
  add_resource: {
    viablePathCount: 5,
    resourceSlackRatio: 0.1,
  },
  remove_resource: {
    viablePathCount: -3,
    resourceSlackRatio: 0.05,
  },
  // Schedule actions
  extend_deadline: {
    viablePathCount: 10,
    constraintCount: -1,
  },
  compress_schedule: {
    viablePathCount: -5,
    constraintCount: 2,
    resourceSlackRatio: -0.1,
  },
  // Scope actions
  add_scope: {
    viablePathCount: -8,
    constraintCount: 3,
    resourceSlackRatio: -0.15,
  },
  reduce_scope: {
    viablePathCount: 15,
    constraintCount: -2,
    resourceSlackRatio: 0.1,
  },
  // Quality actions
  increase_quality: {
    constraintCount: 2,
    viablePathCount: -3,
  },
  relax_tolerance: {
    constraintCount: -1,
    viablePathCount: 5,
  },
  // Risk actions
  mitigate_risk: {
    eigenmodeStability: 0.05,
    viablePathCount: 3,
  },
  accept_risk: {
    eigenmodeStability: -0.03,
    viablePathCount: 2,
  },
  // Generic
  approve: {
    viablePathCount: 1,
    eigenmodeStability: 0.01,
  },
  reject: {
    viablePathCount: -1,
    eigenmodeStability: 0.02,
  },
  defer: {
    viablePathCount: 0,
    eigenmodeStability: -0.01,
  },
  escalate: {
    viablePathCount: 0,
    eigenmodeStability: 0.03,
  },
};

// ============================================================================
// Projection History (for confidence calculation)
// ============================================================================

interface ProjectionHistoryEntry {
  projectedSdi: number;
  actualSdi: number;
  timestamp: Date;
  projectId: string;
  actionType: string;
}

// In-memory projection history for confidence calculation
const projectionHistory: ProjectionHistoryEntry[] = [];

/**
 * Record a projection outcome for confidence calibration
 */
export function recordProjectionOutcome(
  projectId: string,
  actionType: string,
  projectedSdi: number,
  actualSdi: number
): void {
  projectionHistory.push({
    projectedSdi,
    actualSdi,
    timestamp: new Date(),
    projectId,
    actionType,
  });

  // Keep only last 1000 entries
  if (projectionHistory.length > 1000) {
    projectionHistory.shift();
  }
}

/**
 * Get historical accuracy for confidence interval calculation
 */
export function getHistoricalAccuracy(
  projectId?: string,
  actionType?: string
): { meanError: number; stdDev: number; sampleSize: number } {
  let relevantHistory = projectionHistory;

  // Filter by project if specified
  if (projectId) {
    relevantHistory = relevantHistory.filter((h) => h.projectId === projectId);
  }

  // Filter by action type if specified
  if (actionType) {
    relevantHistory = relevantHistory.filter((h) => h.actionType === actionType);
  }

  if (relevantHistory.length === 0) {
    // Return conservative defaults for no history
    return { meanError: 0.15, stdDev: 0.1, sampleSize: 0 };
  }

  // Calculate errors
  const errors = relevantHistory.map((h) =>
    Math.abs(h.projectedSdi - h.actualSdi) / Math.max(h.actualSdi, 1)
  );

  const meanError = errors.reduce((a, b) => a + b, 0) / errors.length;

  const variance =
    errors.reduce((sum, e) => sum + Math.pow(e - meanError, 2), 0) / errors.length;
  const stdDev = Math.sqrt(variance);

  return { meanError, stdDev, sampleSize: relevantHistory.length };
}

/**
 * Clear projection history (for testing)
 */
export function clearProjectionHistory(): void {
  projectionHistory.length = 0;
}

// ============================================================================
// Core Projection Functions
// ============================================================================

/**
 * Estimate component deltas based on action type
 */
export function estimateComponentDeltas(
  action: ProposedAction,
  horizon: number = 7
): SDIComponentDeltas {
  // Start with baseline for action type
  const baseline = ACTION_IMPACT_BASELINES[action.actionType] || {};

  const deltas: SDIComponentDeltas = {
    viablePathCount: baseline.viablePathCount || 0,
    constraintCount: baseline.constraintCount || 0,
    resourceSlackRatio: baseline.resourceSlackRatio || 0,
    eigenmodeStability: baseline.eigenmodeStability || 0,
  };

  // Adjust based on explicit resource impact
  if (action.resourceImpact) {
    const ri = action.resourceImpact;

    // Net labor hours affect resource slack
    const netLabor = (ri.laborHoursFreed || 0) - (ri.laborHoursConsumed || 0);
    deltas.resourceSlackRatio += netLabor * 0.001; // Small per-hour effect

    // Net budget affects resource slack
    const netBudget = (ri.budgetFreed || 0) - (ri.budgetConsumed || 0);
    deltas.resourceSlackRatio += netBudget * 0.00001; // Small per-dollar effect
  }

  // Adjust based on explicit constraint impact
  if (action.constraintImpact) {
    const ci = action.constraintImpact;

    // Net constraints
    const constraintsAdded = ci.constraintsAdded?.length || 0;
    const constraintsRemoved = ci.constraintsRemoved?.length || 0;
    deltas.constraintCount += constraintsAdded - constraintsRemoved;

    // Net paths
    const pathsOpened = ci.pathsOpened || 0;
    const pathsClosed = ci.pathsClosed || 0;
    deltas.viablePathCount += pathsOpened - pathsClosed;
  }

  // Scale effects by horizon (longer horizon = accumulated effects)
  const horizonScale = Math.sqrt(horizon / 7); // Square root dampening
  deltas.viablePathCount = Math.round(deltas.viablePathCount * horizonScale);
  // constraintCount is discrete, so round it
  deltas.constraintCount = Math.round(deltas.constraintCount * horizonScale);
  // These are ratios, don't scale as aggressively
  deltas.resourceSlackRatio *= Math.sqrt(horizonScale);
  deltas.eigenmodeStability *= Math.sqrt(horizonScale);

  return deltas;
}

/**
 * Apply component deltas to current components
 */
export function applyComponentDeltas(
  current: SDIComponents,
  deltas: SDIComponentDeltas
): SDIComponents {
  return {
    viablePathCount: Math.max(1, current.viablePathCount + deltas.viablePathCount),
    constraintCount: Math.max(0, current.constraintCount + deltas.constraintCount),
    resourceSlackRatio: Math.max(0, Math.min(1, current.resourceSlackRatio + deltas.resourceSlackRatio)),
    eigenmodeStability: Math.max(0, Math.min(1, current.eigenmodeStability + deltas.eigenmodeStability)),
  };
}

/**
 * Calculate confidence interval for projection
 */
export function calculateConfidenceInterval(
  projectedSdi: number,
  projectId?: string,
  actionType?: string,
  confidenceLevel: number = 0.95
): ConfidenceInterval {
  const { meanError, stdDev, sampleSize } = getHistoricalAccuracy(projectId, actionType);

  // Z-score for confidence level
  const zScore = confidenceLevel === 0.95 ? 1.96 : confidenceLevel === 0.99 ? 2.576 : 1.645;

  // Adjust for sample size (wider interval with less history)
  const sampleAdjustment = sampleSize < 30 ? Math.sqrt(30 / Math.max(sampleSize, 1)) : 1;

  // Calculate interval width
  const intervalWidth = (meanError + zScore * stdDev) * sampleAdjustment * projectedSdi;

  return {
    lower: Math.max(1, projectedSdi - intervalWidth),
    upper: projectedSdi + intervalWidth,
    confidence: confidenceLevel,
  };
}

/**
 * Calculate cascading effects to other zones
 */
export function calculateCascadingEffects(
  primaryZoneId: string,
  sdiDelta: number,
  zoneDependencies: ZoneDependency[],
  config: SDIProjectorConfig = DEFAULT_PROJECTOR_CONFIG
): CascadingEffect[] {
  const effects: CascadingEffect[] = [];
  const visited = new Set<string>([primaryZoneId]);

  // BFS to find all affected zones
  let currentLevel = zoneDependencies.filter((d) => d.sourceZone === primaryZoneId);
  let depth = 1;

  while (currentLevel.length > 0 && depth <= 3) {
    const nextLevel: ZoneDependency[] = [];

    for (const dep of currentLevel) {
      if (visited.has(dep.targetZone)) {continue;}
      visited.add(dep.targetZone);

      // Calculate effect with decay
      const decayedImpact = sdiDelta * dep.weight * Math.pow(config.cascadingDecayFactor, depth);
      const probability = dep.weight * Math.pow(config.cascadingDecayFactor, depth - 1);

      if (probability >= config.minCascadingProbability) {
        effects.push({
          affectedZone: dep.targetZone,
          sdiImpact: decayedImpact,
          probability,
          effectType: dep.effectType,
          delayDays: dep.delayDays,
        });
      }

      // Find next level dependencies
      const nextDeps = zoneDependencies.filter(
        (d) => d.sourceZone === dep.targetZone && !visited.has(d.targetZone)
      );
      nextLevel.push(...nextDeps);
    }

    currentLevel = nextLevel;
    depth++;
  }

  return effects;
}

/**
 * Project SDI impact of a proposed action
 */
export function projectSDI(
  input: ProjectSDIInput,
  config: SDIProjectorConfig = DEFAULT_PROJECTOR_CONFIG
): SDIProjectionResult {
  const startTime = performance.now();

  const horizon = input.horizon ?? config.defaultHorizonDays;

  // Calculate current SDI
  const currentSdi = computeSDIFromComponents(input.currentComponents);
  const thresholds = DEFAULT_THRESHOLDS;
  const currentClassification = classifySDI(currentSdi, thresholds);

  // Estimate component deltas
  const componentDeltas = estimateComponentDeltas(input.proposedAction, horizon);

  // Apply deltas to get projected components
  const projectedComponents = applyComponentDeltas(input.currentComponents, componentDeltas);

  // Calculate projected SDI
  const projectedSdi = computeSDIFromComponents(projectedComponents);
  const projectedClassification = classifySDI(projectedSdi, thresholds);

  // Calculate delta
  const sdiDelta = projectedSdi - currentSdi;
  const sdiDeltaPercent = currentSdi > 0 ? (sdiDelta / currentSdi) * 100 : 0;

  // Build result
  const result: SDIProjectionResult = {
    currentSdi,
    projectedSdi,
    sdiDelta,
    sdiDeltaPercent,
    currentClassification,
    projectedClassification,
    componentDeltas,
    projectionLatencyMs: 0, // Will be set at end
  };

  // Add confidence interval if requested
  if (input.includeConfidence !== false) {
    result.confidenceInterval = calculateConfidenceInterval(
      projectedSdi,
      input.projectId,
      input.proposedAction.actionType,
      config.confidenceLevel
    );
  }

  // Add cascading effects if requested and zone dependencies provided
  if (
    input.includeCascading !== false &&
    input.zoneId &&
    input.zoneDependencies &&
    input.zoneDependencies.length > 0
  ) {
    result.cascadingEffects = calculateCascadingEffects(
      input.zoneId,
      sdiDelta,
      input.zoneDependencies,
      config
    );
  }

  result.projectionLatencyMs = performance.now() - startTime;

  return result;
}

/**
 * Project SDI for multiple actions (batch)
 */
export function projectMultipleActions(
  projectId: string,
  currentComponents: SDIComponents,
  actions: ProposedAction[],
  options?: {
    horizon?: number;
    includeConfidence?: boolean;
    zoneId?: string;
    zoneDependencies?: ZoneDependency[];
  },
  config: SDIProjectorConfig = DEFAULT_PROJECTOR_CONFIG
): Map<string, SDIProjectionResult> {
  const results = new Map<string, SDIProjectionResult>();

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const actionId = action.targetUrn || `action-${i}`;

    const result = projectSDI(
      {
        projectId,
        currentComponents,
        proposedAction: action,
        horizon: options?.horizon,
        includeConfidence: options?.includeConfidence,
        includeCascading: !!options?.zoneDependencies,
        zoneId: options?.zoneId,
        zoneDependencies: options?.zoneDependencies,
      },
      config
    );

    results.set(actionId, result);
  }

  return results;
}

/**
 * Compare projections and rank actions by SDI impact
 */
export function rankActionsBySDIImpact(
  projections: Map<string, SDIProjectionResult>,
  prefer: 'maximize' | 'minimize' | 'stabilize' = 'maximize'
): Array<{ actionId: string; projection: SDIProjectionResult; rank: number }> {
  const entries = Array.from(projections.entries());

  // Sort based on preference
  entries.sort((a, b) => {
    const projA = a[1];
    const projB = b[1];

    switch (prefer) {
      case 'maximize':
        return projB.projectedSdi - projA.projectedSdi;
      case 'minimize':
        return projA.projectedSdi - projB.projectedSdi;
      case 'stabilize':
        // Prefer smaller absolute delta
        return Math.abs(projA.sdiDelta) - Math.abs(projB.sdiDelta);
    }
  });

  return entries.map(([actionId, projection], index) => ({
    actionId,
    projection,
    rank: index + 1,
  }));
}

/**
 * Check if projected SDI crosses a threshold
 */
export function detectThresholdCrossing(
  currentSdi: number,
  projectedSdi: number,
  thresholds: SDIThresholds = DEFAULT_THRESHOLDS
): {
  crossesThreshold: boolean;
  fromState: SDIClassification;
  toState: SDIClassification;
  isImprovement: boolean;
} {
  const fromState = classifySDI(currentSdi, thresholds);
  const toState = classifySDI(projectedSdi, thresholds);

  const stateOrder: SDIClassification[] = [
    SDIClassification.CRITICAL,
    SDIClassification.WARNING,
    SDIClassification.HEALTHY,
    SDIClassification.ABUNDANT,
  ];
  const fromIndex = stateOrder.indexOf(fromState);
  const toIndex = stateOrder.indexOf(toState);

  return {
    crossesThreshold: fromState !== toState,
    fromState,
    toState,
    isImprovement: toIndex > fromIndex,
  };
}

// ============================================================================
// Service Object
// ============================================================================

/**
 * SDI Projector Service namespace
 */
export const SDIProjectorService = {
  // Core projection
  projectSDI,
  projectMultipleActions,

  // Component estimation
  estimateComponentDeltas,
  applyComponentDeltas,

  // Confidence
  calculateConfidenceInterval,
  getHistoricalAccuracy,
  recordProjectionOutcome,
  clearProjectionHistory,

  // Cascading
  calculateCascadingEffects,

  // Analysis
  rankActionsBySDIImpact,
  detectThresholdCrossing,

  // Constants
  DEFAULT_PROJECTOR_CONFIG,
  ACTION_IMPACT_BASELINES,
};

export default SDIProjectorService;
