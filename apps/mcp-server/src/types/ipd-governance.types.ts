/**
 * IPD Governance Types
 *
 * Type definitions for Integrated Project Delivery (IPD) governance,
 * including PMT/PET voting sessions, Target Cost tracking, and savings distribution.
 *
 * IPD Governance Structure:
 * - PMT (Project Management Team): Day-to-day decisions within thresholds
 * - PET (Project Executive Team): Strategic decisions exceeding PMT authority
 * - Target Cost: Shared financial target with savings/overrun distribution
 *
 * @see .roadmap/features/ipd-governance/FEATURE.json
 * @version 1.0.0
 */

import { AuthorityLevel } from './pm.types.js';

// ============================================================================
// URN Types
// ============================================================================

/**
 * IPD Voting Session URN
 * Format: urn:luhtech:ectropy:ipd:voting-session:{projectId}:{sessionId}
 */
export type VotingSessionURN = `urn:luhtech:ectropy:ipd:voting-session:${string}:${string}`;

/**
 * IPD Target Cost URN
 * Format: urn:luhtech:ectropy:ipd:target-cost:{projectId}
 */
export type TargetCostURN = `urn:luhtech:ectropy:ipd:target-cost:${string}`;

/**
 * IPD Member URN
 * Format: urn:luhtech:ectropy:ipd:member:{projectId}:{memberId}
 */
export type IPDMemberURN = `urn:luhtech:ectropy:ipd:member:${string}:${string}`;

// ============================================================================
// Enums
// ============================================================================

/**
 * Voting body types
 */
export enum VotingBody {
  PMT = 'PMT',
  PET = 'PET',
}

/**
 * Quorum types
 */
export enum QuorumType {
  MAJORITY = 'majority',
  SUPERMAJORITY = 'supermajority',
  UNANIMOUS = 'unanimous',
}

/**
 * Voting session status
 */
export enum VotingSessionStatus {
  DRAFT = 'draft',
  OPEN = 'open',
  CLOSED = 'closed',
  EXPIRED = 'expired',
  ESCALATED = 'escalated',
  CANCELLED = 'cancelled',
}

/**
 * Vote decision options
 */
export enum VoteDecision {
  APPROVE = 'approve',
  REJECT = 'reject',
  ABSTAIN = 'abstain',
  ESCALATE = 'escalate',
}

/**
 * Proposal types for IPD voting
 */
export enum IPDProposalType {
  PMT_DECISION = 'pmt_decision',
  PET_ESCALATION = 'pet_escalation',
  TARGET_COST_AMENDMENT = 'target_cost_amendment',
  SAVINGS_DISTRIBUTION = 'savings_distribution',
  GOAL_VERIFICATION = 'goal_verification',
  SCOPE_CHANGE = 'scope_change',
  SCHEDULE_CHANGE = 'schedule_change',
  RISK_ALLOCATION = 'risk_allocation',
}

/**
 * Target cost change types
 */
export enum TargetCostChangeType {
  INITIAL = 'initial',
  AMENDMENT = 'amendment',
  SCOPE_CHANGE = 'scope_change',
  CONTINGENCY_RELEASE = 'contingency_release',
  RECONCILIATION = 'reconciliation',
}

/**
 * Savings distribution trigger types
 */
export enum SavingsDistributionTrigger {
  SUBSTANTIAL_COMPLETION = 'substantial_completion',
  FINAL_COMPLETION = 'final_completion',
  MILESTONE = 'milestone',
  PERIODIC = 'periodic',
}

// ============================================================================
// IPD Member Types
// ============================================================================

/**
 * IPD team member
 */
export interface IPDMember {
  /** Member URN */
  urn: IPDMemberURN;
  /** User identifier */
  userId: string;
  /** Display name */
  name: string;
  /** Organization/company */
  organization: string;
  /** Role in the project */
  role: string;
  /** Authority level */
  authorityLevel: AuthorityLevel;
  /** PMT membership */
  pmtMember: boolean;
  /** PET membership */
  petMember: boolean;
  /** Voting weight (default 1) */
  voteWeight: number;
  /** Email for notifications */
  email: string;
  /** Phone for SMS notifications */
  phone?: string;
  /** Savings share percentage (for distribution) */
  savingsSharePercent?: number;
  /** Active status */
  active: boolean;
}

