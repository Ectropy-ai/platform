/**
 * Universal Decision Engine Types
 *
 * Domain-agnostic type definitions for the Unified Decision Engine.
 * These types form the abstract foundation shared by ALL domain contexts
 * (platform development, construction PM, healthcare, manufacturing, etc.).
 *
 * Design Principles:
 * - Zero domain coupling: No construction, platform, or industry-specific terms
 * - Composition over inheritance: Small, composable interfaces
 * - Reuses existing URN system from data-source.interface.ts
 * - Compatible with existing dual-process engine types
 *
 * @module adapters/universal
 * @version 1.0.0
 * @see UNIFIED_DECISION_ENGINE_ARCHITECTURE_2026-02-25.json
 */

import type {
  URN,
  GraphMetadata,
} from '../../services/data-source.interface.js';
import type { EigenmodeVector } from '../../types/dual-process.types.js';

// ============================================================================
// Domain Identity
// ============================================================================

/**
 * Unique domain identifier.
 * Each context adapter registers under a distinct domain ID.
 *
 * @example 'platform' | 'construction' | 'healthcare'
 */
export type DomainId = string;

/**
 * Identifies the source context for any entity flowing through the engine.
 * Enables multi-domain operation within a single engine instance.
 */
export interface DomainContext {
  /** Unique domain identifier */
  domainId: DomainId;
  /** Human-readable domain name */
  domainName: string;
  /** Semantic version of the domain adapter */
  domainVersion: string;
}

// ============================================================================
// Universal Status & Classification
// ============================================================================

/**
 * Lifecycle status applicable to any work unit or entity.
 * Intentionally generic — domain adapters map domain-specific
 * statuses (e.g., 'ROUGH_IN', 'in-progress') to these universal values.
 */
export type UniversalStatus =
  | 'planned'
  | 'active'
  | 'completed'
  | 'blocked'
  | 'on-hold'
  | 'cancelled'
  | 'failed';

/**
 * Impact severity applicable across all domains.
 */
export type ImpactLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Risk classification applicable across all domains.
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

// ============================================================================
// Universal Work Unit
// ============================================================================

/**
 * A discrete unit of work in any domain.
 *
 * Maps to:
 * - Platform: Deliverable (p5b-d21), PR, milestone
 * - Construction: Activity, submittal, punch list item
 * - Generic: Task, work order, action item
 */
export interface IWorkUnit {
  /** Unique identifier within the domain */
  id: string;
  /** URN for graph operations */
  urn?: URN;
  /** Domain this work unit belongs to */
  domain: DomainContext;
  /** Human-readable title */
  title: string;
  /** Detailed description */
  description?: string;
  /** Current lifecycle status */
  status: UniversalStatus;
  /** Completion progress (0.0 to 1.0) */
  progress: number;
  /** Who owns this work unit */
  owner?: string;
  /** Parent container ID (phase, project, sprint) */
  containerId?: string;
  /** IDs of work units this depends on */
  dependencyIds: string[];
  /** IDs of work units this blocks */
  blockingIds: string[];
  /** Arbitrary key-value metadata from the domain */
  metadata: Record<string, unknown>;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 last modification timestamp */
  updatedAt: string;
  /** Target completion date (ISO 8601) */
  targetDate?: string;
  /** Graph metadata for traversal */
  graphMetadata?: GraphMetadata;
}

// ============================================================================
// Universal Decision
// ============================================================================

/**
 * A decision captured in any domain.
 *
 * Maps to:
 * - Platform: Decision log entry (d-2026-02-25-...)
 * - Construction: RFI, change order, field decision
 * - Generic: Approval, rejection, deferral
 */
export interface IDecision {
  /** Unique identifier within the domain */
  id: string;
  /** URN for graph operations */
  urn?: URN;
  /** Domain this decision belongs to */
  domain: DomainContext;
  /** Human-readable title */
  title: string;
  /** Context that necessitated this decision */
  context: string;
  /** The decision that was made */
  resolution: string;
  /** Why this decision was chosen */
  rationale: string;
  /** Current status */
  status: UniversalStatus;
  /** Impact severity */
  impact: ImpactLevel;
  /** Who proposed the decision */
  proposedBy: string;
  /** Who approved the decision (if applicable) */
  approvedBy?: string;
  /** Alternatives that were considered */
  alternatives: IDecisionAlternative[];
  /** IDs of related decisions */
  relatedDecisionIds: string[];
  /** IDs of work units impacted by this decision */
  impactedWorkUnitIds: string[];
  /** Evidence supporting this decision */
  evidence: string[];
  /** Searchable tags */
  tags: string[];
  /** Category within the domain (e.g., 'governance', 'technical') */
  category: string;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 last modification timestamp */
  updatedAt: string;
  /** Graph metadata for traversal */
  graphMetadata?: GraphMetadata;
}

