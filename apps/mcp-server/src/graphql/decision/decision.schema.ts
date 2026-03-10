/**
 * Decision GraphQL Schema Definitions
 *
 * Type definitions for PM Decision entities in the Decision Lifecycle.
 * Supports CRUD operations, authority validation, and real-time subscriptions.
 *
 * @module graphql/decision/decision.schema
 * @version 1.0.0
 */

import { gql } from 'graphql-tag';

export const decisionTypeDefs = gql`
  # ==============================================================================
  # Enums
  # ==============================================================================

  enum DecisionStatus {
    PENDING
    APPROVED
    REJECTED
    ESCALATED
    SUPERSEDED
  }

  enum DecisionType {
    FIELD
    TECHNICAL
    SCHEDULE
    BUDGET
    DESIGN
    REGULATORY
    SAFETY
  }

  enum AuthorityLevel {
    FIELD       # Level 0 - Field workers, laborers
    FOREMAN     # Level 1 - Foremen, lead hands
    SUPER       # Level 2 - Superintendents
    PM          # Level 3 - Project managers
    EXEC        # Level 4 - Executives, owners
    DESIGN      # Level 5 - Architects, engineers
    REGULATORY  # Level 6 - Inspectors, code officials
  }

  enum ImpactCategory {
    SCHEDULE
    COST
    QUALITY
    SAFETY
    SCOPE
  }

  enum UrgencyLevel {
    ROUTINE
    STANDARD
    URGENT
    CRITICAL
  }

  # ==============================================================================
  # Input Types
  # ==============================================================================

  input DecisionFilterInput {
    status: DecisionStatus
    type: DecisionType
    authorityLevel: AuthorityLevel
    projectId: ID
    voxelId: ID
    createdById: ID
    dateFrom: DateTime
    dateTo: DateTime
    searchTerm: String
  }

  input PaginationInput {
    page: Int = 1
    limit: Int = 20
  }

  input CaptureDecisionInput {
    projectId: ID!
    voxelId: ID
    type: DecisionType!
    title: String!
    description: String!
    justification: String!
    authorityLevel: AuthorityLevel!
    impactCategories: [ImpactCategory!]!
    urgency: UrgencyLevel = STANDARD
    costImpact: Float
    scheduleImpact: Int
    relatedDecisionIds: [ID!]
    attachments: [AttachmentInput!]
    metadata: JSON
  }

  input AttachmentInput {
    filename: String!
    url: String!
    mimeType: String
    size: Int
  }

  input ApproveDecisionInput {
    decisionId: ID!
    comment: String
    conditions: [String!]
  }

  input RejectDecisionInput {
    decisionId: ID!
    reason: String!
    suggestedAlternative: String
  }

  input EscalateDecisionInput {
    decisionId: ID!
    targetAuthorityLevel: AuthorityLevel!
    reason: String!
    urgency: UrgencyLevel
  }

  input AttachDecisionToVoxelInput {
    decisionId: ID!
    voxelId: ID!
    attachmentType: String = "RELATED"
    notes: String
  }

  input AcknowledgeDecisionInput {
    decisionId: ID!
    acknowledgedById: ID!
    latitude: Float
    longitude: Float
    timestamp: DateTime
    signature: String
    notes: String
  }

  input CreateToleranceOverrideInput {
    voxelId: ID!
    decisionId: ID
    overrideType: String!
    originalValue: Float!
    newValue: Float!
    unit: String!
    justification: String!
    validUntil: DateTime
  }

  # ==============================================================================
  # Object Types
  # ==============================================================================

  type PMDecision {
    id: ID!
    urn: String!
    projectId: ID!
    project: Project
    type: DecisionType!
    title: String!
    description: String!
    justification: String!
    status: DecisionStatus!
    authorityLevel: AuthorityLevel!
    urgency: UrgencyLevel!

    # Impact tracking
    impactCategories: [ImpactCategory!]!
    costImpact: Float
    scheduleImpact: Int
    actualCostImpact: Float
    actualScheduleImpact: Int

    # Workflow
    createdBy: Participant
    createdById: ID
    approvedBy: Participant
    approvedById: ID
    approvalDate: DateTime
    rejectionReason: String
    escalatedTo: PMDecision
    escalatedToId: ID
    supersedes: PMDecision
    supersedesId: ID
    supersededBy: PMDecision

    # Related entities
    voxelAttachments: [VoxelDecisionAttachment!]!
    consequences: [Consequence!]!
    scheduleProposals: [ScheduleProposal!]!
    acknowledgments: [Acknowledgment!]!
    inspections: [Inspection!]!

    # Dual-process tracking
    decisionEvents: [DecisionEvent!]!
    engineType: String
    processingTimeMs: Int

    # Metadata
    tags: [String!]
    attachments: JSON
    metadata: JSON
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type VoxelDecisionAttachment {
    id: ID!
    voxelId: ID!
    voxel: Voxel!
    decisionId: ID!
    decision: PMDecision!
    attachmentType: String!
    notes: String
    createdAt: DateTime!
  }

  type Acknowledgment {
    id: ID!
    urn: String!
    decisionId: ID!
    decision: PMDecision!
    acknowledgedById: ID!
    acknowledgedBy: Participant!
    acknowledgedAt: DateTime!
    latitude: Float
    longitude: Float
    signature: String
    notes: String
    verified: Boolean!
    verifiedAt: DateTime
  }

  type ToleranceOverride {
    id: ID!
    urn: String!
    voxelId: ID!
    voxel: Voxel!
    decisionId: ID
    decision: PMDecision
    overrideType: String!
    originalValue: Float!
    newValue: Float!
    unit: String!
    justification: String!
    approvedById: ID
    approvedBy: Participant
    validUntil: DateTime
    createdAt: DateTime!
  }

  type DecisionEvent {
    id: ID!
    decisionId: ID!
    decision: PMDecision!
    engineType: String!
    eventType: String!
    confidence: Float
    processingTimeMs: Int
    metadata: JSON
    createdAt: DateTime!
  }

  # ==============================================================================
  # Response Types
  # ==============================================================================

  type DecisionConnection {
    nodes: [PMDecision!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    currentPage: Int!
    totalPages: Int!
  }

  type DecisionResult {
    success: Boolean!
    decision: PMDecision
    error: String
    validationErrors: [ValidationError!]
  }

  type ValidationError {
    field: String!
    message: String!
  }

  type AcknowledgmentResult {
    success: Boolean!
    acknowledgment: Acknowledgment
    error: String
  }

  type ToleranceOverrideResult {
    success: Boolean!
    toleranceOverride: ToleranceOverride
    error: String
  }

  # ==============================================================================
  # Queries
  # ==============================================================================

  extend type Query {
    # Single decision by ID or URN
    pmDecision(id: ID, urn: String): PMDecision

    # List decisions with filtering and pagination
    pmDecisions(
      filter: DecisionFilterInput
      pagination: PaginationInput
      orderBy: String
      orderDir: String
    ): DecisionConnection!

    # Get decisions pending approval for current user
    pendingDecisions(pagination: PaginationInput): DecisionConnection!

    # Get decision history (supersession chain)
    decisionHistory(decisionId: ID!): [PMDecision!]!

    # Get decisions requiring acknowledgment
    unacknowledgedDecisions(
      participantId: ID!
      pagination: PaginationInput
    ): DecisionConnection!

    # Authority cascade for a decision type
    authorityRequirements(
      type: DecisionType!
      costImpact: Float
      scheduleImpact: Int
    ): AuthorityRequirement!
  }

  type AuthorityRequirement {
    minimumLevel: AuthorityLevel!
    escalationPath: [AuthorityLevel!]!
    timeoutHours: Int!
    requiresInspection: Boolean!
  }

  # ==============================================================================
  # Mutations
  # ==============================================================================

  extend type Mutation {
    # Core decision operations
    captureDecision(input: CaptureDecisionInput!): DecisionResult!
    approveDecision(input: ApproveDecisionInput!): DecisionResult!
    rejectDecision(input: RejectDecisionInput!): DecisionResult!
    escalateDecision(input: EscalateDecisionInput!): DecisionResult!

    # Voxel attachment
    attachDecisionToVoxel(input: AttachDecisionToVoxelInput!): DecisionResult!
    detachDecisionFromVoxel(decisionId: ID!, voxelId: ID!): DecisionResult!

    # Acknowledgment
    acknowledgeDecision(input: AcknowledgeDecisionInput!): AcknowledgmentResult!
    verifyAcknowledgment(acknowledgmentId: ID!): AcknowledgmentResult!

    # Tolerance override
    createToleranceOverride(input: CreateToleranceOverrideInput!): ToleranceOverrideResult!
    revokeToleranceOverride(overrideId: ID!, reason: String!): ToleranceOverrideResult!
  }

  # ==============================================================================
  # Subscriptions
  # ==============================================================================

  extend type Subscription {
    # Real-time decision updates
    decisionUpdated(projectId: ID!): PMDecision!
    decisionCreated(projectId: ID!): PMDecision!
    decisionApproved(projectId: ID!): PMDecision!

    # Acknowledgment events
    acknowledgmentReceived(decisionId: ID!): Acknowledgment!
  }
`;

export default decisionTypeDefs;
