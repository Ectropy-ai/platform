/**
 * Schedule Proposal GraphQL Schema Definitions
 *
 * Type definitions for look-ahead schedule proposals and changes.
 *
 * @module graphql/schedule/schedule.schema
 * @version 1.0.0
 */

import { gql } from 'graphql-tag';

export const scheduleTypeDefs = gql`
  # ==============================================================================
  # Enums
  # ==============================================================================

  enum ProposalStatus {
    DRAFT
    SUBMITTED
    UNDER_REVIEW
    APPROVED
    REJECTED
    IMPLEMENTED
    WITHDRAWN
  }

  enum ProposalType {
    ACCELERATION
    DELAY
    RESEQUENCE
    RESOURCE_CHANGE
    SCOPE_CHANGE
    MILESTONE_CHANGE
  }

  enum ProposalImpact {
    NONE
    MINOR
    MODERATE
    SIGNIFICANT
    CRITICAL
  }

  # ==============================================================================
  # Input Types
  # ==============================================================================

  input ScheduleProposalFilterInput {
    projectId: ID
    decisionId: ID
    status: ProposalStatus
    type: ProposalType
    submittedById: ID
    impactLevel: ProposalImpact
    dateFrom: DateTime
    dateTo: DateTime
  }

  input CreateScheduleProposalInput {
    projectId: ID!
    decisionId: ID
    type: ProposalType!
    title: String!
    description: String!
    justification: String!
    submittedById: ID!
    proposedChanges: [ScheduleChangeInput!]!
    affectedActivities: [String!]
    costImpact: Float
    scheduleImpact: Int
    attachments: [AttachmentInput!]
  }

  input ScheduleChangeInput {
    activityId: String!
    activityName: String!
    originalStart: DateTime
    originalEnd: DateTime
    proposedStart: DateTime
    proposedEnd: DateTime
    durationChange: Int
    predecessorChanges: [String!]
    notes: String
  }

  input UpdateScheduleProposalInput {
    proposalId: ID!
    title: String
    description: String
    proposedChanges: [ScheduleChangeInput!]
    status: ProposalStatus
  }

  input ReviewScheduleProposalInput {
    proposalId: ID!
    approved: Boolean!
    reviewNotes: String!
    conditions: [String!]
    modifiedChanges: [ScheduleChangeInput!]
  }

  # ==============================================================================
  # Object Types
  # ==============================================================================

  type ScheduleProposal {
    id: ID!
    urn: String!
    projectId: ID!
    project: Project
    decisionId: ID
    decision: PMDecision
    type: ProposalType!
    status: ProposalStatus!
    title: String!
    description: String!
    justification: String!

    # Submitter
    submittedById: ID!
    submittedBy: Participant!
    submittedAt: DateTime!

    # Proposed changes
    proposedChanges: [ScheduleChange!]!
    affectedActivities: [String!]

    # Impact assessment
    costImpact: Float
    scheduleImpact: Int
    impactLevel: ProposalImpact!
    criticalPathAffected: Boolean!

    # Review
    reviewedById: ID
    reviewedBy: Participant
    reviewedAt: DateTime
    reviewNotes: String
    approvalConditions: [String!]

    # Implementation
    implementedAt: DateTime
    implementationNotes: String

    # Metadata
    attachments: JSON
    metadata: JSON
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type ScheduleChange {
    activityId: String!
    activityName: String!
    originalStart: DateTime
    originalEnd: DateTime
    proposedStart: DateTime
    proposedEnd: DateTime
    durationChange: Int
    predecessorChanges: [String!]
    notes: String
    implemented: Boolean!
  }

  # ==============================================================================
  # Response Types
  # ==============================================================================

  type ScheduleProposalConnection {
    nodes: [ScheduleProposal!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type ScheduleProposalResult {
    success: Boolean!
    proposal: ScheduleProposal
    error: String
    validationErrors: [ValidationError!]
  }

  type ScheduleImpactAnalysis {
    proposalId: ID!
    criticalPathAffected: Boolean!
    floatChange: Int
    milestoneImpacts: [MilestoneImpact!]!
    resourceConflicts: [ResourceConflict!]!
    riskAssessment: String
    recommendedAction: String
  }

  type MilestoneImpact {
    milestoneName: String!
    originalDate: DateTime!
    projectedDate: DateTime!
    daysImpact: Int!
  }

  type ResourceConflict {
    resourceName: String!
    conflictDate: DateTime!
    description: String!
  }

  # ==============================================================================
  # Queries
  # ==============================================================================

  extend type Query {
    # Single proposal
    scheduleProposal(id: ID, urn: String): ScheduleProposal

    # List proposals
    scheduleProposals(
      filter: ScheduleProposalFilterInput
      pagination: PaginationInput
      orderBy: String
    ): ScheduleProposalConnection!

    # Proposals pending review
    pendingScheduleProposals(
      projectId: ID!
      pagination: PaginationInput
    ): ScheduleProposalConnection!

    # Impact analysis for a proposal
    analyzeScheduleImpact(proposalId: ID!): ScheduleImpactAnalysis!

    # Proposals affecting a date range
    proposalsInDateRange(
      projectId: ID!
      startDate: DateTime!
      endDate: DateTime!
    ): [ScheduleProposal!]!
  }

  # ==============================================================================
  # Mutations
  # ==============================================================================

  extend type Mutation {
    # Proposal lifecycle
    createScheduleProposal(input: CreateScheduleProposalInput!): ScheduleProposalResult!
    updateScheduleProposal(input: UpdateScheduleProposalInput!): ScheduleProposalResult!
    submitScheduleProposal(proposalId: ID!): ScheduleProposalResult!
    withdrawScheduleProposal(proposalId: ID!, reason: String!): ScheduleProposalResult!

    # Review process
    reviewScheduleProposal(input: ReviewScheduleProposalInput!): ScheduleProposalResult!

    # Implementation
    implementScheduleProposal(proposalId: ID!, notes: String): ScheduleProposalResult!
  }
`;

export default scheduleTypeDefs;
