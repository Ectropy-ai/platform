/**
 * Data Source Abstraction Layer
 *
 * Enterprise pattern for abstracting data access from storage implementation.
 * Enables seamless migration from file-based storage to PostgreSQL/pgvector
 * without changing business logic or API contracts.
 *
 * V3 Migration (2026-01-07): Added graph-ready metadata types for URN identifiers
 * and bidirectional edge traversal support.
 *
 * Design Principles:
 * - Single Responsibility: Each method does one thing
 * - Open/Closed: Easy to extend with new data sources
 * - Liskov Substitution: Any DataSource implementation is interchangeable
 * - Interface Segregation: Consumers depend on specific methods only
 * - Dependency Inversion: High-level code depends on abstractions
 *
 * Migration Path:
 * 1. Current: FileDataSource (reads JSON files)
 * 2. Future: PgVectorDataSource (queries PostgreSQL with vector embeddings)
 * 3. Testing: MockDataSource (in-memory data for tests)
 */

// ============================================================================
// V3 Graph Metadata Types
// ============================================================================

/**
 * URN identifier for graph-ready entities
 * Pattern: urn:luhtech:{venture}:{nodeType}:{identifier}
 *
 * Examples:
 * - urn:luhtech:ectropy:file:decision-log
 * - urn:luhtech:ectropy:decision:d-2026-01-01-example
 * - urn:luhtech:ectropy:service:service-mcp-server
 */
export type URN = string;

/**
 * V3 Graph metadata for bidirectional traversal
 */
export interface GraphMetadata {
  inEdges: URN[];
  outEdges: URN[];
  edges?: GraphEdge[];
}

/**
 * Detailed edge definition for rich graph relationships
 */
export interface GraphEdge {
  from: URN;
  to: URN;
  type: EdgeType;
  weight?: number;
  label?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

/**
 * Edge relationship types (v1.1.0)
 */
export type EdgeType =
  | 'fork'
  | 'depends-on'
  | 'blocks'
  | 'provides'
  | 'consumes'
  | 'synergy'
  | 'supersedes'
  | 'references'
  | 'contains'
  | 'owns'
  | 'implements'
  | 'relates-to';

/**
 * Node type classifications (v1.1.0)
 */
export type NodeType =
  | 'venture'
  | 'file'
  | 'milestone'
  | 'decision'
  | 'service'
  | 'evidence'
  | 'person'
  | 'ip-asset'
  | 'dependency'
  | 'phase'
  | 'task'
  | 'metric'
  | 'extension'
  | 'node'
  | 'deliverable'
  | 'workstream'
  | 'document';

/**
 * V3 file metadata for sync tracking
 */
export interface V3Meta {
  sourceOfTruth: string;
  migratedFrom?: string[];
  migrationDate?: string;
  totalDecisions?: number;
  totalNodes?: number;
  syncStatus?: {
    v1Path: string;
    lastSync: string;
    syncDirection: 'v3-is-source-of-truth' | 'bidirectional' | 'v1-is-source';
  };
}

/**
 * Base interface for all V3 schema files
 */
export interface V3SchemaBase {
  $schema: string;
  $id: URN;
  schemaVersion: string;
  ventureId: string;
  lastUpdated: string;
  meta: V3Meta;
  graphMetadata?: GraphMetadata;
}

// ============================================================================
// Type Definitions (Domain Models) - Extended with V3 Support
// ============================================================================

export interface Decision {
  // V3 Graph identifiers (optional for backward compatibility)
  $id?: URN;
  graphMetadata?: GraphMetadata;

  // Core fields
  decisionId: string;
  title: string;
  status:
    | 'proposed'
    | 'under-review'
    | 'approved'
    | 'rejected'
    | 'implemented'
    | 'deprecated';
  category: string;
  impact: 'low' | 'medium' | 'high' | 'critical';
  proposedBy: string;
  proposedDate: string;
  reviewedBy?: string[];
  approvedBy?: string;
  approvedDate?: string;
  implementedDate?: string;
  context: string;
  decision: string;
  consequences: string;
  alternatives: Array<{
    title: string;
    description: string;
    pros: string[];
    cons: string[];
    effort: string;
    risk: string;
    rejectionReason: string;
  }>;
  relatedDecisions: string[];
  supersedes?: string;
  supersededBy?: string;
  evidence: string[];
  tags: string[];
  voteId?: string;
  votesCast?: number;
  votesRequired?: number;
  votingDeadline?: string;
  impactedDeliverables: string[];
  impactedServices: string[];
  impactedInfrastructure: string[];
  implementationNotes?: string;
  index: number;
}

export interface DecisionLog extends Partial<V3SchemaBase> {
  version: string;
  lastUpdated: string;
  decisions: Decision[];
  // V3 indexes (optional for backward compatibility)
  indexes?: {
    byStatus?: Record<string, string[]>;
    byCategory?: Record<string, string[]>;
    byDecisionId?: Record<string, number>;
  };
}

export interface Vote {
  // V3 Graph identifiers (optional for backward compatibility)
  $id?: URN;
  graphMetadata?: GraphMetadata;

