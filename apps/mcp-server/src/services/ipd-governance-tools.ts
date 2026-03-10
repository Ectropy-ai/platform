/**
 * IPD Governance MCP Tools - IPD-M4
 *
 * MCP tool definitions and handlers for IPD governance operations.
 * These tools enable AI agents to manage voting sessions and target cost tracking.
 *
 * Tools Implemented (9 total):
 * - Voting: create_ipd_voting_session, cast_ipd_vote, get_voting_status,
 *           close_voting_session, escalate_to_pet
 * - Target Cost: create_target_cost, update_target_cost,
 *                get_target_cost_dashboard, calculate_savings
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
  TargetCostChangeType,
  type VotingSession,
  type VoteTally,
  type VotingOutcome,
  type IPDGovernanceConfig,
  type TargetCostRecord,
  type SavingsProjection,
  type SavingsDistribution,
} from '../types/ipd-governance.types.js';

import {
  createVotingSession,
  castVote,
  getVotingSession,
  closeVotingSession,
  escalateToPET,
} from './ipd-voting.service.js';

import {
  createTargetCostRecord,
  getTargetCostRecord,
  updateTargetCost,
  getTargetCostDashboard,
  calculateSavingsProjection,
  projectSavingsDistribution,
  type DashboardData,
} from './ipd-target-cost.service.js';

// ============================================================================
// Types
// ============================================================================

/**
 * IPD tool result type
 */
export interface IPDToolResult<T = unknown> {
  success: boolean;
  data?: T;
  errors?: string[];
  warnings?: string[];
  durationMs: number;
}

/**
 * IPD tool definition interface
 */
export interface IPDToolDefinition {
  name: string;
  description: string;
  category: string;
  version: string;
  inputSchema: {
    type: 'object';
    required: string[];
    properties: Record<string, unknown>;
  };
  handler: (args: Record<string, unknown>) => Promise<IPDToolResult<unknown>>;
}

// ============================================================================
// Voting Session Tools
// ============================================================================

/**
 * Create IPD voting session tool
 */
export const createVotingSessionTool: IPDToolDefinition = {
  name: 'create_ipd_voting_session',
  description: 'Create a new PMT or PET voting session for collaborative decision-making in an IPD contract',
  category: 'ipd-governance',
  version: '1.0.0',
  inputSchema: {
    type: 'object',
    required: ['projectId', 'votingBody', 'proposalType', 'title', 'description', 'proposedByUserId', 'ipdConfig'],
    properties: {
      projectId: {
        type: 'string',
        description: 'Project identifier',
      },
      votingBody: {
        type: 'string',
        enum: ['PMT', 'PET'],
        description: 'Voting body (PMT for day-to-day, PET for strategic decisions)',
      },
      proposalType: {
        type: 'string',
        enum: ['pmt_decision', 'pet_escalation', 'target_cost_amendment', 'savings_distribution', 'goal_verification', 'scope_change', 'schedule_change', 'risk_allocation'],
        description: 'Type of proposal',
      },
      title: {
        type: 'string',
        description: 'Title of the voting session',
      },
      description: {
        type: 'string',
        description: 'Detailed description of what is being voted on',
      },
      proposedByUserId: {
        type: 'string',
        description: 'User ID of the proposer',
      },
      budgetImpact: {
        type: 'number',
        description: 'Budget impact in dollars (optional)',
      },
      scheduleImpactDays: {
        type: 'number',
        description: 'Schedule impact in days (optional)',
      },
      riskLevel: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'critical'],
        description: 'Risk level of the proposal',
      },
      ipdConfig: {
        type: 'object',
        description: 'IPD governance configuration',
      },
    },
  },
  handler: async (args): Promise<IPDToolResult<{ session: VotingSession }>> => {
    const startTime = performance.now();

    try {
      const config = args.ipdConfig as IPDGovernanceConfig;

      const result = await createVotingSession({
        projectId: args.projectId as string,
        votingBody: args.votingBody === 'PMT' ? VotingBody.PMT : VotingBody.PET,
        proposalType: args.proposalType as IPDProposalType,
        title: args.title as string,
        description: args.description as string,
        proposedByUserId: args.proposedByUserId as string,
        impact: {
          budgetImpact: args.budgetImpact as number | undefined,
          scheduleImpactDays: args.scheduleImpactDays as number | undefined,
          riskLevel: (args.riskLevel as 'low' | 'medium' | 'high' | 'critical') || 'medium',
        },
      }, config);

      const elapsedMs = Math.max(1, Math.round(performance.now() - startTime));

      if (!result.success) {
        return {
          success: false,
          errors: [result.error!],
          durationMs: elapsedMs,
        };
      }

      return {
        success: true,
        data: { session: result.data! },
        durationMs: elapsedMs,
      };
    } catch (error) {
      return {
        success: false,
        errors: [(error as Error).message],
        durationMs: Math.max(1, Math.round(performance.now() - startTime)),
      };
    }
  },
};

