/**
 * Success Stack Service - DP-M3
 *
 * Engine 1 of the Dual-Process Decision Architecture.
 * Provides fast pattern-matching from validated decisions.
 *
 * Cognitive Parallel: System 1 (Fast/Intuitive)
 * Latency Target: <50ms for 10^6 patterns
 *
 * @see .roadmap/features/dual-process-decision/FEATURE.json
 * @version 1.0.0
 */

import {
  DEFAULT_DUAL_PROCESS_CONFIG,
  type SuccessPattern,
  type EigenmodeVector,
  type Engine1Output,
  type QuerySuccessStackInput,
  type Action,
  type ProjectedOutcome,
  type SuccessPatternURN,
} from '../types/dual-process.types.js';
import {
  computeCosineSimilarity,
  findAllSimilar,
} from './eigenmode-similarity.service.js';
import { applyDecay, prunePatterns } from './pattern-compression.service.js';

// ============================================================================
// In-Memory Pattern Store
// ============================================================================

/**
 * In-memory pattern storage
 * In production, this would be backed by PostgreSQL/Redis
 */
const patternStore: Map<string, SuccessPattern> = new Map();

/**
 * Index by project ID for faster filtering
 */
const projectIndex: Map<string, Set<string>> = new Map();

/**
 * Index by action type for faster filtering
 */
const actionTypeIndex: Map<string, Set<string>> = new Map();

/**
 * Global patterns index
 */
const globalPatterns: Set<string> = new Set();

/**
 * Platform patterns index (Ectropy's internal development patterns)
 * Completely isolated from tenant/global patterns
 */
const platformPatterns: Set<string> = new Set();

/**
 * Tenant patterns index (keyed by tenantId)
 */
const tenantPatterns: Map<string, Set<string>> = new Map();

// ============================================================================
// Configuration
// ============================================================================

/**
 * Success Stack configuration
 */
