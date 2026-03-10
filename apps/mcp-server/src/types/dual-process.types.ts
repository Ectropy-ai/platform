/**
 * Dual-Process Decision Types
 *
 * TypeScript interfaces for the Dual-Process Decision Architecture.
 * Implements Kahneman's System 1/System 2 cognitive model for construction decisions.
 *
 * Engine 1 (Success Stack): Fast, pattern-matching from validated decisions
 * Engine 2 (Possibility Space): Deliberate, generative option exploration
 * USF Mediator: Arbitration based on Solution Density Index (SDI)
 *
 * @see .roadmap/features/dual-process-decision/FEATURE.json
 * @see .roadmap/features/dual-process-decision/interfaces.json
 * @version 1.0.0
 */

// ============================================================================
// URN Types for Dual-Process
// ============================================================================

/**
 * Dual-process specific node types for URN construction
 */
export type DualProcessNodeType =
  | 'decision-event'
  | 'success-pattern'
  | 'sdi-snapshot'
  | 'monitoring-trigger'
  | 'exploration-budget'
  | 'mediation-decision'
  | 'eigenmode-context'
  | 'possibility-option';

/**
 * Valid URN patterns for dual-process entities
 */
export type DecisionEventURN = `urn:luhtech:${string}:decision-event:DEV-${string}`;
export type SuccessPatternURN = `urn:luhtech:${string}:success-pattern:PAT-${string}`;
export type SDISnapshotURN = `urn:luhtech:${string}:sdi-snapshot:SDI-${string}`;
export type MonitoringTriggerURN = `urn:luhtech:${string}:monitoring-trigger:MON-${string}`;

// ============================================================================
// Enums
// ============================================================================

/**
 * What initiated a decision point
 */
export enum DecisionTriggerType {
  SCHEDULED = 'SCHEDULED', // Regular checkpoint
  EXCEPTION = 'EXCEPTION', // Something went wrong
  OPPORTUNITY = 'OPPORTUNITY', // New possibility identified
  ESCALATION = 'ESCALATION', // Escalated from lower authority
}

/**
 * SDI classification based on thresholds
 */
export enum SDIClassification {
  CRITICAL = 'CRITICAL', // SDI < 100: Crisis mode
  WARNING = 'WARNING', // SDI < 1000: Constrain exploration
  HEALTHY = 'HEALTHY', // SDI >= 10000: Normal operations
  ABUNDANT = 'ABUNDANT', // SDI >= 100000: Full exploration
}

/**
 * Monitoring trigger types for exploratory decisions
 */
export enum MonitoringTriggerType {
  SDI_BREACH = 'SDI_BREACH', // SDI drops below threshold
  TIMELINE_DEVIATION = 'TIMELINE_DEVIATION', // Actual deviates from projected
  RESOURCE_EXHAUSTION = 'RESOURCE_EXHAUSTION', // Resources running low
  CASCADE_DETECTION = 'CASCADE_DETECTION', // Downstream effects detected
  CONFIDENCE_COLLAPSE = 'CONFIDENCE_COLLAPSE', // Pattern confidence drops
}

/**
 * Response actions for monitoring triggers
 */
export enum MonitoringResponse {
  FALLBACK = 'FALLBACK', // Fall back to validated pattern
  ESCALATE = 'ESCALATE', // Escalate to higher authority
  CONSTRAIN = 'CONSTRAIN', // Add constraints to exploration
  RE_MEDIATE = 'RE_MEDIATE', // Run mediation again with new data
}

/**
 * Source of the selected action in mediation
 */
export enum MediationSourceEngine {
  ENGINE_1 = 'engine1', // Success Stack (pattern-matched)
  ENGINE_2 = 'engine2', // Possibility Space (generated)
  BLEND = 'blend', // Weighted combination
  ESCALATE = 'escalate', // Escalated to authority cascade
}

/**
 * Exploration budget recommendation levels
 */
export enum ExplorationRecommendation {
  EXPLOIT = 'exploit', // Use validated patterns only
  CAUTIOUS_EXPLORE = 'cautious_explore', // Limited exploration
  BALANCED = 'balanced', // Mix of both
  AGGRESSIVE_EXPLORE = 'aggressive_explore', // Prioritize exploration
}

// ============================================================================
// Core Types
// ============================================================================

/**
 * 12-element eigenmode vector from EFAS decomposition
 * Represents the current project state in reduced dimensions
 */
export type EigenmodeVector = [
  number, number, number, number, // Eigenmodes 1-4
  number, number, number, number, // Eigenmodes 5-8
  number, number, number, number // Eigenmodes 9-12
];

/**
 * Decision trigger context
 */