/**
 * Cast IPD vote tool
 */
export const castVoteTool: IPDToolDefinition = {
  name: 'cast_ipd_vote',
  description: 'Cast a vote on an IPD voting session',
  category: 'ipd-governance',
  version: '1.0.0',
  inputSchema: {
    type: 'object',
    required: ['sessionUrn', 'voterUserId', 'decision', 'rationale', 'ipdConfig'],
    properties: {
      sessionUrn: {
        type: 'string',
        description: 'URN of the voting session',
      },
      voterUserId: {
        type: 'string',
        description: 'User ID of the voter',
      },
      decision: {
        type: 'string',
        enum: ['approve', 'reject', 'abstain', 'escalate'],
        description: 'Vote decision',
      },
      rationale: {
        type: 'string',
        description: 'Rationale for the vote',
      },
      conditions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional conditions attached to an approval vote',
      },
      ipdConfig: {
        type: 'object',
        description: 'IPD governance configuration',
      },
    },
  },
  handler: async (args): Promise<IPDToolResult<{ session: VotingSession; tally: VoteTally }>> => {
    const startTime = performance.now();

    try {
      const config = args.ipdConfig as IPDGovernanceConfig;

      const decisionMap: Record<string, VoteDecision> = {
        approve: VoteDecision.APPROVE,
        reject: VoteDecision.REJECT,
        abstain: VoteDecision.ABSTAIN,
        escalate: VoteDecision.ESCALATE,
      };

      const result = await castVote({
        sessionUrn: args.sessionUrn as any,
        voterUserId: args.voterUserId as string,
        decision: decisionMap[args.decision as string],
        rationale: args.rationale as string,
        conditions: args.conditions as string[] | undefined,
      }, config);

      const elapsedMs = Math.max(1, Math.round(performance.now() - startTime));

      if (!result.success) {
        return {
          success: false,
          errors: [result.error!],
          durationMs: elapsedMs,
        };
      }

      return {
        success: true,
        data: {
          session: result.data!,
          tally: result.data!.tally,
        },
        durationMs: elapsedMs,
      };
    } catch (error) {
      return {
        success: false,
        errors: [(error as Error).message],
        durationMs: Math.max(1, Math.round(performance.now() - startTime)),
      };
    }
  },
};

/**
 * Get voting status tool
 */
export const getVotingStatusTool: IPDToolDefinition = {
  name: 'get_voting_status',
  description: 'Get the current status of an IPD voting session',
  category: 'ipd-governance',
  version: '1.0.0',
  inputSchema: {
    type: 'object',
    required: ['sessionUrn'],
    properties: {
      sessionUrn: {
        type: 'string',
        description: 'URN of the voting session',
      },
    },
  },
  handler: async (args): Promise<IPDToolResult<{
    status: VotingSessionStatus;
    tally: VoteTally;
    votesReceived: number;
    deadline: string;
    quorumMet: boolean;
  }>> => {
    const startTime = performance.now();

    try {
      const result = await getVotingSession(args.sessionUrn as any);

      const elapsedMs = Math.max(1, Math.round(performance.now() - startTime));

      if (!result.success) {
        return {
          success: false,
          errors: [result.error!],
          durationMs: elapsedMs,
        };
      }

      const session = result.data!;

      return {
        success: true,
        data: {
          status: session.status,
          tally: session.tally,
          votesReceived: session.votes.length,
          deadline: session.deadline,
          quorumMet: session.tally.quorumMet,
        },
        durationMs: elapsedMs,
      };
    } catch (error) {
      return {
        success: false,
        errors: [(error as Error).message],
        durationMs: Math.max(1, Math.round(performance.now() - startTime)),
      };
    }
  },
};

