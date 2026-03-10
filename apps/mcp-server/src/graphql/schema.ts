/**
 * GraphQL Schema for Ectropy Documentation Query Layer
 *
 * Provides structured query interface for JSON-first documentation:
 * - Decision log with relationship traversal
 * - Infrastructure catalog with dependency mapping
 * - Current truth nodes with cross-references
 * - Operational runbooks with deployment procedures
 *
 * Enables 97% token reduction for AI agents by allowing precise queries
 * instead of full markdown reads.
 */

import { runbookTypeDefs } from '../schema/runbook.schema.js';

export const typeDefs = `#graphql
  # ============================================================================
  # DECISION TYPES
  # ============================================================================

  """
  Architectural or strategic decision with alternatives, rationale, and impact
  """
  type Decision {
    decisionId: ID!
    timestamp: String!
    title: String!
    context: String!
    alternatives: [Alternative!]!
    decision: String!
    rationale: String!
    status: DecisionStatus!
    category: DecisionCategory!
    impact: ImpactLevel!
    approvedBy: [String!]!
    implementedDate: String
    votes: [String!]!

    # Impact tracking
    deliverables: [String!]!
    services: [String!]!
    infrastructure: [String!]!

    # Evidence and documentation
    evidence: [String!]!
    documentation: [String!]!

    # Relationship traversal
    relatedDecisions: [Decision!]!
    supersedes: Decision
    supersededBy: Decision
  }

  """
  Alternative option considered for a decision
  """
  type Alternative {
    option: String!
    pros: [String!]!
    cons: [String!]!
    estimatedEffort: String
    riskLevel: RiskLevel
  }

  enum DecisionStatus {
    proposed
    under_review
    approved
    rejected
    implemented
    deprecated
  }

  enum DecisionCategory {
    architecture
    security
    infrastructure
    api_design
    data_model
    deployment
    monitoring
    integration
    feature
    policy
    process
    tooling
    governance
    product
    business
  }

  enum ImpactLevel {
    low
    medium
    high
    critical
  }

  enum RiskLevel {
    low
    medium
    high
    critical
  }

  # ============================================================================
  # INFRASTRUCTURE TYPES
  # ============================================================================

  """
  Physical or virtual server hosting Ectropy services
  """
  type Server {
    serverId: ID!
    name: String!
    ipAddress: String
    environment: String!
    provider: String!
    region: String
    resources: ServerResources
    status: String

    # Relationships
    services: [Service!]!
    ports: [Port!]!
  }

  type ServerResources {
    cpu: String
    memory: String
    storage: String
    bandwidth: String
  }

  """
  Service or application running on infrastructure
  """
  type Service {
    serviceId: ID!
    name: String!
    type: String!
    version: String
    repository: String

    # Deployment
    ports: [Port!]!
    secrets: [Secret!]!
    dependencies: [Service!]!

    # Infrastructure
    servers: [Server!]!
    status: String
  }

  """
  Network port allocation
  """
  type Port {
    number: Int!
    protocol: String!
    purpose: String!
    public: Boolean!

    # Relationships
    service: Service
  }

  """
  Secret or credential reference (no values exposed)
  """
  type Secret {
    secretId: ID!
    name: String!
    type: String!
    scope: String!
    usedBy: [Service!]!
  }

  """
  GitHub Actions workflow
  """
  type Workflow {
    workflowId: ID!
    name: String!
    path: String!
    triggers: [String!]!
    secrets: [Secret!]!
    services: [Service!]!
  }

  # ============================================================================
  # ROADMAP TYPES
  # ============================================================================

  """
  Current Truth node tracking platform changes
  """
  type Node {
    nodeId: ID!
    timestamp: String!
    title: String!
    nodeType: String!
    status: String!

    content: NodeContent!
    metadata: NodeMetadata!
    relationships: NodeRelationships!
  }

  type NodeContent {
    summary: String!
    problem: String
    solution: String
    impact: String
    filesModified: [String!]!
    evidence: [String!]!
  }

  type NodeMetadata {
    author: String
    phase: String
    priority: String
    tags: [String!]!
    estimatedEffort: String
  }

  type NodeRelationships {
    relatedNodes: [Node!]!
    relatedDecisions: [Decision!]!
    blockedBy: [Node!]!
    blocks: [Node!]!
  }

  """
  Roadmap phase with deliverables
  """
  type Phase {
    phaseId: ID!
    name: String!
    status: String!
    startDate: String
    targetDate: String
    completionDate: String

    deliverables: [Deliverable!]!
  }

  """
  Specific deliverable within a phase
  """
  type Deliverable {
    deliverableId: ID!
    title: String!
    description: String!
    status: String!
    assignedTo: String

    # Relationships
    phase: Phase!
    dependencies: [Deliverable!]!
    decisions: [Decision!]!
  }

  # ============================================================================
  # QUERY ROOT
  # ============================================================================

  type Query {
    # Decision queries
    """Get all decisions"""
    decisions: [Decision!]!

    """Get decision by ID"""
    decision(decisionId: ID!): Decision

    """Get decisions by status"""
    decisionsByStatus(status: DecisionStatus!): [Decision!]!

    """Get decisions by category"""
    decisionsByCategory(category: DecisionCategory!): [Decision!]!

    """Get decisions by impact level"""
    decisionsByImpact(impact: ImpactLevel!): [Decision!]!

    """Get decisions affecting a specific deliverable"""
    decisionsForDeliverable(deliverableId: String!): [Decision!]!

    """Get decisions affecting a specific service"""
    decisionsForService(serviceId: String!): [Decision!]!

    # Infrastructure queries
    """Get all servers"""
    servers: [Server!]!

    """Get server by ID"""
    server(serverId: ID!): Server

    """Get all services"""
    services: [Service!]!

    """Get service by ID"""
    service(serviceId: ID!): Service

    """Get services by type"""
    servicesByType(type: String!): [Service!]!

    """Get service dependencies"""
    serviceDependencies(serviceId: ID!): [Service!]!

    """Get all workflows"""
    workflows: [Workflow!]!

    """Get workflow by ID"""
    workflow(workflowId: ID!): Workflow

    # Current Truth queries
    """Get all nodes"""
    nodes: [Node!]!

    """Get node by ID"""
    node(nodeId: ID!): Node

    """Get nodes by type"""
    nodesByType(nodeType: String!): [Node!]!

    """Get nodes by status"""
    nodesByStatus(status: String!): [Node!]!

    """Get nodes by phase"""
    nodesByPhase(phase: String!): [Node!]!

    """Get nodes blocking a specific node"""
    blockers(nodeId: ID!): [Node!]!

    # Roadmap queries
    """Get all phases"""
    phases: [Phase!]!

    """Get phase by ID"""
    phase(phaseId: ID!): Phase

    """Get current active phase"""
    currentPhase: Phase

    """Get deliverable by ID"""
    deliverable(deliverableId: ID!): Deliverable
  }

  ${runbookTypeDefs}
`;
