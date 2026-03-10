/**
 * Decision-Milestone Linker Service
 *
 * Implements bidirectional linking between DecisionEvents and Milestones
 * for complete audit trail and decision-driven planning.
 *
 * Key features:
 * 1. Link decisions to milestones via URN
 * 2. Update graphMetadata edges bidirectionally
 * 3. Query decisions that drove a milestone
 * 4. Propagate classification through decision chains
 *
 * @see .roadmap/features/platform-agent/FEATURE.json
 * @version 1.0.0
 */

// ============================================================================
// Types
// ============================================================================

/**
 * URN pattern for decision events
 */
export type DecisionEventUrn = `urn:luhtech:${string}:decision-event:DEV-${string}`;

/**
 * URN pattern for milestones
 */
export type MilestoneUrn = `urn:luhtech:${string}:milestone:${string}`;

/**
 * URN pattern for features
 */
export type FeatureUrn = `urn:luhtech:${string}:feature:${string}`;

/**
 * Classification type
 */
export type Classification = 'LEAD' | 'DERIVED' | 'EXTERNAL' | 'FLEXIBLE';

/**
 * Decision-milestone link record
 */
export interface DecisionMilestoneLink {
  decisionUrn: DecisionEventUrn;
  milestoneUrn: MilestoneUrn;
  featureUrn?: FeatureUrn;
  classification: Classification;
  linkedAt: string;
  linkedBy: string;
  impact: 'direct' | 'indirect' | 'blocking';
}

/**
 * Milestone with linked decisions
 */
export interface MilestoneWithDecisions {
  milestoneUrn: MilestoneUrn;
  featureUrn?: FeatureUrn;
  linkedDecisions: DecisionEventUrn[];
  classification: Classification;
  healthScore?: number;
  patternConfidence?: number;
  graphMetadata: {
    inEdges: string[];
    outEdges: string[];
  };
}

/**
 * Decision with linked milestone
 */
export interface DecisionWithMilestone {
  decisionUrn: DecisionEventUrn;
  linkedMilestoneUrn?: MilestoneUrn;
  linkedFeatureUrn?: FeatureUrn;
  classification: Classification;
  dependsOn: DecisionEventUrn[];
  blocks: DecisionEventUrn[];
  graphMetadata: {
    inEdges: string[];
    outEdges: string[];
    linkedMilestone?: string;
    linkedFeature?: string;
  };
}

/**
 * Link result
 */
export interface LinkResult {
  success: boolean;
  link?: DecisionMilestoneLink;
  error?: string;
  warnings: string[];
}

/**
 * Query options for decision lookup
 */
export interface DecisionQueryOptions {
  milestoneUrn?: MilestoneUrn;
  featureUrn?: FeatureUrn;
  classification?: Classification;
  includeIndirect?: boolean;
  maxDepth?: number;
}

// ============================================================================
// State Management
// ============================================================================

/**
 * In-memory link storage (would be PostgreSQL in production)
 */
const linkStore: Map<string, DecisionMilestoneLink> = new Map();

/**
 * Milestone → Decisions index
 */
const milestoneToDecisionsIndex: Map<MilestoneUrn, Set<DecisionEventUrn>> = new Map();

/**
 * Decision → Milestone index
 */
const decisionToMilestoneIndex: Map<DecisionEventUrn, MilestoneUrn> = new Map();

/**
 * Decision dependencies graph
 */
const decisionDependencies: Map<DecisionEventUrn, Set<DecisionEventUrn>> = new Map();

/**
 * Decision dependents graph (reverse)
 */
const decisionDependents: Map<DecisionEventUrn, Set<DecisionEventUrn>> = new Map();

// ============================================================================
// Link Management
// ============================================================================

/**
 * Create a link between a decision and a milestone
 */
