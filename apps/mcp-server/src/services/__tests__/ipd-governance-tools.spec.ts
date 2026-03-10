/**
 * IPD Governance MCP Tools Tests - IPD-M4
 *
 * Test-first development for IPD Governance MCP tool definitions.
 * Tests tool handlers for voting sessions and target cost operations.
 *
 * @see .roadmap/features/ipd-governance/FEATURE.json
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  VotingBody,
  QuorumType,
  VotingSessionStatus,
  VoteDecision,
  IPDProposalType,
  TargetCostChangeType,
  type IPDGovernanceConfig,
  type IPDMember,
} from '../../types/ipd-governance.types.js';

import { AuthorityLevel } from '../../types/pm.types.js';

import { clearAllSessions } from '../ipd-voting.service.js';
import { clearAllTargetCostRecords } from '../ipd-target-cost.service.js';

// Import the MCP tools
import {
  // Tool definitions
  createVotingSessionTool,
  castVoteTool,
  getVotingStatusTool,
  closeVotingSessionTool,
  escalateToPETTool,

  // Target cost tools
  createTargetCostTool,
  updateTargetCostTool,
  getTargetCostDashboardTool,
  calculateSavingsTool,

  // Tool registry
  ipdGovernanceTools,
  getIPDToolByName,
  getIPDToolNames,

  // Service namespace
  IPDGovernanceToolsService,
} from '../ipd-governance-tools.js';

// ============================================================================
// Mock Data
// ============================================================================

const mockProjectId = 'PROJ-TOOLS-001';

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

const mockDistributionConfig = {
  ownerSharePercent: 40,
  designTeamSharePercent: 30,
  constructionTeamSharePercent: 30,
  partyShares: [
    { partyName: 'Owner Corp', sharePercent: 40 },
    { partyName: 'Design Partners', sharePercent: 30 },
    { partyName: 'BuildRight Inc', sharePercent: 30 },
  ],
};

// ============================================================================
// Test Setup
// ============================================================================

describe('IPDGovernanceToolsService', () => {
  beforeEach(() => {
    clearAllSessions();
    clearAllTargetCostRecords();
  });

  // ============================================================================
  // Voting Session Tool Tests
  // ============================================================================

  describe('Voting Session Tools', () => {
    describe('create_ipd_voting_session Tool', () => {
      it('should have correct tool definition', () => {
        expect(createVotingSessionTool.name).toBe('create_ipd_voting_session');
        expect(createVotingSessionTool.category).toBe('ipd-governance');
        expect(createVotingSessionTool.inputSchema.required).toContain('projectId');
        expect(createVotingSessionTool.inputSchema.required).toContain('title');
      });

      it('should create a PMT voting session', async () => {
        const result = await createVotingSessionTool.handler({
          projectId: mockProjectId,
          votingBody: 'PMT',
          proposalType: 'pmt_decision',
          title: 'Approve Change Order #123',
          description: 'Change order for foundation modification',
          proposedByUserId: 'user-pm-001',
          budgetImpact: 50000,
          riskLevel: 'medium',
          ipdConfig: mockIPDConfig,
        });

        expect(result.success).toBe(true);
        expect(result.data?.session).toBeDefined();
        expect(result.data?.session.votingBody).toBe(VotingBody.PMT);
        expect(result.data?.session.status).toBe(VotingSessionStatus.OPEN);
        expect(result.durationMs).toBeGreaterThan(0);
      });

      it('should return error for invalid proposer', async () => {
        const result = await createVotingSessionTool.handler({
          projectId: mockProjectId,
          votingBody: 'PMT',
          proposalType: 'pmt_decision',
          title: 'Test Session',
          description: 'Test',
          proposedByUserId: 'unknown-user',
          ipdConfig: mockIPDConfig,
        });

        expect(result.success).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors![0]).toContain('not a member');
      });
    });

    describe('cast_ipd_vote Tool', () => {
      it('should have correct tool definition', () => {
        expect(castVoteTool.name).toBe('cast_ipd_vote');
        expect(castVoteTool.inputSchema.required).toContain('sessionUrn');
        expect(castVoteTool.inputSchema.required).toContain('voterUserId');
        expect(castVoteTool.inputSchema.required).toContain('decision');
      });

      it('should cast an approve vote', async () => {
        // Create session first
        const createResult = await createVotingSessionTool.handler({
          projectId: mockProjectId,
          votingBody: 'PMT',
          proposalType: 'pmt_decision',
          title: 'Test Vote',
          description: 'Test',
          proposedByUserId: 'user-pm-001',
          ipdConfig: mockIPDConfig,
        });

        const sessionUrn = createResult.data?.session.$id;

        // Cast vote
        const voteResult = await castVoteTool.handler({
          sessionUrn,
          voterUserId: 'user-owner-001',
          decision: 'approve',
          rationale: 'Good proposal',
          ipdConfig: mockIPDConfig,
        });

        expect(voteResult.success).toBe(true);
        expect(voteResult.data?.tally.approve).toBe(1);
      });

      it('should prevent duplicate votes', async () => {
        // Create session
        const createResult = await createVotingSessionTool.handler({
          projectId: mockProjectId,
          votingBody: 'PMT',
          proposalType: 'pmt_decision',
          title: 'Test Vote',
          description: 'Test',
          proposedByUserId: 'user-pm-001',
          ipdConfig: mockIPDConfig,
        });

        const sessionUrn = createResult.data?.session.$id;

        // Cast first vote
        await castVoteTool.handler({
          sessionUrn,
          voterUserId: 'user-owner-001',
          decision: 'approve',
          rationale: 'First vote',
          ipdConfig: mockIPDConfig,
        });

        // Try to vote again
        const duplicateResult = await castVoteTool.handler({
          sessionUrn,
          voterUserId: 'user-owner-001',
          decision: 'reject',
          rationale: 'Changed my mind',
          ipdConfig: mockIPDConfig,
        });

        expect(duplicateResult.success).toBe(false);
        expect(duplicateResult.errors![0]).toContain('already voted');
      });
    });

    describe('get_voting_status Tool', () => {
      it('should have correct tool definition', () => {
        expect(getVotingStatusTool.name).toBe('get_voting_status');
        expect(getVotingStatusTool.inputSchema.required).toContain('sessionUrn');
      });

      it('should return voting session status', async () => {
        // Create session
        const createResult = await createVotingSessionTool.handler({
          projectId: mockProjectId,
          votingBody: 'PMT',
          proposalType: 'pmt_decision',
          title: 'Status Test',
          description: 'Test',
          proposedByUserId: 'user-pm-001',
          ipdConfig: mockIPDConfig,
        });

        const sessionUrn = createResult.data?.session.$id;

        // Get status
        const statusResult = await getVotingStatusTool.handler({
          sessionUrn,
        });

        expect(statusResult.success).toBe(true);
        expect(statusResult.data?.status).toBe(VotingSessionStatus.OPEN);
        expect(statusResult.data?.tally).toBeDefined();
        expect(statusResult.data?.votesReceived).toBe(0);
      });
    });

    describe('close_voting_session Tool', () => {
      it('should have correct tool definition', () => {
        expect(closeVotingSessionTool.name).toBe('close_voting_session');
        expect(closeVotingSessionTool.inputSchema.required).toContain('sessionUrn');
        expect(closeVotingSessionTool.inputSchema.required).toContain('closedByUserId');
      });

      it('should close session with outcome', async () => {
        // Create and vote
        const createResult = await createVotingSessionTool.handler({
          projectId: mockProjectId,
          votingBody: 'PMT',
          proposalType: 'pmt_decision',
          title: 'Close Test',
          description: 'Test',
          proposedByUserId: 'user-pm-001',
          ipdConfig: mockIPDConfig,
        });

        const sessionUrn = createResult.data?.session.$id;

        // Cast votes
        await castVoteTool.handler({
          sessionUrn,
          voterUserId: 'user-owner-001',
          decision: 'approve',
          rationale: 'Yes',
          ipdConfig: mockIPDConfig,
        });

        await castVoteTool.handler({
          sessionUrn,
          voterUserId: 'user-arch-001',
          decision: 'approve',
          rationale: 'Yes',
          ipdConfig: mockIPDConfig,
        });

        // Close session
        const closeResult = await closeVotingSessionTool.handler({
          sessionUrn,
          closedByUserId: 'user-owner-001',
          ipdConfig: mockIPDConfig,
        });

        expect(closeResult.success).toBe(true);
        expect(closeResult.data?.status).toBe(VotingSessionStatus.CLOSED);
        expect(closeResult.data?.outcome.result).toBe('approved');
      });
    });

    describe('escalate_to_pet Tool', () => {
      it('should have correct tool definition', () => {
        expect(escalateToPETTool.name).toBe('escalate_to_pet');
        expect(escalateToPETTool.inputSchema.required).toContain('sessionUrn');
        expect(escalateToPETTool.inputSchema.required).toContain('reason');
      });

      it('should escalate PMT session to PET', async () => {
        // Create PMT session
        const createResult = await createVotingSessionTool.handler({
          projectId: mockProjectId,
          votingBody: 'PMT',
          proposalType: 'pmt_decision',
          title: 'Escalation Test',
          description: 'Need escalation',
          proposedByUserId: 'user-pm-001',
          ipdConfig: mockIPDConfig,
        });

        const sessionUrn = createResult.data?.session.$id;

        // Escalate
        const escalateResult = await escalateToPETTool.handler({
          sessionUrn,
          escalatedByUserId: 'user-owner-001',
          reason: 'Exceeds PMT budget authority',
          ipdConfig: mockIPDConfig,
        });

        expect(escalateResult.success).toBe(true);
        expect(escalateResult.data?.originalSessionStatus).toBe(VotingSessionStatus.ESCALATED);
        expect(escalateResult.data?.newPETSession).toBeDefined();
        expect(escalateResult.data?.newPETSession.votingBody).toBe(VotingBody.PET);
      });
    });
  });

  // ============================================================================
  // Target Cost Tool Tests
  // ============================================================================

  describe('Target Cost Tools', () => {
    describe('create_target_cost Tool', () => {
      it('should have correct tool definition', () => {
        expect(createTargetCostTool.name).toBe('create_target_cost');
        expect(createTargetCostTool.category).toBe('ipd-governance');
        expect(createTargetCostTool.inputSchema.required).toContain('projectId');
        expect(createTargetCostTool.inputSchema.required).toContain('targetCost');
      });

      it('should create target cost record', async () => {
        const result = await createTargetCostTool.handler({
          projectId: mockProjectId,
          targetCost: 10000000,
          currency: 'USD',
          contingencyPercent: 5,
          distributionConfig: mockDistributionConfig,
        });

        expect(result.success).toBe(true);
        expect(result.data?.record).toBeDefined();
        expect(result.data?.record.originalTargetCost).toBe(10000000);
        expect(result.data?.record.contingencyRemaining).toBe(500000);
      });
    });

    describe('update_target_cost Tool', () => {
      it('should have correct tool definition', () => {
        expect(updateTargetCostTool.name).toBe('update_target_cost');
        expect(updateTargetCostTool.inputSchema.required).toContain('projectId');
        expect(updateTargetCostTool.inputSchema.required).toContain('amountChange');
      });

      it('should update target cost with amendment', async () => {
        // Create first
        await createTargetCostTool.handler({
          projectId: mockProjectId,
          targetCost: 10000000,
          currency: 'USD',
          distributionConfig: mockDistributionConfig,
        });

        // Update
        const result = await updateTargetCostTool.handler({
          projectId: mockProjectId,
          changeType: 'amendment',
          amountChange: 500000,
          description: 'Scope addition',
          updatedByUserId: 'user-owner-001',
        });

        expect(result.success).toBe(true);
        expect(result.data?.newTargetCost).toBe(10500000);
        expect(result.data?.amendmentCount).toBe(1);
      });
    });

    describe('get_target_cost_dashboard Tool', () => {
      it('should have correct tool definition', () => {
        expect(getTargetCostDashboardTool.name).toBe('get_target_cost_dashboard');
        expect(getTargetCostDashboardTool.inputSchema.required).toContain('projectId');
      });

      it('should return dashboard data', async () => {
        // Create target cost
        await createTargetCostTool.handler({
          projectId: mockProjectId,
          targetCost: 10000000,
          currency: 'USD',
          distributionConfig: mockDistributionConfig,
        });

        // Get dashboard
        const result = await getTargetCostDashboardTool.handler({
          projectId: mockProjectId,
        });

        expect(result.success).toBe(true);
        expect(result.data?.summary).toBeDefined();
        expect(result.data?.summary.targetCost).toBe(10000000);
        expect(result.data?.healthStatus).toBeDefined();
      });
    });

    describe('calculate_savings Tool', () => {
      it('should have correct tool definition', () => {
        expect(calculateSavingsTool.name).toBe('calculate_savings');
        expect(calculateSavingsTool.inputSchema.required).toContain('projectId');
      });

      it('should calculate and project savings', async () => {
        // Create target cost
        await createTargetCostTool.handler({
          projectId: mockProjectId,
          targetCost: 10000000,
          currency: 'USD',
          distributionConfig: mockDistributionConfig,
        });

        // Calculate savings
        const result = await calculateSavingsTool.handler({
          projectId: mockProjectId,
          includeDistribution: true,
        });

        expect(result.success).toBe(true);
        expect(result.data?.projection).toBeDefined();
        expect(result.data?.projection.targetCost).toBe(10000000);
      });
    });
  });

  // ============================================================================
  // Tool Registry Tests
  // ============================================================================

  describe('Tool Registry', () => {
    it('should have all tools registered', () => {
      expect(ipdGovernanceTools.length).toBe(9);
    });

    it('should get tool by name', () => {
      const tool = getIPDToolByName('create_ipd_voting_session');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('create_ipd_voting_session');
    });

    it('should return undefined for unknown tool', () => {
      const tool = getIPDToolByName('unknown_tool');
      expect(tool).toBeUndefined();
    });

    it('should list all tool names', () => {
      const names = getIPDToolNames();
      expect(names).toContain('create_ipd_voting_session');
      expect(names).toContain('cast_ipd_vote');
      expect(names).toContain('create_target_cost');
      expect(names).toContain('calculate_savings');
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('Integration', () => {
    it('should complete full IPD workflow', async () => {
      // 1. Create target cost
      const tcResult = await createTargetCostTool.handler({
        projectId: mockProjectId,
        targetCost: 10000000,
        currency: 'USD',
        contingencyPercent: 5,
        distributionConfig: mockDistributionConfig,
      });
      expect(tcResult.success).toBe(true);

      // 2. Create voting session for scope change
      const sessionResult = await createVotingSessionTool.handler({
        projectId: mockProjectId,
        votingBody: 'PMT',
        proposalType: 'scope_change',
        title: 'Add MEP Scope',
        description: 'Additional mechanical work required',
        proposedByUserId: 'user-pm-001',
        budgetImpact: 75000,
        riskLevel: 'medium',
        ipdConfig: mockIPDConfig,
      });
      expect(sessionResult.success).toBe(true);

      const sessionUrn = sessionResult.data?.session.$id;

      // 3. Cast votes
      await castVoteTool.handler({
        sessionUrn,
        voterUserId: 'user-owner-001',
        decision: 'approve',
        rationale: 'Necessary for building function',
        ipdConfig: mockIPDConfig,
      });

      await castVoteTool.handler({
        sessionUrn,
        voterUserId: 'user-arch-001',
        decision: 'approve',
        rationale: 'Design supports this addition',
        ipdConfig: mockIPDConfig,
      });

      await castVoteTool.handler({
        sessionUrn,
        voterUserId: 'user-pm-001',
        decision: 'approve',
        rationale: 'Within budget authority',
        ipdConfig: mockIPDConfig,
      });

      // 4. Check status
      const statusResult = await getVotingStatusTool.handler({ sessionUrn });
      expect(statusResult.success).toBe(true);
      expect(statusResult.data?.votesReceived).toBe(3);

      // 5. Close session
      const closeResult = await closeVotingSessionTool.handler({
        sessionUrn,
        closedByUserId: 'user-owner-001',
        ipdConfig: mockIPDConfig,
      });
      expect(closeResult.success).toBe(true);
      expect(closeResult.data?.outcome.result).toBe('approved');

      // 6. Update target cost based on approval
      const updateResult = await updateTargetCostTool.handler({
        projectId: mockProjectId,
        changeType: 'scope_change',
        amountChange: 75000,
        description: 'MEP scope addition approved by PMT',
        updatedByUserId: 'user-owner-001',
      });
      expect(updateResult.success).toBe(true);
      expect(updateResult.data?.newTargetCost).toBe(10075000);

      // 7. Get updated dashboard
      const dashboardResult = await getTargetCostDashboardTool.handler({
        projectId: mockProjectId,
      });
      expect(dashboardResult.success).toBe(true);
      expect(dashboardResult.data?.summary.targetCost).toBe(10075000);
    });
  });
});
