/**
 * Pattern Learning Service - DP-M6
 *
 * Manages the learning loop from decision outcomes to pattern compression.
 * When a decision outcome is recorded:
 * 1. Evaluates if the decision meets compression criteria
 * 2. Triggers pattern compression pipeline
 * 3. Updates existing patterns or creates new ones
 * 4. Emits appropriate events
 *
 * @see .roadmap/features/dual-process-decision/FEATURE.json
 * @version 1.0.0
 */

import {
  MediationSourceEngine,
  DUAL_PROCESS_EVENT_TYPES,
  type DecisionEvent,
  type DecisionOutcome,
  type SuccessPattern,
  type ValidationGates,
  type EigenmodeVector,
  type RecordDecisionOutcomeInput,
  type RecordDecisionOutcomeOutput,
} from '../types/dual-process.types.js';

import {
  mergePatterns,
} from './pattern-compression.service.js';

import {
  storePattern,
  getPatternDetails,
  updatePattern,
} from './success-stack.service.js';

import {
  findMostSimilarVector,
} from './eigenmode-similarity.service.js';

import {
  emitEvent,
  emitOutcomeRecorded,
} from './decision-event-handler.service.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Decision record for learning
 */
export interface DecisionRecord {
  decisionEventUrn: string;
  projectId: string;
  zoneId?: string;
  actorId: string;
  timestamp: string;
  triggerType: string;
  actionType: string;
  eigenmodeContext: EigenmodeVector;
  sourceEngine: MediationSourceEngine;
  explorationAllocation: number;
  outcome?: DecisionOutcome;
}

/**
 * Learning result
 */
export interface LearningResult {
  recorded: boolean;
  compressionEligible: boolean;
  compressionTriggered: boolean;
  patternUrn?: string;
  patternAction?: 'created' | 'merged' | 'updated' | 'skipped';
  validationResults?: ValidationGates;
  validationConfidence?: number;
  error?: string;
}

/**
 * Configuration for pattern learning
 */
