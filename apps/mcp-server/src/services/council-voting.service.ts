/**
 * Council Voting Service
 *
 * Enterprise voting service for Admin Council governance decisions.
 * Implements weighted voting, quorum requirements, and V3 graph metadata.
 *
 * Features:
 * - Weighted voting based on council member authority
 * - Quorum validation for different vote types
 * - Automatic deadline enforcement
 * - V3 URN-based entity identification
 * - Graph metadata for decision relationships
 * - Full audit trail with timestamps
 *
 * @module services/council-voting.service
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { DATA_CONFIG } from '../config/data-paths.config.js';
import { getCurrentVersion } from '../utils/version.js';
import {
  ADMIN_COUNCIL_CONFIG,
  getCouncilMember,
  getActiveCouncilMembers,
  getTotalVoteWeight,
  getQuorumConfig,
  getRequiredVoteType,
  isQuorumMet,
  isVoteApproved,
  getVotingDeadline,
  canProposeVote,
  type CouncilMember,
  type QuorumConfig,
} from '../config/admin-council.config.js';
import type {
  URN,
  Vote,
  VotesCollection,
  GraphMetadata,
} from './data-source.interface.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Extended vote with council-specific fields
 */
export interface CouncilVote extends Vote {
  /** Vote type (determines quorum requirements) */
  voteType: QuorumConfig['voteType'];
  /** Impact level of the decision */
  impactLevel: 'low' | 'medium' | 'high' | 'critical';
  /** Decision category for routing */
  category: string;
  /** Voting deadline */
  deadline: string;
  /** Who proposed the vote */
  proposedBy: URN;
  /** Title of the vote */
  title: string;
  /** Description of what is being voted on */
  description: string;
  /** Related decision URN (if voting on existing decision) */
  relatedDecision?: URN;
  /** Weighted vote tallies */
  weightedTallies?: {
    approve: number;
    reject: number;
    abstain: number;
    totalWeight: number;
    participationRate: number;
  };
  /** Final outcome details */
  outcome?: {
    result: 'approved' | 'rejected' | 'expired' | 'cancelled';
    reason: string;
    quorumMet: boolean;
    finalizedAt: string;
    finalizedBy: URN;
  };
  /** Graph metadata for V3 */
  graphMetadata: GraphMetadata;
}

/**
 * Vote cast by a council member
 */
export interface CouncilVoteCast {
  voter: URN;
  voterName: string;
  decision: 'approve' | 'reject' | 'abstain';
  weight: number;
  timestamp: string;
  rationale?: string;
}

/**
 * Input for creating a new council vote
 */
export interface CreateCouncilVoteInput {
  /** ID of decision being voted on (optional) */
  decisionId?: string;
  /** Title for the vote */
  title: string;
  /** Description of what is being voted on */
  description: string;
  /** Category for determining vote type */
  category: string;
  /** Who is proposing the vote */
  proposedBy: string;
  /** Override vote type (optional) */
  voteType?: QuorumConfig['voteType'];
  /** Override deadline in hours (optional) */
  deadlineHours?: number;
}

/**
 * Input for casting a vote
 */
export interface CastCouncilVoteInput {
  /** Vote ID */
  voteId: string;
  /** User ID of voter */
  voterId: string;
  /** Vote decision */
  decision: 'approve' | 'reject' | 'abstain';
  /** Rationale for the vote */
  rationale?: string;
}

/**
 * Council vote result
 */
export interface CouncilVoteResult {
  success: boolean;
  vote?: CouncilVote;
  error?: string;
  message?: string;
}

// ============================================================================
// Council Voting Service
// ============================================================================

export class CouncilVotingService {
  private votesPath: string;
  private cache: VotesCollection | null = null;