export function linkDecisionToMilestone(
  decisionUrn: DecisionEventUrn,
  milestoneUrn: MilestoneUrn,
  options: {
    featureUrn?: FeatureUrn;
    classification?: Classification;
    linkedBy?: string;
    impact?: 'direct' | 'indirect' | 'blocking';
  } = {}
): LinkResult {
  const warnings: string[] = [];

  // Validate URNs
  if (!decisionUrn.match(/^urn:luhtech:[^:]+:decision-event:DEV-/)) {
    return {
      success: false,
      error: `Invalid decision URN format: ${decisionUrn}`,
      warnings,
    };
  }

  if (!milestoneUrn.match(/^urn:luhtech:[^:]+:milestone:/)) {
    return {
      success: false,
      error: `Invalid milestone URN format: ${milestoneUrn}`,
      warnings,
    };
  }

  // Check for existing link
  const existingMilestone = decisionToMilestoneIndex.get(decisionUrn);
  if (existingMilestone && existingMilestone !== milestoneUrn) {
    warnings.push(
      `Decision was previously linked to ${existingMilestone}. Updating to ${milestoneUrn}.`
    );
    // Remove from old milestone's index
    const oldDecisions = milestoneToDecisionsIndex.get(existingMilestone);
    if (oldDecisions) {
      oldDecisions.delete(decisionUrn);
    }
  }

  // Create link
  const link: DecisionMilestoneLink = {
    decisionUrn,
    milestoneUrn,
    featureUrn: options.featureUrn,
    classification: options.classification || 'LEAD',
    linkedAt: new Date().toISOString(),
    linkedBy: options.linkedBy || 'system',
    impact: options.impact || 'direct',
  };

  // Store link
  const linkKey = `${decisionUrn}:${milestoneUrn}`;
  linkStore.set(linkKey, link);

  // Update indices
  decisionToMilestoneIndex.set(decisionUrn, milestoneUrn);

  if (!milestoneToDecisionsIndex.has(milestoneUrn)) {
    milestoneToDecisionsIndex.set(milestoneUrn, new Set());
  }
  milestoneToDecisionsIndex.get(milestoneUrn)!.add(decisionUrn);

  return {
    success: true,
    link,
    warnings,
  };
}

/**
 * Remove link between decision and milestone
 */
export function unlinkDecisionFromMilestone(
  decisionUrn: DecisionEventUrn,
  milestoneUrn: MilestoneUrn
): boolean {
  const linkKey = `${decisionUrn}:${milestoneUrn}`;

  if (!linkStore.has(linkKey)) {
    return false;
  }

  // Remove from store
  linkStore.delete(linkKey);

  // Update indices
  decisionToMilestoneIndex.delete(decisionUrn);

  const decisions = milestoneToDecisionsIndex.get(milestoneUrn);
  if (decisions) {
    decisions.delete(decisionUrn);
  }

  return true;
}

/**
 * Add decision dependency (decision A depends on decision B)
 */
export function addDecisionDependency(
  decisionUrn: DecisionEventUrn,
  dependsOnUrn: DecisionEventUrn
): void {
  // Add to dependencies
  if (!decisionDependencies.has(decisionUrn)) {
    decisionDependencies.set(decisionUrn, new Set());
  }
  decisionDependencies.get(decisionUrn)!.add(dependsOnUrn);

  // Add to dependents (reverse index)
  if (!decisionDependents.has(dependsOnUrn)) {
    decisionDependents.set(dependsOnUrn, new Set());
  }
  decisionDependents.get(dependsOnUrn)!.add(decisionUrn);
}

/**
 * Remove decision dependency
 */
export function removeDecisionDependency(
  decisionUrn: DecisionEventUrn,
  dependsOnUrn: DecisionEventUrn
): void {
  decisionDependencies.get(decisionUrn)?.delete(dependsOnUrn);
  decisionDependents.get(dependsOnUrn)?.delete(decisionUrn);
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get all decisions linked to a milestone
 */
export function getDecisionsForMilestone(
  milestoneUrn: MilestoneUrn,
  options: { includeIndirect?: boolean } = {}
): DecisionEventUrn[] {
  const directDecisions = milestoneToDecisionsIndex.get(milestoneUrn);

  if (!directDecisions) {
    return [];
  }

  const result = new Set(directDecisions);

  // Include indirect decisions (decisions that the direct decisions depend on)
  if (options.includeIndirect) {
    const visited = new Set<DecisionEventUrn>();
    const queue = [...directDecisions];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) {continue;}
      visited.add(current);

      const dependencies = decisionDependencies.get(current);
      if (dependencies) {
        for (const dep of dependencies) {
          result.add(dep);
          if (!visited.has(dep)) {
            queue.push(dep);
          }
        }
      }
    }
  }

  return Array.from(result);
}