export interface PatternLearningConfig {
  minSuccessRateForCompression: number;
  minImprovementForCompression: number;
  similarityThresholdForMerge: number;
  autoCompress: boolean;
  requireReplication: boolean;
  minReplicationCount: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default learning configuration
 */
export const DEFAULT_LEARNING_CONFIG: PatternLearningConfig = {
  minSuccessRateForCompression: 0.7,
  minImprovementForCompression: 0.1, // 10% improvement
  similarityThresholdForMerge: 0.9,
  autoCompress: true,
  requireReplication: false,
  minReplicationCount: 2,
};

// ============================================================================
// Pattern Creation Helper
// ============================================================================

let patternIdCounter = 0;

/**
 * Generate a pattern URN matching SuccessPatternURN type
 */
function generatePatternUrn(projectId: string): `urn:luhtech:${string}:success-pattern:PAT-${string}` {
  const year = new Date().getFullYear();
  const counter = String(++patternIdCounter).padStart(4, '0');
  return `urn:luhtech:${projectId}:success-pattern:PAT-${year}-${counter}`;
}

/**
 * Create a SuccessPattern from a DecisionRecord
 */
function createPatternFromRecord(record: DecisionRecord): SuccessPattern {
  const now = new Date().toISOString();
  const outcome = record.outcome!;

  return {
    $id: generatePatternUrn(record.projectId),
    contextSignature: [...record.eigenmodeContext] as EigenmodeVector,
    actionType: record.actionType,
    actionTemplate: {
      type: record.actionType,
      parameters: {},
      constraints: [],
    },
    outcomeProfile: {
      expectedSuccessRate: outcome.success ? 1.0 : 0,
      expectedImprovement: 1 + outcome.actualVsProjected,
      variance: 0, // No variance with single sample
    },
    confidence: 0.5, // Initial confidence for new patterns
    frequency: 1,
    successCount: outcome.success ? 1 : 0,
    lastApplied: now,
    lastUpdated: now,
    contextBreadth: 0.5, // Default moderate breadth
    sourceDecisions: [record.decisionEventUrn],
    decayFactor: 1.0,
    halfLifeDays: 180, // Default half-life for confidence decay
    isGlobal: false, // Project-specific by default
    projectId: record.projectId,
    tags: [],
  };
}

// ============================================================================
// State Management
// ============================================================================

/**
 * In-memory decision records (would be database in production)
 */
const decisionRecords: Map<string, DecisionRecord> = new Map();

/**
 * Pending compression candidates
 */
const compressionCandidates: Map<string, {
  record: DecisionRecord;
  attempts: number;
  lastAttempt?: string;
}> = new Map();

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Store a decision record for learning
 *
 * @param record - Decision record
 */
export function storeDecisionRecord(record: DecisionRecord): void {
  decisionRecords.set(record.decisionEventUrn, record);
}

/**
 * Get a decision record
 *
 * @param decisionEventUrn - Decision event URN
 * @returns Decision record or undefined
 */
export function getDecisionRecord(decisionEventUrn: string): DecisionRecord | undefined {
  return decisionRecords.get(decisionEventUrn);
}

/**
 * Record a decision outcome and trigger learning
 *
 * @param input - Outcome recording input
 * @param config - Learning configuration
 * @returns Learning result
 */
export async function recordDecisionOutcome(
  input: RecordDecisionOutcomeInput,
  config: PatternLearningConfig = DEFAULT_LEARNING_CONFIG
): Promise<LearningResult> {
  const {
    decisionEventUrn,
    success,
    actualVsProjected,
    downstreamEffects = [],
    learningsExtracted = [],
    triggerPatternCompression = config.autoCompress,
  } = input;

  // Get the decision record
  const record = decisionRecords.get(decisionEventUrn);
  if (!record) {
    return {
      recorded: false,
      compressionEligible: false,
      compressionTriggered: false,
      error: `Decision record not found: ${decisionEventUrn}`,
    };
  }

  // Store outcome
  const outcome: DecisionOutcome = {
    success,
    actualVsProjected,
    downstreamEffects,
    learningsExtracted,
    recordedAt: new Date().toISOString(),
  };

  record.outcome = outcome;

  // Evaluate compression eligibility
  const compressionEligibility = evaluateCompressionEligibility(record, config);

  // Trigger compression if eligible and requested
  let compressionResult: {
    triggered: boolean;
    patternUrn?: string;
    action?: 'created' | 'merged' | 'updated' | 'skipped';
    validationResults?: ValidationGates;
    validationConfidence?: number;
  } = { triggered: false };

  if (compressionEligibility.eligible && triggerPatternCompression) {
    compressionResult = await triggerCompression(record, config);
  }

  // Emit outcome recorded event
  await emitOutcomeRecorded(
    record.projectId,
    decisionEventUrn,
    success,
    actualVsProjected,
    compressionResult.triggered,
    record.actorId
  );

  return {
    recorded: true,
    compressionEligible: compressionEligibility.eligible,
    compressionTriggered: compressionResult.triggered,
    patternUrn: compressionResult.patternUrn,
    patternAction: compressionResult.action,
    validationResults: compressionResult.validationResults,
    validationConfidence: compressionResult.validationConfidence,
  };
}

/**
 * Evaluate if a decision is eligible for pattern compression
 */
function evaluateCompressionEligibility(
  record: DecisionRecord,
  config: PatternLearningConfig
): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // Must have outcome
  if (!record.outcome) {
    reasons.push('No outcome recorded');
    return { eligible: false, reasons };
  }

  // Must be successful
  if (!record.outcome.success) {
    reasons.push('Decision was not successful');
    return { eligible: false, reasons };
  }

  // Must meet improvement threshold
  if (record.outcome.actualVsProjected < config.minImprovementForCompression) {
    reasons.push(`Improvement ${record.outcome.actualVsProjected} below threshold ${config.minImprovementForCompression}`);
    return { eligible: false, reasons };
  }

