/**
 * Pattern Compression Service - DP-M3
 *
 * Validates and compresses validated decisions into reusable success patterns.
 * Implements the four validation gates for pattern extraction:
 * 1. Succeeded - Did the decision achieve its goal?
 * 2. Replicable - Can it be applied again in similar contexts?
 * 3. Generalizable - Does it apply beyond the specific instance?
 * 4. Significant - Was the improvement meaningful?
 *
 * @see .roadmap/features/dual-process-decision/FEATURE.json
 * @version 1.0.0
 */

import {
  DecisionTriggerType,
  DEFAULT_DUAL_PROCESS_CONFIG,
  type DecisionEvent,
  type DecisionOutcome,
  type SuccessPattern,
  type ValidationGates,
  type EigenmodeVector,
  type OutcomeProfile,
  type SuccessPatternURN,
} from '../types/dual-process.types.js';
import {
  computeCosineSimilarity,
  findMostSimilarVector,
  computeVectorCentroid,
} from './eigenmode-similarity.service.js';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Pattern compression configuration
 */
export interface CompressionConfig {
  similarityThreshold: number; // Min similarity to merge (default: 0.85)
  minImprovementThreshold: number; // Min improvement for significance (default: 0.05)
  minContextBreadth: number; // Min breadth for generalizability (default: 0.3)
  pruneThreshold: number; // Min confidence to keep (default: 0.1)
  halfLifeDays: number; // Decay half-life (default: 180)
  maxSourceDecisions: number; // Max source decisions to track (default: 100)
}

/**
 * Default compression configuration
 */
export const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
  similarityThreshold: DEFAULT_DUAL_PROCESS_CONFIG.patternSimilarityThreshold,
  minImprovementThreshold: 0.05,
  minContextBreadth: 0.3,
  pruneThreshold: DEFAULT_DUAL_PROCESS_CONFIG.patternPruneThreshold,
  halfLifeDays: DEFAULT_DUAL_PROCESS_CONFIG.patternDecayHalfLifeDays,
  maxSourceDecisions: 100,
};

/**
 * Compression action result types
 */
export enum CompressionAction {
  CREATED = 'created',
  MERGED = 'merged',
  SKIPPED = 'skipped',
}

/**
 * Result of compression operation
 */
export interface CompressionResult {
  action: CompressionAction;
  pattern?: SuccessPattern;
  mergedWith?: string; // URN of pattern merged with
  validationGates?: ValidationGates;
  reason?: string; // Reason if skipped
}

/**
 * Result of pruning operation
 */
export interface PruneResult {
  remaining: SuccessPattern[];
  pruned: SuccessPattern[];
}

/**
 * Options for compression
 */
export interface CompressionOptions {
  force?: boolean; // Skip validation gates
  config?: Partial<CompressionConfig>;
  projectId?: string;
  isGlobal?: boolean;
}

/**
 * Options for pruning
 */
export interface PruneOptions {
  minConfidence?: number;
  maxAge?: number; // Days
}

// ============================================================================
// Pattern ID Generation
// ============================================================================

let patternIdCounter = 0;

/**
 * Generate a unique pattern URN
 */
function generatePatternUrn(projectId: string = 'global'): SuccessPatternURN {
  const year = new Date().getFullYear();
  const counter = String(++patternIdCounter).padStart(4, '0');
  return `urn:luhtech:${projectId}:success-pattern:PAT-${year}-${counter}` as SuccessPatternURN;
}

/**
 * Reset pattern ID counter (for testing)
 */
export function setPatternIdCounter(value: number): void {
  patternIdCounter = value;
}

// ============================================================================
// Validation Gates
// ============================================================================

/**
 * Validate a decision for compression eligibility
 *
 * Four gates must pass:
 * 1. Succeeded - Decision outcome was successful
 * 2. Replicable - Can be applied in similar future contexts
 * 3. Generalizable - Applies beyond single specific instance
 * 4. Significant - Improvement was meaningful
 *
 * @param decision - Decision event to validate
 * @param config - Compression configuration
 * @returns Validation gate results
 */