export interface DecisionTrigger {
  type: DecisionTriggerType;
  source: string; // What triggered it (entity URN or event)
  urgency: number; // 0-1, higher = more urgent
  deadline?: string; // ISO 8601 timestamp
  context: Record<string, unknown>; // Additional context data
}

/**
 * Action definition for decisions
 */
export interface Action {
  actionType: string;
  targetUrn: string;
  parameters: Record<string, unknown>;
  estimatedDuration?: number; // Hours
  estimatedCost?: number; // USD
}

/**
 * Projected outcome from an action
 */
export interface ProjectedOutcome {
  successProbability: number; // 0-1
  expectedImprovement: number; // Factor (1.0 = no change)
  confidenceInterval: {
    lower: number;
    upper: number;
  };
}

/**
 * Risk profile for an option
 */
export interface RiskProfile {
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  factors: Array<{
    name: string;
    severity: number; // 0-1
    probability: number; // 0-1
  }>;
}

// ============================================================================
// SDI (Solution Density Index) Types
// ============================================================================

/**
 * SDI threshold configuration
 */
export interface SDIThresholds {
  critical: number; // Default: 100
  warning: number; // Default: 1000
  healthy: number; // Default: 10000
  abundant: number; // Default: 100000
  isProjectSpecific: boolean;
}

/**
 * SDI calculation components
 */
export interface SDIComponents {
  viablePathCount: number; // Number of constraint-satisfying paths
  constraintCount: number; // Number of active constraints
  resourceSlackRatio: number; // Available slack (0-1)
  eigenmodeStability: number; // Stability over time window (0-1)
}

/**
 * Full SDI calculation result
 */
export interface SDICalculationResult {
  sdiValue: number; // Raw SDI (10^3 to 10^6 range)
  sdiLog: number; // log10(SDI) for normalized comparison
  shannonEntropy: number; // H = log2(SDI) - information entropy
  classification: SDIClassification;
  explorationBudget: number; // Computed budget (0-1)
  components: SDIComponents;
  thresholds: SDIThresholds;
  timestamp: string; // ISO 8601
}

/**
 * SDI snapshot for persistence
 */
export interface SDISnapshot {
  $id: SDISnapshotURN;
  projectId: string;
  zoneId?: string;
  sdiValue: number;
  sdiLog: number;
  shannonEntropy: number;
  classification: SDIClassification;
  components: SDIComponents;
  timestamp: string;
  graphMetadata?: {
    inEdges: string[];
    outEdges: string[];
  };
}

// ============================================================================
// Engine 1 (Success Stack) Types
// ============================================================================

/**
 * Outcome profile from historical pattern applications
 */
export interface OutcomeProfile {
  expectedSuccessRate: number; // 0-1
  expectedImprovement: number; // Factor
  variance: number; // Outcome variance
  bestCase?: number;
  worstCase?: number;
}

/**
 * Validation gates for pattern compression
 */
export interface ValidationGates {
  succeeded: boolean; // Did the decision succeed?
  replicable: boolean; // Can it be replicated?
  generalizable: boolean; // Does it apply beyond single instance?
  significant: boolean; // Is improvement significant?
}

/**
 * Success pattern from validated decisions
 */
export interface SuccessPattern {
  $id: SuccessPatternURN;
  contextSignature: EigenmodeVector;
  actionType: string;
  actionTemplate?: {
    type: string;
    parameters: Record<string, unknown>;
    constraints: string[];
  };
  outcomeProfile: OutcomeProfile;
  confidence: number; // 0-1, decays over time
  frequency: number; // Times applied
  successCount: number;
  lastApplied: string;
  lastUpdated: string;
  contextBreadth: number; // 0-1, specificity
  sourceDecisions: string[]; // Decision event URNs
  decayFactor: number; // Current decay (0-1)
  halfLifeDays: number; // Default: 180
  projectId?: string; // Null for global
  isGlobal: boolean;
  /**
   * Success Stack tier for isolation.
   * - 'platform': Ectropy's internal development patterns (isolated)
   * - 'global': Anonymized cross-tenant patterns
   * - 'tenant': Tenant-specific patterns
   */
  tier?: SuccessStackTier;
  tenantId?: string; // For tenant-scoped patterns
  domain?: string; // electrical, mechanical, etc.
  tags: string[];
  validationGates?: ValidationGates;
  graphMetadata?: {
    inEdges: string[];
    outEdges: string[];
  };
}

/**
 * Engine 1 (Success Stack) query output
 */
export interface Engine1Output {
  applicablePatterns: SuccessPattern[];
  patternMatchScores: number[]; // Similarity scores
  confidence: number; // Overall confidence
  recommendedAction?: Action;
  projectedOutcome?: ProjectedOutcome;
  queryLatencyMs: number;
}

// ============================================================================
// Engine 2 (Possibility Space) Types
// ============================================================================

