/**
 * Authority GraphQL Schema Definitions
 *
 * Type definitions for authority levels, participants, and escalation cascades.
 *
 * @module graphql/authority/authority.schema
 * @version 1.0.0
 */

import { gql } from 'graphql-tag';

export const authorityTypeDefs = gql`
  # ==============================================================================
  # Enums
  # ==============================================================================

  enum ParticipantRole {
    FIELD_WORKER
    FOREMAN
    SUPERINTENDENT
    PROJECT_MANAGER
    EXECUTIVE
    ARCHITECT
    ENGINEER
    INSPECTOR
    OWNER
    SUBCONTRACTOR
  }

  enum ParticipantStatus {
    ACTIVE
    INACTIVE
    ON_LEAVE
    TERMINATED
  }

  # ==============================================================================
  # Input Types
  # ==============================================================================

  input ParticipantFilterInput {
    projectId: ID
    role: ParticipantRole
    authorityLevel: AuthorityLevel
    status: ParticipantStatus
    searchTerm: String
  }

  input CreateParticipantInput {
    projectId: ID!
    userId: ID
    name: String!
    email: String!
    phone: String
    role: ParticipantRole!
    authorityLevel: AuthorityLevel!
    company: String
    trade: String
    canApprove: Boolean = false
    canEscalate: Boolean = true
    metadata: JSON
  }

  input UpdateParticipantInput {
    participantId: ID!
    name: String
    email: String
    phone: String
    role: ParticipantRole
    authorityLevel: AuthorityLevel
    status: ParticipantStatus
    canApprove: Boolean
    canEscalate: Boolean
  }

  input AuthorityConfigInput {
    projectId: ID!
    decisionType: DecisionType!
    authorityLevel: AuthorityLevel!
    costThreshold: Float
    scheduleThreshold: Int
    autoEscalateHours: Int
    requiresInspection: Boolean
    escalationTargetLevel: AuthorityLevel
  }

  # ==============================================================================
  # Object Types
  # ==============================================================================

  type Participant {
    id: ID!
    urn: String!
    projectId: ID!
    project: Project
    userId: ID
    user: User
    name: String!
    email: String!
    phone: String
    role: ParticipantRole!
    authorityLevel: AuthorityLevel!
    status: ParticipantStatus!
    company: String
    trade: String

    # Permissions
    canApprove: Boolean!
    canEscalate: Boolean!

    # Activity
    decisionsCreated: [PMDecision!]!
    decisionsApproved: [PMDecision!]!
    acknowledgments: [Acknowledgment!]!
    inspectionsAssigned: [Inspection!]!

    # Statistics
    decisionCount: Int!
    approvalCount: Int!
    averageResponseTime: Float

    # Metadata
    metadata: JSON
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type AuthorityLevelConfig {
    level: AuthorityLevel!
    name: String!
    description: String!
    defaultTimeoutHours: Int!
    canApproveTypes: [DecisionType!]!
    maxCostApproval: Float
    maxScheduleApproval: Int
    requiresSecondApprover: Boolean!
    escalationTarget: AuthorityLevel
  }

  type AuthorityGraph {
    projectId: ID!
    levels: [AuthorityLevelConfig!]!
    participants: [Participant!]!
    escalationPaths: [EscalationPath!]!
  }

  type EscalationPath {
    fromLevel: AuthorityLevel!
    toLevel: AuthorityLevel!
    conditions: [String!]!
    timeoutHours: Int!
    autoEscalate: Boolean!
  }

  type AuthorityDecisionConfig {
    decisionType: DecisionType!
    authorityLevel: AuthorityLevel!
    costThreshold: Float
    scheduleThreshold: Int
    autoEscalateHours: Int
    requiresInspection: Boolean!
  }

  # ==============================================================================
  # Response Types
  # ==============================================================================

  type ParticipantConnection {
    nodes: [Participant!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type ParticipantResult {
    success: Boolean!
    participant: Participant
    error: String
  }

  type AuthorityValidation {
    valid: Boolean!
    requiredLevel: AuthorityLevel!
    currentLevel: AuthorityLevel!
    canProceed: Boolean!
    escalationRequired: Boolean!
    escalationTarget: Participant
    reason: String
  }

  # ==============================================================================
  # Queries
  # ==============================================================================

  extend type Query {
    # Participant queries
    participant(id: ID, urn: String): Participant

    participants(
      filter: ParticipantFilterInput
      pagination: PaginationInput
      orderBy: String
    ): ParticipantConnection!

    # Authority configuration
    authorityGraph(projectId: ID!): AuthorityGraph!

    authorityLevelConfig(level: AuthorityLevel!): AuthorityLevelConfig!

    authorityDecisionConfigs(projectId: ID!): [AuthorityDecisionConfig!]!

    # Validation
    validateAuthority(
      participantId: ID!
      decisionType: DecisionType!
      costImpact: Float
      scheduleImpact: Int
    ): AuthorityValidation!

    # Find approvers for a decision
    findApprovers(
      projectId: ID!
      authorityLevel: AuthorityLevel!
      decisionType: DecisionType
    ): [Participant!]!

    # Get escalation chain
    getEscalationChain(
      projectId: ID!
      fromLevel: AuthorityLevel!
    ): [Participant!]!
  }

  # ==============================================================================
  # Mutations
  # ==============================================================================

  extend type Mutation {
    # Participant management
    createParticipant(input: CreateParticipantInput!): ParticipantResult!
    updateParticipant(input: UpdateParticipantInput!): ParticipantResult!
    deactivateParticipant(participantId: ID!, reason: String): ParticipantResult!
    reactivateParticipant(participantId: ID!): ParticipantResult!

    # Authority configuration
    configureAuthorityLevel(
      projectId: ID!
      level: AuthorityLevel!
      config: AuthorityConfigInput!
    ): AuthorityLevelConfig!

    setEscalationPath(
      projectId: ID!
      fromLevel: AuthorityLevel!
      toLevel: AuthorityLevel!
      timeoutHours: Int!
      autoEscalate: Boolean!
    ): EscalationPath!
  }
`;

export default authorityTypeDefs;
