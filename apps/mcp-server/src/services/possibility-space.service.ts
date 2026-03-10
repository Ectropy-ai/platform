/**
 * Possibility Space Service - DP-M4
 *
 * Implements Engine 2 of the Dual-Process Decision Architecture.
 * Generates and evaluates viable options for decision points.
 *
 * Core Capabilities:
 * - Generate viable options based on constraints and resources
 * - Identify novel options (without pattern precedent)
 * - Project SDI impact for each option
 * - Compute risk profiles
 * - Calculate exploration value (information gain)
 *
 * Cognitive Parallel: System 2 (Slow/Deliberative)
 * - Deliberate generation of alternatives
 * - Explicit evaluation of tradeoffs
 * - Discovery of novel solutions
 *
 * @see .roadmap/features/dual-process-decision/FEATURE.json
 * @see .roadmap/features/dual-process-decision/interfaces.json
 * @version 1.0.0
 */

import type {
  SDIComponents,
  EigenmodeVector,
  SuccessPattern,
} from '../types/dual-process.types.js';

import {
  projectSDI,
  projectMultipleActions,
  rankActionsBySDIImpact,
  type ProposedAction,
  type SDIProjectionResult,
  type ZoneDependency,
} from './sdi-projector.service.js';

import {
  computeCosineSimilarity,
  findMostSimilarVector,
} from './eigenmode-similarity.service.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Decision context for option generation
 */
export interface DecisionContext {
  triggerType: 'scheduled' | 'exception' | 'opportunity' | 'escalation';
  constraints: Constraint[];
  resources: ResourceState;
  deadline?: Date | string;
  urgency?: number; // 0-1
  eigenmodeContext?: EigenmodeVector;
}

/**
 * A constraint that limits viable options
 */
export interface Constraint {
  id: string;
  type: 'budget' | 'schedule' | 'scope' | 'quality' | 'resource' | 'regulatory' | 'safety';
  description: string;
  severity: 'soft' | 'hard'; // Soft can be violated with penalty, hard cannot
  value?: number;
  unit?: string;
}

/**
 * Current resource state
 */
export interface ResourceState {
  laborHoursAvailable?: number;
  budgetRemaining?: number;
  equipmentAvailable?: string[];
  materialsOnHand?: string[];
  subcontractorsAvailable?: string[];
}

/**
 * A generated option
 */
export interface Option {
  id: string;
  action: ProposedAction;
  isNovel: boolean;
  projectedSdi: number;
  sdiDelta: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  matchedPatternId?: string;
  matchedPatternSimilarity?: number;
  constraintViolations: ConstraintViolation[];
  feasibilityScore: number; // 0-1
  explorationValue: number; // Information value of choosing this
}

/**
 * A constraint violation by an option
 */
export interface ConstraintViolation {
  constraintId: string;
  constraintType: string;
  severity: 'soft' | 'hard';
  magnitude: number; // How much the constraint is exceeded
  description: string;
}

/**
 * Risk profile for an option
 */
export interface RiskProfile {
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  factors: RiskFactor[];
  mitigationSuggestions?: string[];
}

/**
 * Individual risk factor
 */
export interface RiskFactor {
  name: string;
  severity: number; // 0-1
  probability: number; // 0-1
  impact: string;
  category: 'technical' | 'schedule' | 'cost' | 'quality' | 'safety' | 'external';
}

/**
 * Input for option generation
 */
export interface GenerateOptionsInput {
  projectId: string;
  zoneId?: string;
  currentComponents: SDIComponents;
  decisionContext: DecisionContext;
  computationDepth?: number; // 1-10, default 3
  includeRiskProfiles?: boolean;
  existingPatterns?: SuccessPattern[];
  zoneDependencies?: ZoneDependency[];
  maxOptions?: number; // Default 10
}

/**
 * Output from option generation
 */
export interface GenerateOptionsOutput {
  viableOptions: Option[];
  novelOptions: Option[];
  sdiProjections: Map<string, number>;
  riskProfiles?: Map<string, RiskProfile>;
  explorationValue: Map<string, number>;
  computationDepth: number;
  generationLatencyMs: number;
  constraintsAnalyzed: number;
  optionsConsidered: number;
  optionsFiltered: number;
}

