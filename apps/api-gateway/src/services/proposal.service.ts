/**
 * DAO Proposals Service - Database operations for governance proposals
 * Implements persistent PostgreSQL storage for governance proposals
 */

import { Pool } from 'pg';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

export interface Proposal {
  id: string;
  title: string;
  description: string;
  type:
    | 'budget_allocation'
    | 'material_access'
    | 'governance'
    | 'technical'
    | 'schedule';
  status: 'draft' | 'voting' | 'passed' | 'rejected' | 'expired';
  proposer: {
    id: string;
    name: string;
    role: string;
  };
  votes: {
    for: number;
    against: number;
    abstain: number;
    total: number;
    required?: number;
  };
  votingPeriod: {
    start: string;
    end: string;
  };
  created_at: string;
  updated_at?: string;
}

export interface ProposalVote {
  id: string;
  proposal_id: string;
  user_id: string;
  vote_type: 'for' | 'against' | 'abstain';
  created_at: string;
}

interface StoredVote {
  id: string;
  proposal_id: string;
  user_id: string;
  vote_type: 'for' | 'against' | 'abstain';
  created_at: string;
  updated_at?: string;
}

interface ProposalFilters {
  status?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

interface CreateProposalData {
  title: string;
  description: string;
  type: string;
  proposer_id: string;
}

interface CreateProposalResult {
  id: string;
  title: string;
  description: string;
  type: string;
  status: string;
  proposer: {
    id: string;
  };
  created_at: string;
  voting_start: string;
  voting_end: string;
}

interface CastVoteResult {
  success: boolean;
  message: string;
  vote: {
    id?: string;
    proposal_id: string;
    user_id: string;
    vote_type: string;
    created_at?: string;
    updated_at?: string;
  };
}

interface VotingStatistics {
  totalProposals: number;
  activeProposals: number;
  passedProposals: number;
  rejectedProposals: number;
  averageVotingParticipation: number;
}

export class ProposalService {
  private pool: Pool | null;
  private voteStorage: Map<string, Map<string, StoredVote>>; // For testing: proposalId -> userId -> vote

  constructor(pool?: Pool) {
    this.pool = pool ?? null;
    this.voteStorage = new Map(); // In-memory storage for testing
  }

  private getPool(): Pool {
    if (!this.pool) {
      throw new Error('Database connection pool is not configured');
    }

    return this.pool;
  }