  voteId: string;
  decisionId: string;
  status: 'open' | 'closed' | 'cancelled';
  createdAt: string;
  closedAt?: string;
  votes: Array<{
    voter: string;
    decision: 'approve' | 'reject' | 'abstain';
    timestamp: string;
    comment?: string;
  }>;
  result?: {
    approved: number;
    rejected: number;
    abstained: number;
    outcome: 'approved' | 'rejected' | 'no-consensus';
  };
}

export interface VotesCollection extends Partial<V3SchemaBase> {
  version: string;
  lastUpdated: string;
  votes: Vote[];
}

export interface Server {
  serverId: string;
  name: string;
  ipAddress?: string;
  provider: string;
  region: string;
  status: 'active' | 'maintenance' | 'retired';
  services: string[];
  specs: {
    cpu: string;
    memory: string;
    storage: string;
  };
  monitoring: {
    healthCheck: string;
    metricsEndpoint: string;
  };
  tags: string[];
}

export interface Service {
  serviceId: string;
  name: string;
  type: string;
  version: string;
  status: 'running' | 'stopped' | 'error' | 'deploying';
  serverId: string;
  port: number;
  healthCheck: string;
  dependencies: string[];
  repository?: string;
  documentation?: string;
  tags: string[];
}

export interface Port {
  number: number;
  protocol: 'tcp' | 'udp';
  service: string;
  description: string;
  public: boolean;
}

export interface Workflow {
  workflowId: string;
  name: string;
  path: string;
  trigger: string;
  status: 'active' | 'disabled';
  dependencies: string[];
  artifacts?: string[];
}

export interface InfrastructureCatalog extends Partial<V3SchemaBase> {
  version: string;
  lastUpdated: string;
  servers: Server[];
  services: Service[];
  ports: Port[];
  workflows: Workflow[];
}

export interface Node {
  // V3 Graph identifiers (optional for backward compatibility)
  $id?: URN;
  graphMetadata?: GraphMetadata;

  nodeId: string;
  title: string;
  nodeType: 'file' | 'directory' | 'service' | 'workflow' | 'deliverable';
  status: 'active' | 'archived' | 'deprecated';
  phase: string;
  path?: string;
  description?: string;
  owner?: string;
  createdAt: string;
  lastModified: string;
  retentionDate?: string;
  relationships: {
    dependsOn: string[];
    blockedBy: string[];
    relatedTo: string[];
  };
  metadata: {
    size?: number;
    lines?: number;
    language?: string;
    [key: string]: any;
  };
  evidence: string[];
  tags: string[];
  index: number;
}

export interface CurrentTruth extends Partial<V3SchemaBase> {
  version: string;
  lastUpdated: string;
  nodes: Node[];
  // V3 indexes (optional for backward compatibility)
  indexes?: {
    byNodeType?: Record<string, string[]>;
    byStatus?: Record<string, string[]>;
  };
}

// ============================================================================
// Roadmap Types
// ============================================================================

/**
 * Roadmap phase (mapped from quarter in roadmap.json)
 */
export interface Phase {
  phaseId: string;
  name: string;
  status: string;
  startDate?: string;
  targetDate?: string;
  completionDate?: string;
}

/**
 * Roadmap deliverable within a phase
 */
export interface RoadmapDeliverable {
  deliverableId: string;
  title: string;
  description: string;
  status: string;
  assignedTo?: string;
  phaseId: string;
}

// ============================================================================
// DataSource Interface
// ============================================================================

/**
 * Main data source abstraction interface.
 *
 * All data access goes through this interface. Implementations can:
 * - Read from JSON files (FileDataSource)
 * - Query PostgreSQL (PgDataSource)
 * - Query with vector embeddings (PgVectorDataSource)
 * - Use mock data (MockDataSource)
 *
 * Consumers remain unchanged when swapping implementations.
 */
export interface DataSource {
  // ========================================================================
  // Decision Log Operations
  // ========================================================================

  /**
   * Get all decisions with optional filtering
   */
  getDecisions(filters?: {
    status?: Decision['status'];
    category?: string;
    impact?: Decision['impact'];
    tags?: string[];
  }): Promise<Decision[]>;

  /**
   * Get a single decision by ID (supports both decisionId and URN)
   */
  getDecision(decisionId: string): Promise<Decision | null>;

  /**
   * Get decisions that are superseded by a specific decision
   */
  getSupersededDecisions(decisionId: string): Promise<Decision[]>;

  /**
   * Get decisions that supersede a specific decision
   */
  getSupersedesDecisions(decisionId: string): Promise<Decision[]>;

  /**
   * Get related decisions
   */
  getRelatedDecisions(decisionId: string): Promise<Decision[]>;