/**
 * Generated option from Possibility Space
 */
export interface PossibilityOption {
  id: string;
  action: Action;
  isNovel: boolean; // No pattern precedent
  projectedSdi: number;
  feasibilityScore: number; // Feasibility assessment score
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  explorationValue: number; // Information value of exploring
}

/**
 * Engine 2 (Possibility Space) output
 */
export interface Engine2Output {
  viableOptions: PossibilityOption[];
  novelOptions: PossibilityOption[];
  sdiProjections: Record<string, number>; // Option ID -> SDI
  riskProfiles: Record<string, RiskProfile>;
  explorationValue: Record<string, number>;
  computationDepth: number;
  generationLatencyMs: number;
}

// ============================================================================
// Mediation Types
// ============================================================================

/**
 * Monitoring trigger configuration
 */
export interface MonitoringTrigger {
  $id?: MonitoringTriggerURN;
  decisionEventUrn: string;
  triggerType: MonitoringTriggerType;
  condition: {
    metric: string;
    operator: '<' | '>' | '<=' | '>=' | '==' | '!=';
    threshold: number;
  };
  response: MonitoringResponse;
  checkIntervalMs: number;
  isActive: boolean;
  lastChecked?: string;
  triggeredAt?: string;
}

/**
 * Exploration budget calculation result
 */
export interface ExplorationBudget {
  budget: number; // 0-1
  breakdown: {
    sdiFactor: number; // 40% weight contribution
    stabilityFactor: number; // 35% weight contribution
    resourceFactor: number; // 25% weight contribution
  };
  recommendation: ExplorationRecommendation;
}

/**
 * Mediation decision result
 */
export interface MediationDecision {
  decisionEventUrn: DecisionEventURN;
  selectedAction: Action;
  sourceEngine: MediationSourceEngine;
  rationale: string; // Human-readable explanation
  explorationAllocation: number; // 0-1
  riskBearer: string; // Who takes responsibility
  monitoringTriggers: MonitoringTrigger[];
  fallbackAction?: Action;
  escalationTarget?: string; // Authority URN if escalated
  engine1Output: Engine1Output;
  engine2Output: Engine2Output;
  mediationLatencyMs: number;
}

// ============================================================================
// Decision Event Types
// ============================================================================

/**
 * Decision outcome for learning
 */
export interface DecisionOutcome {
  success: boolean;
  actualVsProjected: number; // -1 to 1 (worse to better)
  downstreamEffects: Array<{
    affectedEntity: string;
    effectType: string;
    magnitude: number;
  }>;
  learningsExtracted: string[];
  recordedAt: string;
}

/**
 * Full decision event capture
 */
export interface DecisionEvent {
  $id: DecisionEventURN;
  timestamp: string;
  projectId: string;
  zoneId?: string;
  actorId: string;
  trigger: DecisionTrigger;
  stateSdi: number;
  stateEigenmodes: EigenmodeVector;
  engine1Output: Engine1Output;
  engine2Output: Engine2Output;
  mediation: MediationDecision;
  outcome?: DecisionOutcome;
  graphMetadata?: {
    inEdges: string[];
    outEdges: string[];
  };
}

// ============================================================================
// MCP Tool Input/Output Types
// ============================================================================

/**
 * calculate_sdi tool input
 */
export interface CalculateSDIInput {
  projectId: string;
  zoneId?: string;
  includeComponents?: boolean;
  includeThresholds?: boolean;
}

/**
 * calculate_sdi tool output
 */
export type CalculateSDIOutput = SDICalculationResult;

/**
 * get_sdi_thresholds tool input
 */
export interface GetSDIThresholdsInput {
  projectId: string;
}

/**
 * get_sdi_thresholds tool output
 */
export type GetSDIThresholdsOutput = SDIThresholds;

/**
 * Success Stack tier for pattern isolation
 */
export type SuccessStackTier = 'platform' | 'global' | 'tenant';

/**
 * query_success_stack tool input
 */
export interface QuerySuccessStackInput {
  projectId: string;
  contextSignature: EigenmodeVector;
  actionType?: string;
  similarityThreshold?: number; // Default: 0.85
  maxResults?: number; // Default: 10
  includeGlobalPatterns?: boolean; // Default: true
  /**
   * Success Stack tier for isolation.
   * - 'platform': Only query Ectropy's internal development patterns
   * - 'global': Query anonymized cross-tenant patterns (shared insights)
   * - 'tenant': Query tenant-specific patterns only
   * Default: undefined (queries all accessible patterns based on other flags)
   */
  tier?: SuccessStackTier;
  /**
   * Exclude global patterns from results. Used by Platform Agent for isolation.
   * Overrides includeGlobalPatterns when true.
   */
  excludeGlobal?: boolean;
  /**
   * Exclude tenant patterns from results. Used by Platform Agent for isolation.
   */
  excludeTenant?: boolean;
}