  // Exploration decisions have higher value for compression
  if (record.sourceEngine === MediationSourceEngine.ENGINE_2) {
    reasons.push('Exploratory decision with successful outcome');
  }

  return { eligible: true, reasons };
}

/**
 * Trigger pattern compression for a decision
 */
async function triggerCompression(
  record: DecisionRecord,
  config: PatternLearningConfig
): Promise<{
  triggered: boolean;
  patternUrn?: string;
  action?: 'created' | 'merged' | 'updated' | 'skipped';
  validationResults?: ValidationGates;
  validationConfidence?: number;
}> {
  // Emit compression started event
  await emitEvent({
    eventType: DUAL_PROCESS_EVENT_TYPES.PATTERN_COMPRESSION_STARTED,
    timestamp: new Date().toISOString(),
    projectId: record.projectId,
    zoneId: record.zoneId,
    actorId: record.actorId,
    decisionEventUrn: record.decisionEventUrn,
  });

  // Validate compression gates manually based on available record data
  const validationResults: ValidationGates = {
    succeeded: record.outcome!.success,
    replicable: record.triggerType !== 'escalation', // Escalations are context-specific
    generalizable: true, // Assume moderate context breadth with available data
    significant: record.outcome!.success && record.outcome!.actualVsProjected >= config.minImprovementForCompression,
  };

  // Check if all gates pass
  const allGatesPass = Object.values(validationResults).every(Boolean);

  if (!allGatesPass) {
    // Emit compression skipped
    await emitEvent({
      eventType: DUAL_PROCESS_EVENT_TYPES.PATTERN_COMPRESSION_COMPLETED,
      timestamp: new Date().toISOString(),
      projectId: record.projectId,
      decisionEventUrn: record.decisionEventUrn,
      action: 'skipped',
    });

    return {
      triggered: false,
      action: 'skipped',
      validationResults,
      validationConfidence: calculateValidationConfidence(validationResults),
    };
  }

  // Create a pattern from the decision record
  const newPattern = createPatternFromRecord(record);

  // Check for similar existing patterns
  const existingPatterns = findSimilarPatterns(
    record.eigenmodeContext,
    record.projectId,
    config.similarityThresholdForMerge
  );

  let action: 'created' | 'merged' | 'updated';
  let patternUrn: string;

  if (existingPatterns.length > 0) {
    // Merge with most similar pattern
    const mostSimilar = existingPatterns[0];
    const merged = mergePatterns(mostSimilar.pattern, newPattern);
    updatePattern(mostSimilar.pattern.$id, merged);

    action = 'merged';
    patternUrn = mostSimilar.pattern.$id;

    // Emit pattern merged event
    await emitEvent({
      eventType: DUAL_PROCESS_EVENT_TYPES.PATTERN_MERGED,
      timestamp: new Date().toISOString(),
      projectId: record.projectId,
      decisionEventUrn: record.decisionEventUrn,
      patternUrn,
    });
  } else {
    // Store as new pattern
    const storeResult = storePattern(newPattern);
    if (!storeResult.success) {
      return {
        triggered: false,
        action: 'skipped',
        validationResults,
        validationConfidence: calculateValidationConfidence(validationResults),
      };
    }

    action = 'created';
    patternUrn = storeResult.patternUrn!;
  }

  // Emit compression completed event
  await emitEvent({
    eventType: DUAL_PROCESS_EVENT_TYPES.PATTERN_COMPRESSION_COMPLETED,
    timestamp: new Date().toISOString(),
    projectId: record.projectId,
    decisionEventUrn: record.decisionEventUrn,
    patternUrn,
    action,
  });

  return {
    triggered: true,
    patternUrn,
    action,
    validationResults,
    validationConfidence: calculateValidationConfidence(validationResults),
  };
}

/**
 * Find similar patterns for potential merge
 */
