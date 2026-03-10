/**
 * Council Voting Tools Unit Tests
 *
 * Enterprise test suite for council voting MCP tools.
 * Tests tool schemas, executors, and registry functions.
 *
 * @module tests/council-voting-tools.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  councilVotingToolSchemas,
  councilCreateVoteSchema,
  councilCastVoteSchema,
  councilCloseVoteSchema,
  councilGetPendingSchema,
  councilGetStatusSchema,
  getCouncilVotingToolSchema,
  getCouncilVotingToolNames,
  executeCouncilVotingTool,
} from '../src/services/council-voting-tools.js';

// ============================================================================
// Tool Schema Tests
// ============================================================================

describe('Council Voting Tool Schemas', () => {
  describe('councilVotingToolSchemas', () => {
    it('should export exactly 5 tools', () => {
      expect(councilVotingToolSchemas).toHaveLength(5);
    });

    it('should include all expected tools', () => {
      const toolNames = councilVotingToolSchemas.map((t) => t.name);
      expect(toolNames).toContain('council_create_vote');
      expect(toolNames).toContain('council_cast_vote');
      expect(toolNames).toContain('council_close_vote');
      expect(toolNames).toContain('council_get_pending');
      expect(toolNames).toContain('council_get_status');
    });

    it('should have valid schema structure for all tools', () => {
      for (const tool of councilVotingToolSchemas) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
        expect(tool.inputSchema.required).toBeDefined();
        expect(tool.category).toBe('Council Voting');
        expect(tool.version).toBe('1.0.0');
      }
    });
  });

  describe('councilCreateVoteSchema', () => {
    it('should have correct name and description', () => {
      expect(councilCreateVoteSchema.name).toBe('council_create_vote');
      expect(councilCreateVoteSchema.description).toContain('Admin Council');
    });

    it('should require title, description, category, proposedBy', () => {
      expect(councilCreateVoteSchema.inputSchema.required).toContain('title');
      expect(councilCreateVoteSchema.inputSchema.required).toContain('description');
      expect(councilCreateVoteSchema.inputSchema.required).toContain('category');
      expect(councilCreateVoteSchema.inputSchema.required).toContain('proposedBy');
    });

    it('should have category enum with all valid values', () => {
      const categoryProp = councilCreateVoteSchema.inputSchema.properties.category as {
        enum: string[];
      };
      expect(categoryProp.enum).toContain('documentation');
      expect(categoryProp.enum).toContain('architecture');
      expect(categoryProp.enum).toContain('governance');
      expect(categoryProp.enum).toContain('strategic-direction');
    });

    it('should have optional decisionId', () => {
      expect(councilCreateVoteSchema.inputSchema.required).not.toContain('decisionId');
      expect(councilCreateVoteSchema.inputSchema.properties.decisionId).toBeDefined();
    });
  });

  describe('councilCastVoteSchema', () => {
    it('should have correct name and description', () => {
      expect(councilCastVoteSchema.name).toBe('council_cast_vote');
      expect(councilCastVoteSchema.description).toContain('vote');
    });

    it('should require voteId, voterId, decision, rationale', () => {
      expect(councilCastVoteSchema.inputSchema.required).toContain('voteId');
      expect(councilCastVoteSchema.inputSchema.required).toContain('voterId');
      expect(councilCastVoteSchema.inputSchema.required).toContain('decision');
      expect(councilCastVoteSchema.inputSchema.required).toContain('rationale');
    });

    it('should have decision enum with approve, reject, abstain', () => {
      const decisionProp = councilCastVoteSchema.inputSchema.properties.decision as {
        enum: string[];
      };
      expect(decisionProp.enum).toEqual(['approve', 'reject', 'abstain']);
    });
  });

  describe('councilCloseVoteSchema', () => {
    it('should have correct name and description', () => {
      expect(councilCloseVoteSchema.name).toBe('council_close_vote');
      expect(councilCloseVoteSchema.description).toContain('Close');
    });

    it('should require voteId and closedBy', () => {
      expect(councilCloseVoteSchema.inputSchema.required).toContain('voteId');
      expect(councilCloseVoteSchema.inputSchema.required).toContain('closedBy');
    });
  });

  describe('councilGetPendingSchema', () => {
    it('should have correct name and description', () => {
      expect(councilGetPendingSchema.name).toBe('council_get_pending');
      expect(councilGetPendingSchema.description).toContain('pending');
    });

    it('should require userId', () => {
      expect(councilGetPendingSchema.inputSchema.required).toContain('userId');
    });
  });

  describe('councilGetStatusSchema', () => {
    it('should have correct name and description', () => {
      expect(councilGetStatusSchema.name).toBe('council_get_status');
      expect(councilGetStatusSchema.description).toContain('status');
    });

    it('should have no required fields', () => {
      expect(councilGetStatusSchema.inputSchema.required).toEqual([]);
    });
  });
});

// ============================================================================
// Tool Registry Tests
// ============================================================================

describe('Tool Registry Functions', () => {
  describe('getCouncilVotingToolSchema', () => {
    it('should return tool schema for valid name', () => {
      const tool = getCouncilVotingToolSchema('council_create_vote');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('council_create_vote');
    });

    it('should return undefined for invalid name', () => {
      const tool = getCouncilVotingToolSchema('invalid_tool_name');
      expect(tool).toBeUndefined();
    });

    it('should return tool for all valid tool names', () => {
      const names = getCouncilVotingToolNames();
      for (const name of names) {
        const tool = getCouncilVotingToolSchema(name);
        expect(tool).toBeDefined();
        expect(tool?.name).toBe(name);
      }
    });
  });

  describe('getCouncilVotingToolNames', () => {
    it('should return array of 5 tool names', () => {
      const names = getCouncilVotingToolNames();
      expect(names).toHaveLength(5);
    });

    it('should return all expected tool names', () => {
      const names = getCouncilVotingToolNames();
      expect(names).toContain('council_create_vote');
      expect(names).toContain('council_cast_vote');
      expect(names).toContain('council_close_vote');
      expect(names).toContain('council_get_pending');
      expect(names).toContain('council_get_status');
    });
  });
});

// ============================================================================
// Tool Executor Tests
// ============================================================================

describe('Tool Executors', () => {
  describe('executeCouncilVotingTool', () => {
    it('should return error for unknown tool', async () => {
      const result = await executeCouncilVotingTool('unknown_tool', {});
      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toContain('Unknown tool');
      expect(result).toHaveProperty('availableTools');
    });

    it('should include available tools in error response', async () => {
      const result = await executeCouncilVotingTool('unknown_tool', {}) as {
        availableTools: string[];
      };
      expect(result.availableTools).toContain('council_create_vote');
      expect(result.availableTools).toContain('council_cast_vote');
    });
  });

  describe('council_create_vote executor', () => {
    it('should return error for non-council member', async () => {
      const result = await executeCouncilVotingTool('council_create_vote', {
        title: 'Test Vote',
        description: 'Test description',
        category: 'documentation',
        proposedBy: 'unknown-user',
      });
      expect(result).toHaveProperty('success', false);
      expect((result as { error: string }).error).toContain('not an active council member');
    });

    it('should create vote for valid council member', async () => {
      const result = await executeCouncilVotingTool('council_create_vote', {
        title: 'Test Vote for Tool Executor',
        description: 'Testing the MCP tool executor',
        category: 'documentation',
        proposedBy: 'erik',
      });
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('vote');
      expect((result as { vote: { voteId: string } }).vote.voteId).toBeTruthy();
      expect(result).toHaveProperty('nextSteps');
    });
  });

  describe('council_cast_vote executor', () => {
    it('should return error for non-council member', async () => {
      const result = await executeCouncilVotingTool('council_cast_vote', {
        voteId: 'vote-123',
        voterId: 'unknown-user',
        decision: 'approve',
        rationale: 'Test rationale',
      });
      expect(result).toHaveProperty('success', false);
      expect((result as { error: string }).error).toContain('not an active council member');
    });

    it('should return error for non-existent vote', async () => {
      const result = await executeCouncilVotingTool('council_cast_vote', {
        voteId: 'non-existent-vote-id',
        voterId: 'erik',
        decision: 'approve',
        rationale: 'Test rationale',
      });
      expect(result).toHaveProperty('success', false);
      expect((result as { error: string }).error).toContain('not found');
    });
  });

  describe('council_close_vote executor', () => {
    it('should return error for non-council member', async () => {
      const result = await executeCouncilVotingTool('council_close_vote', {
        voteId: 'vote-123',
        closedBy: 'unknown-user',
      });
      expect(result).toHaveProperty('success', false);
      expect((result as { error: string }).error).toContain('not an active council member');
    });

    it('should return error for non-existent vote', async () => {
      const result = await executeCouncilVotingTool('council_close_vote', {
        voteId: 'non-existent-vote-id',
        closedBy: 'erik',
      });
      expect(result).toHaveProperty('success', false);
      expect((result as { error: string }).error).toContain('not found');
    });
  });

  describe('council_get_pending executor', () => {
    it('should return error for non-council member', async () => {
      const result = await executeCouncilVotingTool('council_get_pending', {
        userId: 'unknown-user',
      });
      expect(result).toHaveProperty('success', false);
      expect((result as { error: string }).error).toContain('not an active council member');
    });

    it('should return pending votes for valid council member', async () => {
      const result = await executeCouncilVotingTool('council_get_pending', {
        userId: 'erik',
      });
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('member');
      expect(result).toHaveProperty('pendingCount');
      expect(result).toHaveProperty('pendingVotes');
      expect(result).toHaveProperty('actionRequired');
    });
  });

  describe('council_get_status executor', () => {
    it('should return council status', async () => {
      const result = await executeCouncilVotingTool('council_get_status', {});
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('council');
      expect(result).toHaveProperty('votingActivity');
      expect(result).toHaveProperty('openVotes');
      expect(result).toHaveProperty('recentClosed');
    });

    it('should include council members in response', async () => {
      const result = await executeCouncilVotingTool('council_get_status', {}) as {
        council: { members: Array<{ userId: string }> };
      };
      const memberIds = result.council.members.map((m) => m.userId);
      expect(memberIds).toContain('erik');
      expect(memberIds).toContain('seppa');
    });

    it('should include voting activity statistics', async () => {
      const result = await executeCouncilVotingTool('council_get_status', {}) as {
        votingActivity: {
          totalVotes: number;
          openVotes: number;
          closedVotes: number;
        };
      };
      expect(typeof result.votingActivity.totalVotes).toBe('number');
      expect(typeof result.votingActivity.openVotes).toBe('number');
      expect(typeof result.votingActivity.closedVotes).toBe('number');
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Full Voting Workflow Integration', () => {
  let testVoteId: string;

  it('should complete full voting workflow', async () => {
    // Step 1: Create a vote
    const createResult = await executeCouncilVotingTool('council_create_vote', {
      title: 'Integration Test Vote',
      description: 'Testing full voting workflow via MCP tools',
      category: 'documentation',
      proposedBy: 'erik',
    }) as { success: boolean; vote: { voteId: string } };

    expect(createResult.success).toBe(true);
    testVoteId = createResult.vote.voteId;

    // Step 2: Cast votes
    const erikVote = await executeCouncilVotingTool('council_cast_vote', {
      voteId: testVoteId,
      voterId: 'erik',
      decision: 'approve',
      rationale: 'Approve for integration test',
    }) as { success: boolean; currentTallies: { approve: number } };

    expect(erikVote.success).toBe(true);
    expect(erikVote.currentTallies.approve).toBe(2); // Erik weight = 2

    const seppaVote = await executeCouncilVotingTool('council_cast_vote', {
      voteId: testVoteId,
      voterId: 'seppa',
      decision: 'approve',
      rationale: 'AI concurs with approval',
    }) as { success: boolean; currentTallies: { approve: number; participationRate: string } };

    expect(seppaVote.success).toBe(true);
    expect(seppaVote.currentTallies.approve).toBe(3); // Erik (2) + Seppa (1)
    expect(seppaVote.currentTallies.participationRate).toBe('100.0%');

    // Step 3: Close the vote
    const closeResult = await executeCouncilVotingTool('council_close_vote', {
      voteId: testVoteId,
      closedBy: 'erik',
    }) as {
      success: boolean;
      outcome: { result: string; quorumMet: boolean };
    };

    expect(closeResult.success).toBe(true);
    expect(closeResult.outcome.result).toBe('approved');
    expect(closeResult.outcome.quorumMet).toBe(true);

    // Step 4: Verify in status
    const statusResult = await executeCouncilVotingTool('council_get_status', {}) as {
      success: boolean;
      votingActivity: { closedVotes: number };
      recentClosed: Array<{ voteId: string }>;
    };

    expect(statusResult.success).toBe(true);
    expect(statusResult.votingActivity.closedVotes).toBeGreaterThan(0);
    
    const recentIds = statusResult.recentClosed.map((v) => v.voteId);
    expect(recentIds).toContain(testVoteId);
  });
});