/**
 * Get milestone linked to a decision
 */
export function getMilestoneForDecision(decisionUrn: DecisionEventUrn): MilestoneUrn | undefined {
  return decisionToMilestoneIndex.get(decisionUrn);
}

/**
 * Get link details
 */
export function getLinkDetails(
  decisionUrn: DecisionEventUrn,
  milestoneUrn: MilestoneUrn
): DecisionMilestoneLink | undefined {
  const linkKey = `${decisionUrn}:${milestoneUrn}`;
  return linkStore.get(linkKey);
}

/**
 * Get decision dependencies (decisions this decision depends on)
 */
export function getDecisionDependencies(decisionUrn: DecisionEventUrn): DecisionEventUrn[] {
  const deps = decisionDependencies.get(decisionUrn);
  return deps ? Array.from(deps) : [];
}

/**
 * Get decision dependents (decisions that depend on this decision)
 */
export function getDecisionDependents(decisionUrn: DecisionEventUrn): DecisionEventUrn[] {
  const deps = decisionDependents.get(decisionUrn);
  return deps ? Array.from(deps) : [];
}

/**
 * Query decisions with filters
 */
export function queryDecisions(options: DecisionQueryOptions): DecisionEventUrn[] {
  let results: Set<DecisionEventUrn>;

  // Start with milestone filter if provided
  if (options.milestoneUrn) {
    results = new Set(
      getDecisionsForMilestone(options.milestoneUrn, {
        includeIndirect: options.includeIndirect,
      })
    );
  } else {
    // Start with all decisions
    results = new Set(decisionToMilestoneIndex.keys());
  }

  // Filter by classification
  if (options.classification) {
    const filtered = new Set<DecisionEventUrn>();
    for (const decisionUrn of results) {
      const milestoneUrn = decisionToMilestoneIndex.get(decisionUrn);
      if (milestoneUrn) {
        const link = getLinkDetails(decisionUrn, milestoneUrn);
        if (link && link.classification === options.classification) {
          filtered.add(decisionUrn);
        }
      }
    }
    results = filtered;
  }

  // Filter by feature
  if (options.featureUrn) {
    const filtered = new Set<DecisionEventUrn>();
    for (const decisionUrn of results) {
      const milestoneUrn = decisionToMilestoneIndex.get(decisionUrn);
      if (milestoneUrn) {
        const link = getLinkDetails(decisionUrn, milestoneUrn);
        if (link && link.featureUrn === options.featureUrn) {
          filtered.add(decisionUrn);
        }
      }
    }
    results = filtered;
  }

  return Array.from(results);
}

// ============================================================================
// Graph Metadata Helpers
// ============================================================================

/**
 * Build graph metadata for a decision
 */
export function buildDecisionGraphMetadata(decisionUrn: DecisionEventUrn): DecisionWithMilestone['graphMetadata'] {
  const milestoneUrn = decisionToMilestoneIndex.get(decisionUrn);
  const dependencies = getDecisionDependencies(decisionUrn);
  const dependents = getDecisionDependents(decisionUrn);

  let featureUrn: string | undefined;
  if (milestoneUrn) {
    const link = getLinkDetails(decisionUrn, milestoneUrn);
    featureUrn = link?.featureUrn;
  }

  return {
    inEdges: dependencies,
    outEdges: dependents,
    linkedMilestone: milestoneUrn,
    linkedFeature: featureUrn,
  };
}

/**
 * Build graph metadata for a milestone
 */
export function buildMilestoneGraphMetadata(milestoneUrn: MilestoneUrn): MilestoneWithDecisions['graphMetadata'] {
  const decisions = getDecisionsForMilestone(milestoneUrn);

  return {
    inEdges: decisions,
    outEdges: [], // Milestones typically don't have outEdges to decisions
  };
}

// ============================================================================
// Classification Propagation
// ============================================================================