export function validateForCompression(
  decision: DecisionEvent,
  config: CompressionConfig = DEFAULT_COMPRESSION_CONFIG
): ValidationGates {
  const outcome = decision.outcome;

  // Gate 1: Succeeded
  const succeeded = outcome?.success === true;

  // Gate 2: Replicable
  // Escalations are context-specific and not replicable
  const replicable = decision.trigger.type !== DecisionTriggerType.ESCALATION;

  // Gate 3: Generalizable
  // Requires sufficient context breadth (not too specific)
  const contextBreadth = computeContextBreadth(decision);
  const generalizable = contextBreadth >= config.minContextBreadth;

  // Gate 4: Significant
  // Improvement must be above threshold
  const improvement = outcome?.actualVsProjected ?? 0;
  const significant = succeeded && improvement >= config.minImprovementThreshold;

  return {
    succeeded,
    replicable,
    generalizable,
    significant,
  };
}

/**
 * Check if all validation gates pass
 *
 * @param gates - Validation gate results
 * @returns true if all gates pass
 */
export function isCompressionEligible(gates: ValidationGates): boolean {
  return gates.succeeded && gates.replicable && gates.generalizable && gates.significant;
}

// ============================================================================
// Context Breadth Computation
// ============================================================================

/**
 * Compute context breadth for a decision
 *
 * Higher breadth = more generalizable (applies to wider range of contexts).
 * Lower breadth = more specific (applies only to narrow contexts).
 *
 * Factors:
 * - Action type generality (common actions = higher breadth)
 * - Parameter specificity (generic params = higher breadth)
 * - Trigger type (scheduled/opportunity = higher breadth)
 *
 * @param decision - Decision event
 * @returns Context breadth (0-1)
 */
export function computeContextBreadth(decision: DecisionEvent): number {
  let breadth = 0.5; // Start at neutral

  // Action type factor
  const action = decision.mediation.selectedAction;
  const commonActionTypes = [
    'reschedule_task',
    'reallocate_resource',
    'adjust_schedule',
    'update_priority',
    'assign_worker',
    'approve_change',
    'escalate',
  ];

  if (commonActionTypes.includes(action.actionType)) {
    breadth += 0.2;
  }

  // Trigger type factor
  if (
    decision.trigger.type === DecisionTriggerType.SCHEDULED ||
    decision.trigger.type === DecisionTriggerType.OPPORTUNITY
  ) {
    breadth += 0.1;
  }

  // Parameter specificity factor
  const paramCount = Object.keys(action.parameters).length;
  if (paramCount <= 2) {
    breadth += 0.1;
  } else if (paramCount >= 5) {
    breadth -= 0.1;
  }

  // Urgency factor (very urgent = more specific context)
  if (decision.trigger.urgency > 0.8) {
    breadth -= 0.1;
  }

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, breadth));
}

// ============================================================================
// Pattern Compression
// ============================================================================

/**
 * Compress a decision into a success pattern
 *
 * Either creates a new pattern or merges with an existing similar pattern.
 *
 * @param decision - Decision event to compress
 * @param existingPatterns - Existing patterns to potentially merge with
 * @param options - Compression options
 * @returns Compression result
 */
export function compressDecision(
  decision: DecisionEvent,
  existingPatterns: SuccessPattern[],
  options: CompressionOptions = {}
): CompressionResult {
  const config = { ...DEFAULT_COMPRESSION_CONFIG, ...options.config };

  // Validate unless forced
  if (!options.force) {
    const gates = validateForCompression(decision, config);
    if (!isCompressionEligible(gates)) {
      return {
        action: CompressionAction.SKIPPED,
        validationGates: gates,
        reason: getSkipReason(gates),
      };
    }
  }

  // Find similar existing pattern
  const similarPatterns = existingPatterns.filter(
    p => p.actionType === decision.mediation.selectedAction.actionType
  );

  if (similarPatterns.length > 0) {
    const contextSignatures = similarPatterns.map(p => p.contextSignature);
    const searchResult = findMostSimilarVector(
      decision.stateEigenmodes,
      contextSignatures,
      config.similarityThreshold
    );

    if (searchResult.index >= 0) {
      // Merge with existing pattern
      const existingPattern = similarPatterns[searchResult.index];
      const mergedPattern = mergePatternWithDecision(existingPattern, decision, config);

      return {
        action: CompressionAction.MERGED,
        pattern: mergedPattern,
        mergedWith: existingPattern.$id,
        validationGates: options.force ? undefined : validateForCompression(decision, config),
      };
    }
  }

  // Create new pattern
  const newPattern = createPatternFromDecision(decision, options, config);

  return {
    action: CompressionAction.CREATED,
    pattern: newPattern,
    validationGates: options.force ? undefined : validateForCompression(decision, config),
  };
}