/**
 * Close voting session tool
 */
export const closeVotingSessionTool: IPDToolDefinition = {
  name: 'close_voting_session',
  description: 'Close an IPD voting session and determine the outcome',
  category: 'ipd-governance',
  version: '1.0.0',
  inputSchema: {
    type: 'object',
    required: ['sessionUrn', 'closedByUserId', 'ipdConfig'],
    properties: {
      sessionUrn: {
        type: 'string',
        description: 'URN of the voting session',
      },
      closedByUserId: {
        type: 'string',
        description: 'User ID of who is closing the session',
      },
      decisionRationale: {
        type: 'string',
        description: 'Optional rationale for the decision',
      },
      ipdConfig: {
        type: 'object',
        description: 'IPD governance configuration',
      },
    },
  },
  handler: async (args): Promise<IPDToolResult<{
    status: VotingSessionStatus;
    outcome: VotingOutcome;
  }>> => {
    const startTime = performance.now();

    try {
      const config = args.ipdConfig as IPDGovernanceConfig;

      const result = await closeVotingSession({
        sessionUrn: args.sessionUrn as any,
        closedByUserId: args.closedByUserId as string,
        decisionRationale: args.decisionRationale as string | undefined,
      }, config);

      const elapsedMs = Math.max(1, Math.round(performance.now() - startTime));

      if (!result.success) {
        return {
          success: false,
          errors: [result.error!],
          durationMs: elapsedMs,
        };
      }

      return {
        success: true,
        data: {
          status: result.data!.status,
          outcome: result.data!.outcome!,
        },
        durationMs: elapsedMs,
      };
    } catch (error) {
      return {
        success: false,
        errors: [(error as Error).message],
        durationMs: Math.max(1, Math.round(performance.now() - startTime)),
      };
    }
  },
};

/**
 * Escalate to PET tool
 */
export const escalateToPETTool: IPDToolDefinition = {
  name: 'escalate_to_pet',
  description: 'Escalate a PMT voting session to the Project Executive Team (PET)',
  category: 'ipd-governance',
  version: '1.0.0',
  inputSchema: {
    type: 'object',
    required: ['sessionUrn', 'escalatedByUserId', 'reason', 'ipdConfig'],
    properties: {
      sessionUrn: {
        type: 'string',
        description: 'URN of the PMT voting session to escalate',
      },
      escalatedByUserId: {
        type: 'string',
        description: 'User ID of who is escalating',
      },
      reason: {
        type: 'string',
        description: 'Reason for escalation',
      },
      ipdConfig: {
        type: 'object',
        description: 'IPD governance configuration',
      },
    },
  },
  handler: async (args): Promise<IPDToolResult<{
    originalSessionStatus: VotingSessionStatus;
    newPETSession: VotingSession;
  }>> => {
    const startTime = performance.now();

    try {
      const config = args.ipdConfig as IPDGovernanceConfig;

      const result = await escalateToPET({
        sessionUrn: args.sessionUrn as any,
        escalatedByUserId: args.escalatedByUserId as string,
        reason: args.reason as string,
      }, config);

      const elapsedMs = Math.max(1, Math.round(performance.now() - startTime));

      if (!result.success) {
        return {
          success: false,
          errors: [result.error!],
          durationMs: elapsedMs,
        };
      }

      return {
        success: true,
        data: {
          originalSessionStatus: result.data!.originalSession.status,
          newPETSession: result.data!.newSession,
        },
        durationMs: elapsedMs,
      };
    } catch (error) {
      return {
        success: false,
        errors: [(error as Error).message],
        durationMs: Math.max(1, Math.round(performance.now() - startTime)),
      };
    }
  },
};

// ============================================================================
// Target Cost Tools
// ============================================================================

/**
 * Create target cost tool
 */