/**
 * Configuration for option generation
 */
export interface PossibilitySpaceConfig {
  defaultComputationDepth: number;
  defaultMaxOptions: number;
  noveltyThreshold: number; // Similarity below which option is considered novel
  feasibilityThreshold: number; // Minimum feasibility to include option
  hardConstraintWeight: number;
  softConstraintWeight: number;
  explorationBonusWeight: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default configuration
 */
export const DEFAULT_POSSIBILITY_SPACE_CONFIG: PossibilitySpaceConfig = {
  defaultComputationDepth: 3,
  defaultMaxOptions: 10,
  noveltyThreshold: 0.7, // Below 0.7 similarity = novel
  feasibilityThreshold: 0.3,
  hardConstraintWeight: 10.0,
  softConstraintWeight: 1.0,
  explorationBonusWeight: 0.15,
};

/**
 * Action templates by trigger type
 */
const ACTION_TEMPLATES: Record<string, ProposedAction[]> = {
  scheduled: [
    { actionType: 'approve', parameters: {} },
    { actionType: 'defer', parameters: {} },
    { actionType: 'escalate', parameters: {} },
  ],
  exception: [
    { actionType: 'mitigate_risk', parameters: {} },
    { actionType: 'reallocate_resource', parameters: {} },
    { actionType: 'compress_schedule', parameters: {} },
    { actionType: 'extend_deadline', parameters: {} },
    { actionType: 'reduce_scope', parameters: {} },
    { actionType: 'escalate', parameters: {} },
  ],
  opportunity: [
    { actionType: 'add_resource', parameters: {} },
    { actionType: 'reduce_scope', parameters: {} },
    { actionType: 'increase_quality', parameters: {} },
    { actionType: 'approve', parameters: {} },
    { actionType: 'defer', parameters: {} },
  ],
  escalation: [
    { actionType: 'approve', parameters: {} },
    { actionType: 'reject', parameters: {} },
    { actionType: 'add_resource', parameters: {} },
    { actionType: 'extend_deadline', parameters: {} },
    { actionType: 'escalate', parameters: {} },
  ],
};

/**
 * Additional actions by constraint type
 */
const CONSTRAINT_RESPONSE_ACTIONS: Record<string, ProposedAction[]> = {
  budget: [
    { actionType: 'reduce_scope', parameters: {} },
    { actionType: 'reallocate_resource', parameters: {} },
    { actionType: 'defer', parameters: {} },
  ],
  schedule: [
    { actionType: 'add_resource', parameters: {} },
    { actionType: 'compress_schedule', parameters: {} },
    { actionType: 'reduce_scope', parameters: {} },
  ],
  scope: [
    { actionType: 'reduce_scope', parameters: {} },
    { actionType: 'add_resource', parameters: {} },
    { actionType: 'extend_deadline', parameters: {} },
  ],
  quality: [
    { actionType: 'increase_quality', parameters: {} },
    { actionType: 'relax_tolerance', parameters: {} },
    { actionType: 'add_resource', parameters: {} },
  ],
  resource: [
    { actionType: 'reallocate_resource', parameters: {} },
    { actionType: 'add_resource', parameters: {} },
    { actionType: 'defer', parameters: {} },
  ],
  safety: [
    { actionType: 'mitigate_risk', parameters: {} },
    { actionType: 'escalate', parameters: {} },
  ],
  regulatory: [
    { actionType: 'escalate', parameters: {} },
    { actionType: 'defer', parameters: {} },
  ],
};

// ============================================================================
// Option ID Generation
// ============================================================================

let optionIdCounter = 0;

export function setOptionIdCounter(value: number): void {
  optionIdCounter = value;
}

function generateOptionId(): string {
  return `OPT-${Date.now().toString(36)}-${(++optionIdCounter).toString(36).padStart(4, '0')}`;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Generate candidate actions based on context
 */
export function generateCandidateActions(
  context: DecisionContext,
  depth: number = 3
): ProposedAction[] {
  const candidates: ProposedAction[] = [];
  const seenTypes = new Set<string>();

  // Add base actions for trigger type
  const baseActions = ACTION_TEMPLATES[context.triggerType] || ACTION_TEMPLATES.scheduled;
  for (const action of baseActions) {
    if (!seenTypes.has(action.actionType)) {
      candidates.push({ ...action });
      seenTypes.add(action.actionType);
    }
  }

  // Add constraint-specific responses
  for (const constraint of context.constraints) {
    const responseActions = CONSTRAINT_RESPONSE_ACTIONS[constraint.type] || [];
    for (const action of responseActions) {
      if (!seenTypes.has(action.actionType)) {
        candidates.push({ ...action });
        seenTypes.add(action.actionType);
      }
    }
  }

  // For deeper computation, add parameter variations
  if (depth >= 2) {
    const variations: ProposedAction[] = [];
    for (const candidate of candidates) {
      // Add urgency variations
      if (candidate.actionType !== 'escalate') {
        variations.push({
          ...candidate,
          parameters: { ...candidate.parameters, urgent: true },
        });
      }
    }
    candidates.push(...variations);
  }

  // For even deeper computation, add resource-specific variations
  if (depth >= 3 && context.resources) {
    const resourceVariations: ProposedAction[] = [];

    if (context.resources.laborHoursAvailable && context.resources.laborHoursAvailable > 0) {
      resourceVariations.push({
        actionType: 'add_resource',
        parameters: { resourceType: 'labor', amount: context.resources.laborHoursAvailable * 0.5 },
        resourceImpact: { laborHoursConsumed: context.resources.laborHoursAvailable * 0.5 },
      });
    }

    if (context.resources.budgetRemaining && context.resources.budgetRemaining > 0) {
      resourceVariations.push({
        actionType: 'add_resource',
        parameters: { resourceType: 'contractor', budget: context.resources.budgetRemaining * 0.25 },
        resourceImpact: { budgetConsumed: context.resources.budgetRemaining * 0.25 },
      });
    }

    candidates.push(...resourceVariations);
  }

  return candidates;
}

/**
 * Check if an action violates any constraints
 */
export function checkConstraintViolations(
  action: ProposedAction,
  constraints: Constraint[],
  resources: ResourceState
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  for (const constraint of constraints) {
    let violated = false;
    let magnitude = 0;

    switch (constraint.type) {
      case 'budget':
        if (action.estimatedCost && constraint.value) {
          if (action.estimatedCost > (resources.budgetRemaining || 0)) {
            violated = true;
            magnitude = (action.estimatedCost - (resources.budgetRemaining || 0)) / constraint.value;
          }
        }
        break;

      case 'schedule':
        if (action.actionType === 'extend_deadline' && constraint.severity === 'hard') {
          violated = true;
          magnitude = 0.5;
        }
        break;

      case 'resource':
        if (action.resourceImpact?.laborHoursConsumed) {
          const available = resources.laborHoursAvailable || 0;
          if (action.resourceImpact.laborHoursConsumed > available) {
            violated = true;
            magnitude = (action.resourceImpact.laborHoursConsumed - available) / Math.max(available, 1);
          }
        }
        break;

      case 'safety':
        if (action.actionType === 'accept_risk') {
          violated = true;
          magnitude = 0.8;
        }
        break;

      case 'regulatory':
        if (action.actionType === 'relax_tolerance') {
          violated = true;
          magnitude = 0.6;
        }
        break;
    }

    if (violated) {
      violations.push({
        constraintId: constraint.id,
        constraintType: constraint.type,
        severity: constraint.severity,
        magnitude,
        description: `Action ${action.actionType} violates ${constraint.type} constraint: ${constraint.description}`,
      });
    }
  }

  return violations;
}

/**
 * Calculate feasibility score for an option
 */
export function calculateFeasibility(
  violations: ConstraintViolation[],
  config: PossibilitySpaceConfig = DEFAULT_POSSIBILITY_SPACE_CONFIG
): number {
  if (violations.length === 0) {
    return 1.0;
  }

  let penalty = 0;
  for (const violation of violations) {
    const weight = violation.severity === 'hard'
      ? config.hardConstraintWeight
      : config.softConstraintWeight;
    penalty += violation.magnitude * weight;
  }

  // Hard constraint violations make option infeasible
  const hasHardViolation = violations.some((v) => v.severity === 'hard');
  if (hasHardViolation) {
    return 0;
  }

  // Soft violations reduce feasibility but don't eliminate
  return Math.max(0, 1 - penalty * 0.2);
}

/**
 * Check if an option is novel (not matching existing patterns)
 */
export function checkNovelty(
  action: ProposedAction,
  contextSignature: EigenmodeVector | undefined,
  existingPatterns: SuccessPattern[],
  threshold: number = 0.7
): { isNovel: boolean; matchedPatternId?: string; similarity?: number } {
  if (!contextSignature || existingPatterns.length === 0) {
    return { isNovel: true };
  }

  // Find patterns matching this action type
  const matchingTypePatterns = existingPatterns.filter(
    (p) => p.actionType === action.actionType
  );

  if (matchingTypePatterns.length === 0) {
    return { isNovel: true };
  }

  // Find most similar pattern
  const signatures = matchingTypePatterns.map((p) => p.contextSignature);
  const result = findMostSimilarVector(contextSignature, signatures, 0);

  if (result.index < 0) {
    return { isNovel: true };
  }

  const similarity = result.similarity;
  const matchedPattern = matchingTypePatterns[result.index];

  return {
    isNovel: similarity < threshold,
    matchedPatternId: matchedPattern.$id,
    similarity,
  };
}

/**
 * Calculate risk profile for an option
 */
export function calculateRiskProfile(
  option: Option,
  context: DecisionContext
): RiskProfile {
  const factors: RiskFactor[] = [];

  // SDI-based risk
  if (option.sdiDelta < -500) {
    factors.push({
      name: 'SDI Degradation',
      severity: Math.min(1, Math.abs(option.sdiDelta) / 2000),
      probability: 0.7,
      impact: 'Reduced decision flexibility',
      category: 'technical',
    });
  }

  // Novelty risk
  if (option.isNovel) {
    factors.push({
      name: 'Unproven Approach',
      severity: 0.4,
      probability: 0.5,
      impact: 'Uncertain outcome without precedent',
      category: 'technical',
    });
  }

  // Constraint violation risk
  for (const violation of option.constraintViolations) {
    factors.push({
      name: `${violation.constraintType} Constraint Pressure`,
      severity: violation.magnitude,
      probability: 0.6,
      impact: violation.description,
      category: violation.constraintType as RiskFactor['category'],
    });
  }

  // Urgency risk
  if (context.urgency && context.urgency > 0.7) {
    factors.push({
      name: 'Time Pressure',
      severity: context.urgency * 0.6,
      probability: 0.8,
      impact: 'Reduced time for validation',
      category: 'schedule',
    });
  }

  // Calculate overall risk
  const avgSeverity = factors.length > 0
    ? factors.reduce((sum, f) => sum + f.severity * f.probability, 0) / factors.length
    : 0;

  let overallRisk: RiskProfile['overallRisk'];
  if (avgSeverity > 0.7) {
    overallRisk = 'critical';
  } else if (avgSeverity > 0.5) {
    overallRisk = 'high';
  } else if (avgSeverity > 0.25) {
    overallRisk = 'medium';
  } else {
    overallRisk = 'low';
  }

  return {
    overallRisk,
    factors,
  };
}

/**
 * Calculate exploration value (information gain) for an option
 */
export function calculateExplorationValue(
  option: Option,
  existingPatterns: SuccessPattern[],
  context: DecisionContext,
  config: PossibilitySpaceConfig = DEFAULT_POSSIBILITY_SPACE_CONFIG
): number {
  let value = 0;

  // Novel options have inherent exploration value
  if (option.isNovel) {
    value += 0.4;
  }

  // Low-frequency patterns have exploration value
  if (option.matchedPatternId) {
    const pattern = existingPatterns.find((p) => p.$id === option.matchedPatternId);
    if (pattern && pattern.frequency < 5) {
      value += 0.2;
    }
  }

  // Options that improve SDI in constrained contexts have value
  if (context.constraints.length > 3 && option.sdiDelta > 0) {
    value += 0.15;
  }

  // Options that address specific constraint types have value
  const actionType = option.action.actionType;
  const relevantConstraints = context.constraints.filter((c) => {
    const responses = CONSTRAINT_RESPONSE_ACTIONS[c.type] || [];
    return responses.some((r) => r.actionType === actionType);
  });
  if (relevantConstraints.length > 0) {
    value += 0.1 * relevantConstraints.length;
  }

  // Cap at 1.0
  return Math.min(1, value);
}

/**
 * Generate and evaluate options for a decision point
 */
export function generateOptions(
  input: GenerateOptionsInput,
  config: PossibilitySpaceConfig = DEFAULT_POSSIBILITY_SPACE_CONFIG
): GenerateOptionsOutput {
  const startTime = performance.now();

  const depth = input.computationDepth ?? config.defaultComputationDepth;
  const maxOptions = input.maxOptions ?? config.defaultMaxOptions;

  // Generate candidate actions
  const candidates = generateCandidateActions(input.decisionContext, depth);
  const optionsConsidered = candidates.length;

  // Project SDI for all candidates
  const projections = projectMultipleActions(
    input.projectId,
    input.currentComponents,
    candidates,
    {
      horizon: 7,
      includeConfidence: false,
      zoneId: input.zoneId,
      zoneDependencies: input.zoneDependencies,
    }
  );

  // Evaluate each candidate
  const options: Option[] = [];
  let optionsFiltered = 0;

  const projectionEntries = Array.from(projections.entries());

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const projectionKey = candidate.targetUrn || `action-${i}`;
    const projection = projections.get(projectionKey);

    if (!projection) {continue;}

    // Check constraint violations
    const violations = checkConstraintViolations(
      candidate,
      input.decisionContext.constraints,
      input.decisionContext.resources
    );

    // Calculate feasibility
    const feasibility = calculateFeasibility(violations, config);

    // Skip infeasible options
    if (feasibility < config.feasibilityThreshold) {
      optionsFiltered++;
      continue;
    }

    // Check novelty
    const novelty = checkNovelty(
      candidate,
      input.decisionContext.eigenmodeContext,
      input.existingPatterns || [],
      config.noveltyThreshold
    );

    // Determine risk level based on SDI delta and violations
    let riskLevel: Option['riskLevel'];
    if (violations.some((v) => v.severity === 'hard') || projection.sdiDelta < -1000) {
      riskLevel = 'critical';
    } else if (violations.length > 2 || projection.sdiDelta < -500) {
      riskLevel = 'high';
    } else if (violations.length > 0 || projection.sdiDelta < -100) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'low';
    }

    const option: Option = {
      id: generateOptionId(),
      action: candidate,
      isNovel: novelty.isNovel,
      projectedSdi: projection.projectedSdi,
      sdiDelta: projection.sdiDelta,
      riskLevel,
      matchedPatternId: novelty.matchedPatternId,
      matchedPatternSimilarity: novelty.similarity,
      constraintViolations: violations,
      feasibilityScore: feasibility,
      explorationValue: 0, // Will be calculated below
    };

    // Calculate exploration value
    option.explorationValue = calculateExplorationValue(
      option,
      input.existingPatterns || [],
      input.decisionContext,
      config
    );

    options.push(option);
  }