  constructor() {
    this.votesPath = DATA_CONFIG.files.votes;
    console.log(`🗳️  CouncilVotingService initialized`);
    console.log(`   Votes file: ${this.votesPath}`);
    console.log(
      `   Active council members: ${getActiveCouncilMembers().length}`
    );
    console.log(`   Total vote weight: ${getTotalVoteWeight()}`);
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Load votes collection from file
   */
  private loadVotes(): VotesCollection {
    if (this.cache) {
      return this.cache;
    }

    try {
      if (!existsSync(this.votesPath)) {
        // Initialize empty votes collection
        const empty: VotesCollection = {
          $schema: 'https://luhtech.dev/schemas/votes.schema.v2.json',
          $id: 'urn:luhtech:ectropy:file:votes',
          schemaVersion: '2.0.0',
          ventureId: 'ectropy',
          lastUpdated: new Date().toISOString(),
          version: getCurrentVersion(),
          votes: [],
        };
        this.saveVotes(empty);
        return empty;
      }

      const content = readFileSync(this.votesPath, 'utf-8');
      const data = JSON.parse(content) as VotesCollection;
      this.cache = data;
      return data;
    } catch (error) {
      console.error('Failed to load votes:', error);
      throw new Error(`Failed to load votes: ${(error as Error).message}`);
    }
  }

  /**
   * Save votes collection to file
   */
  private saveVotes(data: VotesCollection): void {
    try {
      data.lastUpdated = new Date().toISOString();

      // Update indexes
      const indexes = {
        byStatus: {} as Record<string, string[]>,
        byDecision: {} as Record<string, string[]>,
        byProposer: {} as Record<string, string[]>,
      };

      for (const vote of data.votes) {
        // Index by status
        if (!indexes.byStatus[vote.status]) {
          indexes.byStatus[vote.status] = [];
        }
        indexes.byStatus[vote.status].push(vote.voteId);

        // Index by decision
        if (vote.decisionId) {
          if (!indexes.byDecision[vote.decisionId]) {
            indexes.byDecision[vote.decisionId] = [];
          }
          indexes.byDecision[vote.decisionId].push(vote.voteId);
        }

        // Index by proposer (for council votes)
        const councilVote = vote as CouncilVote;
        if (councilVote.proposedBy) {
          if (!indexes.byProposer[councilVote.proposedBy]) {
            indexes.byProposer[councilVote.proposedBy] = [];
          }
          indexes.byProposer[councilVote.proposedBy].push(vote.voteId);
        }
      }

      (data as any).indexes = indexes;
      (data as any).meta = {
        ...(data as any).meta,
        totalVotes: data.votes.length,
        lastSync: new Date().toISOString(),
      };

      const content = JSON.stringify(data, null, 2);
      writeFileSync(this.votesPath, content, 'utf-8');
      this.cache = data;
    } catch (error) {
      console.error('Failed to save votes:', error);
      throw new Error(`Failed to save votes: ${(error as Error).message}`);
    }
  }

  /**
   * Generate unique vote ID
   */
  private generateVoteId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `vote-${timestamp}-${random}`;
  }

  /**
   * Generate URN for a vote
   */
  private generateVoteURN(voteId: string): URN {
    return `urn:luhtech:ectropy:vote:${voteId}`;
  }