function findSimilarPatterns(
  contextSignature: EigenmodeVector,
  projectId: string,
  threshold: number
): Array<{ pattern: SuccessPattern; similarity: number }> {
  // This would query the success stack in production
  // For now, return empty array (new patterns will be created)
  return [];
}

/**
 * Calculate validation confidence from gates
 */
function calculateValidationConfidence(gates: ValidationGates): number {
  const passed = Object.values(gates).filter(Boolean).length;
  const total = Object.keys(gates).length;
  return passed / total;
}

// ============================================================================
// Batch Processing
// ============================================================================

/**
 * Process pending compression candidates
 */
export async function processPendingCompressions(
  config: PatternLearningConfig = DEFAULT_LEARNING_CONFIG
): Promise<{
  processed: number;
  compressed: number;
  skipped: number;
}> {
  const results = { processed: 0, compressed: 0, skipped: 0 };

  for (const [urn, candidate] of compressionCandidates.entries()) {
    results.processed++;

    const result = await triggerCompression(candidate.record, config);

    if (result.triggered) {
      results.compressed++;
      compressionCandidates.delete(urn);
    } else {
      results.skipped++;
      candidate.attempts++;
      candidate.lastAttempt = new Date().toISOString();

      // Remove after 3 failed attempts
      if (candidate.attempts >= 3) {
        compressionCandidates.delete(urn);
      }
    }
  }

  return results;
}

/**
 * Add a decision to pending compression queue
 */
export function queueForCompression(decisionEventUrn: string): boolean {
  const record = decisionRecords.get(decisionEventUrn);
  if (!record || !record.outcome) {
    return false;
  }

  if (!compressionCandidates.has(decisionEventUrn)) {
    compressionCandidates.set(decisionEventUrn, {
      record,
      attempts: 0,
    });
  }

  return true;
}

// ============================================================================
// Analytics
// ============================================================================

/**
 * Get learning statistics
 */
export function getLearningStatistics(): {
  totalDecisions: number;
  withOutcomes: number;
  successRate: number;
  avgImprovement: number;
  pendingCompressions: number;
} {
  const records = Array.from(decisionRecords.values());
  const withOutcomes = records.filter((r) => r.outcome);
  const successful = withOutcomes.filter((r) => r.outcome!.success);

  const improvements = withOutcomes.map((r) => r.outcome!.actualVsProjected);
  const avgImprovement = improvements.length > 0
    ? improvements.reduce((a, b) => a + b, 0) / improvements.length
    : 0;

  return {
    totalDecisions: records.length,
    withOutcomes: withOutcomes.length,
    successRate: withOutcomes.length > 0 ? successful.length / withOutcomes.length : 0,
    avgImprovement,
    pendingCompressions: compressionCandidates.size,
  };
}

/**
 * Get decisions by source engine
 */
export function getDecisionsByEngine(): Record<MediationSourceEngine, number> {
  const counts: Record<string, number> = {
    [MediationSourceEngine.ENGINE_1]: 0,
    [MediationSourceEngine.ENGINE_2]: 0,
    [MediationSourceEngine.BLEND]: 0,
    [MediationSourceEngine.ESCALATE]: 0,
  };

  for (const record of decisionRecords.values()) {
    counts[record.sourceEngine] = (counts[record.sourceEngine] || 0) + 1;
  }

  return counts as Record<MediationSourceEngine, number>;
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Clear all decision records (for testing)
 */
export function clearDecisionRecords(): void {
  decisionRecords.clear();
  compressionCandidates.clear();
}

// ============================================================================
// Service Export
// ============================================================================

/**
 * Pattern Learning Service namespace
 */
export const PatternLearningService = {
  // Core functions
  storeDecisionRecord,
  getDecisionRecord,
  recordDecisionOutcome,
  queueForCompression,
  processPendingCompressions,

  // Analytics
  getLearningStatistics,
  getDecisionsByEngine,

  // Cleanup
  clearDecisionRecords,

  // Configuration
  DEFAULT_LEARNING_CONFIG,
};

export default PatternLearningService;