/**
 * PMT configuration
 */
export interface PMTConfiguration {
  /** PMT members */
  members: IPDMember[];
  /** Budget decision limit */
  budgetLimit: number;
  /** Schedule decision limit (days) */
  scheduleLimitDays: number;
  /** Default quorum type */
  quorumType: QuorumType;
  /** Voting window in hours */
  votingWindowHours: number;
  /** Escalation triggers */
  escalationTriggers: {
    budgetThreshold: number;
    scheduleThreshold: number;
    unanimityRequired: boolean;
  };
}

/**
 * PET configuration
 */
export interface PETConfiguration {
  /** PET members */
  members: IPDMember[];
  /** Budget authority (can be 'unlimited') */
  budgetAuthority: number | 'unlimited';
  /** Schedule authority (can be 'unlimited') */
  scheduleAuthority: number | 'unlimited';
  /** Default quorum type */
  quorumType: QuorumType;
  /** Voting window in hours */
  votingWindowHours: number;
  /** Final authority on all matters */
  finalAuthority: boolean;
}

// ============================================================================
// Voting Session Types
// ============================================================================

/**
 * Individual vote cast
 */
export interface VoteCast {
  /** Voter URN */
  voterUrn: IPDMemberURN;
  /** Voter name */
  voterName: string;
  /** Organization */
  organization: string;
  /** Vote decision */
  decision: VoteDecision;
  /** Vote weight */
  weight: number;
  /** Rationale for the vote */
  rationale: string;
  /** Timestamp */
  timestamp: string;
  /** Conditions attached to vote */
  conditions?: string[];
}

/**
 * Vote tally
 */
export interface VoteTally {
  /** Approve votes count */
  approve: number;
  /** Reject votes count */
  reject: number;
  /** Abstain votes count */
  abstain: number;
  /** Escalate votes count */
  escalate: number;
  /** Weighted approve */
  weightedApprove: number;
  /** Weighted reject */
  weightedReject: number;
  /** Weighted abstain */
  weightedAbstain: number;
  /** Total weight of votes cast */
  totalWeightCast: number;
  /** Total possible weight */
  totalWeightPossible: number;
  /** Participation rate */
  participationRate: number;
  /** Quorum met */
  quorumMet: boolean;
}

/**
 * Voting session outcome
 */
export interface VotingOutcome {
  /** Result */
  result: 'approved' | 'rejected' | 'escalated' | 'expired' | 'cancelled';
  /** Quorum was met */
  quorumMet: boolean;
  /** Final tally */
  finalTally: VoteTally;
  /** Decision rationale */
  decisionRationale: string;
  /** Conditions from approving votes */
  conditions: string[];
  /** Escalation details if escalated */
  escalationDetails?: {
    escalatedTo: VotingBody;
    reason: string;
    newSessionUrn?: VotingSessionURN;
  };
  /** Finalized timestamp */
  finalizedAt: string;
  /** Finalized by */
  finalizedBy: IPDMemberURN;
}

/**
 * Voting session
 */
export interface VotingSession {
  /** Session URN */
  $id: VotingSessionURN;
  /** Schema reference */
  $schema: string;
  /** Schema version */
  schemaVersion: string;
  /** Metadata */
  meta: {
    projectId: string;
    sourceOfTruth: string;
    lastUpdated: string;
  };
  /** Session ID */
  sessionId: string;
  /** Project ID */
  projectId: string;
  /** Voting body (PMT or PET) */
  votingBody: VotingBody;
  /** Proposal type */
  proposalType: IPDProposalType;
  /** Title */
  title: string;
  /** Description */
  description: string;
  /** Related decision URN */
  relatedDecisionUrn?: string;
  /** Proposed by */
  proposedBy: IPDMemberURN;
  /** Status */
  status: VotingSessionStatus;
  /** Quorum type */
  quorumType: QuorumType;
  /** Required participation (0-1) */
  requiredParticipation: number;
  /** Voting deadline */
  deadline: string;
  /** Votes cast */
  votes: VoteCast[];
  /** Current tally */
  tally: VoteTally;
  /** Outcome (when closed) */
  outcome?: VotingOutcome;
  /** Impact assessment */
  impact: {
    budgetImpact?: number;
    scheduleImpactDays?: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    affectedParties: string[];
  };
  /** Attachments/references */
  attachments: Array<{
    name: string;
    url: string;
    type: string;
  }>;
  /** Timestamps */
  timestamps: {
    createdAt: string;
    openedAt?: string;
    closedAt?: string;
    escalatedAt?: string;
  };
  /** Graph metadata */
  graphMetadata: {
    inEdges: string[];
    outEdges: string[];
  };
}