  // Sort by SDI impact + exploration bonus
  options.sort((a, b) => {
    const scoreA = a.projectedSdi + a.explorationValue * config.explorationBonusWeight * a.projectedSdi;
    const scoreB = b.projectedSdi + b.explorationValue * config.explorationBonusWeight * b.projectedSdi;
    return scoreB - scoreA;
  });

  // Limit to maxOptions
  const viableOptions = options.slice(0, maxOptions);
  const novelOptions = viableOptions.filter((o) => o.isNovel);

  // Build SDI projections map
  const sdiProjections = new Map<string, number>();
  for (const option of viableOptions) {
    sdiProjections.set(option.id, option.projectedSdi);
  }

  // Build exploration value map
  const explorationValue = new Map<string, number>();
  for (const option of viableOptions) {
    explorationValue.set(option.id, option.explorationValue);
  }

  // Build risk profiles if requested
  let riskProfiles: Map<string, RiskProfile> | undefined;
  if (input.includeRiskProfiles) {
    riskProfiles = new Map();
    for (const option of viableOptions) {
      riskProfiles.set(option.id, calculateRiskProfile(option, input.decisionContext));
    }
  }

  return {
    viableOptions,
    novelOptions,
    sdiProjections,
    riskProfiles,
    explorationValue,
    computationDepth: depth,
    generationLatencyMs: performance.now() - startTime,
    constraintsAnalyzed: input.decisionContext.constraints.length,
    optionsConsidered,
    optionsFiltered,
  };
}

