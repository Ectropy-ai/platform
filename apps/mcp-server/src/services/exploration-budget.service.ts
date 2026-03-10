/**
 * Exploration Budget Service - DP-M5
 *
 * Calculates exploration budget based on SDI, stability, and resources.
 * Determines how much "exploration" (Engine 2) vs "exploitation" (Engine 1) to use.
 *
 * Formula:
 * budget = (sdiFactor * 0.4) + (stabilityFactor * 0.35) + (resourceFactor * 0.25)
 *
 * Where:
 * - sdiFactor = min(log10(SDI) / 6, 1)
 * - stabilityFactor = eigenmodeStability (clamped 0-1)
 * - resourceFactor = resourceSlackRatio (clamped 0-1)
 *
 * @see .roadmap/features/dual-process-decision/FEATURE.json
 * @version 1.0.0
 */

import {
  DecisionTriggerType,
  ExplorationRecommendation,
  DEFAULT_DUAL_PROCESS_CONFIG,
  type ExplorationBudget,
  type SDIThresholds,
} from '../types/dual-process.types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Input for exploration budget calculation
 */
export interface ExplorationBudgetInput {
  sdiValue: number;
  eigenmodeStability: number;
  resourceSlackRatio: number;
  thresholds?: Partial<SDIThresholds>;
  weights?: {
    sdi?: number;
    stability?: number;
    resources?: number;
  };
}

/**
 * Context adjustments for budget calculation
 */
export interface BudgetContextAdjustments {
  urgency?: number;
  triggerType?: DecisionTriggerType;
  deadline?: Date | string;
  constraintPressure?: number;
}

/**
 * Configuration for exploration budget calculation
 */
export interface ExplorationBudgetConfig {
  defaultWeights: {
    sdi: number;
    stability: number;
    resources: number;
  };
  thresholds: SDIThresholds;
  budgetThresholds: {
    cautious: number;
    balanced: number;
  };
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default thresholds
 */
const DEFAULT_THRESHOLDS: SDIThresholds = {
  critical: DEFAULT_DUAL_PROCESS_CONFIG.sdiCriticalThreshold,
  warning: DEFAULT_DUAL_PROCESS_CONFIG.sdiWarningThreshold,
  healthy: DEFAULT_DUAL_PROCESS_CONFIG.sdiHealthyThreshold,
  abundant: DEFAULT_DUAL_PROCESS_CONFIG.sdiAbundantThreshold,
  isProjectSpecific: false,
};

/**
 * Default budget configuration
 */
export const DEFAULT_BUDGET_CONFIG: ExplorationBudgetConfig = {
  defaultWeights: {
    sdi: DEFAULT_DUAL_PROCESS_CONFIG.explorationBudgetSdiWeight,
    stability: DEFAULT_DUAL_PROCESS_CONFIG.explorationBudgetStabilityWeight,
    resources: DEFAULT_DUAL_PROCESS_CONFIG.explorationBudgetResourceWeight,
  },
  thresholds: DEFAULT_THRESHOLDS,
  budgetThresholds: {
    cautious: 0.3,
    balanced: 0.7,
  },
};

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Calculate exploration budget based on current state
 *
 * @param input - Budget calculation input
 * @returns Exploration budget with breakdown
 */
export function calculateExplorationBudget(input: ExplorationBudgetInput): ExplorationBudget {
  const {
    sdiValue,
    eigenmodeStability,
    resourceSlackRatio,
    thresholds: customThresholds,
    weights: customWeights,
  } = input;

  const thresholds = { ...DEFAULT_THRESHOLDS, ...customThresholds };
  const weights = {
    sdi: customWeights?.sdi ?? DEFAULT_BUDGET_CONFIG.defaultWeights.sdi,
    stability: customWeights?.stability ?? DEFAULT_BUDGET_CONFIG.defaultWeights.stability,
    resources: customWeights?.resources ?? DEFAULT_BUDGET_CONFIG.defaultWeights.resources,
  };

  // Critical SDI = no exploration allowed
  if (sdiValue <= 0 || sdiValue < thresholds.critical) {
    return {
      budget: 0,
      breakdown: {
        sdiFactor: 0,
        stabilityFactor: 0,
        resourceFactor: 0,
      },
      recommendation: ExplorationRecommendation.EXPLOIT,
    };
  }

  // Calculate SDI factor: min(log10(SDI) / 6, 1)
  // This normalizes SDI to a 0-1 scale where 10^6 = 1.0
  const sdiLog = Math.log10(Math.max(1, sdiValue));
  const sdiFactor = Math.min(sdiLog / 6, 1);

  // Clamp stability and resource factors to [0, 1]
  const stabilityFactor = Math.max(0, Math.min(1, eigenmodeStability));
  const resourceFactor = Math.max(0, Math.min(1, resourceSlackRatio));

  // Compute weighted budget
  const rawBudget =
    sdiFactor * weights.sdi +
    stabilityFactor * weights.stability +
    resourceFactor * weights.resources;

  // Clamp to [0, 1]
  const budget = Math.max(0, Math.min(1, rawBudget));

  // Determine recommendation
  const recommendation = getExplorationRecommendation(budget);

  return {
    budget,
    breakdown: {
      sdiFactor,
      stabilityFactor,
      resourceFactor,
    },
    recommendation,
  };
}

/**
 * Get exploration recommendation based on budget level
 *
 * @param budget - Budget value (0-1)
 * @returns Exploration recommendation
 */
export function getExplorationRecommendation(budget: number): ExplorationRecommendation {
  if (budget <= 0) {
    return ExplorationRecommendation.EXPLOIT;
  }

  if (budget < DEFAULT_BUDGET_CONFIG.budgetThresholds.cautious) {
    return ExplorationRecommendation.CAUTIOUS_EXPLORE;
  }

  if (budget < DEFAULT_BUDGET_CONFIG.budgetThresholds.balanced) {
    return ExplorationRecommendation.BALANCED;
  }

  return ExplorationRecommendation.AGGRESSIVE_EXPLORE;
}

/**
 * Adjust budget based on context factors
 *
 * - High urgency reduces budget
 * - Exception triggers reduce budget
 * - Opportunity triggers increase budget
 * - Deadline pressure reduces budget
 *
 * @param baseBudget - Base budget value
 * @param context - Context adjustments
 * @returns Adjusted budget
 */
export function adjustBudgetForContext(
  baseBudget: number,
  context: BudgetContextAdjustments
): number {
  let adjusted = baseBudget;

  // Urgency reduces exploration (higher urgency = more conservative)
  if (context.urgency !== undefined) {
    const urgencyPenalty = context.urgency * 0.3; // Up to 30% reduction
    adjusted -= urgencyPenalty;
  }

  // Trigger type adjustments
  if (context.triggerType !== undefined) {
    switch (context.triggerType) {
      case DecisionTriggerType.EXCEPTION:
        // Exceptions call for caution
        adjusted *= 0.7; // 30% reduction
        break;
      case DecisionTriggerType.OPPORTUNITY:
        // Opportunities allow more exploration
        adjusted *= 1.3; // 30% increase
        break;
      case DecisionTriggerType.ESCALATION:
        // Escalations need balanced approach
        adjusted *= 0.9; // 10% reduction
        break;
      case DecisionTriggerType.SCHEDULED:
      default:
        // No adjustment for scheduled decisions
        break;
    }
  }

  // Deadline pressure
  if (context.deadline !== undefined) {
    const deadline = typeof context.deadline === 'string'
      ? new Date(context.deadline)
      : context.deadline;
    const now = new Date();
    const hoursUntilDeadline = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilDeadline < 4) {
      // Very tight deadline
      adjusted *= 0.5;
    } else if (hoursUntilDeadline < 24) {
      // Within a day
      adjusted *= 0.8;
    }
  }

