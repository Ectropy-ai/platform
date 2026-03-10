/**
 * IPD Voting Service - IPD-M2
 *
 * Implements PMT/PET voting session management for Integrated Project Delivery.
 * Supports creating sessions, casting votes, calculating tallies, and escalation workflows.
 *
 * Key Features:
 * - PMT (Project Management Team) voting for day-to-day decisions
 * - PET (Project Executive Team) voting for strategic decisions
 * - Quorum-based decision making (majority, supermajority, unanimous)
 * - Escalation from PMT to PET when thresholds are exceeded
 *
 * @see .roadmap/features/ipd-governance/FEATURE.json
 * @version 1.0.0
 */

import {
  VotingBody,
  QuorumType,
  VotingSessionStatus,
  VoteDecision,
  IPDProposalType,
  type VotingSession,
  type VoteCast,
  type VoteTally,
  type VotingOutcome,
  type IPDMember,
  type IPDGovernanceConfig,
  type CreateVotingSessionInput,
  type CastVoteInput,
  type CloseVotingSessionInput,
  type EscalateToPETInput,
  type VotingSessionURN,
  type IPDMemberURN,
  type IPDServiceResult,
  DEFAULT_QUORUM_REQUIREMENTS,
  DEFAULT_VOTING_WINDOW_HOURS,
  PROPOSAL_TYPE_QUORUM,
  IPD_SCHEMA_VERSION,
} from '../types/ipd-governance.types.js';

// ============================================================================
// In-Memory Storage (for service implementation)
// ============================================================================

/**
 * In-memory storage for voting sessions
 * In production, this would be replaced with database storage
 */
const sessionStore = new Map<VotingSessionURN, VotingSession>();

/**
 * Clear all sessions (for testing)
 */
export function clearAllSessions(): void {
  sessionStore.clear();
}

// ============================================================================
// URN Builders
// ============================================================================

/**
 * Build a voting session URN
 */
export function buildVotingSessionURN(projectId: string, sessionId: string): VotingSessionURN {
  return `urn:luhtech:ectropy:ipd:voting-session:${projectId}:${sessionId}` as VotingSessionURN;
}

/**
 * Build an IPD member URN
 */