  // ========================================================================
  // V3 Graph Operations (New in v3)
  // ========================================================================

  /**
   * Get entity by URN identifier
   * Supports cross-type lookups using URN pattern
   */
  getByURN?(urn: URN): Promise<Decision | Node | Vote | null>;

  /**
   * Get related entities by URN using graph edges
   * Traverses inEdges and outEdges for relationship discovery
   */
  getRelatedByURN?(
    urn: URN,
    edgeType?: EdgeType
  ): Promise<Array<Decision | Node | Vote>>;

  // ========================================================================
  // Votes Operations
  // ========================================================================

  /**
   * Get all votes
   */
  getVotes(): Promise<Vote[]>;

  /**
   * Get a single vote by ID
   */
  getVote(voteId: string): Promise<Vote | null>;

  /**
   * Create a new vote
   */
  createVote(vote: Omit<Vote, 'voteId'>): Promise<Vote>;

  /**
   * Cast a vote on a decision
   */
  castVote(
    voteId: string,
    voter: string,
    decision: 'approve' | 'reject' | 'abstain',
    comment?: string
  ): Promise<Vote>;

  /**
   * Close a vote and calculate results
   */
  closeVote(voteId: string): Promise<Vote>;

  /**
   * Get votes for a specific decision
   */
  getVotesForDecision(decisionId: string): Promise<Vote[]>;

  // ========================================================================
  // Infrastructure Catalog Operations
  // ========================================================================

  /**
   * Get all servers with optional filtering
   */
  getServers(filters?: {
    status?: Server['status'];
    provider?: string;
    tags?: string[];
  }): Promise<Server[]>;

  /**
   * Get a single server by ID
   */
  getServer(serverId: string): Promise<Server | null>;

  /**
   * Get all services with optional filtering
   */
  getServices(filters?: {
    status?: Service['status'];
    serverId?: string;
    type?: string;
    tags?: string[];
  }): Promise<Service[]>;

  /**
   * Get a single service by ID
   */
  getService(serviceId: string): Promise<Service | null>;

  /**
   * Get services that depend on a specific service
   */
  getServiceDependencies(serviceId: string): Promise<Service[]>;

  /**
   * Get all port allocations
   */
  getPorts(): Promise<Port[]>;

  /**
   * Get workflows with optional filtering
   */
  getWorkflows(filters?: { status?: Workflow['status'] }): Promise<Workflow[]>;

  /**
   * Get a single workflow by ID
   */
  getWorkflow(workflowId: string): Promise<Workflow | null>;

  // ========================================================================
  // Current Truth Operations
  // ========================================================================

  /**
   * Get all nodes with optional filtering
   */
  getNodes(filters?: {
    nodeType?: Node['nodeType'];
    status?: Node['status'];
    phase?: string;
    tags?: string[];
  }): Promise<Node[]>;

  /**
   * Get a single node by ID
   */
  getNode(nodeId: string): Promise<Node | null>;

  /**
   * Get nodes that depend on a specific node
   */
  getNodeDependencies(nodeId: string): Promise<Node[]>;

  /**
   * Get nodes that block a specific node
   */
  getNodeBlockers(nodeId: string): Promise<Node[]>;

  /**
   * Get nodes related to a specific node
   */
  getRelatedNodes(nodeId: string): Promise<Node[]>;

  // ========================================================================
  // Roadmap Operations
  // ========================================================================

  /**
   * Get all phases with optional filtering
   */
  getPhases(filters?: { status?: string }): Promise<Phase[]>;

  /**
   * Get a single phase by ID
   */
  getPhase(phaseId: string): Promise<Phase | null>;

  /**
   * Get the current active phase
   */
  getCurrentPhase(): Promise<Phase | null>;

  /**
   * Get all deliverables with optional filtering
   */
  getDeliverables(filters?: {
    phaseId?: string;
    status?: string;
  }): Promise<RoadmapDeliverable[]>;

  /**
   * Get a single deliverable by ID
   */
  getDeliverable(deliverableId: string): Promise<RoadmapDeliverable | null>;

  // ========================================================================
  // Utility Operations
  // ========================================================================

  /**
   * Clear any internal caches (for development/testing)
   */
  clearCache(): void;

  /**
   * Get data source health/status
   */
  getHealth(): Promise<{
    healthy: boolean;
    source: string;
    latency?: number;
    error?: string;
  }>;
}

// ============================================================================
// Factory Types
// ============================================================================

/**
 * Configuration for creating data source instances
 */
export interface DataSourceConfig {
  type: 'file' | 'postgres' | 'pgvector' | 'mock';

  // File-based config
  dataPath?: string;

  // Database config
  connectionString?: string;
  pool?: any; // PostgreSQL pool

  // Cache config
  enableCache?: boolean;
  cacheTTL?: number;
}

/**
 * Factory function type for creating data sources
 */
export type DataSourceFactory = (config: DataSourceConfig) => DataSource;
