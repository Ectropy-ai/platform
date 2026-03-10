/**
 * Consequence GraphQL Schema Definitions
 *
 * Type definitions for decision consequences and outcome tracking.
 *
 * @module graphql/consequence/consequence.schema
 * @version 1.0.0
 */

import { gql } from 'graphql-tag';

export const consequenceTypeDefs = gql`
  # ==============================================================================
  # Enums
  # ==============================================================================

  enum ConsequenceType {
    SCHEDULE_CHANGE
    COST_CHANGE
    SCOPE_CHANGE
    QUALITY_IMPACT
    SAFETY_IMPACT
    RESOURCE_CHANGE
    DEPENDENCY_CHANGE
  }

  enum ConsequenceStatus {
    PROJECTED
    CONFIRMED
    MITIGATED
    REALIZED
  }

  enum ConsequenceSeverity {
    MINOR
    MODERATE
    SIGNIFICANT
    MAJOR
    CRITICAL
  }

  # ==============================================================================
  # Input Types
  # ==============================================================================

  input ConsequenceFilterInput {
    projectId: ID
    decisionId: ID
    type: ConsequenceType
    status: ConsequenceStatus
    severity: ConsequenceSeverity
    affectedVoxelId: ID
  }

  input CreateConsequenceInput {
    projectId: ID!
    decisionId: ID!
    type: ConsequenceType!
    severity: ConsequenceSeverity!
    description: String!
    projectedImpact: ImpactInput!
    affectedVoxelIds: [ID!]
    mitigationStrategy: String
    metadata: JSON
  }

  input ImpactInput {
    costDelta: Float
    scheduleDelta: Int
    qualityScore: Float
    safetyRisk: Float
    description: String
  }

  input UpdateConsequenceInput {
    consequenceId: ID!
    status: ConsequenceStatus
    actualImpact: ImpactInput
    resolution: String
  }

  # ==============================================================================
  # Object Types
  # ==============================================================================

  type Consequence {
    id: ID!
    urn: String!
    projectId: ID!
    project: Project
    decisionId: ID!
    decision: PMDecision!
    type: ConsequenceType!
    status: ConsequenceStatus!
    severity: ConsequenceSeverity!
    description: String!

    # Impact tracking
    projectedImpact: Impact!
    actualImpact: Impact
    variancePercentage: Float

    # Affected entities
    affectedVoxels: [Voxel!]!

    # Mitigation
    mitigationStrategy: String
    mitigationEffectiveness: Float
    resolution: String
    resolvedAt: DateTime

    # Metadata
    metadata: JSON
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Impact {
    costDelta: Float
    scheduleDelta: Int
    qualityScore: Float
    safetyRisk: Float
    description: String
  }

  # ==============================================================================
  # Response Types
  # ==============================================================================

  type ConsequenceConnection {
    nodes: [Consequence!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type ConsequenceResult {
    success: Boolean!
    consequence: Consequence
    error: String
  }

  type ConsequenceAnalytics {
    totalConsequences: Int!
    byType: [TypeCount!]!
    bySeverity: [SeverityCount!]!
    totalCostImpact: Float!
    totalScheduleImpact: Int!
    averageVariance: Float
  }

  type TypeCount {
    type: ConsequenceType!
    count: Int!
  }

  type SeverityCount {
    severity: ConsequenceSeverity!
    count: Int!
  }

  # ==============================================================================
  # Queries
  # ==============================================================================

  extend type Query {
    # Single consequence
    consequence(id: ID, urn: String): Consequence

    # List consequences
    consequences(
      filter: ConsequenceFilterInput
      pagination: PaginationInput
      orderBy: String
    ): ConsequenceConnection!

    # Consequences for a decision
    decisionConsequences(decisionId: ID!): [Consequence!]!

    # Consequences affecting a voxel
    voxelConsequences(voxelId: ID!): [Consequence!]!

    # Analytics
    consequenceAnalytics(
      projectId: ID!
      dateFrom: DateTime
      dateTo: DateTime
    ): ConsequenceAnalytics!
  }

  # ==============================================================================
  # Mutations
  # ==============================================================================

  extend type Mutation {
    # Consequence management
    createConsequence(input: CreateConsequenceInput!): ConsequenceResult!
    updateConsequence(input: UpdateConsequenceInput!): ConsequenceResult!
    confirmConsequence(consequenceId: ID!, actualImpact: ImpactInput!): ConsequenceResult!
    mitigateConsequence(consequenceId: ID!, strategy: String!, effectiveness: Float): ConsequenceResult!
    resolveConsequence(consequenceId: ID!, resolution: String!): ConsequenceResult!

    # Link consequences to voxels
    linkConsequenceToVoxel(consequenceId: ID!, voxelId: ID!): ConsequenceResult!
    unlinkConsequenceFromVoxel(consequenceId: ID!, voxelId: ID!): ConsequenceResult!
  }
`;

export default consequenceTypeDefs;