export function buildIPDMemberURN(projectId: string, userId: string): IPDMemberURN {
  return `urn:luhtech:ectropy:ipd:member:${projectId}:${userId}` as IPDMemberURN;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a voting session is open
 */
export function isVotingOpen(session: VotingSession): boolean {
  return session.status === VotingSessionStatus.OPEN;
}

/**
 * Calculate voting deadline from hours
 */
export function getVotingDeadline(hours: number): string {
  const deadline = new Date();
  deadline.setHours(deadline.getHours() + hours);
  return deadline.toISOString();
}

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `vs-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get the quorum type for a proposal
 */
function getQuorumForProposal(
  proposalType: IPDProposalType,
  votingBody: VotingBody,
  config: IPDGovernanceConfig,
  override?: QuorumType
): QuorumType {
  if (override) {
    return override;
  }

  // Check default quorum mapping
  return PROPOSAL_TYPE_QUORUM[proposalType] || (
    votingBody === VotingBody.PMT ? config.pmt.quorumType : config.pet.quorumType
  );
}

/**
 * Get voting window hours for a voting body
 */
function getVotingWindowHours(
  votingBody: VotingBody,
  config: IPDGovernanceConfig,
  override?: number
): number {
  if (override) {
    return override;
  }

  return votingBody === VotingBody.PMT
    ? config.pmt.votingWindowHours
    : config.pet.votingWindowHours;
}

// ============================================================================
// Member Management
// ============================================================================

/**
 * Get an IPD member by user ID
 */
export function getIPDMember(userId: string, config: IPDGovernanceConfig): IPDMember | undefined {
  return config.pmt.members.find(m => m.userId === userId);
}

/**
 * Get all PMT members
 */
export function getPMTMembers(config: IPDGovernanceConfig): IPDMember[] {
  return config.pmt.members.filter(m => m.pmtMember && m.active);
}

/**
 * Get all PET members
 */
export function getPETMembers(config: IPDGovernanceConfig): IPDMember[] {
  return config.pmt.members.filter(m => m.petMember && m.active);
}

/**
 * Check if a member can vote in a specific voting body
 */
export function canMemberVote(member: IPDMember, votingBody: VotingBody): boolean {
  if (!member.active) {
    return false;
  }

  if (votingBody === VotingBody.PMT) {
    return member.pmtMember;
  } else {
    return member.petMember;
  }
}

/**
 * Get members for a voting body
 */
function getVotingBodyMembers(votingBody: VotingBody, config: IPDGovernanceConfig): IPDMember[] {
  return votingBody === VotingBody.PMT
    ? getPMTMembers(config)
    : getPETMembers(config);
}

// ============================================================================
// Tally and Quorum
// ============================================================================

/**
 * Calculate vote tally from votes
 */
export function calculateTally(votes: VoteCast[], totalMembers: number): VoteTally {
  const tally: VoteTally = {
    approve: 0,
    reject: 0,
    abstain: 0,
    escalate: 0,
    weightedApprove: 0,
    weightedReject: 0,
    weightedAbstain: 0,
    totalWeightCast: 0,
    totalWeightPossible: totalMembers,
    participationRate: 0,
    quorumMet: false,
  };

  for (const vote of votes) {
    switch (vote.decision) {
      case VoteDecision.APPROVE:
        tally.approve++;
        tally.weightedApprove += vote.weight;
        break;
      case VoteDecision.REJECT:
        tally.reject++;
        tally.weightedReject += vote.weight;
        break;
      case VoteDecision.ABSTAIN:
        tally.abstain++;
        tally.weightedAbstain += vote.weight;
        break;
      case VoteDecision.ESCALATE:
        tally.escalate++;
        break;
    }
    tally.totalWeightCast += vote.weight;
  }

  tally.participationRate = totalMembers > 0 ? votes.length / totalMembers : 0;

  return tally;
}

/**
 * Check if quorum is met
 */
export function checkQuorum(tally: VoteTally, quorumType: QuorumType): boolean {
  const requiredParticipation = DEFAULT_QUORUM_REQUIREMENTS[quorumType];
  return tally.participationRate >= requiredParticipation;
}

/**
 * Determine voting outcome
 */
export function determineOutcome(
  tally: VoteTally,
  quorumType: QuorumType
): 'approved' | 'rejected' | 'escalated' | 'no_quorum' {
  // Check for escalation first (if any escalate votes)
  if (tally.escalate > 0 && tally.escalate >= (tally.approve + tally.reject) / 2) {
    return 'escalated';
  }

  const quorumMet = checkQuorum(tally, quorumType);
  if (!quorumMet) {
    return 'no_quorum';
  }

  // For unanimous, all votes must approve
  if (quorumType === QuorumType.UNANIMOUS) {
    return tally.reject === 0 && tally.approve > 0 ? 'approved' : 'rejected';
  }

  // For majority/supermajority, compare approve vs reject weighted votes
  const threshold = quorumType === QuorumType.SUPERMAJORITY ? 0.67 : 0.51;
  const totalDecisionWeight = tally.weightedApprove + tally.weightedReject;

  if (totalDecisionWeight === 0) {
    return 'rejected';
  }

  const approvalRatio = tally.weightedApprove / totalDecisionWeight;
  return approvalRatio >= threshold ? 'approved' : 'rejected';
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Create a new voting session
 */
export async function createVotingSession(
  input: CreateVotingSessionInput,
  config: IPDGovernanceConfig
): Promise<IPDServiceResult<VotingSession>> {
  // Validate proposer is a member
  const proposer = getIPDMember(input.proposedByUserId, config);
  if (!proposer) {
    return {
      success: false,
      error: `User ${input.proposedByUserId} is not a member of the IPD team`,
    };
  }

  // Check proposer can vote in the target body
  if (!canMemberVote(proposer, input.votingBody)) {
    return {
      success: false,
      error: `User ${input.proposedByUserId} is not a member of ${input.votingBody}`,
    };
  }

  const sessionId = generateSessionId();
  const sessionUrn = buildVotingSessionURN(input.projectId, sessionId);
  const now = new Date().toISOString();

  // Determine quorum type
  const quorumType = getQuorumForProposal(
    input.proposalType,
    input.votingBody,
    config,
    input.quorumType
  );

  // Calculate deadline
  const votingWindowHours = getVotingWindowHours(
    input.votingBody,
    config,
    input.deadlineHours
  );
  const deadline = getVotingDeadline(votingWindowHours);

  // Get members for this voting body
  const members = getVotingBodyMembers(input.votingBody, config);

  // Initialize empty tally
  const initialTally: VoteTally = {
    approve: 0,
    reject: 0,
    abstain: 0,
    escalate: 0,
    weightedApprove: 0,
    weightedReject: 0,
    weightedAbstain: 0,
    totalWeightCast: 0,
    totalWeightPossible: members.length,
    participationRate: 0,
    quorumMet: false,
  };

  const session: VotingSession = {
    $id: sessionUrn,
    $schema: 'urn:luhtech:ectropy:schema:ipd-voting-session',
    schemaVersion: IPD_SCHEMA_VERSION,
    meta: {
      projectId: input.projectId,
      sourceOfTruth: 'ipd-voting-service',
      lastUpdated: now,
    },
    sessionId,
    projectId: input.projectId,
    votingBody: input.votingBody,
    proposalType: input.proposalType,
    title: input.title,
    description: input.description,
    relatedDecisionUrn: input.relatedDecisionUrn,
    proposedBy: buildIPDMemberURN(input.projectId, input.proposedByUserId),
    status: VotingSessionStatus.OPEN,
    quorumType,
    requiredParticipation: DEFAULT_QUORUM_REQUIREMENTS[quorumType],
    deadline,
    votes: [],
    tally: initialTally,
    impact: {
      budgetImpact: input.impact?.budgetImpact,
      scheduleImpactDays: input.impact?.scheduleImpactDays,
      riskLevel: input.impact?.riskLevel || 'medium',
      affectedParties: input.impact?.affectedParties || [],
    },
    attachments: input.attachments || [],
    timestamps: {
      createdAt: now,
      openedAt: now,
    },
    graphMetadata: {
      inEdges: [],
      outEdges: [],
    },
  };

  // Store the session
  sessionStore.set(sessionUrn, session);

  return {
    success: true,
    data: session,
  };
}

/**
 * Get a voting session by URN
 */
export async function getVotingSession(
  sessionUrn: VotingSessionURN
): Promise<IPDServiceResult<VotingSession>> {
  const session = sessionStore.get(sessionUrn);

  if (!session) {
    return {
      success: false,
      error: `Voting session ${sessionUrn} not found`,
    };
  }

  return {
    success: true,
    data: session,
  };
}

/**
 * Get all open sessions for a project
 */
export async function getOpenSessions(
  projectId: string,
  votingBody?: VotingBody
): Promise<IPDServiceResult<VotingSession[]>> {
  const sessions: VotingSession[] = [];

  for (const session of sessionStore.values()) {
    if (session.projectId === projectId && session.status === VotingSessionStatus.OPEN) {
      if (!votingBody || session.votingBody === votingBody) {
        sessions.push(session);
      }
    }
  }

  return {
    success: true,
    data: sessions,
  };
}

/**
 * Get pending votes for a member
 */
export async function getPendingVotesForMember(
  userId: string,
  projectId: string,
  config: IPDGovernanceConfig
): Promise<IPDServiceResult<VotingSession[]>> {
  const member = getIPDMember(userId, config);
  if (!member) {
    return {
      success: false,
      error: `User ${userId} is not a member of the IPD team`,
    };
  }

  const pendingSessions: VotingSession[] = [];

  for (const session of sessionStore.values()) {
    if (
      session.projectId === projectId &&
      session.status === VotingSessionStatus.OPEN &&
      canMemberVote(member, session.votingBody)
    ) {
      // Check if member has already voted
      const memberUrn = buildIPDMemberURN(projectId, userId);
      const hasVoted = session.votes.some(v => v.voterUrn === memberUrn);
      if (!hasVoted) {
        pendingSessions.push(session);
      }
    }
  }

  return {
    success: true,
    data: pendingSessions,
  };
}

// ============================================================================
// Vote Casting
// ============================================================================

/**
 * Cast a vote on a session
 */
export async function castVote(
  input: CastVoteInput,
  config: IPDGovernanceConfig
): Promise<IPDServiceResult<VotingSession>> {
  // Get the session
  const session = sessionStore.get(input.sessionUrn);
  if (!session) {
    return {
      success: false,
      error: `Voting session ${input.sessionUrn} not found`,
    };
  }

  // Check session is open
  if (!isVotingOpen(session)) {
    return {
      success: false,
      error: `Voting session is not open for voting`,
    };
  }

  // Check voter is a member
  const voter = getIPDMember(input.voterUserId, config);
  if (!voter) {
    return {
      success: false,
      error: `User ${input.voterUserId} is not authorized to vote`,
    };
  }

  // Check voter can vote in this body
  if (!canMemberVote(voter, session.votingBody)) {
    return {
      success: false,
      error: `User ${input.voterUserId} is not authorized to vote in ${session.votingBody}`,
    };
  }

  // Check voter hasn't already voted
  const voterUrn = buildIPDMemberURN(session.projectId, input.voterUserId);
  const existingVote = session.votes.find(v => v.voterUrn === voterUrn);
  if (existingVote) {
    return {
      success: false,
      error: `User ${input.voterUserId} has already voted on this session`,
    };
  }

  // Create the vote
  const vote: VoteCast = {
    voterUrn,
    voterName: voter.name,
    organization: voter.organization,
    decision: input.decision,
    weight: voter.voteWeight,
    rationale: input.rationale,
    timestamp: new Date().toISOString(),
    conditions: input.conditions,
  };

  // Add vote to session
  session.votes.push(vote);

  // Recalculate tally
  const members = getVotingBodyMembers(session.votingBody, config);
  session.tally = calculateTally(session.votes, members.length);
  session.tally.quorumMet = checkQuorum(session.tally, session.quorumType);

  // Update metadata
  session.meta.lastUpdated = new Date().toISOString();

  // Store updated session
  sessionStore.set(input.sessionUrn, session);

  return {
    success: true,
    data: session,
  };
}

// ============================================================================
// Session Close and Escalation
// ============================================================================

/**
 * Close a voting session
 */
export async function closeVotingSession(
  input: CloseVotingSessionInput,
  config: IPDGovernanceConfig
): Promise<IPDServiceResult<VotingSession>> {
  const session = sessionStore.get(input.sessionUrn);
  if (!session) {
    return {
      success: false,
      error: `Voting session ${input.sessionUrn} not found`,
    };
  }

  // Check session is open
  if (session.status !== VotingSessionStatus.OPEN) {
    return {
      success: false,
      error: `Voting session is already closed or not open`,
    };
  }

  // Validate closer is a member
  const closer = getIPDMember(input.closedByUserId, config);
  if (!closer) {
    return {
      success: false,
      error: `User ${input.closedByUserId} is not authorized to close this session`,
    };
  }

  const now = new Date().toISOString();

  // Calculate final tally
  const members = getVotingBodyMembers(session.votingBody, config);
  const finalTally = calculateTally(session.votes, members.length);
  finalTally.quorumMet = checkQuorum(finalTally, session.quorumType);

  // Determine outcome
  const result = determineOutcome(finalTally, session.quorumType);

  // Collect conditions from approving votes
  const conditions: string[] = [];
  for (const vote of session.votes) {
    if (vote.decision === VoteDecision.APPROVE && vote.conditions) {
      conditions.push(...vote.conditions);
    }
  }

  // Build outcome
  const outcome: VotingOutcome = {
    result: result === 'no_quorum' ? 'expired' : result,
    quorumMet: finalTally.quorumMet,
    finalTally,
    decisionRationale: input.decisionRationale || `Session closed with ${result} outcome`,
    conditions,
    finalizedAt: now,
    finalizedBy: buildIPDMemberURN(session.projectId, input.closedByUserId),
  };

  // Update session
  session.status = VotingSessionStatus.CLOSED;
  session.tally = finalTally;
  session.outcome = outcome;
  session.timestamps.closedAt = now;
  session.meta.lastUpdated = now;

  // Store updated session
  sessionStore.set(input.sessionUrn, session);

  return {
    success: true,
    data: session,
  };
}

/**
 * Escalate a PMT session to PET
 */
export async function escalateToPET(
  input: EscalateToPETInput,
  config: IPDGovernanceConfig
): Promise<IPDServiceResult<{
  originalSession: VotingSession;
  newSession: VotingSession;
}>> {
  const originalSession = sessionStore.get(input.sessionUrn);
  if (!originalSession) {
    return {
      success: false,
      error: `Voting session ${input.sessionUrn} not found`,
    };
  }

  // Check it's a PMT session
  if (originalSession.votingBody === VotingBody.PET) {
    return {
      success: false,
      error: `Session is already a PET session and cannot be escalated`,
    };
  }

  // Check session is open
  if (originalSession.status !== VotingSessionStatus.OPEN) {
    return {
      success: false,
      error: `Cannot escalate a closed session`,
    };
  }

  // Validate escalator is a member
  const escalator = getIPDMember(input.escalatedByUserId, config);
  if (!escalator) {
    return {
      success: false,
      error: `User ${input.escalatedByUserId} is not authorized to escalate this session`,
    };
  }

  const now = new Date().toISOString();

  // Create new PET session
  const petSessionResult = await createVotingSession({
    projectId: originalSession.projectId,
    votingBody: VotingBody.PET,
    proposalType: IPDProposalType.PET_ESCALATION,
    title: `[Escalated] ${originalSession.title}`,
    description: `${originalSession.description}\n\nEscalation Reason: ${input.reason}`,
    proposedByUserId: input.escalatedByUserId,
    relatedDecisionUrn: originalSession.relatedDecisionUrn,
    impact: originalSession.impact,
    attachments: originalSession.attachments,
  }, config);

  if (!petSessionResult.success || !petSessionResult.data) {
    return {
      success: false,
      error: `Failed to create PET session: ${petSessionResult.error}`,
    };
  }

  // Mark original session as escalated
  originalSession.status = VotingSessionStatus.ESCALATED;
  originalSession.timestamps.escalatedAt = now;
  originalSession.meta.lastUpdated = now;
  originalSession.outcome = {
    result: 'escalated',
    quorumMet: false,
    finalTally: originalSession.tally,
    decisionRationale: `Escalated to PET: ${input.reason}`,
    conditions: [],
    escalationDetails: {
      escalatedTo: VotingBody.PET,
      reason: input.reason,
      newSessionUrn: petSessionResult.data.$id,
    },
    finalizedAt: now,
    finalizedBy: buildIPDMemberURN(originalSession.projectId, input.escalatedByUserId),
  };

  // Store updated original session
  sessionStore.set(input.sessionUrn, originalSession);

  // Add edge connection between sessions
  petSessionResult.data.graphMetadata.inEdges.push(input.sessionUrn);
  originalSession.graphMetadata.outEdges.push(petSessionResult.data.$id);

  return {
    success: true,
    data: {
      originalSession,
      newSession: petSessionResult.data,
    },
  };
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Get IPD governance configuration
 * In production, this would fetch from database
 */
export function getIPDGovernanceConfig(projectId: string): IPDGovernanceConfig | undefined {
  // This is a placeholder - in production this would fetch from database
  return undefined;
}

/**
 * Initialize IPD governance for a project
 */
export async function initializeIPDGovernance(
  config: IPDGovernanceConfig
): Promise<IPDServiceResult<IPDGovernanceConfig>> {
  // In production, this would persist the configuration
  return {
    success: true,
    data: config,
  };
}

// ============================================================================
// Service Export
// ============================================================================

/**
 * IPD Voting Service namespace
 */
export const IPDVotingService = {
  // Session Management
  createVotingSession,
  getVotingSession,
  getOpenSessions,
  getPendingVotesForMember,
  closeVotingSession,
  escalateToPET,

  // Vote Operations
  castVote,
  calculateTally,
  checkQuorum,
  determineOutcome,

  // Member Management
  getIPDMember,
  getPMTMembers,
  getPETMembers,
  canMemberVote,

  // Configuration
  getIPDGovernanceConfig,
  initializeIPDGovernance,

  // Utilities
  buildVotingSessionURN,
  buildIPDMemberURN,
  isVotingOpen,
  getVotingDeadline,
  clearAllSessions,
};

export default IPDVotingService;