/**
 * Find the best option based on criteria
 */
export function findBestOption(
  options: Option[],
  criteria: 'sdi' | 'feasibility' | 'exploration' | 'balanced' = 'balanced'
): Option | undefined {
  if (options.length === 0) {return undefined;}

  switch (criteria) {
    case 'sdi':
      return options.reduce((best, current) =>
        current.projectedSdi > best.projectedSdi ? current : best
      );

    case 'feasibility':
      return options.reduce((best, current) =>
        current.feasibilityScore > best.feasibilityScore ? current : best
      );

    case 'exploration':
      return options.reduce((best, current) =>
        current.explorationValue > best.explorationValue ? current : best
      );

    case 'balanced':
    default:
      // Weighted score combining all factors
      const score = (o: Option) =>
        o.projectedSdi * 0.4 +
        o.feasibilityScore * 1000 * 0.3 +
        o.explorationValue * 1000 * 0.2 +
        (o.riskLevel === 'low' ? 100 : o.riskLevel === 'medium' ? 50 : 0) * 0.1;

      return options.reduce((best, current) =>
        score(current) > score(best) ? current : best
      );
  }
}

/**
 * Filter options by risk level
 */
export function filterByRiskLevel(
  options: Option[],
  maxRisk: 'low' | 'medium' | 'high' | 'critical'
): Option[] {
  const riskOrder = ['low', 'medium', 'high', 'critical'];
  const maxIndex = riskOrder.indexOf(maxRisk);

  return options.filter((o) => riskOrder.indexOf(o.riskLevel) <= maxIndex);
}

