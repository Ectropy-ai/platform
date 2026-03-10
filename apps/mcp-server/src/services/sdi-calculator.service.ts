/**
 * SDI Calculator Service - DP-M2
 *
 * Implements Solution Density Index (SDI) calculation and classification.
 * SDI measures the density of viable decision paths in the current project state,
 * enabling the dual-process system to calibrate exploration vs. exploitation.
 *
 * Mathematical Foundation:
 * - SDI range: 10^2 to 10^6 (practical range)
 * - Shannon Entropy: H = log2(SDI)
 * - Higher SDI = more viable paths = safer to explore
 *
 * @see .roadmap/features/dual-process-decision/FEATURE.json
 * @see .roadmap/features/dual-process-decision/interfaces.json
 * @version 1.0.0
 */

import {
  SDIClassification,
  ExplorationRecommendation,
  DEFAULT_DUAL_PROCESS_CONFIG,
  type SDICalculationResult,
  type SDIComponents,
  type SDIThresholds,
  type ExplorationBudget,
} from '../types/dual-process.types.js';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * SDI Calculator configuration
 */
export interface SDICalculatorConfig {
  thresholds?: Partial<SDIThresholds>;
  weights?: {
    viablePathCount?: number; // Default: 0.3
    constraintCount?: number; // Default: 0.2
    resourceSlackRatio?: number; // Default: 0.25
    eigenmodeStability?: number; // Default: 0.25
  };
  budgetWeights?: {
    sdi?: number; // Default: 0.4
    stability?: number; // Default: 0.35
    resources?: number; // Default: 0.25
  };
}

/**
 * SDI calculation input
 */
export interface SDICalculationInput {
  projectId: string;
  zoneId?: string;
  components: SDIComponents;
  includeComponents?: boolean;
  includeThresholds?: boolean;
  config?: SDICalculatorConfig;
}

/**
 * Exploration budget calculation input
 */