export const createTargetCostTool: IPDToolDefinition = {
  name: 'create_target_cost',
  description: 'Create a target cost record for an IPD project',
  category: 'ipd-governance',
  version: '1.0.0',
  inputSchema: {
    type: 'object',
    required: ['projectId', 'targetCost', 'currency', 'distributionConfig'],
    properties: {
      projectId: {
        type: 'string',
        description: 'Project identifier',
      },
      targetCost: {
        type: 'number',
        description: 'Target cost amount',
      },
      currency: {
        type: 'string',
        description: 'Currency code (e.g., USD, CAD)',
      },
      contingencyPercent: {
        type: 'number',
        description: 'Contingency percentage (default 5%)',
      },
      distributionConfig: {
        type: 'object',
        description: 'Savings distribution configuration',
      },
    },
  },
  handler: async (args): Promise<IPDToolResult<{ record: TargetCostRecord }>> => {
    const startTime = performance.now();

    try {
      const contingencyAmount = args.contingencyPercent
        ? ((args.targetCost as number) * (args.contingencyPercent as number)) / 100
        : undefined;

      const result = await createTargetCostRecord({
        projectId: args.projectId as string,
        currency: args.currency as string,
        originalTargetCost: args.targetCost as number,
        contingencyAmount,
        distributionConfig: args.distributionConfig as any,
      });

      const elapsedMs = Math.max(1, Math.round(performance.now() - startTime));

      if (!result.success) {
        return {
          success: false,
          errors: [result.error!],
          durationMs: elapsedMs,
        };
      }

      return {
        success: true,
        data: { record: result.data! },
        durationMs: elapsedMs,
      };
    } catch (error) {
      return {
        success: false,
        errors: [(error as Error).message],
        durationMs: Math.max(1, Math.round(performance.now() - startTime)),
      };
    }
  },
};

/**
 * Update target cost tool
 */
export const updateTargetCostTool: IPDToolDefinition = {
  name: 'update_target_cost',
  description: 'Update the target cost with an amendment',
  category: 'ipd-governance',
  version: '1.0.0',
  inputSchema: {
    type: 'object',
    required: ['projectId', 'changeType', 'amountChange', 'description', 'updatedByUserId'],
    properties: {
      projectId: {
        type: 'string',
        description: 'Project identifier',
      },
      changeType: {
        type: 'string',
        enum: ['initial', 'amendment', 'scope_change', 'contingency_release', 'reconciliation'],
        description: 'Type of change',
      },
      amountChange: {
        type: 'number',
        description: 'Amount to add (positive) or subtract (negative)',
      },
      description: {
        type: 'string',
        description: 'Description of the change',
      },
      updatedByUserId: {
        type: 'string',
        description: 'User ID of who is making the update',
      },
      approvalSessionUrn: {
        type: 'string',
        description: 'URN of the voting session that approved this change (optional)',
      },
    },
  },
  handler: async (args): Promise<IPDToolResult<{
    newTargetCost: number;
    amendmentCount: number;
  }>> => {
    const startTime = performance.now();

    try {
      const changeTypeMap: Record<string, TargetCostChangeType> = {
        initial: TargetCostChangeType.INITIAL,
        amendment: TargetCostChangeType.AMENDMENT,
        scope_change: TargetCostChangeType.SCOPE_CHANGE,
        contingency_release: TargetCostChangeType.CONTINGENCY_RELEASE,
        reconciliation: TargetCostChangeType.RECONCILIATION,
      };

      const result = await updateTargetCost({
        projectId: args.projectId as string,
        changeType: changeTypeMap[args.changeType as string],
        amountChange: args.amountChange as number,
        description: args.description as string,
        updatedByUserId: args.updatedByUserId as string,
        approvalSessionUrn: args.approvalSessionUrn as any,
      });

      const elapsedMs = Math.max(1, Math.round(performance.now() - startTime));

      if (!result.success) {
        return {
          success: false,
          errors: [result.error!],
          durationMs: elapsedMs,
        };
      }

      return {
        success: true,
        data: {
          newTargetCost: result.data!.currentTargetCost,
          amendmentCount: result.data!.amendments.length,
        },
        durationMs: elapsedMs,
      };
    } catch (error) {
      return {
        success: false,
        errors: [(error as Error).message],
        durationMs: Math.max(1, Math.round(performance.now() - startTime)),
      };
    }
  },
};

