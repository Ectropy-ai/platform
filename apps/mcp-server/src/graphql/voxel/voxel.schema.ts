/**
 * Voxel GraphQL Schema Definitions
 *
 * Type definitions for Voxel (3D spatial decision containers) entities.
 * Supports spatial queries, decision surface retrieval, and alerts.
 *
 * @module graphql/voxel/voxel.schema
 * @version 1.0.0
 */

import { gql } from 'graphql-tag';

export const voxelTypeDefs = gql`
  # ==============================================================================
  # Enums
  # ==============================================================================

  enum VoxelType {
    ZONE
    LEVEL
    ROOM
    ASSEMBLY
    ELEMENT
    SYSTEM
  }

  enum VoxelStatus {
    PLANNED
    IN_PROGRESS
    COMPLETE
    ON_HOLD
    ISSUE
  }

  enum AlertSeverity {
    INFO
    WARNING
    ERROR
    CRITICAL
  }

  enum AlertStatus {
    ACTIVE
    ACKNOWLEDGED
    RESOLVED
    DISMISSED
  }

  # ==============================================================================
  # Input Types
  # ==============================================================================

  input VoxelFilterInput {
    projectId: ID
    type: VoxelType
    status: VoxelStatus
    parentId: ID
    hasActiveAlerts: Boolean
    hasDecisions: Boolean
    searchTerm: String
    boundingBox: BoundingBoxInput
  }

  input BoundingBoxInput {
    minX: Float!
    minY: Float!
    minZ: Float!
    maxX: Float!
    maxY: Float!
    maxZ: Float!
  }

  input CreateVoxelInput {
    projectId: ID!
    parentId: ID
    type: VoxelType!
    name: String!
    description: String
    coordinates: CoordinatesInput
    boundingBox: BoundingBoxInput
    ifcGuid: String
    metadata: JSON
  }

  input CoordinatesInput {
    x: Float!
    y: Float!
    z: Float!
  }

  input UpdateVoxelInput {
    id: ID!
    name: String
    description: String
    status: VoxelStatus
    coordinates: CoordinatesInput
    boundingBox: BoundingBoxInput
    metadata: JSON
  }

  input CreateVoxelAlertInput {
    voxelId: ID!
    decisionId: ID
    severity: AlertSeverity!
    title: String!
    message: String!
    actionRequired: String
    expiresAt: DateTime
  }

  input CreatePreApprovalInput {
    voxelId: ID!
    approvedById: ID!
    scope: String!
    conditions: [String!]
    maxCostImpact: Float
    maxScheduleImpact: Int
    validFrom: DateTime!
    validUntil: DateTime!
  }

  # ==============================================================================
  # Object Types
  # ==============================================================================

  type Voxel {
    id: ID!
    urn: String!
    projectId: ID!
    project: Project
    parentId: ID
    parent: Voxel
    children: [Voxel!]!
    type: VoxelType!
    name: String!
    description: String
    status: VoxelStatus!

    # Spatial data
    coordinates: Coordinates
    boundingBox: BoundingBox
    ifcGuid: String

    # Decision surface
    decisionAttachments: [VoxelDecisionAttachment!]!
    decisions: [PMDecision!]!
    decisionCount: Int!
    activeDecisionCount: Int!

    # Alerts and overrides
    alerts: [VoxelAlert!]!
    activeAlerts: [VoxelAlert!]!
    toleranceOverrides: [ToleranceOverride!]!
    preApprovals: [PreApproval!]!

    # Relationships
    adjacentVoxels: [Voxel!]!
    dependsOn: [Voxel!]!
    dependedOnBy: [Voxel!]!

    # Metadata
    metadata: JSON
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Coordinates {
    x: Float!
    y: Float!
    z: Float!
  }

  type BoundingBox {
    minX: Float!
    minY: Float!
    minZ: Float!
    maxX: Float!
    maxY: Float!
    maxZ: Float!
  }

  type VoxelAlert {
    id: ID!
    urn: String!
    voxelId: ID!
    voxel: Voxel!
    decisionId: ID
    decision: PMDecision
    severity: AlertSeverity!
    status: AlertStatus!
    title: String!
    message: String!
    actionRequired: String
    acknowledgedById: ID
    acknowledgedBy: Participant
    acknowledgedAt: DateTime
    resolvedAt: DateTime
    expiresAt: DateTime
    createdAt: DateTime!
  }

  type PreApproval {
    id: ID!
    urn: String!
    voxelId: ID!
    voxel: Voxel!
    approvedById: ID!
    approvedBy: Participant!
    scope: String!
    conditions: [String!]
    maxCostImpact: Float
    maxScheduleImpact: Int
    validFrom: DateTime!
    validUntil: DateTime!
    usageCount: Int!
    lastUsedAt: DateTime
    createdAt: DateTime!
  }

  # Voxel Decision Surface - comprehensive view of voxel with all decisions
  type VoxelDecisionSurface {
    voxel: Voxel!
    decisions: [PMDecision!]!
    pendingDecisions: [PMDecision!]!
    approvedDecisions: [PMDecision!]!
    alerts: [VoxelAlert!]!
    toleranceOverrides: [ToleranceOverride!]!
    preApprovals: [PreApproval!]!
    childSurfaces: [VoxelDecisionSurface!]!

    # Aggregations
    totalDecisionCount: Int!
    pendingCount: Int!
    alertCount: Int!
    hasActivePreApproval: Boolean!
  }

  # ==============================================================================
  # Response Types
  # ==============================================================================

  type VoxelConnection {
    nodes: [Voxel!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type VoxelResult {
    success: Boolean!
    voxel: Voxel
    error: String
  }

  type VoxelAlertResult {
    success: Boolean!
    alert: VoxelAlert
    error: String
  }

  type PreApprovalResult {
    success: Boolean!
    preApproval: PreApproval
    error: String
  }

  # ==============================================================================
  # Queries
  # ==============================================================================

  extend type Query {
    # Single voxel by ID or URN
    voxel(id: ID, urn: String): Voxel

    # List voxels with filtering
    voxels(
      filter: VoxelFilterInput
      pagination: PaginationInput
      orderBy: String
    ): VoxelConnection!

    # Get voxel hierarchy tree
    voxelTree(projectId: ID!, rootId: ID): [Voxel!]!

    # Get voxel decision surface (comprehensive view)
    voxelDecisionSurface(voxelId: ID!, includeChildren: Boolean = false): VoxelDecisionSurface!

    # Spatial query - find voxels in bounding box
    voxelsInBoundingBox(
      projectId: ID!
      boundingBox: BoundingBoxInput!
    ): [Voxel!]!

    # Get voxels with active alerts
    voxelsWithAlerts(
      projectId: ID!
      severity: AlertSeverity
    ): [Voxel!]!

    # Get pre-approvals for a voxel
    activePreApprovals(voxelId: ID!): [PreApproval!]!
  }

  # ==============================================================================
  # Mutations
  # ==============================================================================

  extend type Mutation {
    # Voxel CRUD
    createVoxel(input: CreateVoxelInput!): VoxelResult!
    updateVoxel(input: UpdateVoxelInput!): VoxelResult!
    deleteVoxel(id: ID!): VoxelResult!

    # Voxel relationships
    setVoxelParent(voxelId: ID!, parentId: ID): VoxelResult!
    addVoxelDependency(voxelId: ID!, dependsOnId: ID!): VoxelResult!
    removeVoxelDependency(voxelId: ID!, dependsOnId: ID!): VoxelResult!

    # Alerts
    createVoxelAlert(input: CreateVoxelAlertInput!): VoxelAlertResult!
    acknowledgeVoxelAlert(alertId: ID!): VoxelAlertResult!
    resolveVoxelAlert(alertId: ID!, resolution: String): VoxelAlertResult!
    dismissVoxelAlert(alertId: ID!, reason: String): VoxelAlertResult!

    # Pre-approvals
    createPreApproval(input: CreatePreApprovalInput!): PreApprovalResult!
    revokePreApproval(preApprovalId: ID!, reason: String!): PreApprovalResult!
  }

  # ==============================================================================
  # Subscriptions
  # ==============================================================================

  extend type Subscription {
    # Voxel updates
    voxelUpdated(projectId: ID!): Voxel!

    # Alert notifications
    voxelAlertCreated(projectId: ID!): VoxelAlert!
    voxelAlertResolved(projectId: ID!): VoxelAlert!
  }
`;

export default voxelTypeDefs;