/**
 * Propagate classification from decision to pattern
 * When a decision is compressed to a pattern, the pattern inherits the classification
 */
export function propagateClassificationToPattern(
  decisionUrn: DecisionEventUrn
): Classification {
  const milestoneUrn = decisionToMilestoneIndex.get(decisionUrn);

  if (!milestoneUrn) {
    return 'FLEXIBLE'; // Default for unlinked decisions
  }

  const link = getLinkDetails(decisionUrn, milestoneUrn);
  return link?.classification || 'LEAD';
}

/**
 * Determine classification based on trigger type
 */
export function classificationFromTriggerType(
  triggerType: 'scheduled' | 'exception' | 'opportunity' | 'escalation'
): Classification {
  switch (triggerType) {
    case 'scheduled':
      return 'LEAD';
    case 'exception':
      return 'DERIVED';
    case 'opportunity':
      return 'FLEXIBLE';
    case 'escalation':
      return 'EXTERNAL';
    default:
      return 'LEAD';
  }
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate DAG property for decision dependencies (no cycles)
 */
export function validateDecisionDAG(startUrn: DecisionEventUrn): {
  valid: boolean;
  cycle?: DecisionEventUrn[];
} {
  const visited = new Set<DecisionEventUrn>();
  const recursionStack = new Set<DecisionEventUrn>();
  const path: DecisionEventUrn[] = [];

  function hasCycle(urn: DecisionEventUrn): boolean {
    visited.add(urn);
    recursionStack.add(urn);
    path.push(urn);

    const dependencies = decisionDependencies.get(urn);
    if (dependencies) {
      for (const dep of dependencies) {
        if (!visited.has(dep)) {
          if (hasCycle(dep)) {
            return true;
          }
        } else if (recursionStack.has(dep)) {
          // Cycle found
          path.push(dep);
          return true;
        }
      }
    }

    recursionStack.delete(urn);
    path.pop();
    return false;
  }

  if (hasCycle(startUrn)) {
    // Extract the cycle from path
    const cycleStart = path[path.length - 1];
    const cycleStartIndex = path.indexOf(cycleStart);
    const cycle = path.slice(cycleStartIndex);

    return { valid: false, cycle };
  }

  return { valid: true };
}

// ============================================================================
// Reset (for testing)
// ============================================================================

/**
 * Reset all state (for testing)
 */
export function resetLinkState(): void {
  linkStore.clear();
  milestoneToDecisionsIndex.clear();
  decisionToMilestoneIndex.clear();
  decisionDependencies.clear();
  decisionDependents.clear();
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Get link statistics
 */
export function getLinkStatistics(): {
  totalLinks: number;
  totalMilestones: number;
  totalDecisions: number;
  averageDecisionsPerMilestone: number;
  classificationBreakdown: Record<Classification, number>;
} {
  const classificationBreakdown: Record<Classification, number> = {
    LEAD: 0,
    DERIVED: 0,
    EXTERNAL: 0,
    FLEXIBLE: 0,
  };

  for (const link of linkStore.values()) {
    classificationBreakdown[link.classification]++;
  }

  const totalMilestones = milestoneToDecisionsIndex.size;
  const totalDecisions = decisionToMilestoneIndex.size;
  const avgDecisionsPerMilestone =
    totalMilestones > 0 ? totalDecisions / totalMilestones : 0;

  return {
    totalLinks: linkStore.size,
    totalMilestones,
    totalDecisions,
    averageDecisionsPerMilestone: avgDecisionsPerMilestone,
    classificationBreakdown,
  };
}

export default {
  linkDecisionToMilestone,
  unlinkDecisionFromMilestone,
  addDecisionDependency,
  removeDecisionDependency,
  getDecisionsForMilestone,
  getMilestoneForDecision,
  getLinkDetails,
  getDecisionDependencies,
  getDecisionDependents,
  queryDecisions,
  buildDecisionGraphMetadata,
  buildMilestoneGraphMetadata,
  propagateClassificationToPattern,
  classificationFromTriggerType,
  validateDecisionDAG,
  resetLinkState,
  getLinkStatistics,
};