/**
 * Get target cost dashboard tool
 */
export const getTargetCostDashboardTool: IPDToolDefinition = {
  name: 'get_target_cost_dashboard',
  description: 'Get comprehensive target cost dashboard data for an IPD project',
  category: 'ipd-governance',
  version: '1.0.0',
  inputSchema: {
    type: 'object',
    required: ['projectId'],
    properties: {
      projectId: {
        type: 'string',
        description: 'Project identifier',
      },
    },
  },
  handler: async (args): Promise<IPDToolResult<DashboardData>> => {
    const startTime = performance.now();

    try {
      const result = await getTargetCostDashboard(args.projectId as string);

      const elapsedMs = Math.max(1, Math.round(performance.now() - startTime));

      if (!result.success) {
        return {
          success: false,
          errors: [result.error!],
          durationMs: elapsedMs,
        };
      }

      return {
        success: true,
        data: result.data!,
        durationMs: elapsedMs,
      };
    } catch (error) {
      return {
        success: false,
        errors: [(error as Error).message],
        durationMs: Math.max(1, Math.round(performance.now() - startTime)),
      };
    }
  },
};

/**
 * Calculate savings tool
 */
export const calculateSavingsTool: IPDToolDefinition = {
  name: 'calculate_savings',
  description: 'Calculate projected savings and distribution for an IPD project',
  category: 'ipd-governance',
  version: '1.0.0',
  inputSchema: {
    type: 'object',
    required: ['projectId'],
    properties: {
      projectId: {
        type: 'string',
        description: 'Project identifier',
      },
      asOfDate: {
        type: 'string',
        description: 'Optional date for the projection (ISO format)',
      },
      includeDistribution: {
        type: 'boolean',
        description: 'Include party distribution in the result',
      },
    },
  },
  handler: async (args): Promise<IPDToolResult<{
    projection: SavingsProjection;
    distribution?: SavingsDistribution;
  }>> => {
    const startTime = performance.now();

    try {
      const projectionResult = await calculateSavingsProjection({
        projectId: args.projectId as string,
        asOfDate: args.asOfDate as string | undefined,
      });

      const elapsedMs = Math.max(1, Math.round(performance.now() - startTime));

      if (!projectionResult.success) {
        return {
          success: false,
          errors: [projectionResult.error!],
          durationMs: elapsedMs,
        };
      }

      let distribution: SavingsDistribution | undefined;

      if (args.includeDistribution && projectionResult.data!.projectedSavings > 0) {
        const distributionResult = await projectSavingsDistribution(
          args.projectId as string,
          projectionResult.data!.projectedSavings
        );

        if (distributionResult.success) {
          distribution = distributionResult.data;
        }
      }

      return {
        success: true,
        data: {
          projection: projectionResult.data!,
          distribution,
        },
        durationMs: elapsedMs,
      };
    } catch (error) {
      return {
        success: false,
        errors: [(error as Error).message],
        durationMs: Math.max(1, Math.round(performance.now() - startTime)),
      };
    }
  },
};

// ============================================================================
// Tool Registry
// ============================================================================

/**
 * All IPD governance tools
 */
export const ipdGovernanceTools: IPDToolDefinition[] = [
  // Voting tools
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
];

/**
 * Get a tool by name
 */
export function getIPDToolByName(name: string): IPDToolDefinition | undefined {
  return ipdGovernanceTools.find(tool => tool.name === name);
}

/**
 * Get all tool names
 */
export function getIPDToolNames(): string[] {
  return ipdGovernanceTools.map(tool => tool.name);
}

/**
 * Register IPD governance tools with an MCP server
 */
export function registerIPDTools(server: {
  registerTool: (tool: IPDToolDefinition) => void;
}): void {
  for (const tool of ipdGovernanceTools) {
    server.registerTool(tool);
  }
}

// ============================================================================
// Service Export
// ============================================================================

export const IPDGovernanceToolsService = {
  // Voting tools
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

  // Registry
  ipdGovernanceTools,
  getIPDToolByName,
  getIPDToolNames,
  registerIPDTools,
};

export default IPDGovernanceToolsService;
