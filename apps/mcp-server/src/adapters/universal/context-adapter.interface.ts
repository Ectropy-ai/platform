/**
 * Context Adapter Interface
 *
 * The contract that ALL domain-specific adapters must implement.
 * This is the primary abstraction boundary between the universal
 * decision engine core and domain-specific data/logic.
 *
 * Each domain (platform, construction, healthcare, etc.) implements
 * this interface to translate its data model into universal types
 * that the decision engine can reason about.
 *
 * Design Principles:
 * - Adapter Pattern: Domain-specific → universal type translation
 * - Strategy Pattern: Engine selects adapter by domain ID at runtime
 * - Read-heavy: Adapters primarily read domain state; writes go through domain services
 * - Cacheable: All methods return snapshots; adapters may cache internally
 *
 * @module adapters/universal
 * @version 1.0.0
 */

import type {
  DomainContext,
  DomainId,
  IWorkUnit,
  IDecision,
  IDependency,
  IStateNode,
  IContainer,
  IAuthorityCascade,
  IHealthAssessment,
  IHealthMetric,
  IWorkRecommendation,
  WorkUnitFilter,
  DecisionFilter,
  StateNodeFilter,
} from './universal.types.js';
import type { EigenmodeVector } from '../../types/dual-process.types.js';

// ============================================================================
// Context Adapter Interface
// ============================================================================

/**
 * Contract for domain-specific context adapters.
 *
 * Implementors translate domain data (files, databases, APIs) into
 * universal types that the decision engine processes uniformly.
 *
 * @example
 * ```typescript
 * class PlatformContextAdapter implements IContextAdapter {
 *   getDomainContext() { return { domainId: 'platform', ... }; }
 *   async getWorkUnits() { // reads .roadmap/roadmap.json deliverables }
 *   async getDecisions() { // reads .roadmap/decision-log.json }
 * }
 * ```
 */
export interface IContextAdapter {
  // ==========================================================================
  // Identity
  // ==========================================================================

  /**
   * Returns the domain context identifying this adapter.
   * Must be stable across calls — used for routing and isolation.
   */
  getDomainContext(): DomainContext;

  // ==========================================================================
  // Work Units (Deliverables, Activities, Tasks)
  // ==========================================================================

  /**
   * Retrieve all work units matching the filter criteria.
   * Returns domain data mapped to universal IWorkUnit.
   */
  getWorkUnits(filter?: WorkUnitFilter): Promise<IWorkUnit[]>;

  /**
   * Retrieve a single work unit by ID.
   * Returns null if not found.
   */
  getWorkUnit(id: string): Promise<IWorkUnit | null>;

  // ==========================================================================
  // Decisions (Decision Log, RFIs, Change Orders)
  // ==========================================================================

  /**
   * Retrieve all decisions matching the filter criteria.
   * Returns domain data mapped to universal IDecision.
   */
  getDecisions(filter?: DecisionFilter): Promise<IDecision[]>;

  /**
   * Retrieve a single decision by ID.
   * Returns null if not found.
   */
  getDecision(id: string): Promise<IDecision | null>;

  // ==========================================================================
  // Dependencies
  // ==========================================================================

  /**
   * Retrieve all dependencies for a given entity.
   * Returns both upstream (depends-on) and downstream (blocks) relationships.
   *
   * @param entityId - The work unit or state node to query dependencies for
   */
  getDependencies(entityId: string): Promise<IDependency[]>;

  // ==========================================================================
  // State Nodes (Current Truth)
  // ==========================================================================

  /**
   * Retrieve all state nodes matching the filter criteria.
   * State nodes represent the current ground truth of the domain.
   */
  getStateNodes(filter?: StateNodeFilter): Promise<IStateNode[]>;

  /**
   * Retrieve a single state node by ID.
   * Returns null if not found.
   */
  getStateNode(id: string): Promise<IStateNode | null>;

  // ==========================================================================
  // Containers (Phases, Projects, Sprints)
  // ==========================================================================

  /**
   * Retrieve all containers (phases, projects, sprints).
   */
  getContainers(): Promise<IContainer[]>;

  /**
   * Retrieve the currently active container.
   * Returns null if no container is active.
   */
  getActiveContainer(): Promise<IContainer | null>;

  // ==========================================================================
  // Authority
  // ==========================================================================

  /**
   * Retrieve the authority cascade for this domain.
   * Defines the governance hierarchy for decision approvals.
   */
  getAuthorityCascade(): Promise<IAuthorityCascade>;

  // ==========================================================================
  // Health & Eigenmodes
  // ==========================================================================

  /**
   * Compute the current health assessment for the domain.
   * Returns 12 metrics that form the eigenmode vector.
   */
  computeHealthAssessment(): Promise<IHealthAssessment>;

  /**
   * Compute the current eigenmode vector.
   * Shorthand for computeHealthAssessment().eigenmodeVector.
   */
  computeEigenmodeVector(): Promise<EigenmodeVector>;

  /**
   * Compute a single health metric by ID.
   * Useful for targeted monitoring without full assessment overhead.
   */
  computeMetric(metricId: string): Promise<IHealthMetric | null>;

  // ==========================================================================
  // Work Prioritization
  // ==========================================================================

  /**
   * Get prioritized work recommendations.
   * Combines work unit status, dependencies, health metrics,
   * and decision context to produce actionable recommendations.
   *
   * @param limit - Maximum number of recommendations to return
   */
  getWorkRecommendations(limit?: number): Promise<IWorkRecommendation[]>;

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Initialize the adapter. Called once when registered with the context registry.
   * Use for loading configuration, establishing connections, warming caches.
   */
  initialize(): Promise<void>;

  /**
   * Check if the adapter is healthy and data is accessible.
   */
  healthCheck(): Promise<AdapterHealthStatus>;

  /**
   * Clear any internal caches. Called when data freshness is required.
   */
  clearCache(): void;
}

// ============================================================================
// Supporting Types
// ============================================================================

/**
 * Health status of an adapter.
 */
export interface AdapterHealthStatus {
  /** Is the adapter healthy and serving data? */
  healthy: boolean;
  /** Data source description */
  source: string;
  /** Last successful data read (ISO 8601) */
  lastDataRead?: string;
  /** Latency of last health check (ms) */
  latencyMs?: number;
  /** Error message if unhealthy */
  error?: string;
  /** Count of data entities available */
  entityCounts?: {
    workUnits: number;
    decisions: number;
    stateNodes: number;
    containers: number;
  };
}

/**
 * Configuration for creating a context adapter.
 */
export interface ContextAdapterConfig {
  /** Domain identifier */
  domainId: DomainId;
  /** Whether to enable internal caching */
  enableCache?: boolean;
  /** Cache TTL in milliseconds */
  cacheTTL?: number;
  /** Additional domain-specific configuration */
  options?: Record<string, unknown>;
}