/**
 * An alternative that was considered during a decision.
 */
export interface IDecisionAlternative {
  /** Name of the alternative */
  title: string;
  /** Description of what this alternative entails */
  description: string;
  /** Arguments in favor */
  pros: string[];
  /** Arguments against */
  cons: string[];
  /** Was this alternative selected? */
  selected: boolean;
  /** Why was this alternative rejected (if not selected)? */
  rejectionReason?: string;
}

// ============================================================================
// Universal Dependency
// ============================================================================

/**
 * A dependency relationship between entities in any domain.
 *
 * Maps to:
 * - Platform: Blocking graph, package dependency, service dependency
 * - Construction: Schedule dependency, predecessor/successor, trade sequence
 * - Generic: Depends-on, blocks, provides, consumes
 */
export interface IDependency {
  /** Unique identifier */
  id: string;
  /** URN for graph operations */
  urn?: URN;
  /** Domain this dependency belongs to */
  domain: DomainContext;
  /** URN or ID of the entity that depends */
  sourceId: string;
  /** URN or ID of the entity depended upon */
  targetId: string;
  /** Type of dependency relationship */
  type: DependencyType;
  /** Whether violation of this dependency is critical */
  isCritical: boolean;
  /** Current status of this dependency */
  status: 'satisfied' | 'pending' | 'violated' | 'waived';
  /** Additional context about this dependency */
  description?: string;
  /** Metadata from the domain */
  metadata: Record<string, unknown>;
}

/**
 * Relationship types for dependencies.
 * Intentionally broad to cover multiple domains.
 */
export type DependencyType =
  | 'blocks'
  | 'depends-on'
  | 'provides'
  | 'consumes'
  | 'contains'
  | 'implements'
  | 'supersedes'
  | 'references';

// ============================================================================
// Universal State Node
// ============================================================================

/**
 * A node in the domain's state graph representing current ground truth.
 *
 * Maps to:
 * - Platform: current-truth.json node (feature, deliverable, infrastructure)
 * - Construction: BIM submittal status, inspection point, zone state
 * - Generic: Any entity with status tracking and relationships
 */
export interface IStateNode {
  /** Unique identifier within the domain */
  id: string;
  /** URN for graph operations */
  urn?: URN;
  /** Domain this node belongs to */
  domain: DomainContext;
  /** Human-readable title */
  title: string;
  /** Node classification within the domain */
  nodeType: string;
  /** Current lifecycle status */
  status: UniversalStatus;
  /** Phase or stage this node belongs to */
  phase?: string;
  /** Detailed content (approach, outcome, impact) */
  content: Record<string, unknown>;
  /** Structured metadata (category, tags, metrics) */
  metadata: Record<string, unknown>;
  /** Relationship graph */
  relationships: IStateNodeRelationships;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 last modification timestamp */
  updatedAt: string;
  /** Graph metadata for traversal */
  graphMetadata?: GraphMetadata;
}

/**
 * Relationships for a state node.
 */
export interface IStateNodeRelationships {
  /** Nodes this depends on */
  dependencies: string[];
  /** Nodes this triggers or enables */
  triggers: string[];
  /** Related nodes (non-directional) */
  relatedNodes: string[];
  /** Evidence file references */
  evidence: string[];
}

// ============================================================================
// Universal Container (Phase / Project / Sprint)
// ============================================================================

/**
 * A logical grouping of work units.
 *
 * Maps to:
 * - Platform: Quarter (q1_2026), Phase (phase-5b)
 * - Construction: Project phase, building zone, trade package
 * - Generic: Sprint, milestone group, work package
 */
export interface IContainer {
  /** Unique identifier */
  id: string;
  /** URN for graph operations */
  urn?: URN;
  /** Domain this container belongs to */
  domain: DomainContext;
  /** Human-readable name */
  name: string;
  /** What this container focuses on */
  description?: string;
  /** Current status */
  status: UniversalStatus;
  /** Ordered work unit IDs within this container */
  workUnitIds: string[];
  /** Milestone gates within this container */
  milestones: IMilestone[];
  /** Parent container ID (for nesting) */
  parentId?: string;
  /** Start date (ISO 8601) */
  startDate?: string;
  /** Target end date (ISO 8601) */
  targetDate?: string;
  /** Metadata from the domain */
  metadata: Record<string, unknown>;
}

/**
 * A milestone gate within a container.
 */