export interface SuccessStackConfig {
  defaultSimilarityThreshold: number;
  maxResults: number;
  includeGlobalPatterns: boolean;
  decayOnQuery: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_STACK_CONFIG: SuccessStackConfig = {
  defaultSimilarityThreshold: DEFAULT_DUAL_PROCESS_CONFIG.patternSimilarityThreshold,
  maxResults: DEFAULT_DUAL_PROCESS_CONFIG.maxPatternQueryResults,
  includeGlobalPatterns: DEFAULT_DUAL_PROCESS_CONFIG.enableGlobalPatterns,
  decayOnQuery: false,
};

// ============================================================================
// ID Counter
// ============================================================================

let stackIdCounter = 0;

/**
 * Set ID counter (for testing)
 */
export function setStackIdCounter(value: number): void {
  stackIdCounter = value;
}

/**
 * Clear all patterns (for testing)
 */
export function clearPatternStore(): void {
  patternStore.clear();
  projectIndex.clear();
  actionTypeIndex.clear();
  globalPatterns.clear();
  platformPatterns.clear();
  tenantPatterns.clear();
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of pattern store operation
 */
export interface StoreResult {
  success: boolean;
  patternUrn?: string;
  error?: string;
}

/**
 * Result of pattern update operation
 */
export interface UpdateResult {
  success: boolean;
  error?: string;
}

/**
 * Result of decay operation
 */
export interface DecayResult {
  decayedCount: number;
  prunedCount: number;
  prunedUrns: string[];
}

/**
 * Ranked pattern result
 */
export interface RankedPattern {
  pattern: SuccessPattern;
  similarity: number;
  score: number;
}

/**
 * Options for getPatternDetails
 */
export interface GetPatternOptions {
  includeSourceDecisions?: boolean;
}

/**
 * Options for decay operation
 */
export interface DecayOptions {
  pruneThreshold?: number;
}

// ============================================================================
// Pattern Storage Functions
// ============================================================================

/**
 * Store a pattern in the Success Stack
 *
 * @param pattern - Pattern to store
 * @returns Store result
 */
export function storePattern(pattern: SuccessPattern): StoreResult {
  // Validate pattern
  const validationError = validatePattern(pattern);
  if (validationError) {
    return { success: false, error: validationError };
  }

  // Check for duplicate
  if (patternStore.has(pattern.$id)) {
    return { success: false, error: `Pattern ${pattern.$id} already exists` };
  }

  // Store pattern
  patternStore.set(pattern.$id, { ...pattern });

  // Update project index
  if (pattern.projectId) {
    if (!projectIndex.has(pattern.projectId)) {
      projectIndex.set(pattern.projectId, new Set());
    }
    projectIndex.get(pattern.projectId)!.add(pattern.$id);
  }

  // Update action type index
  if (!actionTypeIndex.has(pattern.actionType)) {
    actionTypeIndex.set(pattern.actionType, new Set());
  }
  actionTypeIndex.get(pattern.actionType)!.add(pattern.$id);

  // Update tier-based indexes
  if (pattern.tier === 'platform') {
    // Platform patterns are completely isolated
    platformPatterns.add(pattern.$id);
  } else if (pattern.tier === 'tenant' && pattern.tenantId) {
    // Tenant-specific patterns
    if (!tenantPatterns.has(pattern.tenantId)) {
      tenantPatterns.set(pattern.tenantId, new Set());
    }
    tenantPatterns.get(pattern.tenantId)!.add(pattern.$id);
  } else if (pattern.isGlobal || pattern.tier === 'global') {
    // Global patterns (cross-tenant, anonymized)
    globalPatterns.add(pattern.$id);
  }

  return { success: true, patternUrn: pattern.$id };
}

/**
 * Validate a pattern
 */
function validatePattern(pattern: SuccessPattern): string | null {
  if (!pattern.$id) {
    return 'Invalid pattern: missing $id';
  }

  if (!pattern.contextSignature || pattern.contextSignature.length !== 12) {
    return 'Invalid pattern: contextSignature must have 12 elements';
  }

  if (pattern.confidence < 0 || pattern.confidence > 1) {
    return 'Invalid pattern: confidence must be between 0 and 1';
  }

  if (pattern.frequency < 0) {
    return 'Invalid pattern: frequency must be non-negative';
  }

  return null;
}

/**
 * Get pattern details by URN
 *
 * @param patternUrn - Pattern URN
 * @param options - Retrieval options
 * @returns Pattern or undefined
 */
export function getPatternDetails(
  patternUrn: SuccessPatternURN,
  options: GetPatternOptions = {}
): SuccessPattern | undefined {
  const pattern = patternStore.get(patternUrn);
  if (!pattern) {
    return undefined;
  }

  // Return copy to prevent mutations
  return { ...pattern };
}

/**
 * Update a pattern
 *
 * @param patternUrn - Pattern to update
 * @param updates - Fields to update
 * @returns Update result
 */
export function updatePattern(
  patternUrn: SuccessPatternURN,
  updates: Partial<SuccessPattern>
): UpdateResult {
  const pattern = patternStore.get(patternUrn);
  if (!pattern) {
    return { success: false, error: 'Pattern not found' };
  }

  // Apply updates
  const updated: SuccessPattern = {
    ...pattern,
    ...updates,
    $id: pattern.$id, // Prevent ID change
    lastUpdated: new Date().toISOString(),
  };

  // Validate updated pattern
  const validationError = validatePattern(updated);
  if (validationError) {
    return { success: false, error: validationError };
  }

  patternStore.set(patternUrn, updated);

  // Update global index if isGlobal changed
  if (updates.isGlobal !== undefined) {
    if (updates.isGlobal) {
      globalPatterns.add(patternUrn);
    } else {
      globalPatterns.delete(patternUrn);
    }
  }

  return { success: true };
}

/**
 * Remove a pattern from the Success Stack
 *
 * @param patternUrn - Pattern to remove
 * @returns Remove result
 */
export function removePattern(patternUrn: SuccessPatternURN): UpdateResult {
  const pattern = patternStore.get(patternUrn);
  if (!pattern) {
    return { success: false, error: 'Pattern not found' };
  }

  // Remove from store
  patternStore.delete(patternUrn);

  // Remove from project index
  if (pattern.projectId && projectIndex.has(pattern.projectId)) {
    projectIndex.get(pattern.projectId)!.delete(patternUrn);
  }

  // Remove from action type index
  if (actionTypeIndex.has(pattern.actionType)) {
    actionTypeIndex.get(pattern.actionType)!.delete(patternUrn);
  }

  // Remove from global index
  globalPatterns.delete(patternUrn);

  return { success: true };
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Query the Success Stack for matching patterns
 *
 * This is the main entry point for Engine 1 pattern retrieval.
 *
 * @param input - Query parameters
 * @returns Engine 1 output with matched patterns
 */
export async function querySuccessStack(
  input: QuerySuccessStackInput
): Promise<Engine1Output> {
  const startTime = performance.now();

  const {
    projectId,
    contextSignature,
    actionType,
    similarityThreshold = DEFAULT_STACK_CONFIG.defaultSimilarityThreshold,
    maxResults = DEFAULT_STACK_CONFIG.maxResults,
    includeGlobalPatterns = DEFAULT_STACK_CONFIG.includeGlobalPatterns,
    tier,
    excludeGlobal,
    excludeTenant,
  } = input;

  // Get candidate patterns with tier filtering
  const candidateUrns = getCandidatePatterns(projectId, actionType, {
    includeGlobalPatterns: excludeGlobal ? false : includeGlobalPatterns,
    tier,
    excludeTenant,
  });

  if (candidateUrns.length === 0) {
    return createEmptyOutput(startTime);
  }

  // Get patterns and their signatures
  const candidates: SuccessPattern[] = [];
  const signatures: EigenmodeVector[] = [];

  for (const urn of candidateUrns) {
    const pattern = patternStore.get(urn);
    if (pattern) {
      candidates.push(pattern);
      signatures.push(pattern.contextSignature);
    }
  }

  // Find similar patterns
  const similarResults = findAllSimilar(contextSignature, signatures, similarityThreshold);

  // Build result with ranked patterns
  const applicablePatterns: SuccessPattern[] = [];
  const patternMatchScores: number[] = [];

  for (const result of similarResults) {
    const pattern = candidates[result.index];
    applicablePatterns.push(pattern);
    patternMatchScores.push(result.similarity);
  }

  // Rank by combined relevance
  const ranked = rankPatternsByRelevance(applicablePatterns, contextSignature);

  // Sort and limit results
  const sortedPatterns = ranked
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  const finalPatterns = sortedPatterns.map(r => r.pattern);
  const finalScores = sortedPatterns.map(r => r.score);

  // Compute overall confidence
  const confidence = computeOverallConfidence(finalPatterns, finalScores);

  // Get recommended action
  const recommendedAction = getRecommendedAction(finalPatterns, finalScores);

  // Compute projected outcome
  const projectedOutcome = computeProjectedOutcome(finalPatterns, finalScores);

  const queryLatencyMs = performance.now() - startTime;

  return {
    applicablePatterns: finalPatterns,
    patternMatchScores: finalScores,
    confidence,
    recommendedAction,
    projectedOutcome,
    queryLatencyMs,
  };
}

/**
 * Options for candidate pattern retrieval
 */
interface GetCandidatePatternsOptions {
  includeGlobalPatterns?: boolean;
  tier?: 'platform' | 'global' | 'tenant';
  excludeTenant?: boolean;
  tenantId?: string;
}

/**
 * Get candidate patterns for query with tier-based filtering
 *
 * Tier isolation:
 * - 'platform': Only returns platform patterns (Ectropy internal)
 * - 'global': Only returns global patterns (anonymized cross-tenant)
 * - 'tenant': Only returns tenant-specific patterns
 * - undefined: Returns based on other flags
 */
function getCandidatePatterns(
  projectId: string,
  actionType?: string,
  options: GetCandidatePatternsOptions = {}
): string[] {
  const {
    includeGlobalPatterns = true,
    tier,
    excludeTenant = false,
    tenantId,
  } = options;

  const candidateUrns = new Set<string>();

  // Tier-based isolation: if tier is specified, only return patterns from that tier
  if (tier === 'platform') {
    // Platform Agent: ONLY platform patterns, completely isolated
    for (const urn of platformPatterns) {
      candidateUrns.add(urn);
    }
  } else if (tier === 'global') {
    // Global tier: ONLY global patterns
    for (const urn of globalPatterns) {
      candidateUrns.add(urn);
    }
  } else if (tier === 'tenant' && tenantId) {
    // Tenant tier: ONLY that tenant's patterns
    const tPatterns = tenantPatterns.get(tenantId);
    if (tPatterns) {
      for (const urn of tPatterns) {
        candidateUrns.add(urn);
      }
    }
  } else {
    // No tier specified: use legacy behavior with flags
    // Add project patterns (if not excluding tenants)
    if (!excludeTenant && projectId && projectIndex.has(projectId)) {
      for (const urn of projectIndex.get(projectId)!) {
        candidateUrns.add(urn);
      }
    }

    // Add global patterns if requested
    if (includeGlobalPatterns) {
      for (const urn of globalPatterns) {
        candidateUrns.add(urn);
      }
    }

    // Add tenant patterns if not excluding
    if (!excludeTenant && tenantId && tenantPatterns.has(tenantId)) {
      for (const urn of tenantPatterns.get(tenantId)!) {
        candidateUrns.add(urn);
      }
    }
  }

  // Filter by action type if specified
  if (actionType && actionTypeIndex.has(actionType)) {
    const actionUrns = actionTypeIndex.get(actionType)!;
    return Array.from(candidateUrns).filter(urn => actionUrns.has(urn));
  }

  return Array.from(candidateUrns);
}

/**
 * Create empty output
 */
function createEmptyOutput(startTime: number): Engine1Output {
  return {
    applicablePatterns: [],
    patternMatchScores: [],
    confidence: 0,
    queryLatencyMs: performance.now() - startTime,
  };
}

// ============================================================================
// Ranking and Scoring Functions
// ============================================================================

/**
 * Rank patterns by combined relevance
 *
 * Combines similarity score with pattern confidence and frequency.
 *
 * @param patterns - Patterns to rank
 * @param contextSignature - Query context
 * @returns Ranked patterns
 */
export function rankPatternsByRelevance(
  patterns: SuccessPattern[],
  contextSignature: EigenmodeVector
): RankedPattern[] {
  return patterns.map(pattern => {
    const similarity = computeCosineSimilarity(contextSignature, pattern.contextSignature);

    // Combined score: 50% similarity, 30% confidence, 20% normalized frequency
    const normalizedFrequency = Math.min(1, pattern.frequency / 100);
    const score =
      0.5 * similarity +
      0.3 * pattern.confidence * pattern.decayFactor +
      0.2 * normalizedFrequency;

    return { pattern, similarity, score };
  });
}

/**
 * Compute overall confidence from matched patterns
 *
 * @param patterns - Matched patterns
 * @param scores - Match scores
 * @returns Overall confidence (0-1)
 */
export function computeOverallConfidence(
  patterns: SuccessPattern[],
  scores: number[]
): number {
  if (patterns.length === 0) {
    return 0;
  }

  // Weighted average of confidence by score
  let totalWeight = 0;
  let weightedSum = 0;

  for (let i = 0; i < patterns.length; i++) {
    const weight = scores[i];
    weightedSum += weight * patterns[i].confidence * patterns[i].decayFactor;
    totalWeight += weight;
  }

  if (totalWeight === 0) {
    return 0;
  }

  return Math.min(1, weightedSum / totalWeight);
}

/**
 * Get recommended action from best matching patterns
 *
 * @param patterns - Matched patterns
 * @param scores - Match scores
 * @returns Recommended action or undefined
 */
export function getRecommendedAction(
  patterns: SuccessPattern[],
  scores: number[]
): Action | undefined {
  if (patterns.length === 0) {
    return undefined;
  }

  // Find pattern with best combined score and confidence
  let bestIndex = 0;
  let bestScore = 0;

  for (let i = 0; i < patterns.length; i++) {
    const combinedScore = scores[i] * patterns[i].confidence;
    if (combinedScore > bestScore) {
      bestScore = combinedScore;
      bestIndex = i;
    }
  }

  const bestPattern = patterns[bestIndex];
  const template = bestPattern.actionTemplate;

  if (!template) {
    return {
      actionType: bestPattern.actionType,
      targetUrn: '',
      parameters: {},
    };
  }

  return {
    actionType: template.type,
    targetUrn: '',
    parameters: { ...template.parameters },
    estimatedDuration: (template.parameters as any)?.estimatedHours,
    estimatedCost: (template.parameters as any)?.estimatedCost,
  };
}

/**
 * Compute projected outcome from matched patterns
 */
function computeProjectedOutcome(
  patterns: SuccessPattern[],
  scores: number[]
): ProjectedOutcome | undefined {
  if (patterns.length === 0) {
    return undefined;
  }

  // Weighted average of outcome profiles
  let totalWeight = 0;
  let successSum = 0;
  let improvementSum = 0;

  for (let i = 0; i < patterns.length; i++) {
    const weight = scores[i] * patterns[i].confidence;
    const profile = patterns[i].outcomeProfile;

    successSum += weight * profile.expectedSuccessRate;
    improvementSum += weight * profile.expectedImprovement;
    totalWeight += weight;
  }

  if (totalWeight === 0) {
    return undefined;
  }

  const avgSuccess = successSum / totalWeight;
  const avgImprovement = improvementSum / totalWeight;

  // Compute confidence interval based on variance and sample size
  const avgVariance = patterns.reduce((sum, p) => sum + p.outcomeProfile.variance, 0) / patterns.length;
  const margin = Math.sqrt(avgVariance) * 1.96; // 95% CI

  return {
    successProbability: avgSuccess,
    expectedImprovement: avgImprovement,
    confidenceInterval: {
      lower: Math.max(0, avgImprovement - margin),
      upper: avgImprovement + margin,
    },
  };
}

// ============================================================================
// Decay Functions
// ============================================================================

/**
 * Apply decay to all patterns in the store
 *
 * @param options - Decay options
 * @returns Decay result
 */
export function decayAllPatterns(options: DecayOptions = {}): DecayResult {
  const pruneThreshold = options.pruneThreshold ?? DEFAULT_DUAL_PROCESS_CONFIG.patternPruneThreshold;

  const allPatterns = Array.from(patternStore.values());
  let decayedCount = 0;
  const prunedUrns: string[] = [];

  // Apply decay to all patterns
  for (const pattern of allPatterns) {
    const decayed = applyDecay(pattern);

    if (decayed.decayFactor < 1.0) {
      decayedCount++;
    }

    // Check if should be pruned
    if (decayed.confidence < pruneThreshold) {
      prunedUrns.push(pattern.$id);
      removePattern(pattern.$id);
    } else {
      // Update with decayed values
      patternStore.set(pattern.$id, decayed);
    }
  }

  return {
    decayedCount,
    prunedCount: prunedUrns.length,
    prunedUrns,
  };
}

// ============================================================================
// Statistics Functions
// ============================================================================

/**
 * Get statistics about the pattern store
 */
export function getStoreStatistics(): {
  totalPatterns: number;
  projectCount: number;
  actionTypeCount: number;
  globalPatternCount: number;
  averageConfidence: number;
  averageFrequency: number;
} {
  const patterns = Array.from(patternStore.values());

  const totalConfidence = patterns.reduce((sum, p) => sum + p.confidence, 0);
  const totalFrequency = patterns.reduce((sum, p) => sum + p.frequency, 0);

  return {
    totalPatterns: patternStore.size,
    projectCount: projectIndex.size,
    actionTypeCount: actionTypeIndex.size,
    globalPatternCount: globalPatterns.size,
    averageConfidence: patterns.length > 0 ? totalConfidence / patterns.length : 0,
    averageFrequency: patterns.length > 0 ? totalFrequency / patterns.length : 0,
  };
}

// ============================================================================
// Export Service Object
// ============================================================================

/**
 * Success Stack Service singleton
 */
export const SuccessStackService = {
  querySuccessStack,
  getPatternDetails,
  storePattern,
  removePattern,
  updatePattern,
  decayAllPatterns,
  getRecommendedAction,
  computeOverallConfidence,
  rankPatternsByRelevance,
  getStoreStatistics,
  clearPatternStore,
  setStackIdCounter,
  DEFAULT_STACK_CONFIG,
};