// ============================================================================
// Target Cost Types
// ============================================================================

/**
 * Target cost line item
 */
export interface TargetCostLineItem {
  /** Line item ID */
  id: string;
  /** Category */
  category: string;
  /** Description */
  description: string;
  /** Original amount */
  originalAmount: number;
  /** Current amount */
  currentAmount: number;
  /** Committed cost */
  committedCost: number;
  /** Actual cost */
  actualCost: number;
  /** Forecast to complete */
  forecastToComplete: number;
  /** Variance */
  variance: number;
  /** Status */
  status: 'on_track' | 'at_risk' | 'over_budget' | 'under_budget';
}

/**
 * Target cost amendment
 */
export interface TargetCostAmendment {
  /** Amendment ID */
  id: string;
  /** Change type */
  changeType: TargetCostChangeType;
  /** Description */
  description: string;
  /** Amount change */
  amountChange: number;
  /** New total */
  newTotal: number;
  /** Effective date */
  effectiveDate: string;
  /** Approved by voting session */
  approvedBySessionUrn?: VotingSessionURN;
  /** Timestamp */
  timestamp: string;
}

/**
 * Savings projection
 */
export interface SavingsProjection {
  /** Projection date */
  projectionDate: string;
  /** Target cost */
  targetCost: number;
  /** Projected final cost */
  projectedFinalCost: number;
  /** Projected savings (positive) or overrun (negative) */
  projectedSavings: number;
  /** Confidence level (0-1) */
  confidenceLevel: number;
  /** Methodology */
  methodology: string;
  /** Assumptions */
  assumptions: string[];
}

/**
 * Party savings share
 */
export interface PartySavingsShare {
  /** Party name */
  partyName: string;
  /** Organization */
  organization: string;
  /** Role */
  role: string;
  /** Share percentage */
  sharePercent: number;
  /** Projected amount */
  projectedAmount: number;
  /** Actual amount (if distributed) */
  actualAmount?: number;
}

/**
 * Savings distribution
 */
export interface SavingsDistribution {
  /** Distribution ID */
  id: string;
  /** Trigger type */
  triggerType: SavingsDistributionTrigger;
  /** Distribution date */
  distributionDate: string;
  /** Total savings amount */
  totalSavings: number;
  /** Party shares */
  partyShares: PartySavingsShare[];
  /** Status */
  status: 'projected' | 'pending_approval' | 'approved' | 'distributed';
  /** Approved by session */
  approvedBySessionUrn?: VotingSessionURN;
}

/**
 * Target cost record
 */
export interface TargetCostRecord {
  /** Record URN */
  $id: TargetCostURN;
  /** Schema reference */
  $schema: string;
  /** Schema version */
  schemaVersion: string;
  /** Metadata */
  meta: {
    projectId: string;
    sourceOfTruth: string;
    lastUpdated: string;
  };
  /** Project ID */
  projectId: string;
  /** Currency */
  currency: string;
  /** Original target cost */
  originalTargetCost: number;
  /** Current target cost */
  currentTargetCost: number;
  /** Line items */
  lineItems: TargetCostLineItem[];
  /** Amendments */
  amendments: TargetCostAmendment[];
  /** Committed cost total */
  committedCost: number;
  /** Actual cost total */
  actualCost: number;
  /** Forecast to complete */
  forecastToComplete: number;
  /** Estimated at completion */
  estimatedAtCompletion: number;
  /** Current variance */
  currentVariance: number;
  /** Contingency remaining */
  contingencyRemaining: number;
  /** Savings projections */
  savingsProjections: SavingsProjection[];
  /** Distribution configuration */
  distributionConfig: {
    ownerSharePercent: number;
    designTeamSharePercent: number;
    constructionTeamSharePercent: number;
    partyShares: Array<{
      partyName: string;
      sharePercent: number;
    }>;
  };
  /** Past distributions */
  distributions: SavingsDistribution[];
  /** Timestamps */
  timestamps: {
    createdAt: string;
    updatedAt: string;
  };
  /** Graph metadata */
  graphMetadata: {
    inEdges: string[];
    outEdges: string[];
  };
}