/**
 * Create a new pattern from a decision
 */
function createPatternFromDecision(
  decision: DecisionEvent,
  options: CompressionOptions,
  config: CompressionConfig
): SuccessPattern {
  const now = new Date().toISOString();
  const outcome = decision.outcome!;
  const action = decision.mediation.selectedAction;

  return {
    $id: generatePatternUrn(options.projectId || decision.projectId),
    contextSignature: [...decision.stateEigenmodes] as EigenmodeVector,
    actionType: action.actionType,
    actionTemplate: {
      type: action.actionType,
      parameters: { ...action.parameters },
      constraints: [],
    },
    outcomeProfile: {
      expectedSuccessRate: outcome.success ? 1.0 : 0,
      expectedImprovement: 1 + outcome.actualVsProjected,
      variance: 0, // No variance with single sample
    },
    confidence: computeInitialConfidence(decision),
    frequency: 1,
    successCount: outcome.success ? 1 : 0,
    lastApplied: now,
    lastUpdated: now,
    contextBreadth: computeContextBreadth(decision),
    sourceDecisions: [decision.$id],
    decayFactor: 1.0,
    halfLifeDays: config.halfLifeDays,
    projectId: options.projectId || decision.projectId,
    isGlobal: options.isGlobal ?? false,
    tags: extractTags(decision),
  };
}

/**
 * Compute initial confidence for a new pattern
 */
function computeInitialConfidence(decision: DecisionEvent): number {
  let confidence = 0.5; // Base confidence

  // Boost for high SDI (stable state)
  if (decision.stateSdi > 10000) {
    confidence += 0.2;
  }

  // Boost for better-than-expected outcome
  const improvement = decision.outcome?.actualVsProjected ?? 0;
  if (improvement > 0.1) {
    confidence += 0.15;
  } else if (improvement > 0.2) {
    confidence += 0.25;
  }

  // Cap at 0.9 for new patterns
  return Math.min(0.9, confidence);
}

/**
 * Extract tags from decision for pattern categorization
 */
function extractTags(decision: DecisionEvent): string[] {
  const tags: string[] = [];
  const action = decision.mediation.selectedAction;

  // Action type as tag
  tags.push(action.actionType);

  // Trigger type as tag
  tags.push(decision.trigger.type.toLowerCase());

  // Extract domain from target URN if present
  if (action.targetUrn) {
    const urnParts = action.targetUrn.split(':');
    if (urnParts.length >= 4) {
      tags.push(urnParts[3]); // Node type
    }
  }

  return [...new Set(tags)]; // Deduplicate
}

/**
 * Get reason for skipping compression
 */
function getSkipReason(gates: ValidationGates): string {
  const reasons: string[] = [];

  if (!gates.succeeded) {
    reasons.push('Decision did not succeed');
  }
  if (!gates.replicable) {
    reasons.push('Decision not replicable (escalation)');
  }
  if (!gates.generalizable) {
    reasons.push('Context too specific');
  }
  if (!gates.significant) {
    reasons.push('Improvement not significant');
  }

  return reasons.join('; ');
}

// ============================================================================
// Pattern Merging
// ============================================================================

/**
 * Merge two patterns into one
 *
 * Combines statistics and averages context signatures weighted by frequency.
 *
 * @param pattern1 - First pattern
 * @param pattern2 - Second pattern
 * @returns Merged pattern
 */