export interface IMilestone {
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Target date (ISO 8601) */
  targetDate: string;
  /** Whether this is a blocking gate */
  isGate: boolean;
  /** Whether this milestone is on the critical path */
  isCritical: boolean;
  /** Current status */
  status: UniversalStatus;
  /** Metadata from the domain */
  metadata: Record<string, unknown>;
}

// ============================================================================
// Universal Authority
// ============================================================================

/**
 * An authority level in the domain's governance hierarchy.
 *
 * Maps to:
 * - Platform: CLAUDE_AGENT → DEVELOPER → ARCHITECT → ERIK
 * - Construction: FIELD → FOREMAN → SUPERINTENDENT → PM → ARCHITECT → OWNER → REGULATORY
 * - Generic: Any tiered approval hierarchy
 */
export interface IAuthorityLevel {
  /** Numeric tier (0 = lowest authority) */
  tier: number;
  /** Machine-readable identifier */
  id: string;
  /** Human-readable title */
  title: string;
  /** Maximum budget this level can approve (currency units) */
  budgetLimit: number;
  /** Maximum time scope this level can authorize (hours) */
  timeAuthorityHours: number;
  /** Work scope description (e.g., 'single-file', 'multi-feature') */
  scopeDescription: string;
  /** Whether this level can auto-approve within thresholds */
  canAutoApprove: boolean;
  /** Permission strings specific to this level */
  permissions: string[];
}

/**
 * Complete authority cascade configuration for a domain.
 */
export interface IAuthorityCascade {
  /** Domain this cascade belongs to */
  domain: DomainContext;
  /** Ordered authority levels (lowest to highest) */
  levels: IAuthorityLevel[];
  /** Default timeout before auto-escalation (hours per level) */
  escalationTimeouts: Record<string, number>;
}

// ============================================================================
// Universal Health Metrics
// ============================================================================

/**
 * A single health metric measurement.
 * The eigenmode system uses 12 of these to form the EigenmodeVector.
 *
 * Maps to:
 * - Platform: test_coverage, ci_stability, technical_debt, etc.
 * - Construction: quality_score, safety_incidents, schedule_variance, etc.
 */
export interface IHealthMetric {
  /** Machine-readable metric identifier */
  id: string;
  /** Human-readable metric name */
  name: string;
  /** Current value (normalized 0.0 to 1.0) */
  value: number;
  /** Previous value for trend detection */
  previousValue?: number;
  /** Trend direction */
  trend: 'improving' | 'stable' | 'declining';
  /** Weight in the eigenmode vector (sums to 1.0 across all metrics) */
  weight: number;
  /** Lower bound for 'healthy' classification */
  healthyThreshold: number;
  /** Lower bound for 'warning' classification */
  warningThreshold: number;
  /** ISO 8601 timestamp of measurement */
  measuredAt: string;
  /** Source of the measurement */
  source: string;
}

/**
 * Complete health assessment for a domain context.
 */
export interface IHealthAssessment {
  /** Domain this assessment belongs to */
  domain: DomainContext;
  /** Overall health classification */
  overallHealth: 'healthy' | 'warning' | 'critical';
  /** Overall score (0-100) */
  score: number;
  /** Individual metrics (12 for eigenmode compatibility) */
  metrics: IHealthMetric[];
  /** Computed eigenmode vector from metrics */
  eigenmodeVector: EigenmodeVector;
  /** ISO 8601 timestamp of assessment */
  assessedAt: string;
}

// ============================================================================
// Adapter Query Types
// ============================================================================

/**
 * Filter criteria for querying work units.
 */
export interface WorkUnitFilter {
  status?: UniversalStatus[];
  containerId?: string;
  owner?: string;
  tags?: string[];
  hasBlockers?: boolean;
}

/**
 * Filter criteria for querying decisions.
 */
export interface DecisionFilter {
  status?: UniversalStatus[];
  category?: string;
  impact?: ImpactLevel[];
  tags?: string[];
  proposedBy?: string;
}

/**
 * Filter criteria for querying state nodes.
 */
export interface StateNodeFilter {
  nodeType?: string[];
  status?: UniversalStatus[];
  phase?: string;
  tags?: string[];
}

/**
 * Prioritized work recommendation from the engine.
 */
export interface IWorkRecommendation {
  /** Work unit being recommended */
  workUnit: IWorkUnit;
  /** Priority score (higher = more important, 0.0 to 1.0) */
  priority: number;
  /** Why this work unit is recommended */
  rationale: string;
  /** Blocking dependencies that need resolution first */
  blockers: IDependency[];
  /** Related decisions providing context */
  relatedDecisions: IDecision[];
  /** Health metrics relevant to this recommendation */
  relevantMetrics: IHealthMetric[];
}
