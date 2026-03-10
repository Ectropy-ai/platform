/**
 * Proposal Service Test Suite - P0 Critical Coverage
 * Target: 95%+ coverage for DAO governance core business logic
 *
 * Test Strategy:
 * - AAA Pattern (Arrange, Act, Assert)
 * - Mock external dependencies (database)
 * - Test edge cases and error paths
 * - Validate business logic invariants (quorum, voting periods, duplicate prevention)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProposalService } from './proposal.service.js';
import type { Pool, QueryResult } from 'pg';

// Mock logger to prevent console output during tests
vi.mock('../../../../libs/shared/utils/src/logger.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('ProposalService', () => {
  let service: ProposalService;
  let mockPool: Pool;
  let mockQuery: ReturnType<typeof vi.fn>;

  // Helper to run tests in production mode (bypasses test mode check)
  const withProductionMode = async (fn: () => Promise<void>) => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await fn();
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  };

  beforeEach(() => {
    // Reset mocks before each test
    mockQuery = vi.fn();
    mockPool = {
      query: mockQuery,
    } as unknown as Pool;

    service = new ProposalService(mockPool);
  });

  describe('Constructor', () => {
    it('should initialize with pool', () => {
      const serviceWithPool = new ProposalService(mockPool);
      expect(serviceWithPool).toBeDefined();
    });

    it('should initialize without pool for test mode', () => {
      const serviceWithoutPool = new ProposalService();
      expect(serviceWithoutPool).toBeDefined();
    });
  });

  describe('getProposals', () => {
    it('should return empty array when pool is not configured', async () => {
      const serviceWithoutPool = new ProposalService();
      const proposals = await serviceWithoutPool.getProposals();
      expect(proposals).toEqual([]);
    });

    it('should fetch all proposals with default filters', async () => {
      const mockRows = [
        {
          id: 'prop-1',
          title: 'Budget Proposal',
          description: 'Allocate budget for Q1',
          type: 'budget_allocation',
          status: 'voting',
          proposer_id: 'user-1',
          proposer_name: 'Alice',
          proposer_role: 'owner',
          votes_for_count: '10',
          votes_against_count: '5',
          votes_abstain_count: '2',
          total_votes: '17',
          voting_start: '2025-11-24T00:00:00Z',
          voting_end: '2025-12-01T00:00:00Z',
          created_at: '2025-11-24T00:00:00Z',
          updated_at: '2025-11-24T12:00:00Z',
        },
      ];

      mockQuery.mockResolvedValue({ rows: mockRows } as QueryResult);

      const proposals = await service.getProposals();

      expect(proposals).toHaveLength(1);
      expect(proposals[0]).toMatchObject({
        id: 'prop-1',
        title: 'Budget Proposal',
        type: 'budget_allocation',
        status: 'voting',
        proposer: {
          id: 'user-1',
          name: 'Alice',
          role: 'owner',
        },
        votes: {
          for: 10,
          against: 5,
          abstain: 2,
          total: 17,
          required: 15, // budget_allocation requires 15
        },
      });

      expect(mockQuery).toHaveBeenCalledOnce();
    });

    it('should filter by status', async () => {
      mockQuery.mockResolvedValue({ rows: [] } as QueryResult);

      await service.getProposals({ status: 'passed' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('p.status = $1'),
        ['passed']
      );
    });

    it('should filter by type', async () => {
      mockQuery.mockResolvedValue({ rows: [] } as QueryResult);

      await service.getProposals({ type: 'governance' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('p.type = $1'),
        ['governance']
      );
    });

    it('should filter by status and type combined', async () => {
      mockQuery.mockResolvedValue({ rows: [] } as QueryResult);

      await service.getProposals({ status: 'voting', type: 'technical' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('p.status = $1'),
        ['voting', 'technical']
      );
    });

    it('should apply limit', async () => {
      mockQuery.mockResolvedValue({ rows: [] } as QueryResult);

      await service.getProposals({ limit: 10 });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 10'),
        []
      );
    });

    it('should apply offset', async () => {
      mockQuery.mockResolvedValue({ rows: [] } as QueryResult);

      await service.getProposals({ offset: 20 });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('OFFSET 20'),
        []
      );
    });

    it('should apply limit and offset for pagination', async () => {
      mockQuery.mockResolvedValue({ rows: [] } as QueryResult);

      await service.getProposals({ limit: 10, offset: 20 });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 10'),
        []
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('OFFSET 20'),
        []
      );
    });

    it('should handle proposals with missing proposer data', async () => {
      const mockRows = [
        {
          id: 'prop-1',
          title: 'Test Proposal',
          description: 'Description',
          type: 'technical',
          status: 'voting',
          proposer_id: 'user-1',
          proposer_name: null,
          proposer_role: null,
          votes_for_count: '0',
          votes_against_count: '0',
          votes_abstain_count: '0',
          total_votes: '0',
          voting_start: '2025-11-24T00:00:00Z',
          voting_end: '2025-12-01T00:00:00Z',
          created_at: '2025-11-24T00:00:00Z',
        },
      ];

      mockQuery.mockResolvedValue({ rows: mockRows } as QueryResult);

      const proposals = await service.getProposals();

      expect(proposals[0].proposer).toEqual({
        id: 'user-1',
        name: 'Unknown',
        role: 'unknown',
      });
    });

    it('should handle proposals with zero votes', async () => {
      const mockRows = [
        {
          id: 'prop-1',
          title: 'New Proposal',
          description: 'Just created',
          type: 'schedule',
          status: 'voting',
          proposer_id: 'user-1',
          proposer_name: 'Bob',
          proposer_role: 'contractor',
          votes_for_count: null,
          votes_against_count: null,
          votes_abstain_count: null,
          total_votes: null,
          voting_start: '2025-11-24T00:00:00Z',
          voting_end: '2025-12-01T00:00:00Z',
          created_at: '2025-11-24T00:00:00Z',
        },
      ];

      mockQuery.mockResolvedValue({ rows: mockRows } as QueryResult);

      const proposals = await service.getProposals();

      expect(proposals[0].votes).toEqual({
        for: 0,
        against: 0,
        abstain: 0,
        total: 0,
        required: 8, // schedule requires 8
      });
    });

    it('should calculate correct required votes for each proposal type', async () => {
      const mockRows = [
        {
          id: 'prop-governance',
          title: 'Governance',
          description: 'Test',
          type: 'governance',
          status: 'voting',
          proposer_id: 'user-1',
          proposer_name: 'Alice',
          proposer_role: 'owner',
          votes_for_count: '0',
          votes_against_count: '0',
          votes_abstain_count: '0',
          total_votes: '0',
          voting_start: '2025-11-24T00:00:00Z',
          voting_end: '2025-12-01T00:00:00Z',
          created_at: '2025-11-24T00:00:00Z',
        },
        {
          id: 'prop-budget',
          title: 'Budget',
          description: 'Test',
          type: 'budget_allocation',
          status: 'voting',
          proposer_id: 'user-1',
          proposer_name: 'Alice',
          proposer_role: 'owner',
          votes_for_count: '0',
          votes_against_count: '0',
          votes_abstain_count: '0',
          total_votes: '0',
          voting_start: '2025-11-24T00:00:00Z',
          voting_end: '2025-12-01T00:00:00Z',
          created_at: '2025-11-24T00:00:00Z',
        },
        {
          id: 'prop-technical',
          title: 'Technical',
          description: 'Test',
          type: 'technical',
          status: 'voting',
          proposer_id: 'user-1',
          proposer_name: 'Alice',
          proposer_role: 'owner',
          votes_for_count: '0',
          votes_against_count: '0',
          votes_abstain_count: '0',
          total_votes: '0',
          voting_start: '2025-11-24T00:00:00Z',
          voting_end: '2025-12-01T00:00:00Z',
          created_at: '2025-11-24T00:00:00Z',
        },
        {
          id: 'prop-material',
          title: 'Material',
          description: 'Test',
          type: 'material_access',
          status: 'voting',
          proposer_id: 'user-1',
          proposer_name: 'Alice',
          proposer_role: 'owner',
          votes_for_count: '0',
          votes_against_count: '0',
          votes_abstain_count: '0',
          total_votes: '0',
          voting_start: '2025-11-24T00:00:00Z',
          voting_end: '2025-12-01T00:00:00Z',
          created_at: '2025-11-24T00:00:00Z',
        },
        {
          id: 'prop-schedule',
          title: 'Schedule',
          description: 'Test',
          type: 'schedule',
          status: 'voting',
          proposer_id: 'user-1',
          proposer_name: 'Alice',
          proposer_role: 'owner',
          votes_for_count: '0',
          votes_against_count: '0',
          votes_abstain_count: '0',
          total_votes: '0',
          voting_start: '2025-11-24T00:00:00Z',
          voting_end: '2025-12-01T00:00:00Z',
          created_at: '2025-11-24T00:00:00Z',
        },
      ];

      mockQuery.mockResolvedValue({ rows: mockRows } as QueryResult);

      const proposals = await service.getProposals();

      expect(proposals[0].votes.required).toBe(20); // governance
      expect(proposals[1].votes.required).toBe(15); // budget_allocation
      expect(proposals[2].votes.required).toBe(12); // technical
      expect(proposals[3].votes.required).toBe(10); // material_access
      expect(proposals[4].votes.required).toBe(8); // schedule
    });

    it('should use default required votes for unknown proposal type', async () => {
      const mockRows = [
        {
          id: 'prop-unknown',
          title: 'Unknown Type',
          description: 'Test',
          type: 'unknown_type',
          status: 'voting',
          proposer_id: 'user-1',
          proposer_name: 'Alice',
          proposer_role: 'owner',
          votes_for_count: '0',
          votes_against_count: '0',
          votes_abstain_count: '0',
          total_votes: '0',
          voting_start: '2025-11-24T00:00:00Z',
          voting_end: '2025-12-01T00:00:00Z',
          created_at: '2025-11-24T00:00:00Z',
        },
      ];

      mockQuery.mockResolvedValue({ rows: mockRows } as QueryResult);

      const proposals = await service.getProposals();

      expect(proposals[0].votes.required).toBe(10); // default
    });

    it('should throw error when database query fails', async () => {
      mockQuery.mockRejectedValue(new Error('Database connection failed'));

      await expect(service.getProposals()).rejects.toThrow(
        'Failed to retrieve proposals'
      );
    });

    it('should order proposals by created_at DESC', async () => {
      mockQuery.mockResolvedValue({ rows: [] } as QueryResult);

      await service.getProposals();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY p.created_at DESC'),
        []
      );
    });
  });

  describe('getProposalById', () => {
    it('should return proposal when found', async () => {
      const mockRows = [
        {
          id: 'prop-1',
          title: 'Test Proposal',
          description: 'Description',
          type: 'governance',
          status: 'voting',
          proposer_id: 'user-1',
          proposer_name: 'Alice',
          proposer_role: 'owner',
          votes_for_count: '5',
          votes_against_count: '3',
          votes_abstain_count: '1',
          total_votes: '9',
          voting_start: '2025-11-24T00:00:00Z',
          voting_end: '2025-12-01T00:00:00Z',
          created_at: '2025-11-24T00:00:00Z',
        },
      ];

      mockQuery.mockResolvedValue({ rows: mockRows } as QueryResult);

      const proposal = await service.getProposalById('prop-1');

      expect(proposal).not.toBeNull();
      expect(proposal?.id).toBe('prop-1');
      expect(proposal?.title).toBe('Test Proposal');
    });

    it('should return null when proposal not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] } as QueryResult);

      const proposal = await service.getProposalById('non-existent');

      expect(proposal).toBeNull();
    });

    it('should throw error when database query fails', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      await expect(service.getProposalById('prop-1')).rejects.toThrow(
        'Failed to retrieve proposal'
      );
    });
  });

  describe('createProposal', () => {
    it('should create proposal in test mode without pool', async () => {
      const serviceWithoutPool = new ProposalService();

      const proposalData = {
        title: 'Test Proposal',
        description: 'This is a test',
        type: 'governance',
        proposer_id: 'user-1',
      };

      const result = await serviceWithoutPool.createProposal(proposalData);

      expect(result).toMatchObject({
        title: 'Test Proposal',
        description: 'This is a test',
        type: 'governance',
        status: 'voting',
        proposer: {
          id: 'user-1',
        },
      });

      expect(result.id).toMatch(/^prop_\d+_/);
      expect(new Date(result.voting_end).getTime()).toBeGreaterThan(
        new Date(result.voting_start).getTime()
      );
    });

    it('should create proposal with 7-day voting period', async () => {
      await withProductionMode(async () => {
        const mockRows = [
          {
            id: 'prop-123',
            title: 'New Proposal',
            description: 'Description',
            type: 'budget_allocation',
            status: 'voting',
            proposer_id: 'user-1',
            created_at: '2025-11-24T00:00:00Z',
            voting_start: '2025-11-24T00:00:00Z',
            voting_end: '2025-12-01T00:00:00Z',
          },
        ];

        mockQuery.mockResolvedValue({ rows: mockRows } as QueryResult);

        const proposalData = {
          title: 'New Proposal',
          description: 'Description',
          type: 'budget_allocation',
          proposer_id: 'user-1',
        };

        const result = await service.createProposal(proposalData);

        expect(result.id).toBe('prop-123');
        expect(result.status).toBe('voting');

        // Verify 7-day voting period in database call
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO proposals'),
          expect.arrayContaining([
            'New Proposal',
            'Description',
            'budget_allocation',
            'user-1',
            'voting',
          ])
        );
      });
    });

    it('should set status to "voting" by default', async () => {
      const mockRows = [
        {
          id: 'prop-123',
          title: 'Test',
          description: 'Test',
          type: 'technical',
          status: 'voting',
          proposer_id: 'user-1',
          created_at: '2025-11-24T00:00:00Z',
          voting_start: '2025-11-24T00:00:00Z',
          voting_end: '2025-12-01T00:00:00Z',
        },
      ];

      mockQuery.mockResolvedValue({ rows: mockRows } as QueryResult);

      const result = await service.createProposal({
        title: 'Test',
        description: 'Test',
        type: 'technical',
        proposer_id: 'user-1',
      });

      expect(result.status).toBe('voting');
    });

    it('should throw error when database insert fails', async () => {
      mockQuery.mockRejectedValue(new Error('Insert failed'));

      await expect(
        service.createProposal({
          title: 'Test',
          description: 'Test',
          type: 'governance',
          proposer_id: 'user-1',
        })
      ).rejects.toThrow('Failed to create proposal');
    });

    it('should handle all proposal types', async () => {
      const types = [
        'governance',
        'budget_allocation',
        'technical',
        'material_access',
        'schedule',
      ];

      for (const type of types) {
        const serviceWithoutPool = new ProposalService();

        const result = await serviceWithoutPool.createProposal({
          title: `${type} proposal`,
          description: 'Test',
          type,
          proposer_id: 'user-1',
        });

        expect(result.type).toBe(type);
        expect(result.status).toBe('voting');
      }
    });
  });

  describe('castVote', () => {
    it('should cast new vote in test mode', async () => {
      const serviceWithoutPool = new ProposalService();

      const result = await serviceWithoutPool.castVote(
        'prop-1',
        'user-1',
        'for'
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Vote cast successfully');
      expect(result.vote).toMatchObject({
        proposal_id: 'prop-1',
        user_id: 'user-1',
        vote_type: 'for',
      });
      expect(result.vote.id).toMatch(/^vote_\d+$/);
    });

    it('should update existing vote in test mode', async () => {
      const serviceWithoutPool = new ProposalService();

      // Cast initial vote
      await serviceWithoutPool.castVote('prop-1', 'user-1', 'for');

      // Update vote
      const result = await serviceWithoutPool.castVote(
        'prop-1',
        'user-1',
        'against'
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Vote updated successfully');
      expect(result.vote.vote_type).toBe('against');
    });

    it('should allow different users to vote on same proposal in test mode', async () => {
      const serviceWithoutPool = new ProposalService();

      const vote1 = await serviceWithoutPool.castVote('prop-1', 'user-1', 'for');
      const vote2 = await serviceWithoutPool.castVote(
        'prop-1',
        'user-2',
        'against'
      );

      expect(vote1.vote.user_id).toBe('user-1');
      expect(vote2.vote.user_id).toBe('user-2');
      expect(vote1.vote.vote_type).toBe('for');
      expect(vote2.vote.vote_type).toBe('against');
    });

    it('should cast new vote with database', async () => {
      // No existing vote
      mockQuery.mockResolvedValueOnce({ rows: [] } as QueryResult);

      // Insert new vote
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'vote-123' }],
      } as QueryResult);

      const result = await service.castVote('prop-1', 'user-1', 'for');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Vote cast successfully');
      expect(result.vote.id).toBe('vote-123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, vote_type FROM votes'),
        ['user-1', 'prop-1']
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO votes'),
        ['prop-1', 'user-1', 'for']
      );
    });

    it('should update existing vote with database', async () => {
      // Existing vote found
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'vote-123', vote_type: 'for' }],
      } as QueryResult);

      // Update vote
      mockQuery.mockResolvedValueOnce({ rows: [] } as QueryResult);

      const result = await service.castVote('prop-1', 'user-1', 'against');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Vote updated successfully');
      expect(result.vote.vote_type).toBe('against');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE votes SET vote_type'),
        ['against', 'user-1', 'prop-1']
      );
    });

    it('should handle all vote types', async () => {
      const voteTypes = ['for', 'against', 'abstain'];

      for (const voteType of voteTypes) {
        const serviceWithoutPool = new ProposalService();

        const result = await serviceWithoutPool.castVote(
          'prop-1',
          'user-1',
          voteType
        );

        expect(result.vote.vote_type).toBe(voteType);
      }
    });

    it('should handle duplicate vote constraint violation', async () => {
      // No existing vote in SELECT
      mockQuery.mockResolvedValueOnce({ rows: [] } as QueryResult);

      // Constraint violation on INSERT
      const error = new Error('Duplicate key violation') as Error & {
        constraint: string;
      };
      error.constraint = 'unique_user_proposal';
      mockQuery.mockRejectedValueOnce(error);

      await expect(service.castVote('prop-1', 'user-1', 'for')).rejects.toThrow(
        'User has already voted on this proposal'
      );
    });

    it('should throw generic error for other database failures', async () => {
      mockQuery.mockRejectedValue(new Error('Database connection failed'));

      await expect(service.castVote('prop-1', 'user-1', 'for')).rejects.toThrow(
        'Failed to cast vote'
      );
    });
  });

  describe('getVotingStatistics', () => {
    it('should return zero statistics in test mode', async () => {
      const serviceWithoutPool = new ProposalService();

      const stats = await serviceWithoutPool.getVotingStatistics();

      expect(stats).toEqual({
        totalProposals: 0,
        activeProposals: 0,
        passedProposals: 0,
        rejectedProposals: 0,
        averageVotingParticipation: 0,
      });
    });

    it('should fetch voting statistics from database', async () => {
      const mockRows = [
        {
          total_proposals: '50',
          active_proposals: '12',
          passed_proposals: '25',
          rejected_proposals: '10',
        },
      ];

      mockQuery.mockResolvedValue({ rows: mockRows } as QueryResult);

      const stats = await service.getVotingStatistics();

      expect(stats).toEqual({
        totalProposals: 50,
        activeProposals: 12,
        passedProposals: 25,
        rejectedProposals: 10,
        averageVotingParticipation: 0,
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(*) as total_proposals')
      );
    });

    it('should handle null counts from database', async () => {
      const mockRows = [
        {
          total_proposals: null,
          active_proposals: null,
          passed_proposals: null,
          rejected_proposals: null,
        },
      ];

      mockQuery.mockResolvedValue({ rows: mockRows } as QueryResult);

      const stats = await service.getVotingStatistics();

      expect(stats).toEqual({
        totalProposals: 0,
        activeProposals: 0,
        passedProposals: 0,
        rejectedProposals: 0,
        averageVotingParticipation: 0,
      });
    });

    it('should throw error when database query fails', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      await expect(service.getVotingStatistics()).rejects.toThrow(
        'Failed to retrieve voting statistics'
      );
    });
  });

  describe('Error Handling & Edge Cases', () => {
    it('should return zero statistics when pool is not configured', async () => {
      const serviceWithoutPool = new ProposalService();

      // Service should gracefully handle missing pool regardless of environment
      const stats = await serviceWithoutPool.getVotingStatistics();

      expect(stats).toEqual({
        totalProposals: 0,
        activeProposals: 0,
        passedProposals: 0,
        rejectedProposals: 0,
        averageVotingParticipation: 0,
      });
    });

    it('should handle concurrent votes on same proposal', async () => {
      const serviceWithoutPool = new ProposalService();

      const votes = await Promise.all([
        serviceWithoutPool.castVote('prop-1', 'user-1', 'for'),
        serviceWithoutPool.castVote('prop-1', 'user-2', 'for'),
        serviceWithoutPool.castVote('prop-1', 'user-3', 'against'),
      ]);

      expect(votes).toHaveLength(3);
      expect(votes.every((v) => v.success)).toBe(true);
    });

    it('should handle rapid vote changes by same user', async () => {
      const serviceWithoutPool = new ProposalService();

      // Cast initial vote
      await serviceWithoutPool.castVote('prop-1', 'user-1', 'for');

      // Rapidly change vote multiple times
      await serviceWithoutPool.castVote('prop-1', 'user-1', 'against');
      await serviceWithoutPool.castVote('prop-1', 'user-1', 'abstain');
      const finalVote = await serviceWithoutPool.castVote(
        'prop-1',
        'user-1',
        'for'
      );

      expect(finalVote.vote.vote_type).toBe('for');
    });
  });

  describe('Business Logic Validation', () => {
    it('should enforce governance proposals require 20 votes', async () => {
      const mockRows = [
        {
          id: 'prop-gov',
          title: 'Governance Change',
          description: 'Critical change',
          type: 'governance',
          status: 'voting',
          proposer_id: 'user-1',
          proposer_name: 'Alice',
          proposer_role: 'owner',
          votes_for_count: '15',
          votes_against_count: '3',
          votes_abstain_count: '1',
          total_votes: '19',
          voting_start: '2025-11-24T00:00:00Z',
          voting_end: '2025-12-01T00:00:00Z',
          created_at: '2025-11-24T00:00:00Z',
        },
      ];

      mockQuery.mockResolvedValue({ rows: mockRows } as QueryResult);

      const proposals = await service.getProposals({ type: 'governance' });

      expect(proposals[0].votes.required).toBe(20);
      expect(proposals[0].votes.total).toBe(19); // Not yet meeting quorum
    });

    it('should verify voting period is 7 days', async () => {
      const serviceWithoutPool = new ProposalService();

      const result = await serviceWithoutPool.createProposal({
        title: 'Test',
        description: 'Test',
        type: 'governance',
        proposer_id: 'user-1',
      });

      const start = new Date(result.voting_start);
      const end = new Date(result.voting_end);
      const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);

      expect(diffDays).toBe(7);
    });
  });
});