export interface ExplorationBudgetInput {
  sdiValue: number;
  eigenmodeStability: number;
  resourceSlackRatio: number;
  thresholds: SDIThresholds;
  config?: SDICalculatorConfig;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default SDI component weights for formula
 */
const DEFAULT_COMPONENT_WEIGHTS = {
  viablePathCount: 0.30,
  constraintCount: 0.20,
  resourceSlackRatio: 0.25,
  eigenmodeStability: 0.25,
};

/**
 * Default exploration budget weights
 */
const DEFAULT_BUDGET_WEIGHTS = {
  sdi: 0.40,
  stability: 0.35,
  resources: 0.25,
};

/**
 * Default thresholds matching the specification
 */
const DEFAULT_SDI_THRESHOLDS: SDIThresholds = {
  critical: DEFAULT_DUAL_PROCESS_CONFIG.sdiCriticalThreshold,
  warning: DEFAULT_DUAL_PROCESS_CONFIG.sdiWarningThreshold,
  healthy: DEFAULT_DUAL_PROCESS_CONFIG.sdiHealthyThreshold,
  abundant: DEFAULT_DUAL_PROCESS_CONFIG.sdiAbundantThreshold,
  isProjectSpecific: false,
};

// Project-specific threshold overrides (in a real system, this would be from DB)
const projectThresholdOverrides: Map<string, Partial<SDIThresholds>> = new Map();

// ============================================================================
// Core Calculation Functions
// ============================================================================

/**
 * Compute SDI from component values
 *
 * Formula:
 * SDI = (viablePaths * slackRatio * stability) / max(constraints, 1)
 *
 * This gives higher SDI when:
 * - More viable paths are available
 * - Higher resource slack ratio
 * - Higher eigenmode stability
 * - Fewer constraints
 *
 * @param components - SDI component values
 * @param weights - Optional custom weights
 * @returns Raw SDI value
 */
export function computeSDIFromComponents(
  components: SDIComponents,
  partialWeights?: Partial<typeof DEFAULT_COMPONENT_WEIGHTS>
): number {
  const weights = { ...DEFAULT_COMPONENT_WEIGHTS, ...partialWeights };
  const {
    viablePathCount,
    constraintCount,
    resourceSlackRatio,
    eigenmodeStability,
  } = components;

  // Prevent division by zero
  const effectiveConstraints = Math.max(constraintCount, 1);

  // Base formula: paths scaled by slack and stability, divided by constraints
  // Adding 1 to avoid log(0) issues later
  const rawSDI =
    (viablePathCount * (1 + resourceSlackRatio) * (1 + eigenmodeStability)) /
    effectiveConstraints;

  // Apply component weights as scaling factors
  const weightedSDI =
    rawSDI *
    (1 + (resourceSlackRatio - 0.5) * weights.resourceSlackRatio) *
    (1 + (eigenmodeStability - 0.5) * weights.eigenmodeStability);

  // Ensure non-negative result
  return Math.max(0, weightedSDI);
}

/**
 * Normalize SDI to log10 scale
 *
 * @param sdiValue - Raw SDI value
 * @returns log10(SDI) for normalized comparison, or 0 for invalid input
 */
export function normalizeSDI(sdiValue: number): number {
  if (sdiValue <= 0) {
    return 0;
  }
  return Math.log10(sdiValue);
}

/**
 * Compute Shannon entropy from SDI
 *
 * H = log2(SDI)
 *
 * This represents the information content / uncertainty in the decision space.
 * Higher entropy = more options = more information needed to specify a path.
 *
 * @param sdiValue - Raw SDI value
 * @returns Shannon entropy in bits, or 0 for invalid input
 */
export function computeShannonEntropy(sdiValue: number): number {
  if (sdiValue <= 1) {
    return 0;
  }
  return Math.log2(sdiValue);
}

/**
 * Classify SDI value based on thresholds
 *
 * Classification zones:
 * - CRITICAL: SDI < critical threshold (100) - Crisis mode
 * - WARNING: critical <= SDI < healthy threshold (10000) - Constrain exploration
 * - HEALTHY: healthy <= SDI < abundant threshold (100000) - Normal operations
 * - ABUNDANT: SDI >= abundant threshold - Full exploration enabled
 *
 * @param sdiValue - Raw SDI value
 * @param thresholds - Threshold configuration
 * @returns SDI classification
 */
export function classifySDI(
  sdiValue: number,
  thresholds: SDIThresholds
): SDIClassification {
  if (sdiValue < thresholds.critical) {
    return SDIClassification.CRITICAL;
  }

  if (sdiValue < thresholds.healthy) {
    return SDIClassification.WARNING;
  }

  if (sdiValue < thresholds.abundant) {
    return SDIClassification.HEALTHY;
  }

  return SDIClassification.ABUNDANT;
}

/**
 * Validate SDI component values
 *
 * @param components - Components to validate
 * @returns true if all components are valid
 */
export function validateSDIComponents(components: SDIComponents): boolean {
  const {
    viablePathCount,
    constraintCount,
    resourceSlackRatio,
    eigenmodeStability,
  } = components;

  // Viable paths must be non-negative
  if (viablePathCount < 0) {
    return false;
  }

  // Constraints must be non-negative
  if (constraintCount < 0) {
    return false;
  }

  // Resource slack ratio must be in [0, 1]
  if (resourceSlackRatio < 0 || resourceSlackRatio > 1) {
    return false;
  }

  // Eigenmode stability must be in [0, 1]
  if (eigenmodeStability < 0 || eigenmodeStability > 1) {
    return false;
  }

  return true;
}

// ============================================================================
// Exploration Budget Functions
// ============================================================================

/**
 * Compute exploration budget based on current state
 *
 * Formula:
 * budget = (sdiFactor * 0.4) + (stabilityFactor * 0.35) + (resourceFactor * 0.25)
 *
 * Where:
 * - sdiFactor = min(log10(SDI) / 6, 1) - More paths = more exploration room
 * - stabilityFactor = eigenmodeStability - Stable state = safer to experiment
 * - resourceFactor = resourceSlackRatio - More slack = can afford risk
 *
 * @param input - Budget calculation input
 * @returns Exploration budget with breakdown
 */
export function computeExplorationBudget(input: ExplorationBudgetInput): ExplorationBudget {
  const {
    sdiValue,
    eigenmodeStability,
    resourceSlackRatio,
    thresholds,
    config,
  } = input;

  const weights = {
    ...DEFAULT_BUDGET_WEIGHTS,
    ...config?.budgetWeights,
  };

  // Check for critical state first - no exploration allowed
  if (sdiValue < thresholds.critical) {
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

  // SDI factor: min(log10(SDI) / 6, 1)
  // This normalizes SDI to a 0-1 scale where 10^6 = max
  const sdiLog = sdiValue > 0 ? Math.log10(sdiValue) : 0;
  const sdiFactor = Math.min(sdiLog / 6, 1);

  // Stability and resource factors are already 0-1
  const stabilityFactor = eigenmodeStability;
  const resourceFactor = resourceSlackRatio;

  // Compute weighted budget
  const budget = Math.min(
    1,
    Math.max(
      0,
      sdiFactor * weights.sdi +
        stabilityFactor * weights.stability +
        resourceFactor * weights.resources
    )
  );

  // Determine recommendation based on budget level
  // Thresholds: <0.3 = cautious, 0.3-0.7 = balanced, >0.7 = aggressive
  let recommendation: ExplorationRecommendation;
  if (budget < 0.3) {
    recommendation = ExplorationRecommendation.CAUTIOUS_EXPLORE;
  } else if (budget < 0.7) {
    recommendation = ExplorationRecommendation.BALANCED;
  } else {
    recommendation = ExplorationRecommendation.AGGRESSIVE_EXPLORE;
  }

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

// ============================================================================
// Main API Functions
// ============================================================================

/**
 * Calculate SDI for a project/zone
 *
 * This is the main entry point for SDI calculation. It:
 * 1. Validates input components
 * 2. Computes raw SDI from components
 * 3. Normalizes to log scale
 * 4. Computes Shannon entropy
 * 5. Classifies based on thresholds
 * 6. Computes exploration budget
 *
 * @param input - Calculation input
 * @returns Full SDI calculation result
 */
export async function calculateSDI(
  input: SDICalculationInput
): Promise<SDICalculationResult> {
  const {
    projectId,
    components,
    includeComponents = true,
    includeThresholds = true,
    config,
  } = input;

  // Validate components
  if (!validateSDIComponents(components)) {
    throw new Error('Invalid SDI components: values must be non-negative and ratios must be in [0,1]');
  }

  // Get thresholds (project-specific or default)
  const thresholds = await getSDIThresholds(projectId, config?.thresholds);

  // Compute raw SDI
  const sdiValue = computeSDIFromComponents(components, config?.weights);

  // Normalize and compute entropy
  const sdiLog = normalizeSDI(sdiValue);
  const shannonEntropy = computeShannonEntropy(sdiValue);

  // Classify
  const classification = classifySDI(sdiValue, thresholds);

  // Compute exploration budget
  const budgetResult = computeExplorationBudget({
    sdiValue,
    eigenmodeStability: components.eigenmodeStability,
    resourceSlackRatio: components.resourceSlackRatio,
    thresholds,
    config,
  });

  // Build result
  const result: SDICalculationResult = {
    sdiValue,
    sdiLog,
    shannonEntropy,
    classification,
    explorationBudget: budgetResult.budget,
    components: includeComponents ? components : {} as SDIComponents,
    thresholds: includeThresholds ? thresholds : {} as SDIThresholds,
    timestamp: new Date().toISOString(),
  };

  return result;
}

/**
 * Get SDI thresholds for a project
 *
 * Returns project-specific thresholds if configured, otherwise defaults.
 *
 * @param projectId - Project identifier
 * @param overrides - Optional threshold overrides
 * @returns SDI thresholds
 */
export async function getSDIThresholds(
  projectId: string,
  overrides?: Partial<SDIThresholds>
): Promise<SDIThresholds> {
  // Check for project-specific overrides
  const projectOverrides = projectThresholdOverrides.get(projectId);

  if (projectOverrides || overrides) {
    return {
      ...DEFAULT_SDI_THRESHOLDS,
      ...projectOverrides,
      ...overrides,
      isProjectSpecific: true,
    };
  }

  return { ...DEFAULT_SDI_THRESHOLDS };
}

/**
 * Set project-specific SDI thresholds
 *
 * @param projectId - Project identifier
 * @param thresholds - Threshold values to set
 */
export function setProjectThresholds(
  projectId: string,
  thresholds: Partial<SDIThresholds>
): void {
  // Validate threshold ordering
  const merged = { ...DEFAULT_SDI_THRESHOLDS, ...thresholds };
  if (
    merged.critical >= merged.warning ||
    merged.warning >= merged.healthy ||
    merged.healthy >= merged.abundant
  ) {
    throw new Error(
      'Invalid thresholds: must satisfy critical < warning < healthy < abundant'
    );
  }

  projectThresholdOverrides.set(projectId, thresholds);
}

/**
 * Clear project-specific thresholds
 *
 * @param projectId - Project identifier
 */
export function clearProjectThresholds(projectId: string): void {
  projectThresholdOverrides.delete(projectId);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the exploration budget recommendation text
 *
 * @param budget - Budget value (0-1)
 * @param classification - SDI classification
 * @returns Human-readable recommendation
 */
export function getExplorationRecommendationText(
  budget: number,
  classification: SDIClassification
): string {
  switch (classification) {
    case SDIClassification.CRITICAL:
      return 'Crisis mode: Use validated patterns only. No exploration permitted.';

    case SDIClassification.WARNING:
      return `Limited exploration (${Math.round(budget * 100)}% budget). Prefer proven patterns with minimal deviation.`;

    case SDIClassification.HEALTHY:
      return `Balanced exploration (${Math.round(budget * 100)}% budget). Mix proven patterns with moderate innovation.`;

    case SDIClassification.ABUNDANT:
      return `Full exploration enabled (${Math.round(budget * 100)}% budget). Actively seek novel solutions.`;

    default:
      return `Exploration budget: ${Math.round(budget * 100)}%`;
  }
}

/**
 * Estimate SDI impact of a proposed change
 *
 * @param currentComponents - Current SDI components
 * @param delta - Projected changes to components
 * @returns Projected SDI after change
 */
export function projectSDIChange(
  currentComponents: SDIComponents,
  delta: Partial<SDIComponents>
): {
  projectedSDI: number;
  currentSDI: number;
  delta: number;
  deltaPercent: number;
} {
  const currentSDI = computeSDIFromComponents(currentComponents);

  const projectedComponents: SDIComponents = {
    viablePathCount: currentComponents.viablePathCount + (delta.viablePathCount || 0),
    constraintCount: currentComponents.constraintCount + (delta.constraintCount || 0),
    resourceSlackRatio: Math.min(1, Math.max(0,
      currentComponents.resourceSlackRatio + (delta.resourceSlackRatio || 0)
    )),
    eigenmodeStability: Math.min(1, Math.max(0,
      currentComponents.eigenmodeStability + (delta.eigenmodeStability || 0)
    )),
  };

  const projectedSDI = computeSDIFromComponents(projectedComponents);

  return {
    projectedSDI,
    currentSDI,
    delta: projectedSDI - currentSDI,
    deltaPercent: currentSDI > 0 ? ((projectedSDI - currentSDI) / currentSDI) * 100 : 0,
  };
}