  // Constraint pressure
  if (context.constraintPressure !== undefined) {
    // Higher constraint pressure = less exploration room
    const constraintPenalty = context.constraintPressure * 0.2;
    adjusted -= constraintPenalty;
  }

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, adjusted));
}

/**
 * Calculate adaptive exploration allocation
 *
 * Given a budget and engine outputs, determine the actual exploration allocation.
 *
 * @param budget - Available exploration budget
 * @param engine1Confidence - Confidence from Engine 1
 * @param engine2ExplorationValue - Exploration value of best Engine 2 option
 * @returns Actual exploration allocation
 */
export function calculateExplorationAllocation(
  budget: number,
  engine1Confidence: number,
  engine2ExplorationValue: number
): number {
  if (budget <= 0) {
    return 0;
  }

  // If Engine 1 has high confidence, allocate less exploration
  const confidenceDiscount = engine1Confidence * 0.5;

  // If Engine 2 has high exploration value, allocate more
  const explorationBonus = engine2ExplorationValue * 0.3;

  // Base allocation is proportional to budget
  const allocation = budget * (1 - confidenceDiscount + explorationBonus);

  return Math.max(0, Math.min(budget, allocation));
}

/**
 * Get human-readable budget description
 *
 * @param budget - Budget result
 * @returns Human-readable description
 */
export function getBudgetDescription(budget: ExplorationBudget): string {
  const percentBudget = Math.round(budget.budget * 100);

  switch (budget.recommendation) {
    case ExplorationRecommendation.EXPLOIT:
      return `No exploration permitted (${percentBudget}% budget). Use validated patterns only.`;

    case ExplorationRecommendation.CAUTIOUS_EXPLORE:
      return `Cautious exploration (${percentBudget}% budget). Prefer proven patterns with minimal deviation.`;

    case ExplorationRecommendation.BALANCED:
      return `Balanced exploration (${percentBudget}% budget). Mix proven patterns with moderate innovation.`;

    case ExplorationRecommendation.AGGRESSIVE_EXPLORE:
      return `Aggressive exploration (${percentBudget}% budget). Actively seek novel solutions.`;

    default:
      return `Exploration budget: ${percentBudget}%`;
  }
}

// ============================================================================
// Service Export
// ============================================================================

/**
 * Exploration Budget Service namespace
 */
export const ExplorationBudgetService = {
  calculateExplorationBudget,
  getExplorationRecommendation,
  adjustBudgetForContext,
  calculateExplorationAllocation,
  getBudgetDescription,
  DEFAULT_BUDGET_CONFIG,
};

export default ExplorationBudgetService;
