/**
 * Council Voting MCP Tools
 *
 * MCP tool definitions for Seppä to interact with the Admin Council voting system.
 * These tools enable AI-driven governance participation.
 *
 * Tools:
 * - council_create_vote: Create a new council vote
 * - council_cast_vote: Cast a vote on an open decision
 * - council_close_vote: Close voting and determine outcome
 * - council_get_pending: Get pending votes for a member
 * - council_get_status: Get current voting status/summary
 *
 * @module services/council-voting-tools
 */

import {
  getCouncilVotingService,
  type CreateCouncilVoteInput,
  type CastCouncilVoteInput,
} from './council-voting.service.js';
import {
  getActiveCouncilMembers,
  getCouncilMember,
  getTotalVoteWeight,
  ADMIN_COUNCIL_CONFIG,
} from '../config/admin-council.config.js';
import { getCurrentVersion } from '../utils/version.js';

// ============================================================================
// Tool Definitions
// ============================================================================

export interface MCPToolInputSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required: string[];
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: MCPToolInputSchema;
  category: string;
  version: string;
}

export interface MCPToolExecutor {
  name: string;
  execute: (input: unknown) => Promise<unknown>;
}

// ============================================================================
// Tool Schemas (for MCP registration)
// ============================================================================

/**
 * Tool: council_create_vote
 * Creates a new council vote for decision governance
 */
export const councilCreateVoteSchema: MCPTool = {
  name: 'council_create_vote',
  description: 'Create a new Admin Council vote for a governance decision. Use this to propose architectural changes, schema modifications, or strategic decisions that require council approval.',
  category: 'Council Voting',
  version: getCurrentVersion(),
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Title of the vote (5-200 characters)',
      },
      description: {
        type: 'string',
        description: 'Detailed description of what is being voted on',
      },
      category: {
        type: 'string',
        enum: [
          'documentation',
          'minor-refactor',
          'dependency-update',
          'feature',
          'api-change',
          'schema-modification',
          'breaking-change',
          'security',
          'architecture',
          'core-architecture',
          'governance',
          'strategic-direction',
        ],
        description: 'Category determines vote type and quorum requirements',
      },
      proposedBy: {
        type: 'string',
        description: 'User ID of the proposer (must be a council member)',
      },
      decisionId: {
        type: 'string',
        description: 'Optional: ID of related decision from decision-log.json',
      },
    },
    required: ['title', 'description', 'category', 'proposedBy'],
  },
};

/**
 * Tool: council_cast_vote
 * Cast a vote on an open council decision
 */
export const councilCastVoteSchema: MCPTool = {
  name: 'council_cast_vote',
  description: 'Cast your vote on an open Admin Council decision. Requires rationale explaining your voting decision.',
  category: 'Council Voting',
  version: getCurrentVersion(),
  inputSchema: {
    type: 'object',
    properties: {
      voteId: {
        type: 'string',
        description: 'ID of the vote to cast on',
      },
      voterId: {
        type: 'string',
        description: 'User ID of the voter (must be a council member)',
      },
      decision: {
        type: 'string',
        enum: ['approve', 'reject', 'abstain'],
        description: 'Your voting decision',
      },
      rationale: {
        type: 'string',
        description: 'Explanation for your vote (required)',
      },
    },
    required: ['voteId', 'voterId', 'decision', 'rationale'],
  },
};

/**
 * Tool: council_close_vote
 * Close voting and determine the outcome
 */
export const councilCloseVoteSchema: MCPTool = {
  name: 'council_close_vote',
  description: 'Close an open vote and determine the final outcome. Only use after sufficient voting has occurred or deadline has passed.',
  category: 'Council Voting',
  version: getCurrentVersion(),
  inputSchema: {
    type: 'object',
    properties: {
      voteId: {
        type: 'string',
        description: 'ID of the vote to close',
      },
      closedBy: {
        type: 'string',
        description: 'User ID of who is closing the vote (must be a council member)',
      },
    },
    required: ['voteId', 'closedBy'],
  },
};