// ============================================================================
// IPD Governance Configuration
// ============================================================================

/**
 * IPD Governance configuration for a project
 */
export interface IPDGovernanceConfig {
  /** Project ID */
  projectId: string;
  /** PMT configuration */
  pmt: PMTConfiguration;
  /** PET configuration */
  pet: PETConfiguration;
  /** Target cost record URN */
  targetCostUrn?: TargetCostURN;
  /** Default voting window hours */
  defaultVotingWindowHours: number;
  /** Notification settings */
  notifications: {
    emailEnabled: boolean;
    smsEnabled: boolean;
    reminderHours: number[];
  };
  /** Active */
  active: boolean;
}

// ============================================================================
// Service Input/Output Types
// ============================================================================

/**
 * Create voting session input
 */
export interface CreateVotingSessionInput {
  projectId: string;
  votingBody: VotingBody;
  proposalType: IPDProposalType;
  title: string;
  description: string;
  proposedByUserId: string;
  relatedDecisionUrn?: string;
  impact?: {
    budgetImpact?: number;
    scheduleImpactDays?: number;
    riskLevel?: 'low' | 'medium' | 'high' | 'critical';
    affectedParties?: string[];
  };
  attachments?: Array<{
    name: string;
    url: string;
    type: string;
  }>;
  deadlineHours?: number;
  quorumType?: QuorumType;
}

/**
 * Cast vote input
 */
export interface CastVoteInput {
  sessionUrn: VotingSessionURN;
  voterUserId: string;
  decision: VoteDecision;
  rationale: string;
  conditions?: string[];
}

/**
 * Close voting session input
 */
export interface CloseVotingSessionInput {
  sessionUrn: VotingSessionURN;
  closedByUserId: string;
  decisionRationale?: string;
}

/**
 * Escalate to PET input
 */
export interface EscalateToPETInput {
  sessionUrn: VotingSessionURN;
  escalatedByUserId: string;
  reason: string;
}

/**
 * Update target cost input
 */
export interface UpdateTargetCostInput {
  projectId: string;
  changeType: TargetCostChangeType;
  amountChange: number;
  description: string;
  updatedByUserId: string;
  approvalSessionUrn?: VotingSessionURN;
}

/**
 * Calculate savings projection input
 */
export interface CalculateSavingsInput {
  projectId: string;
  asOfDate?: string;
  methodology?: string;
}

/**
 * Service result type
 */
export interface IPDServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  warnings?: string[];
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default quorum requirements
 */
export const DEFAULT_QUORUM_REQUIREMENTS: Record<QuorumType, number> = {
  [QuorumType.MAJORITY]: 0.51,
  [QuorumType.SUPERMAJORITY]: 0.67,
  [QuorumType.UNANIMOUS]: 1.0,
};

/**
 * Default voting window hours
 */
export const DEFAULT_VOTING_WINDOW_HOURS = 72;

/**
 * Default PMT budget limit
 */
export const DEFAULT_PMT_BUDGET_LIMIT = 100000;

/**
 * Default PMT schedule limit (days)
 */
export const DEFAULT_PMT_SCHEDULE_LIMIT_DAYS = 30;

/**
 * Proposal type to default quorum mapping
 */
export const PROPOSAL_TYPE_QUORUM: Record<IPDProposalType, QuorumType> = {
  [IPDProposalType.PMT_DECISION]: QuorumType.MAJORITY,
  [IPDProposalType.PET_ESCALATION]: QuorumType.MAJORITY,
  [IPDProposalType.TARGET_COST_AMENDMENT]: QuorumType.SUPERMAJORITY,
  [IPDProposalType.SAVINGS_DISTRIBUTION]: QuorumType.UNANIMOUS,
  [IPDProposalType.GOAL_VERIFICATION]: QuorumType.MAJORITY,
  [IPDProposalType.SCOPE_CHANGE]: QuorumType.SUPERMAJORITY,
  [IPDProposalType.SCHEDULE_CHANGE]: QuorumType.MAJORITY,
  [IPDProposalType.RISK_ALLOCATION]: QuorumType.SUPERMAJORITY,
};

/**
 * Schema version
 */
export const IPD_SCHEMA_VERSION = '1.0.0';