export function mergePatterns(
  pattern1: SuccessPattern,
  pattern2: SuccessPattern
): SuccessPattern {
  const totalFrequency = pattern1.frequency + pattern2.frequency;
  const weight1 = pattern1.frequency / totalFrequency;
  const weight2 = pattern2.frequency / totalFrequency;

  // Weighted average of context signatures
  const mergedSignature: EigenmodeVector = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 12; i++) {
    mergedSignature[i] =
      weight1 * pattern1.contextSignature[i] +
      weight2 * pattern2.contextSignature[i];
  }

  // Weighted average of outcome profiles
  const mergedOutcome: OutcomeProfile = {
    expectedSuccessRate:
      weight1 * pattern1.outcomeProfile.expectedSuccessRate +
      weight2 * pattern2.outcomeProfile.expectedSuccessRate,
    expectedImprovement:
      weight1 * pattern1.outcomeProfile.expectedImprovement +
      weight2 * pattern2.outcomeProfile.expectedImprovement,
    variance:
      weight1 * pattern1.outcomeProfile.variance +
      weight2 * pattern2.outcomeProfile.variance,
  };

  // Combine source decisions (with limit)
  const allSourceDecisions = [
    ...pattern1.sourceDecisions,
    ...pattern2.sourceDecisions,
  ];
  const sourceDecisions = allSourceDecisions.slice(-DEFAULT_COMPRESSION_CONFIG.maxSourceDecisions);

  // Use most recent lastApplied
  const lastApplied = pattern1.lastApplied > pattern2.lastApplied
    ? pattern1.lastApplied
    : pattern2.lastApplied;

  return {
    $id: pattern1.$id, // Keep first pattern's ID
    contextSignature: mergedSignature,
    actionType: pattern1.actionType,
    actionTemplate: pattern1.actionTemplate,
    outcomeProfile: mergedOutcome,
    confidence:
      weight1 * pattern1.confidence + weight2 * pattern2.confidence,
    frequency: totalFrequency,
    successCount: pattern1.successCount + pattern2.successCount,
    lastApplied,
    lastUpdated: new Date().toISOString(),
    contextBreadth: Math.max(pattern1.contextBreadth, pattern2.contextBreadth),
    sourceDecisions,
    decayFactor: Math.max(pattern1.decayFactor, pattern2.decayFactor),
    halfLifeDays: pattern1.halfLifeDays,
    projectId: pattern1.projectId,
    isGlobal: pattern1.isGlobal || pattern2.isGlobal,
    tags: [...new Set([...pattern1.tags, ...pattern2.tags])],
  };
}

/**
 * Merge a pattern with a new decision
 */
function mergePatternWithDecision(
  pattern: SuccessPattern,
  decision: DecisionEvent,
  config: CompressionConfig
): SuccessPattern {
  const outcome = decision.outcome!;
  const now = new Date().toISOString();

  const newFrequency = pattern.frequency + 1;
  const oldWeight = pattern.frequency / newFrequency;
  const newWeight = 1 / newFrequency;

  // Update context signature
  const mergedSignature: EigenmodeVector = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 12; i++) {
    mergedSignature[i] =
      oldWeight * pattern.contextSignature[i] +
      newWeight * decision.stateEigenmodes[i];
  }

  // Update outcome profile
  const newImprovement = 1 + outcome.actualVsProjected;
  const mergedOutcome: OutcomeProfile = {
    expectedSuccessRate:
      oldWeight * pattern.outcomeProfile.expectedSuccessRate +
      newWeight * (outcome.success ? 1 : 0),
    expectedImprovement:
      oldWeight * pattern.outcomeProfile.expectedImprovement +
      newWeight * newImprovement,
    variance: updateVariance(
      pattern.outcomeProfile.variance,
      pattern.outcomeProfile.expectedImprovement,
      newImprovement,
      newFrequency
    ),
  };

  // Update source decisions
  const sourceDecisions = [...pattern.sourceDecisions, decision.$id]
    .slice(-config.maxSourceDecisions);

  // Update confidence
  const confidenceBoost = outcome.success && outcome.actualVsProjected > 0 ? 0.02 : -0.02;
  const newConfidence = Math.max(0.1, Math.min(0.99, pattern.confidence + confidenceBoost));

  return {
    ...pattern,
    contextSignature: mergedSignature,
    outcomeProfile: mergedOutcome,
    confidence: newConfidence,
    frequency: newFrequency,
    successCount: pattern.successCount + (outcome.success ? 1 : 0),
    lastApplied: now,
    lastUpdated: now,
    sourceDecisions,
    decayFactor: 1.0, // Reset decay on new application
  };
}

/**
 * Update running variance using Welford's algorithm
 */
function updateVariance(
  oldVariance: number,
  oldMean: number,
  newValue: number,
  newCount: number
): number {
  if (newCount <= 1) {return 0;}

  const newMean = oldMean + (newValue - oldMean) / newCount;
  const newVariance =
    ((newCount - 2) * oldVariance + (newValue - oldMean) * (newValue - newMean)) /
    (newCount - 1);

  return Math.max(0, newVariance);
}