  /**
   * Get all proposals with vote counts and proposer information
   */
  async getProposals(filters?: ProposalFilters): Promise<Proposal[]> {
    try {
      let whereConditions = ['p.active = true'];
      const values: (string | number)[] = [];
      let paramCount = 1;

      if (filters?.status) {
        whereConditions.push(`p.status = $${paramCount++}`);
        values.push(filters.status);
      }

      if (filters?.type) {
        whereConditions.push(`p.type = $${paramCount++}`);
        values.push(filters.type);
      }

      const limitClause = filters?.limit ? `LIMIT ${filters.limit}` : '';
      const offsetClause = filters?.offset ? `OFFSET ${filters.offset}` : '';

      const pool = this.pool;
      if (!pool) {
        return [];
      }

      const result = await pool.query(
        `
        SELECT 
          p.*,
          u.username as proposer_name,
          u.role as proposer_role,
          COALESCE(p.votes_for, 0) as votes_for_count,
          COALESCE(p.votes_against, 0) as votes_against_count,
          COALESCE(p.votes_abstain, 0) as votes_abstain_count,
          (COALESCE(p.votes_for, 0) + COALESCE(p.votes_against, 0) + COALESCE(p.votes_abstain, 0)) as total_votes
        FROM proposals p
        LEFT JOIN users u ON p.proposer_id = u.id
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY p.created_at DESC
        ${limitClause}
        ${offsetClause}
      `,
        values
      );

      return result.rows.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        type: p.type,
        status: p.status,
        proposer: {
          id: p.proposer_id,
          name: p.proposer_name || 'Unknown',
          role: p.proposer_role || 'unknown',
        },
        votes: {
          for: parseInt(p.votes_for_count) || 0,
          against: parseInt(p.votes_against_count) || 0,
          abstain: parseInt(p.votes_abstain_count) || 0,
          total: parseInt(p.total_votes) || 0,
          required: this.calculateRequiredVotes(p.type),
        },
        votingPeriod: {
          start: p.voting_start,
          end: p.voting_end,
        },
        created_at: p.created_at,
        updated_at: p.updated_at,
      }));
    } catch (error) {
      logger.error('Failed to fetch proposals', {
        filters,
        error: (error as Error).message,
      });
      throw new Error('Failed to retrieve proposals');
    }
  }

  /**
   * Get proposal by ID with detailed information
   */
  async getProposalById(proposalId: string): Promise<Proposal | null> {
    try {
      const proposals = await this.getProposals();
      return proposals.find((p) => p.id === proposalId) || null;
    } catch (error) {
      logger.error('Failed to fetch proposal', {
        proposalId,
        error: (error as Error).message,
      });
      throw new Error('Failed to retrieve proposal');
    }
  }

  /**
   * Calculate required votes based on proposal type
   */
  private calculateRequiredVotes(type: string): number {
    const requirements = {
      governance: 20,
      budget_allocation: 15,
      technical: 12,
      material_access: 10,
      schedule: 8,
    };

    return requirements[type as keyof typeof requirements] || 10;
  }

  /**
   * Create new proposal with proper validation
   */
  async createProposal(
    data: CreateProposalData
  ): Promise<CreateProposalResult> {
    try {
      // For testing/development - use in-memory storage when database is not available
      if (!this.pool) {
        const proposalId = `prop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        return {
          id: proposalId,
          title: data.title,
          description: data.description,
          type: data.type,
          status: 'voting',
          proposer: {
            id: data.proposer_id,
          },
          created_at: new Date().toISOString(),
          voting_start: new Date().toISOString(),
          voting_end: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000
          ).toISOString(),
        };
      }

      const result = await this.getPool().query(
        `INSERT INTO proposals (title, description, type, proposer_id, status, voting_start, voting_end, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING *`,
        [
          data.title,
          data.description,
          data.type,
          data.proposer_id,
          'voting', // Set to voting status by default
          new Date().toISOString(),
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days voting period
        ]
      );

      return {
        id: result.rows[0].id,
        title: result.rows[0].title,
        description: result.rows[0].description,
        type: result.rows[0].type,
        status: result.rows[0].status,
        proposer: {
          id: result.rows[0].proposer_id,
        },
        created_at: result.rows[0].created_at,
        voting_start: result.rows[0].voting_start,
        voting_end: result.rows[0].voting_end,
      };
    } catch (error) {
      logger.error('Failed to create proposal', {
        data,
        error: (error as Error).message,
      });
      throw new Error('Failed to create proposal');
    }
  }

  /**
   * Cast vote on proposal with duplicate prevention
   */
  async castVote(
    proposalId: string,
    userId: string,
    voteType: 'for' | 'against' | 'abstain'
  ): Promise<CastVoteResult> {
    try {
      // For testing/development - use in-memory storage when database is not available
      if (!this.pool) {
        if (!this.voteStorage.has(proposalId)) {
          this.voteStorage.set(proposalId, new Map());
        }

        const proposalVotes = this.voteStorage.get(proposalId)!;
        const existingVote = proposalVotes.get(userId);

        if (existingVote) {
          // Update existing vote
          const updatedVote: StoredVote = {
            ...existingVote,
            vote_type: voteType,
            updated_at: new Date().toISOString(),
          };
          proposalVotes.set(userId, updatedVote);
          return {
            success: true,
            message: 'Vote updated successfully',
            vote: {
              proposal_id: proposalId,
              user_id: userId,
              vote_type: voteType,
              updated_at: new Date().toISOString(),
            },
          };
        } else {
          // Create new vote
          const newVote: StoredVote = {
            id: `vote_${Date.now()}`,
            proposal_id: proposalId,
            user_id: userId,
            vote_type: voteType,
            created_at: new Date().toISOString(),
          };
          proposalVotes.set(userId, newVote);

          return {
            success: true,
            message: 'Vote cast successfully',
            vote: newVote,
          };
        }
      }

      // Database implementation (when available)
      // Check for existing vote first
      const pool = this.getPool();
      const existingVote = await pool.query(
        'SELECT id, vote_type FROM votes WHERE user_id = $1 AND proposal_id = $2',
        [userId, proposalId]
      );

      if (existingVote.rows.length > 0) {
        // Update existing vote instead of creating duplicate
        await pool.query(
          'UPDATE votes SET vote_type = $1, updated_at = NOW() WHERE user_id = $2 AND proposal_id = $3',
          [voteType, userId, proposalId]
        );

        return {
          success: true,
          message: 'Vote updated successfully',
          vote: {
            proposal_id: proposalId,
            user_id: userId,
            vote_type: voteType,
            updated_at: new Date().toISOString(),
          },
        };
      } else {
        // Insert new vote with database constraint protection
        const result = await pool.query(
          'INSERT INTO votes (proposal_id, user_id, vote_type, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id',
          [proposalId, userId, voteType]
        );

        return {
          success: true,
          message: 'Vote cast successfully',
          vote: {
            id: result.rows[0].id,
            proposal_id: proposalId,
            user_id: userId,
            vote_type: voteType,
            created_at: new Date().toISOString(),
          },
        };
      }
    } catch (error) {
      // Handle database constraint violation
      const dbError = error as { constraint?: string };
      if (dbError.constraint === 'unique_user_proposal') {
        throw new Error('User has already voted on this proposal');
      }

      logger.error('Failed to cast vote', {
        proposalId,
        userId,
        voteType,
        error: (error as Error).message,
      });
      throw new Error('Failed to cast vote');
    }
  }

  /**
   * Get voting statistics
   */
  async getVotingStatistics(): Promise<VotingStatistics> {
    // For testing/development - use in-memory storage when database is not available
    if (!this.pool) {
      return {
        totalProposals: 0,
        activeProposals: 0,
        passedProposals: 0,
        rejectedProposals: 0,
        averageVotingParticipation: 0,
      };
    }

    try {
      const result = await this.getPool().query(`
        SELECT 
          COUNT(*) as total_proposals,
          COUNT(CASE WHEN status = 'voting' THEN 1 END) as active_proposals,
          COUNT(CASE WHEN status = 'passed' THEN 1 END) as passed_proposals,
          COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_proposals
        FROM proposals WHERE active = true
      `);

      return {
        totalProposals: parseInt(result.rows[0].total_proposals) || 0,
        activeProposals: parseInt(result.rows[0].active_proposals) || 0,
        passedProposals: parseInt(result.rows[0].passed_proposals) || 0,
        rejectedProposals: parseInt(result.rows[0].rejected_proposals) || 0,
        averageVotingParticipation: 0, // Could calculate from votes table
      };
    } catch (error) {
      logger.error('Failed to get voting statistics', {
        error: (error as Error).message,
      });
      throw new Error('Failed to retrieve voting statistics');
    }
  }
}