/**
 * Tool: council_get_pending
 * Get pending votes that need action from a member
 */
export const councilGetPendingSchema: MCPTool = {
  name: 'council_get_pending',
  description: 'Get all pending votes that require action from a specific council member.',
  category: 'Council Voting',
  version: getCurrentVersion(),
  inputSchema: {
    type: 'object',
    properties: {
      userId: {
        type: 'string',
        description: 'User ID of the council member',
      },
    },
    required: ['userId'],
  },
};

/**
 * Tool: council_get_status
 * Get current council voting status and summary
 */
export const councilGetStatusSchema: MCPTool = {
  name: 'council_get_status',
  description: 'Get current Admin Council status, including members, open votes, and recent activity.',
  category: 'Council Voting',
  version: getCurrentVersion(),
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

// ============================================================================
// Tool Executors
// ============================================================================

/**
 * Execute council_create_vote
 */
async function executeCouncilCreateVote(input: unknown): Promise<unknown> {
  const typedInput = input as CreateCouncilVoteInput;
  const service = getCouncilVotingService();
  const result = await service.createVote(typedInput);

  if (!result.success) {
    return {
      success: false,
      error: result.error,
    };
  }

  return {
    success: true,
    vote: {
      voteId: result.vote?.voteId,
      title: result.vote?.title,
      voteType: result.vote?.voteType,
      impactLevel: result.vote?.impactLevel,
      deadline: result.vote?.deadline,
      status: result.vote?.status,
    },
    message: result.message,
    nextSteps: [
      'Council members should review the proposal',
      'Use council_cast_vote to cast your vote',
      `Deadline: ${result.vote?.deadline}`,
    ],
  };
}

/**
 * Execute council_cast_vote
 */
async function executeCouncilCastVote(input: unknown): Promise<unknown> {
  const typedInput = input as CastCouncilVoteInput;
  const service = getCouncilVotingService();
  const result = await service.castVote(typedInput);

  if (!result.success) {
    return {
      success: false,
      error: result.error,
    };
  }

  const tallies = result.vote?.weightedTallies;
  return {
    success: true,
    voteRecorded: {
      voteId: result.vote?.voteId,
      decision: typedInput.decision,
      voter: typedInput.voterId,
    },
    currentTallies: {
      approve: tallies?.approve ?? 0,
      reject: tallies?.reject ?? 0,
      abstain: tallies?.abstain ?? 0,
      participationRate: `${((tallies?.participationRate ?? 0) * 100).toFixed(1)}%`,
    },
    message: result.message,
  };
}

/**
 * Execute council_close_vote
 */
async function executeCouncilCloseVote(input: unknown): Promise<unknown> {
  const typedInput = input as { voteId: string; closedBy: string };
  const service = getCouncilVotingService();
  const result = await service.closeVote(typedInput.voteId, typedInput.closedBy);

  if (!result.success) {
    return {
      success: false,
      error: result.error,
    };
  }

  return {
    success: true,
    outcome: {
      voteId: result.vote?.voteId,
      title: result.vote?.title,
      result: result.vote?.outcome?.result,
      reason: result.vote?.outcome?.reason,
      quorumMet: result.vote?.outcome?.quorumMet,
    },
    finalTallies: result.vote?.weightedTallies,
    message: result.message,
  };
}

/**
 * Execute council_get_pending
 */
async function executeCouncilGetPending(input: unknown): Promise<unknown> {
  const typedInput = input as { userId: string };
  const member = getCouncilMember(typedInput.userId);
  if (!member) {
    return {
      success: false,
      error: `User '${typedInput.userId}' is not an active council member`,
    };
  }

  const service = getCouncilVotingService();
  const pendingVotes = await service.getPendingVotesForMember(typedInput.userId);

  return {
    success: true,
    member: {
      userId: member.userId,
      displayName: member.displayName,
      role: member.role,
    },
    pendingCount: pendingVotes.length,
    pendingVotes: pendingVotes.map((v) => ({
      voteId: v.voteId,
      title: v.title,
      category: v.category,
      voteType: v.voteType,
      impactLevel: v.impactLevel,
      deadline: v.deadline,
      isExpired: new Date(v.deadline) < new Date(),
      currentTallies: v.weightedTallies,
    })),
    actionRequired: pendingVotes.length > 0
      ? 'Please review and cast your votes before deadlines'
      : 'No pending votes - you are up to date',
  };
}

/**
 * Execute council_get_status
 */
async function executeCouncilGetStatus(): Promise<unknown> {
  const service = getCouncilVotingService();
  const allVotes = await service.getVotes();
  const openVotes = await service.getVotes({ status: 'open' });
  const closedVotes = allVotes.filter((v) => v.status === 'closed');
  const approvedVotes = closedVotes.filter((v) => v.outcome?.result === 'approved');

  const members = getActiveCouncilMembers();

  return {
    success: true,
    council: {
      name: ADMIN_COUNCIL_CONFIG.councilName,
      totalMembers: members.length,
      totalVoteWeight: getTotalVoteWeight(),
      members: members.map((m) => ({
        userId: m.userId,
        displayName: m.displayName,
        role: m.role,
        voteWeight: m.voteWeight,
        authorityLevel: m.authorityLevel,
      })),
    },
    votingActivity: {
      totalVotes: allVotes.length,
      openVotes: openVotes.length,
      closedVotes: closedVotes.length,
      approvalRate: closedVotes.length > 0
        ? `${((approvedVotes.length / closedVotes.length) * 100).toFixed(1)}%`
        : 'N/A',
    },
    openVotes: openVotes.map((v) => ({
      voteId: v.voteId,
      title: v.title,
      category: v.category,
      deadline: v.deadline,
      participationRate: `${((v.weightedTallies?.participationRate ?? 0) * 100).toFixed(1)}%`,
    })),
    recentClosed: closedVotes
      .sort((a, b) => new Date(b.closedAt || 0).getTime() - new Date(a.closedAt || 0).getTime())
      .slice(0, 5)
      .map((v) => ({
        voteId: v.voteId,
        title: v.title,
        result: v.outcome?.result,
        closedAt: v.closedAt,
      })),
  };
}

// ============================================================================
// Tool Registry
// ============================================================================

/**
 * All council voting tool schemas for MCP registration
 */
export const councilVotingToolSchemas: MCPTool[] = [
  councilCreateVoteSchema,
  councilCastVoteSchema,
  councilCloseVoteSchema,
  councilGetPendingSchema,
  councilGetStatusSchema,
];

/**
 * Tool executor registry
 */
const toolExecutors: Record<string, (input: unknown) => Promise<unknown>> = {
  'council_create_vote': executeCouncilCreateVote,
  'council_cast_vote': executeCouncilCastVote,
  'council_close_vote': executeCouncilCloseVote,
  'council_get_pending': executeCouncilGetPending,
  'council_get_status': executeCouncilGetStatus,
};

/**
 * Get tool schema by name
 */
export function getCouncilVotingToolSchema(name: string): MCPTool | undefined {
  return councilVotingToolSchemas.find((t) => t.name === name);
}

/**
 * Execute a council voting tool by name
 */
export async function executeCouncilVotingTool(
  toolName: string,
  input: unknown
): Promise<unknown> {
  const executor = toolExecutors[toolName];
  if (!executor) {
    return {
      success: false,
      error: `Unknown tool: ${toolName}`,
      availableTools: councilVotingToolSchemas.map((t) => t.name),
    };
  }

  try {
    return await executor(input);
  } catch (error) {
    return {
      success: false,
      error: `Tool execution failed: ${(error as Error).message}`,
    };
  }
}

/**
 * Get all tool names for registration
 */
export function getCouncilVotingToolNames(): string[] {
  return councilVotingToolSchemas.map((t) => t.name);
}