/**
 * Get option summary statistics
 */
export function getOptionsSummary(options: Option[]): {
  totalOptions: number;
  novelCount: number;
  feasibleCount: number;
  avgSdiDelta: number;
  riskDistribution: Record<string, number>;
} {
  const feasibleOptions = options.filter((o) => o.feasibilityScore > 0.5);
  const novelOptions = options.filter((o) => o.isNovel);
  const avgDelta = options.length > 0
    ? options.reduce((sum, o) => sum + o.sdiDelta, 0) / options.length
    : 0;

  const riskDist: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const o of options) {
    riskDist[o.riskLevel]++;
  }

  return {
    totalOptions: options.length,
    novelCount: novelOptions.length,
    feasibleCount: feasibleOptions.length,
    avgSdiDelta: avgDelta,
    riskDistribution: riskDist,
  };
}

// ============================================================================
// Service Object
// ============================================================================

/**
 * Possibility Space Service namespace
 */
export const PossibilitySpaceService = {
  // Core generation
  generateOptions,
  generateCandidateActions,

  // Evaluation
  checkConstraintViolations,
  calculateFeasibility,
  checkNovelty,
  calculateRiskProfile,
  calculateExplorationValue,

  // Selection
  findBestOption,
  filterByRiskLevel,

  // Analysis
  getOptionsSummary,

  // Configuration
  setOptionIdCounter,
  DEFAULT_POSSIBILITY_SPACE_CONFIG,
};

export default PossibilitySpaceService;