  /**
   * Clear cache (for testing)
   */
  clearCache(): void {
    this.cache = null;
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Create a new council vote
   */
  async createVote(input: CreateCouncilVoteInput): Promise<CouncilVoteResult> {
    try {
      // Validate proposer is a council member
      const proposer = getCouncilMember(input.proposedBy);
      if (!proposer) {
        return {
          success: false,
          error: `User '${input.proposedBy}' is not an active council member`,
        };
      }

      // Determine vote type and impact level
      const voteType = input.voteType || getRequiredVoteType(input.category);
      const impactLevel = this.determineImpactLevel(input.category);

      // Check if proposer has authority to propose this vote
      if (!canProposeVote(input.proposedBy, impactLevel)) {
        return {
          success: false,
          error: `User '${input.proposedBy}' does not have sufficient authority to propose ${impactLevel} impact votes`,
        };
      }

      // Calculate deadline
      const quorumConfig = getQuorumConfig(voteType);
      const deadlineHours =
        input.deadlineHours || quorumConfig?.votingPeriodHours || 72;
      const deadline = new Date();
      deadline.setHours(deadline.getHours() + deadlineHours);

      // Generate vote ID and URN
      const voteId = this.generateVoteId();
      const voteURN = this.generateVoteURN(voteId);

      // Create council vote
      const councilVote: CouncilVote = {
        $id: voteURN,
        voteId,
        decisionId: input.decisionId || '',
        status: 'open',
        createdAt: new Date().toISOString(),
        votes: [],
        voteType,
        impactLevel,
        category: input.category,
        deadline: deadline.toISOString(),
        proposedBy: proposer.$id,
        title: input.title,
        description: input.description,
        relatedDecision: input.decisionId
          ? `urn:luhtech:ectropy:decision:${input.decisionId}`
          : undefined,
        graphMetadata: {
          inEdges: input.decisionId
            ? [`urn:luhtech:ectropy:decision:${input.decisionId}`]
            : [],
          outEdges: [],
        },
      };

      // Save vote
      const votesData = this.loadVotes();
      votesData.votes.push(councilVote as any);
      this.saveVotes(votesData);

      console.log(`🗳️  Council vote created: ${voteId}`);
      console.log(`   Title: ${input.title}`);
      console.log(`   Type: ${voteType}`);
      console.log(`   Deadline: ${deadline.toISOString()}`);

      return {
        success: true,
        vote: councilVote,
        message: `Vote created successfully. Deadline: ${deadline.toISOString()}`,
      };
    } catch (error) {
      console.error('Failed to create vote:', error);
      return {
        success: false,
        error: `Failed to create vote: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Cast a vote
   */
  async castVote(input: CastCouncilVoteInput): Promise<CouncilVoteResult> {
    try {
      // Validate voter is a council member
      const voter = getCouncilMember(input.voterId);
      if (!voter) {
        return {
          success: false,
          error: `User '${input.voterId}' is not an active council member`,
        };
      }

      // Check rationale requirement
      if (ADMIN_COUNCIL_CONFIG.requireRationale && !input.rationale) {
        return {
          success: false,
          error: 'Rationale is required for all votes',
        };
      }

      // Load votes
      const votesData = this.loadVotes();
      const voteIndex = votesData.votes.findIndex(
        (v) => v.voteId === input.voteId
      );

      if (voteIndex === -1) {
        return {
          success: false,
          error: `Vote '${input.voteId}' not found`,
        };
      }

      const vote = votesData.votes[voteIndex] as CouncilVote;

      // Check vote is still open
      if (vote.status !== 'open') {
        return {
          success: false,
          error: `Vote is ${vote.status}, not open for voting`,
        };
      }

      // Check deadline
      if (new Date(vote.deadline) < new Date()) {
        return {
          success: false,
          error: 'Voting deadline has passed',
        };
      }

      // Check if voter already voted
      const existingVoteIndex = vote.votes.findIndex(
        (v: any) => v.voter === voter.$id
      );

      const voteCast: CouncilVoteCast = {
        voter: voter.$id,
        voterName: voter.displayName,
        decision: input.decision,
        weight: voter.voteWeight,
        timestamp: new Date().toISOString(),
        rationale: input.rationale,
      };

      if (existingVoteIndex >= 0) {
        if (!ADMIN_COUNCIL_CONFIG.allowVoteChanges) {
          return {
            success: false,
            error: 'Vote changes are not allowed',
          };
        }
        // Update existing vote
        vote.votes[existingVoteIndex] = voteCast as any;
        console.log(
          `🗳️  Vote changed by ${voter.displayName}: ${input.decision}`
        );
      } else {
        // Add new vote
        vote.votes.push(voteCast as any);
        console.log(`🗳️  Vote cast by ${voter.displayName}: ${input.decision}`);
      }

      // Update weighted tallies
      vote.weightedTallies = this.calculateWeightedTallies(vote);

      // Save votes
      votesData.votes[voteIndex] = vote as any;
      this.saveVotes(votesData);

      return {
        success: true,
        vote,
        message: `Vote cast successfully by ${voter.displayName}`,
      };
    } catch (error) {
      console.error('Failed to cast vote:', error);
      return {
        success: false,
        error: `Failed to cast vote: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Close a vote and determine outcome
   */
  async closeVote(
    voteId: string,
    closedBy: string
  ): Promise<CouncilVoteResult> {
    try {
      // Validate closer is a council member
      const closer = getCouncilMember(closedBy);
      if (!closer) {
        return {
          success: false,
          error: `User '${closedBy}' is not an active council member`,
        };
      }

      // Load votes
      const votesData = this.loadVotes();
      const voteIndex = votesData.votes.findIndex((v) => v.voteId === voteId);

      if (voteIndex === -1) {
        return {
          success: false,
          error: `Vote '${voteId}' not found`,
        };
      }

      const vote = votesData.votes[voteIndex] as CouncilVote;

      // Check vote is still open
      if (vote.status !== 'open') {
        return {
          success: false,
          error: `Vote is already ${vote.status}`,
        };
      }

      // Calculate final tallies
      const tallies = this.calculateWeightedTallies(vote);

      // Null safety guard for TypeScript strict mode
      if (!tallies) {
        return {
          success: false,
          error: 'Failed to calculate vote tallies',
        };
      }

      vote.weightedTallies = tallies;

      // Check quorum
      const quorumMet = isQuorumMet(
        vote.voteType,
        tallies.approve + tallies.reject,
        tallies.abstain
      );

      // Determine outcome
      let result: 'approved' | 'rejected' | 'expired' | 'cancelled';
      let reason: string;

      if (!quorumMet) {
        result = 'rejected';
        reason = `Quorum not met: ${(tallies.participationRate * 100).toFixed(1)}% participation`;
      } else {
        const voteResult = isVoteApproved(
          vote.voteType,
          tallies.approve,
          tallies.reject,
          tallies.abstain
        );
        result = voteResult.approved ? 'approved' : 'rejected';
        reason = voteResult.reason;
      }

      // Update vote
      vote.status = 'closed';
      vote.closedAt = new Date().toISOString();
      vote.outcome = {
        result,
        reason,
        quorumMet,
        finalizedAt: new Date().toISOString(),
        finalizedBy: closer.$id,
      };
      vote.result = {
        approved: tallies.approve,
        rejected: tallies.reject,
        abstained: tallies.abstain,
        outcome:
          result === 'approved'
            ? 'approved'
            : result === 'rejected'
              ? 'rejected'
              : 'no-consensus',
      };

      // Save votes
      votesData.votes[voteIndex] = vote as any;
      this.saveVotes(votesData);

      console.log(`🗳️  Vote closed: ${voteId}`);
      console.log(`   Result: ${result}`);
      console.log(`   Reason: ${reason}`);

      return {
        success: true,
        vote,
        message: `Vote closed with result: ${result}. ${reason}`,
      };
    } catch (error) {
      console.error('Failed to close vote:', error);
      return {
        success: false,
        error: `Failed to close vote: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Get a specific vote by ID
   */
  async getVote(voteId: string): Promise<CouncilVote | null> {
    const votesData = this.loadVotes();
    const vote = votesData.votes.find((v) => v.voteId === voteId);
    return vote ? (vote as CouncilVote) : null;
  }

  /**
   * Get all council votes with optional filters
   */
  async getVotes(filters?: {
    status?: string;
    proposedBy?: string;
    decisionId?: string;
  }): Promise<CouncilVote[]> {
    const votesData = this.loadVotes();
    let votes = votesData.votes as CouncilVote[];

    if (filters) {
      if (filters.status) {
        votes = votes.filter((v) => v.status === filters.status);
      }
      if (filters.proposedBy) {
        const member = getCouncilMember(filters.proposedBy);
        if (member) {
          votes = votes.filter((v) => v.proposedBy === member.$id);
        }
      }
      if (filters.decisionId) {
        votes = votes.filter((v) => v.decisionId === filters.decisionId);
      }
    }

    return votes;
  }

  /**
   * Get pending votes requiring action from a specific member
   */
  async getPendingVotesForMember(userId: string): Promise<CouncilVote[]> {
    const member = getCouncilMember(userId);
    if (!member) {
      return [];
    }

    const openVotes = await this.getVotes({ status: 'open' });

    // Filter to votes where member hasn't voted yet
    return openVotes.filter((vote) => {
      const hasVoted = vote.votes.some((v: any) => v.voter === member.$id);
      return !hasVoted;
    });
  }

  /**
   * Check and close expired votes
   */
  async processExpiredVotes(): Promise<{
    expired: string[];
    errors: string[];
  }> {
    const expired: string[] = [];
    const errors: string[] = [];

    const openVotes = await this.getVotes({ status: 'open' });
    const now = new Date();

    for (const vote of openVotes) {
      if (new Date(vote.deadline) < now) {
        try {
          // Close with system as closer
          const result = await this.closeVote(vote.voteId, 'seppa');
          if (result.success) {
            expired.push(vote.voteId);
          } else {
            errors.push(`${vote.voteId}: ${result.error}`);
          }
        } catch (error) {
          errors.push(`${vote.voteId}: ${(error as Error).message}`);
        }
      }
    }

    if (expired.length > 0) {
      console.log(`🗳️  Processed ${expired.length} expired votes`);
    }

    return { expired, errors };
  }

  // ==========================================================================
  // Private Calculation Methods
  // ==========================================================================

  /**
   * Calculate weighted tallies for a vote
   */
  private calculateWeightedTallies(
    vote: CouncilVote
  ): NonNullable<CouncilVote['weightedTallies']> {
    let approve = 0;
    let reject = 0;
    let abstain = 0;

    for (const v of vote.votes as CouncilVoteCast[]) {
      const weight = v.weight || 1;
      switch (v.decision) {
        case 'approve':
          approve += weight;
          break;
        case 'reject':
          reject += weight;
          break;
        case 'abstain':
          abstain += weight;
          break;
      }
    }

    const totalWeight = getTotalVoteWeight();
    const participationRate = (approve + reject + abstain) / totalWeight;

    return {
      approve,
      reject,
      abstain,
      totalWeight,
      participationRate,
    };
  }

  /**
   * Determine impact level from category
   */
  private determineImpactLevel(
    category: string
  ): 'low' | 'medium' | 'high' | 'critical' {
    const lowCategories = [
      'documentation',
      'minor-refactor',
      'dependency-update',
    ];
    const mediumCategories = ['feature', 'api-change', 'schema-modification'];
    const highCategories = ['breaking-change', 'security', 'architecture'];
    const criticalCategories = [
      'core-architecture',
      'governance',
      'strategic-direction',
    ];

    if (criticalCategories.includes(category)) {
      return 'critical';
    }
    if (highCategories.includes(category)) {
      return 'high';
    }
    if (mediumCategories.includes(category)) {
      return 'medium';
    }
    if (lowCategories.includes(category)) {
      return 'low';
    }

    // Default to medium for unknown categories
    return 'medium';
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let councilVotingService: CouncilVotingService | null = null;

export function getCouncilVotingService(): CouncilVotingService {
  if (!councilVotingService) {
    councilVotingService = new CouncilVotingService();
  }
  return councilVotingService;
}

export function createCouncilVotingService(): CouncilVotingService {
  return new CouncilVotingService();
}