/**
 * query_success_stack tool output
 */
export type QuerySuccessStackOutput = Engine1Output;

/**
 * get_exploration_budget tool input
 */
export interface GetExplorationBudgetInput {
  projectId: string;
  zoneId?: string;
  includeBreakdown?: boolean;
}

/**
 * get_exploration_budget tool output
 */
export type GetExplorationBudgetOutput = ExplorationBudget;

/**
 * mediate_decision tool input
 */
export interface MediateDecisionInput {
  projectId: string;
  zoneId?: string;
  trigger: DecisionTrigger;
  actorId: string;
  forceEngine?: 'engine1' | 'engine2';
  dryRun?: boolean;
}

/**
 * mediate_decision tool output
 */
export type MediateDecisionOutput = MediationDecision;

/**
 * record_decision_outcome tool input
 */
export interface RecordDecisionOutcomeInput {
  decisionEventUrn: string;
  success: boolean;
  actualVsProjected: number;
  downstreamEffects?: Array<{
    affectedEntity: string;
    effectType: string;
    magnitude: number;
  }>;
  learningsExtracted?: string[];
  triggerPatternCompression?: boolean;
}

/**
 * record_decision_outcome tool output
 */
export interface RecordDecisionOutcomeOutput {
  recorded: boolean;
  compressionEligible: boolean;
  compressionTriggered: boolean;
  patternUrn?: string;
  validationConfidence?: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Dual-process configuration options
 */
export interface DualProcessConfig {
  // SDI Thresholds
  sdiCriticalThreshold: number; // Default: 100
  sdiWarningThreshold: number; // Default: 1000
  sdiHealthyThreshold: number; // Default: 10000
  sdiAbundantThreshold: number; // Default: 100000

  // Pattern matching
  patternSimilarityThreshold: number; // Default: 0.85
  patternDecayHalfLifeDays: number; // Default: 180
  patternPruneThreshold: number; // Default: 0.1
  maxPatternQueryResults: number; // Default: 10

  // Exploration budget weights
  explorationBudgetSdiWeight: number; // Default: 0.4
  explorationBudgetStabilityWeight: number; // Default: 0.35
  explorationBudgetResourceWeight: number; // Default: 0.25

  // Engine 2 settings
  engine2ComputationDepth: number; // Default: 3

  // Feature flags
  enableGlobalPatterns: boolean; // Default: true
}

/**
 * Default configuration values
 */
export const DEFAULT_DUAL_PROCESS_CONFIG: DualProcessConfig = {
  sdiCriticalThreshold: 100,
  sdiWarningThreshold: 1000,
  sdiHealthyThreshold: 10000,
  sdiAbundantThreshold: 100000,
  patternSimilarityThreshold: 0.85,
  patternDecayHalfLifeDays: 180,
  patternPruneThreshold: 0.1,
  maxPatternQueryResults: 10,
  explorationBudgetSdiWeight: 0.4,
  explorationBudgetStabilityWeight: 0.35,
  explorationBudgetResourceWeight: 0.25,
  engine2ComputationDepth: 3,
  enableGlobalPatterns: true,
};

// ============================================================================
// Event Types for USF Integration
// ============================================================================

/**
 * USF event types for dual-process system
 */
export const DUAL_PROCESS_EVENT_TYPES = {
  // Decision events
  DECISION_EVENT_CREATED: 'usf:decision-event:created',
  DECISION_EVENT_MEDIATED: 'usf:decision-event:mediated',
  DECISION_EVENT_OUTCOME_RECORDED: 'usf:decision-event:outcome-recorded',

  // Pattern events
  PATTERN_COMPRESSION_STARTED: 'usf:pattern:compression-started',
  PATTERN_COMPRESSION_COMPLETED: 'usf:pattern:compression-completed',
  PATTERN_MERGED: 'usf:pattern:merged',
  PATTERN_DECAYED: 'usf:pattern:decayed',

  // SDI events
  SDI_CALCULATED: 'usf:sdi:calculated',
  SDI_THRESHOLD_BREACHED: 'usf:sdi:threshold-breached',

  // Exploration events
  EXPLORATION_TRIGGERED: 'usf:exploration:triggered',
  EXPLORATION_MONITORED: 'usf:exploration:monitored',
  EXPLORATION_FALLBACK: 'usf:exploration:fallback',

  // Mediation events
  MEDIATION_ESCALATED: 'usf:mediation:escalated',
} as const;

export type DualProcessEventType = typeof DUAL_PROCESS_EVENT_TYPES[keyof typeof DUAL_PROCESS_EVENT_TYPES];