// ============================================================================
// Pattern Decay
// ============================================================================

/**
 * Apply time-based decay to a pattern
 *
 * Uses exponential decay with configurable half-life.
 * Patterns that haven't been applied recently lose confidence.
 *
 * @param pattern - Pattern to decay
 * @returns Pattern with updated decay factor and confidence
 */
export function applyDecay(pattern: SuccessPattern): SuccessPattern {
  const lastApplied = new Date(pattern.lastApplied);
  const now = new Date();
  const daysSinceApplied = (now.getTime() - lastApplied.getTime()) / (1000 * 60 * 60 * 24);

  // Exponential decay: decay = 0.5^(t/half_life)
  const decayFactor = Math.pow(0.5, daysSinceApplied / pattern.halfLifeDays);

  // Apply decay to confidence
  const decayedConfidence = pattern.confidence * decayFactor;

  return {
    ...pattern,
    decayFactor,
    confidence: Math.max(0, decayedConfidence),
  };
}

// ============================================================================
// Pattern Pruning
// ============================================================================

/**
 * Prune patterns below confidence threshold
 *
 * @param patterns - Patterns to prune
 * @param options - Pruning options
 * @returns Pruning result with remaining and pruned patterns
 */
export function prunePatterns(
  patterns: SuccessPattern[],
  options: PruneOptions = {}
): PruneResult {
  const minConfidence = options.minConfidence ?? DEFAULT_COMPRESSION_CONFIG.pruneThreshold;

  const remaining: SuccessPattern[] = [];
  const pruned: SuccessPattern[] = [];

  for (const pattern of patterns) {
    // Apply decay first
    const decayed = applyDecay(pattern);

    if (decayed.confidence >= minConfidence) {
      remaining.push(decayed);
    } else {
      pruned.push(decayed);
    }
  }

  return { remaining, pruned };
}

// ============================================================================
// Pattern Update from Outcome
// ============================================================================

/**
 * Update a pattern based on a new outcome
 *
 * Called when a pattern is applied and the outcome is recorded.
 *
 * @param pattern - Pattern to update
 * @param outcome - Decision outcome
 * @returns Updated pattern
 */
export function updatePatternFromOutcome(
  pattern: SuccessPattern,
  outcome: DecisionOutcome
): SuccessPattern {
  const newFrequency = pattern.frequency + 1;
  const oldWeight = pattern.frequency / newFrequency;
  const newWeight = 1 / newFrequency;

  // Update outcome profile
  const newImprovement = 1 + outcome.actualVsProjected;
  const mergedOutcome: OutcomeProfile = {
    expectedSuccessRate:
      oldWeight * pattern.outcomeProfile.expectedSuccessRate +
      newWeight * (outcome.success ? 1 : 0),
    expectedImprovement:
      oldWeight * pattern.outcomeProfile.expectedImprovement +
      newWeight * newImprovement,
    variance: updateVariance(
      pattern.outcomeProfile.variance,
      pattern.outcomeProfile.expectedImprovement,
      newImprovement,
      newFrequency
    ),
  };

  // Adjust confidence based on outcome
  let confidenceAdjustment = 0;
  if (outcome.success) {
    confidenceAdjustment = 0.01 + outcome.actualVsProjected * 0.05;
  } else {
    confidenceAdjustment = -0.05 - Math.abs(outcome.actualVsProjected) * 0.05;
  }

  const newConfidence = Math.max(0.05, Math.min(0.99,
    pattern.confidence + confidenceAdjustment
  ));

  return {
    ...pattern,
    outcomeProfile: mergedOutcome,
    confidence: newConfidence,
    frequency: newFrequency,
    successCount: pattern.successCount + (outcome.success ? 1 : 0),
    lastApplied: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    decayFactor: 1.0, // Reset decay
  };
}

// ============================================================================
// Export Service Object
// ============================================================================

/**
 * Pattern Compression Service singleton
 */
export const PatternCompressionService = {
  validateForCompression,
  isCompressionEligible,
  compressDecision,
  mergePatterns,
  applyDecay,
  prunePatterns,
  computeContextBreadth,
  updatePatternFromOutcome,
  setPatternIdCounter,
  DEFAULT_COMPRESSION_CONFIG,
  CompressionAction,
};
