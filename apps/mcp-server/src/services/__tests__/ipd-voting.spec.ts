/**
 * IPD Voting Service Tests - IPD-M1/M2
 *
 * Test-first development for IPD Governance voting functionality.
 * Tests PMT/PET voting sessions, vote casting, and escalation workflows.
 *
 * @see .roadmap/features/ipd-governance/FEATURE.json
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  VotingBody,
  QuorumType,
  VotingSessionStatus,
  VoteDecision,
  IPDProposalType,
  type VotingSession,
  type VoteCast,
  type VoteTally,
  type IPDMember,
  type IPDGovernanceConfig,
  type CreateVotingSessionInput,
  type CastVoteInput,
  type CloseVotingSessionInput,
  type EscalateToPETInput,
  DEFAULT_QUORUM_REQUIREMENTS,
  DEFAULT_VOTING_WINDOW_HOURS,
} from '../../types/ipd-governance.types.js';

import { AuthorityLevel } from '../../types/pm.types.js';

// Import the service (to be implemented)
import {
  // Core voting functions
  createVotingSession,
  castVote,
  closeVotingSession,
  escalateToPET,
  getVotingSession,
  getOpenSessions,
  getPendingVotesForMember,

  // Tally and quorum
  calculateTally,
  checkQuorum,
  determineOutcome,

  // Member management
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

  // Service namespace
  IPDVotingService,
} from '../ipd-voting.service.js';

// ============================================================================
// Mock Data
// ============================================================================

const mockProjectId = 'PROJ-TEST-001';

const mockPMTMembers: IPDMember[] = [
  {
    urn: `urn:luhtech:ectropy:ipd:member:${mockProjectId}:user-owner-001` as any,
    userId: 'user-owner-001',
    name: 'John Owner',
    organization: 'Acme Development Corp',
    role: 'Owner Representative',
    authorityLevel: AuthorityLevel.OWNER,
    pmtMember: true,
    petMember: true,
    voteWeight: 1,
    email: 'john@acme.com',
    savingsSharePercent: 40,
    active: true,
  },
  {
    urn: `urn:luhtech:ectropy:ipd:member:${mockProjectId}:user-arch-001` as any,
    userId: 'user-arch-001',
    name: 'Jane Architect',
    organization: 'Smith & Associates',
    role: 'Lead Architect',
    authorityLevel: AuthorityLevel.ARCHITECT,
    pmtMember: true,
    petMember: true,
    voteWeight: 1,
    email: 'jane@smitharch.com',
    savingsSharePercent: 30,
    active: true,
  },
  {
    urn: `urn:luhtech:ectropy:ipd:member:${mockProjectId}:user-pm-001` as any,
    userId: 'user-pm-001',
    name: 'Bob Builder',
    organization: 'BuildRight Inc',
    role: 'Project Manager',
    authorityLevel: AuthorityLevel.PM,
    pmtMember: true,
    petMember: false,
    voteWeight: 1,
    email: 'bob@buildright.com',
    savingsSharePercent: 30,
    active: true,
  },
];

const mockIPDConfig: IPDGovernanceConfig = {
  projectId: mockProjectId,
  pmt: {
    members: mockPMTMembers,
    budgetLimit: 100000,
    scheduleLimitDays: 30,
    quorumType: QuorumType.MAJORITY,
    votingWindowHours: 72,
    escalationTriggers: {
      budgetThreshold: 100000,
      scheduleThreshold: 30,
      unanimityRequired: false,
    },
  },
  pet: {
    members: mockPMTMembers.filter(m => m.petMember),
    budgetAuthority: 'unlimited',
    scheduleAuthority: 'unlimited',
    quorumType: QuorumType.MAJORITY,
    votingWindowHours: 48,
    finalAuthority: true,
  },
  defaultVotingWindowHours: 72,
  notifications: {
    emailEnabled: true,
    smsEnabled: true,
    reminderHours: [24, 4],
  },
  active: true,
};

// ============================================================================
// Voting Session Tests
// ============================================================================

describe('IPDVotingService', () => {
  // Clear sessions before each test to ensure isolation
  beforeEach(() => {
    clearAllSessions();
  });

  describe('Voting Session Management', () => {
    describe('createVotingSession', () => {
      it('should create a PMT voting session', async () => {
        const input: CreateVotingSessionInput = {
          projectId: mockProjectId,
          votingBody: VotingBody.PMT,
          proposalType: IPDProposalType.PMT_DECISION,
          title: 'Approve Change Order #123',
          description: 'Change order for foundation modification',
          proposedByUserId: 'user-pm-001',
          impact: {
            budgetImpact: 50000,
            scheduleImpactDays: 5,
            riskLevel: 'medium',
            affectedParties: ['Owner', 'Contractor'],
          },
        };

        const result = await createVotingSession(input, mockIPDConfig);

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.data?.votingBody).toBe(VotingBody.PMT);
        expect(result.data?.status).toBe(VotingSessionStatus.OPEN);
      });

      it('should create a PET voting session', async () => {
        const input: CreateVotingSessionInput = {
          projectId: mockProjectId,
          votingBody: VotingBody.PET,
          proposalType: IPDProposalType.TARGET_COST_AMENDMENT,
          title: 'Target Cost Amendment - Phase 2',
          description: 'Increase target cost by $500,000 for additional scope',
          proposedByUserId: 'user-owner-001',
          impact: {
            budgetImpact: 500000,
            riskLevel: 'high',
          },
        };

        const result = await createVotingSession(input, mockIPDConfig);

        expect(result.success).toBe(true);
        expect(result.data?.votingBody).toBe(VotingBody.PET);
        expect(result.data?.quorumType).toBe(QuorumType.SUPERMAJORITY);
      });

      it('should set correct quorum based on proposal type', async () => {
        const savingsInput: CreateVotingSessionInput = {
          projectId: mockProjectId,
          votingBody: VotingBody.PET,
          proposalType: IPDProposalType.SAVINGS_DISTRIBUTION,
          title: 'Final Savings Distribution',
          description: 'Distribute project savings',
          proposedByUserId: 'user-owner-001',
        };

        const result = await createVotingSession(savingsInput, mockIPDConfig);

        expect(result.success).toBe(true);
        expect(result.data?.quorumType).toBe(QuorumType.UNANIMOUS);
      });

      it('should set deadline based on voting body configuration', async () => {
        const input: CreateVotingSessionInput = {
          projectId: mockProjectId,
          votingBody: VotingBody.PMT,
          proposalType: IPDProposalType.PMT_DECISION,
          title: 'Test Session',
          description: 'Test',
          proposedByUserId: 'user-pm-001',
        };

        const result = await createVotingSession(input, mockIPDConfig);

        expect(result.success).toBe(true);
        expect(result.data?.deadline).toBeDefined();

        // Deadline should be 72 hours from now for PMT
        const deadline = new Date(result.data!.deadline);
        const now = new Date();
        const hoursDiff = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);
        expect(hoursDiff).toBeCloseTo(72, 0);
      });

      it('should generate proper URN for session', async () => {
        const input: CreateVotingSessionInput = {
          projectId: mockProjectId,
          votingBody: VotingBody.PMT,
          proposalType: IPDProposalType.PMT_DECISION,
          title: 'Test Session',
          description: 'Test',
          proposedByUserId: 'user-pm-001',
        };

        const result = await createVotingSession(input, mockIPDConfig);

        expect(result.success).toBe(true);
        expect(result.data?.$id).toContain('urn:luhtech:ectropy:ipd:voting-session');
        expect(result.data?.$id).toContain(mockProjectId);
      });

      it('should reject if proposer is not a member', async () => {
        const input: CreateVotingSessionInput = {
          projectId: mockProjectId,
          votingBody: VotingBody.PMT,
          proposalType: IPDProposalType.PMT_DECISION,
          title: 'Test Session',
          description: 'Test',
          proposedByUserId: 'unknown-user',
        };

        const result = await createVotingSession(input, mockIPDConfig);

        expect(result.success).toBe(false);
        expect(result.error).toContain('not a member');
      });
    });

    describe('getVotingSession', () => {
      it('should retrieve voting session by URN', async () => {
        // First create a session
        const createInput: CreateVotingSessionInput = {
          projectId: mockProjectId,
          votingBody: VotingBody.PMT,
          proposalType: IPDProposalType.PMT_DECISION,
          title: 'Test Session',
          description: 'Test',
          proposedByUserId: 'user-pm-001',
        };

        const createResult = await createVotingSession(createInput, mockIPDConfig);
        expect(createResult.success).toBe(true);

        // Then retrieve it
        const getResult = await getVotingSession(createResult.data!.$id);

        expect(getResult.success).toBe(true);
        expect(getResult.data?.$id).toBe(createResult.data!.$id);
      });

      it('should return error for non-existent session', async () => {
        const result = await getVotingSession(
          'urn:luhtech:ectropy:ipd:voting-session:PROJ-TEST-001:nonexistent' as any
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
      });
    });

    describe('getOpenSessions', () => {
      it('should return all open sessions for a project', async () => {
        const result = await getOpenSessions(mockProjectId);

        expect(result.success).toBe(true);
        expect(Array.isArray(result.data)).toBe(true);
      });

      it('should filter by voting body', async () => {
        const pmtResult = await getOpenSessions(mockProjectId, VotingBody.PMT);
        const petResult = await getOpenSessions(mockProjectId, VotingBody.PET);

        expect(pmtResult.success).toBe(true);
        expect(petResult.success).toBe(true);

        if (pmtResult.data && pmtResult.data.length > 0) {
          expect(pmtResult.data.every(s => s.votingBody === VotingBody.PMT)).toBe(true);
        }
      });
    });
  });

  // ============================================================================
  // Vote Casting Tests
  // ============================================================================

  describe('Vote Casting', () => {
    describe('castVote', () => {
      it('should cast an approve vote', async () => {
        // Create a session first
        const createInput: CreateVotingSessionInput = {
          projectId: mockProjectId,
          votingBody: VotingBody.PMT,
          proposalType: IPDProposalType.PMT_DECISION,
          title: 'Test Vote',
          description: 'Test',
          proposedByUserId: 'user-pm-001',
        };
        const session = await createVotingSession(createInput, mockIPDConfig);

        const voteInput: CastVoteInput = {
          sessionUrn: session.data!.$id,
          voterUserId: 'user-owner-001',
          decision: VoteDecision.APPROVE,
          rationale: 'This change is necessary for project success',
        };

        const result = await castVote(voteInput, mockIPDConfig);

        expect(result.success).toBe(true);
        expect(result.data?.votes.length).toBeGreaterThan(0);
        expect(result.data?.tally.approve).toBeGreaterThan(0);
      });

      it('should cast a reject vote', async () => {
        const createInput: CreateVotingSessionInput = {
          projectId: mockProjectId,
          votingBody: VotingBody.PMT,
          proposalType: IPDProposalType.PMT_DECISION,
          title: 'Test Vote',
          description: 'Test',
          proposedByUserId: 'user-pm-001',
        };
        const session = await createVotingSession(createInput, mockIPDConfig);

        const voteInput: CastVoteInput = {
          sessionUrn: session.data!.$id,
          voterUserId: 'user-arch-001',
          decision: VoteDecision.REJECT,
          rationale: 'Budget impact is too high',
        };

        const result = await castVote(voteInput, mockIPDConfig);

        expect(result.success).toBe(true);
        expect(result.data?.tally.reject).toBeGreaterThan(0);
      });

      it('should prevent voting on closed session', async () => {
        const createInput: CreateVotingSessionInput = {
          projectId: mockProjectId,
          votingBody: VotingBody.PMT,
          proposalType: IPDProposalType.PMT_DECISION,
          title: 'Test Vote',
          description: 'Test',
          proposedByUserId: 'user-pm-001',
        };
        const session = await createVotingSession(createInput, mockIPDConfig);

        // Close the session
        await closeVotingSession({
          sessionUrn: session.data!.$id,
          closedByUserId: 'user-owner-001',
        }, mockIPDConfig);

        // Try to vote
        const voteInput: CastVoteInput = {
          sessionUrn: session.data!.$id,
          voterUserId: 'user-arch-001',
          decision: VoteDecision.APPROVE,
          rationale: 'Late vote',
        };

        const result = await castVote(voteInput, mockIPDConfig);

        expect(result.success).toBe(false);
        expect(result.error).toContain('not open');
      });

      it('should prevent non-member from voting', async () => {
        const createInput: CreateVotingSessionInput = {
          projectId: mockProjectId,
          votingBody: VotingBody.PMT,
          proposalType: IPDProposalType.PMT_DECISION,
          title: 'Test Vote',
          description: 'Test',
          proposedByUserId: 'user-pm-001',
        };
        const session = await createVotingSession(createInput, mockIPDConfig);

        const voteInput: CastVoteInput = {
          sessionUrn: session.data!.$id,
          voterUserId: 'unknown-user',
          decision: VoteDecision.APPROVE,
          rationale: 'Trying to vote',
        };

        const result = await castVote(voteInput, mockIPDConfig);

        expect(result.success).toBe(false);
        expect(result.error).toContain('not authorized');
      });

      it('should prevent duplicate votes', async () => {
        const createInput: CreateVotingSessionInput = {
          projectId: mockProjectId,
          votingBody: VotingBody.PMT,
          proposalType: IPDProposalType.PMT_DECISION,
          title: 'Test Vote',
          description: 'Test',
          proposedByUserId: 'user-pm-001',
        };
        const session = await createVotingSession(createInput, mockIPDConfig);

        const voteInput: CastVoteInput = {
          sessionUrn: session.data!.$id,
          voterUserId: 'user-owner-001',
          decision: VoteDecision.APPROVE,
          rationale: 'First vote',
        };

        await castVote(voteInput, mockIPDConfig);

        // Try to vote again
        const result = await castVote(voteInput, mockIPDConfig);

        expect(result.success).toBe(false);
        expect(result.error).toContain('already voted');
      });

      it('should apply vote weight correctly', async () => {
        const createInput: CreateVotingSessionInput = {
          projectId: mockProjectId,
          votingBody: VotingBody.PMT,
          proposalType: IPDProposalType.PMT_DECISION,
          title: 'Test Vote',
          description: 'Test',
          proposedByUserId: 'user-pm-001',
        };
        const session = await createVotingSession(createInput, mockIPDConfig);

        const voteInput: CastVoteInput = {
          sessionUrn: session.data!.$id,
          voterUserId: 'user-owner-001',
          decision: VoteDecision.APPROVE,
          rationale: 'Approved',
        };

        const result = await castVote(voteInput, mockIPDConfig);

        expect(result.success).toBe(true);
        expect(result.data?.tally.weightedApprove).toBe(1); // Weight of 1
      });
    });

    describe('canMemberVote', () => {
      it('should return true for PMT member on PMT session', () => {
        const member = mockPMTMembers.find(m => m.pmtMember);
        const canVote = canMemberVote(member!, VotingBody.PMT);
        expect(canVote).toBe(true);
      });

      it('should return true for PET member on PET session', () => {
        const member = mockPMTMembers.find(m => m.petMember);
        const canVote = canMemberVote(member!, VotingBody.PET);
        expect(canVote).toBe(true);
      });

      it('should return false for non-PET member on PET session', () => {
        const member = mockPMTMembers.find(m => !m.petMember);
        if (member) {
          const canVote = canMemberVote(member, VotingBody.PET);
          expect(canVote).toBe(false);
        }
      });
    });
  });

  // ============================================================================
  // Tally and Quorum Tests
  // ============================================================================

  describe('Tally and Quorum', () => {
    describe('calculateTally', () => {
      it('should calculate vote tally correctly', () => {
        const votes: VoteCast[] = [
          { voterUrn: 'urn:1' as any, voterName: 'A', organization: 'Org', decision: VoteDecision.APPROVE, weight: 1, rationale: 'Yes', timestamp: new Date().toISOString() },
          { voterUrn: 'urn:2' as any, voterName: 'B', organization: 'Org', decision: VoteDecision.APPROVE, weight: 1, rationale: 'Yes', timestamp: new Date().toISOString() },
          { voterUrn: 'urn:3' as any, voterName: 'C', organization: 'Org', decision: VoteDecision.REJECT, weight: 1, rationale: 'No', timestamp: new Date().toISOString() },
        ];

        const tally = calculateTally(votes, 3);

        expect(tally.approve).toBe(2);
        expect(tally.reject).toBe(1);
        expect(tally.weightedApprove).toBe(2);
        expect(tally.weightedReject).toBe(1);
        expect(tally.participationRate).toBeCloseTo(1, 2); // 3/3 = 100%
      });

      it('should handle weighted votes', () => {
        const votes: VoteCast[] = [
          { voterUrn: 'urn:1' as any, voterName: 'A', organization: 'Org', decision: VoteDecision.APPROVE, weight: 2, rationale: 'Yes', timestamp: new Date().toISOString() },
          { voterUrn: 'urn:2' as any, voterName: 'B', organization: 'Org', decision: VoteDecision.REJECT, weight: 1, rationale: 'No', timestamp: new Date().toISOString() },
        ];

        const tally = calculateTally(votes, 3);

        expect(tally.weightedApprove).toBe(2);
        expect(tally.weightedReject).toBe(1);
        expect(tally.totalWeightCast).toBe(3);
      });
    });

    describe('checkQuorum', () => {
      it('should return true when majority quorum is met', () => {
        const tally: VoteTally = {
          approve: 2, reject: 1, abstain: 0, escalate: 0,
          weightedApprove: 2, weightedReject: 1, weightedAbstain: 0,
          totalWeightCast: 3, totalWeightPossible: 3,
          participationRate: 1, quorumMet: false,
        };

        const result = checkQuorum(tally, QuorumType.MAJORITY);
        expect(result).toBe(true);
      });

      it('should return false when quorum is not met', () => {
        const tally: VoteTally = {
          approve: 1, reject: 0, abstain: 0, escalate: 0,
          weightedApprove: 1, weightedReject: 0, weightedAbstain: 0,
          totalWeightCast: 1, totalWeightPossible: 3,
          participationRate: 0.33, quorumMet: false,
        };

        const result = checkQuorum(tally, QuorumType.MAJORITY);
        expect(result).toBe(false);
      });

      it('should require unanimous participation for unanimous quorum', () => {
        const partialTally: VoteTally = {
          approve: 2, reject: 0, abstain: 0, escalate: 0,
          weightedApprove: 2, weightedReject: 0, weightedAbstain: 0,
          totalWeightCast: 2, totalWeightPossible: 3,
          participationRate: 0.67, quorumMet: false,
        };

        const result = checkQuorum(partialTally, QuorumType.UNANIMOUS);
        expect(result).toBe(false);

        const fullTally: VoteTally = {
          approve: 3, reject: 0, abstain: 0, escalate: 0,
          weightedApprove: 3, weightedReject: 0, weightedAbstain: 0,
          totalWeightCast: 3, totalWeightPossible: 3,
          participationRate: 1, quorumMet: false,
        };

        const fullResult = checkQuorum(fullTally, QuorumType.UNANIMOUS);
        expect(fullResult).toBe(true);
      });
    });

    describe('determineOutcome', () => {
      it('should return approved when majority approves', () => {
        const tally: VoteTally = {
          approve: 2, reject: 1, abstain: 0, escalate: 0,
          weightedApprove: 2, weightedReject: 1, weightedAbstain: 0,
          totalWeightCast: 3, totalWeightPossible: 3,
          participationRate: 1, quorumMet: true,
        };

        const outcome = determineOutcome(tally, QuorumType.MAJORITY);
        expect(outcome).toBe('approved');
      });

      it('should return rejected when majority rejects', () => {
        const tally: VoteTally = {
          approve: 1, reject: 2, abstain: 0, escalate: 0,
          weightedApprove: 1, weightedReject: 2, weightedAbstain: 0,
          totalWeightCast: 3, totalWeightPossible: 3,
          participationRate: 1, quorumMet: true,
        };

        const outcome = determineOutcome(tally, QuorumType.MAJORITY);
        expect(outcome).toBe('rejected');
      });

      it('should return escalated when escalate votes exceed threshold', () => {
        const tally: VoteTally = {
          approve: 0, reject: 0, abstain: 0, escalate: 2,
          weightedApprove: 0, weightedReject: 0, weightedAbstain: 0,
          totalWeightCast: 2, totalWeightPossible: 3,
          participationRate: 0.67, quorumMet: false,
        };

        const outcome = determineOutcome(tally, QuorumType.MAJORITY);
        expect(outcome).toBe('escalated');
      });
    });
  });

  // ============================================================================
  // Session Close and Escalation Tests
  // ============================================================================

  describe('Session Close and Escalation', () => {
    describe('closeVotingSession', () => {
      it('should close session and determine outcome', async () => {
        // Create session
        const createInput: CreateVotingSessionInput = {
          projectId: mockProjectId,
          votingBody: VotingBody.PMT,
          proposalType: IPDProposalType.PMT_DECISION,
          title: 'Test Close',
          description: 'Test',
          proposedByUserId: 'user-pm-001',
        };
        const session = await createVotingSession(createInput, mockIPDConfig);

        // Cast votes
        await castVote({
          sessionUrn: session.data!.$id,
          voterUserId: 'user-owner-001',
          decision: VoteDecision.APPROVE,
          rationale: 'Approved',
        }, mockIPDConfig);

        await castVote({
          sessionUrn: session.data!.$id,
          voterUserId: 'user-arch-001',
          decision: VoteDecision.APPROVE,
          rationale: 'Approved',
        }, mockIPDConfig);

        // Close session
        const closeResult = await closeVotingSession({
          sessionUrn: session.data!.$id,
          closedByUserId: 'user-owner-001',
        }, mockIPDConfig);

        expect(closeResult.success).toBe(true);
        expect(closeResult.data?.status).toBe(VotingSessionStatus.CLOSED);
        expect(closeResult.data?.outcome?.result).toBe('approved');
      });

      it('should not close already closed session', async () => {
        const createInput: CreateVotingSessionInput = {
          projectId: mockProjectId,
          votingBody: VotingBody.PMT,
          proposalType: IPDProposalType.PMT_DECISION,
          title: 'Test Close',
          description: 'Test',
          proposedByUserId: 'user-pm-001',
        };
        const session = await createVotingSession(createInput, mockIPDConfig);

        // Close once
        await closeVotingSession({
          sessionUrn: session.data!.$id,
          closedByUserId: 'user-owner-001',
        }, mockIPDConfig);

        // Try to close again
        const result = await closeVotingSession({
          sessionUrn: session.data!.$id,
          closedByUserId: 'user-owner-001',
        }, mockIPDConfig);

        expect(result.success).toBe(false);
        expect(result.error).toContain('already closed');
      });
    });

    describe('escalateToPET', () => {
      it('should escalate PMT session to PET', async () => {
        // Create PMT session
        const createInput: CreateVotingSessionInput = {
          projectId: mockProjectId,
          votingBody: VotingBody.PMT,
          proposalType: IPDProposalType.PMT_DECISION,
          title: 'Test Escalation',
          description: 'Need escalation',
          proposedByUserId: 'user-pm-001',
        };
        const session = await createVotingSession(createInput, mockIPDConfig);

        // Escalate
        const escalateResult = await escalateToPET({
          sessionUrn: session.data!.$id,
          escalatedByUserId: 'user-owner-001',
          reason: 'Exceeds PMT authority',
        }, mockIPDConfig);

        expect(escalateResult.success).toBe(true);
        expect(escalateResult.data?.originalSession?.status).toBe(VotingSessionStatus.ESCALATED);
        expect(escalateResult.data?.newSession?.votingBody).toBe(VotingBody.PET);
      });

      it('should not escalate PET session', async () => {
        const createInput: CreateVotingSessionInput = {
          projectId: mockProjectId,
          votingBody: VotingBody.PET,
          proposalType: IPDProposalType.TARGET_COST_AMENDMENT,
          title: 'PET Decision',
          description: 'Already at PET',
          proposedByUserId: 'user-owner-001',
        };
        const session = await createVotingSession(createInput, mockIPDConfig);

        const result = await escalateToPET({
          sessionUrn: session.data!.$id,
          escalatedByUserId: 'user-owner-001',
          reason: 'Trying to escalate',
        }, mockIPDConfig);

        expect(result.success).toBe(false);
        expect(result.error).toContain('already a PET');
      });
    });
  });

  // ============================================================================
  // Member Management Tests
  // ============================================================================

  describe('Member Management', () => {
    describe('getIPDMember', () => {
      it('should find member by user ID', () => {
        const member = getIPDMember('user-owner-001', mockIPDConfig);
        expect(member).toBeDefined();
        expect(member?.name).toBe('John Owner');
      });

      it('should return undefined for unknown user', () => {
        const member = getIPDMember('unknown-user', mockIPDConfig);
        expect(member).toBeUndefined();
      });
    });

    describe('getPMTMembers', () => {
      it('should return all PMT members', () => {
        const members = getPMTMembers(mockIPDConfig);
        expect(members.length).toBe(3);
        expect(members.every(m => m.pmtMember)).toBe(true);
      });
    });

    describe('getPETMembers', () => {
      it('should return all PET members', () => {
        const members = getPETMembers(mockIPDConfig);
        expect(members.length).toBe(2);
        expect(members.every(m => m.petMember)).toBe(true);
      });
    });

    describe('getPendingVotesForMember', () => {
      it('should return sessions where member has not voted', async () => {
        // Create a session
        const createInput: CreateVotingSessionInput = {
          projectId: mockProjectId,
          votingBody: VotingBody.PMT,
          proposalType: IPDProposalType.PMT_DECISION,
          title: 'Pending Vote Test',
          description: 'Test',
          proposedByUserId: 'user-pm-001',
        };
        await createVotingSession(createInput, mockIPDConfig);

        const pending = await getPendingVotesForMember('user-owner-001', mockProjectId, mockIPDConfig);

        expect(pending.success).toBe(true);
        expect(Array.isArray(pending.data)).toBe(true);
      });
    });
  });

  // ============================================================================
  // Utility Tests
  // ============================================================================

  describe('Utilities', () => {
    describe('buildVotingSessionURN', () => {
      it('should build correct URN format', () => {
        const urn = buildVotingSessionURN('PROJ-001', 'session-123');
        expect(urn).toBe('urn:luhtech:ectropy:ipd:voting-session:PROJ-001:session-123');
      });
    });

    describe('buildIPDMemberURN', () => {
      it('should build correct URN format', () => {
        const urn = buildIPDMemberURN('PROJ-001', 'user-001');
        expect(urn).toBe('urn:luhtech:ectropy:ipd:member:PROJ-001:user-001');
      });
    });

    describe('isVotingOpen', () => {
      it('should return true for open status', () => {
        const session = { status: VotingSessionStatus.OPEN } as VotingSession;
        expect(isVotingOpen(session)).toBe(true);
      });

      it('should return false for closed status', () => {
        const session = { status: VotingSessionStatus.CLOSED } as VotingSession;
        expect(isVotingOpen(session)).toBe(false);
      });
    });

    describe('getVotingDeadline', () => {
      it('should calculate deadline from hours', () => {
        const deadline = getVotingDeadline(72);
        const expected = new Date();
        expected.setHours(expected.getHours() + 72);

        const diff = Math.abs(new Date(deadline).getTime() - expected.getTime());
        expect(diff).toBeLessThan(1000); // Within 1 second
      });
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('Integration', () => {
    it('should complete full PMT voting workflow', async () => {
      // 1. Create session
      const createResult = await createVotingSession({
        projectId: mockProjectId,
        votingBody: VotingBody.PMT,
        proposalType: IPDProposalType.PMT_DECISION,
        title: 'Full Workflow Test',
        description: 'Testing complete workflow',
        proposedByUserId: 'user-pm-001',
        impact: {
          budgetImpact: 25000,
          riskLevel: 'low',
        },
      }, mockIPDConfig);

      expect(createResult.success).toBe(true);
      const sessionUrn = createResult.data!.$id;

      // 2. Cast votes from all members
      await castVote({
        sessionUrn,
        voterUserId: 'user-owner-001',
        decision: VoteDecision.APPROVE,
        rationale: 'Good proposal',
      }, mockIPDConfig);

      await castVote({
        sessionUrn,
        voterUserId: 'user-arch-001',
        decision: VoteDecision.APPROVE,
        rationale: 'Architecturally sound',
      }, mockIPDConfig);

      await castVote({
        sessionUrn,
        voterUserId: 'user-pm-001',
        decision: VoteDecision.APPROVE,
        rationale: 'Within budget',
      }, mockIPDConfig);

      // 3. Close session
      const closeResult = await closeVotingSession({
        sessionUrn,
        closedByUserId: 'user-owner-001',
      }, mockIPDConfig);

      expect(closeResult.success).toBe(true);
      expect(closeResult.data?.status).toBe(VotingSessionStatus.CLOSED);
      expect(closeResult.data?.outcome?.result).toBe('approved');
      expect(closeResult.data?.outcome?.quorumMet).toBe(true);
    });

    it('should complete PMT to PET escalation workflow', async () => {
      // 1. Create PMT session
      const createResult = await createVotingSession({
        projectId: mockProjectId,
        votingBody: VotingBody.PMT,
        proposalType: IPDProposalType.SCOPE_CHANGE,
        title: 'Major Scope Change',
        description: 'Requires PET approval',
        proposedByUserId: 'user-pm-001',
        impact: {
          budgetImpact: 500000,
          riskLevel: 'high',
        },
      }, mockIPDConfig);

      expect(createResult.success).toBe(true);

      // 2. Escalate to PET
      const escalateResult = await escalateToPET({
        sessionUrn: createResult.data!.$id,
        escalatedByUserId: 'user-owner-001',
        reason: 'Exceeds PMT budget authority',
      }, mockIPDConfig);

      expect(escalateResult.success).toBe(true);
      expect(escalateResult.data?.newSession?.votingBody).toBe(VotingBody.PET);

      // 3. Vote in PET session
      const petSessionUrn = escalateResult.data!.newSession!.$id;

      await castVote({
        sessionUrn: petSessionUrn,
        voterUserId: 'user-owner-001',
        decision: VoteDecision.APPROVE,
        rationale: 'Strategically important',
      }, mockIPDConfig);

      await castVote({
        sessionUrn: petSessionUrn,
        voterUserId: 'user-arch-001',
        decision: VoteDecision.APPROVE,
        rationale: 'Design supports this',
      }, mockIPDConfig);

      // 4. Close PET session
      const closeResult = await closeVotingSession({
        sessionUrn: petSessionUrn,
        closedByUserId: 'user-owner-001',
      }, mockIPDConfig);

      expect(closeResult.success).toBe(true);
      expect(closeResult.data?.outcome?.result).toBe('approved');
    });
  });
});
