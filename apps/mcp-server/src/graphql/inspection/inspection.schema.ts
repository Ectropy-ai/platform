/**
 * Inspection GraphQL Schema Definitions
 *
 * Type definitions for field inspections and validation workflows.
 *
 * @module graphql/inspection/inspection.schema
 * @version 1.0.0
 */

import { gql } from 'graphql-tag';

export const inspectionTypeDefs = gql`
  # ==============================================================================
  # Enums
  # ==============================================================================

  enum InspectionType {
    QUALITY
    SAFETY
    PROGRESS
    REGULATORY
    COMMISSIONING
    PUNCH
  }

  enum InspectionStatus {
    SCHEDULED
    IN_PROGRESS
    PASSED
    FAILED
    CONDITIONAL
    CANCELLED
  }

  enum InspectionPriority {
    LOW
    MEDIUM
    HIGH
    CRITICAL
  }

  # ==============================================================================
  # Input Types
  # ==============================================================================

  input InspectionFilterInput {
    projectId: ID
    type: InspectionType
    status: InspectionStatus
    inspectorId: ID
    voxelId: ID
    decisionId: ID
    scheduledFrom: DateTime
    scheduledTo: DateTime
  }

  input RequestInspectionInput {
    projectId: ID!
    voxelId: ID
    decisionId: ID
    type: InspectionType!
    priority: InspectionPriority = MEDIUM
    title: String!
    description: String!
    scheduledDate: DateTime!
    requestedById: ID!
    inspectorId: ID
    checklist: [String!]
    attachments: [AttachmentInput!]
  }

  input CompleteInspectionInput {
    inspectionId: ID!
    status: InspectionStatus!
    findings: String!
    checklistResults: [ChecklistResultInput!]
    issues: [InspectionIssueInput!]
    attachments: [AttachmentInput!]
    signature: String
    completedAt: DateTime
  }

  input ChecklistResultInput {
    item: String!
    passed: Boolean!
    notes: String
  }

  input InspectionIssueInput {
    severity: AlertSeverity!
    description: String!
    requiresRework: Boolean!
    deadline: DateTime
  }

  # ==============================================================================
  # Object Types
  # ==============================================================================

  type Inspection {
    id: ID!
    urn: String!
    projectId: ID!
    project: Project
    voxelId: ID
    voxel: Voxel
    decisionId: ID
    decision: PMDecision
    type: InspectionType!
    status: InspectionStatus!
    priority: InspectionPriority!
    title: String!
    description: String!

    # Scheduling
    scheduledDate: DateTime!
    startedAt: DateTime
    completedAt: DateTime

    # Participants
    requestedById: ID!
    requestedBy: Participant!
    inspectorId: ID
    inspector: Participant

    # Results
    findings: String
    checklistResults: [ChecklistResult!]
    issues: [InspectionIssue!]
    attachments: JSON

    # Metadata
    metadata: JSON
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type ChecklistResult {
    item: String!
    passed: Boolean!
    notes: String
  }

  type InspectionIssue {
    id: ID!
    severity: AlertSeverity!
    description: String!
    requiresRework: Boolean!
    deadline: DateTime
    resolvedAt: DateTime
    resolution: String
  }

  # ==============================================================================
  # Response Types
  # ==============================================================================

  type InspectionConnection {
    nodes: [Inspection!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type InspectionResult {
    success: Boolean!
    inspection: Inspection
    error: String
    validationErrors: [ValidationError!]
  }

  # ==============================================================================
  # Queries
  # ==============================================================================

  extend type Query {
    # Single inspection
    inspection(id: ID, urn: String): Inspection

    # List inspections
    inspections(
      filter: InspectionFilterInput
      pagination: PaginationInput
      orderBy: String
    ): InspectionConnection!

    # Upcoming inspections for a project
    upcomingInspections(
      projectId: ID!
      days: Int = 7
    ): [Inspection!]!

    # Overdue inspections
    overdueInspections(projectId: ID!): [Inspection!]!

    # Inspections for a specific inspector
    myInspections(
      inspectorId: ID!
      status: InspectionStatus
      pagination: PaginationInput
    ): InspectionConnection!
  }

  # ==============================================================================
  # Mutations
  # ==============================================================================

  extend type Mutation {
    # Request and manage inspections
    requestInspection(input: RequestInspectionInput!): InspectionResult!
    assignInspector(inspectionId: ID!, inspectorId: ID!): InspectionResult!
    rescheduleInspection(inspectionId: ID!, newDate: DateTime!): InspectionResult!
    cancelInspection(inspectionId: ID!, reason: String!): InspectionResult!

    # Complete inspection
    startInspection(inspectionId: ID!): InspectionResult!
    completeInspection(input: CompleteInspectionInput!): InspectionResult!

    # Issue resolution
    resolveInspectionIssue(
      inspectionId: ID!
      issueId: ID!
      resolution: String!
    ): InspectionResult!
  }

  # ==============================================================================
  # Subscriptions
  # ==============================================================================

  extend type Subscription {
    inspectionCompleted(projectId: ID!): Inspection!
    inspectionFailed(projectId: ID!): Inspection!
  }
`;

export default inspectionTypeDefs;
