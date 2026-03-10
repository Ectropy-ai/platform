/**
 * GraphQL Mutation Schema for Roadmap Data Operations
 *
 * Provides mutation interface for CRUD operations on:
 * - State Nodes (current truth)
 * - Documentation Decisions
 * - Roadmap phases, deliverables, and features
 * - Infrastructure services
 * - Platform state
 * - Bulk sync/export operations
 *
 * Input types and result types defined here complement the existing
 * query types in schema.ts (Node, Phase, Deliverable are already defined).
 *
 * @module graphql/roadmap-mutations.schema
 * @version 1.0.0
 */

export const roadmapMutationTypeDefs = `#graphql
  # ============================================================================
  # INPUT TYPES - State Nodes
  # ============================================================================

  """
  Input for creating a new state node in the current truth graph
  """
  input StateNodeInput {
    title: String!
    nodeType: String!
    phase: String
    path: String
    description: String
    owner: String
    tags: [String]
    evidence: [String]
  }

  """
  Input for updating an existing state node
  """
  input StateNodeUpdateInput {
    title: String
    status: String
    phase: String
    description: String
    owner: String
    tags: [String]
  }

  # ============================================================================
  # INPUT TYPES - Documentation Decisions
  # ============================================================================

  """
  Input for creating a new documentation decision
  """
  input DocDecisionInput {
    title: String!
    category: String!
    impact: String!
    context: String
    decision: String
    consequences: String
    proposedBy: String
    tags: [String]
  }

  """
  Input for updating an existing documentation decision
  """
  input DocDecisionUpdateInput {
    title: String
    status: String
    category: String
    impact: String
    context: String
    decision: String
    consequences: String
    implementationNotes: String
    tags: [String]
  }

  # ============================================================================
  # INPUT TYPES - Roadmap Features
  # ============================================================================

  """
  Input for creating a new roadmap feature
  """
  input FeatureInput {
    name: String!
    category: String
    status: String
    priority: Int
    phase: String
    dependencies: [String]
    description: String
  }

  """
  Input for updating an existing roadmap feature
  """
  input FeatureUpdateInput {
    name: String
    category: String
    status: String
    priority: Int
    phase: String
    description: String
  }

  # ============================================================================
  # INPUT TYPES - Platform State
  # ============================================================================

  """
  Input for updating the platform state snapshot
  """
  input PlatformStateInput {
    health: String
    phase: String
    completedDeliverables: Int
    totalDeliverables: Int
    productionReadinessScore: Int
    typeSafetyScore: Int
  }

  # ============================================================================
  # RESULT TYPES - Documentation Decisions
  # ============================================================================

  """
  Documentation decision record with full metadata
  """
  type DocDecision {
    decisionId: String!
    title: String!
    status: String!
    category: String!
    impact: String!
    proposedBy: String
    proposedDate: String
    context: String
    decision: String
    consequences: String
    evidence: [String]
    tags: [String]
  }

  # ============================================================================
  # RESULT TYPES - Roadmap Features
  # ============================================================================

  """
  Roadmap feature with tracking metadata
  """
  type RoadmapFeatureType {
    featureId: String!
    name: String!
    category: String
    status: String!
    priority: Int
    phase: String
    dependencies: [String]
    description: String
  }

  # ============================================================================
  # RESULT TYPES - Infrastructure Services
  # ============================================================================

  """
  Infrastructure service with status tracking
  """
  type InfraServiceType {
    serviceId: String!
    name: String!
    type: String
    status: String!
    port: Int
  }

  # ============================================================================
  # RESULT TYPES - Platform State
  # ============================================================================

  """
  Platform state snapshot with health metrics
  """
  type PlatformStateType {
    health: String
    phase: String
    completedDeliverables: Int
    totalDeliverables: Int
    productionReadinessScore: Int
    typeSafetyScore: Int
  }

  # ============================================================================
  # RESULT TYPES - Bulk Operations
  # ============================================================================

  """
  Result of syncing data from .roadmap/ JSON files into the database
  """
  type SyncResult {
    success: Boolean!
    entitiesSynced: Int!
    errors: [String]!
  }

  """
  Result of exporting database state to .roadmap/ JSON files
  """
  type ExportResult {
    success: Boolean!
    filesExported: [String]!
    errors: [String]!
  }

  # ============================================================================
  # MUTATIONS
  # ============================================================================

  type Mutation {
    # State Nodes
    """Create a new state node in the current truth graph"""
    createStateNode(input: StateNodeInput!): Node!

    """Update an existing state node by ID"""
    updateStateNode(nodeId: String!, input: StateNodeUpdateInput!): Node!

    """Delete a state node by ID"""
    deleteStateNode(nodeId: String!): Boolean!

    # Documentation Decisions
    """Create a new documentation decision"""
    createDocDecision(input: DocDecisionInput!): DocDecision!

    """Update an existing documentation decision"""
    updateDocDecision(decisionId: String!, input: DocDecisionUpdateInput!): DocDecision!

    # Roadmap
    """Update the status of a roadmap phase"""
    updatePhaseStatus(phaseId: String!, status: String!): Phase!

    """Update the status of a deliverable, optionally setting completion date"""
    updateDeliverableStatus(deliverableId: String!, status: String!, completedDate: String): Deliverable!

    """Create a new roadmap feature"""
    createFeature(input: FeatureInput!): RoadmapFeatureType!

    """Update an existing roadmap feature"""
    updateFeature(featureId: String!, input: FeatureUpdateInput!): RoadmapFeatureType!

    # Infrastructure
    """Update the status of an infrastructure service"""
    updateServiceStatus(serviceId: String!, status: String!): InfraServiceType!

    # Platform State
    """Update the platform state snapshot"""
    updatePlatformState(input: PlatformStateInput!): PlatformStateType!

    # Bulk Operations
    """Sync data from .roadmap/ JSON files into the database"""
    syncFromFiles: SyncResult!

    """Export database state to .roadmap/ JSON files"""
    exportToFiles: ExportResult!
  }
`;
