/**
 * Council Voting REST API Routes
 *
 * Enterprise API endpoints for Admin Council governance voting.
 * Integrates with CouncilVotingService for weighted voting and quorum validation.
 *
 * Endpoints:
 * - POST   /api/mcp/council/votes           - Create a new council vote
 * - GET    /api/mcp/council/votes           - List all council votes
 * - GET    /api/mcp/council/votes/:id       - Get specific vote details
 * - POST   /api/mcp/council/votes/:id/cast  - Cast a vote
 * - POST   /api/mcp/council/votes/:id/close - Close a vote
 * - GET    /api/mcp/council/members         - List council members
 * - GET    /api/mcp/council/pending/:userId - Get pending votes for member
 * - POST   /api/mcp/council/process-expired - Process expired votes
 *
 * @module routes/council-votes.routes
 */

import {
  Router,
  Request,
  Response,
  type Router as ExpressRouter,
} from 'express';
import {
  getCouncilVotingService,
  type CreateCouncilVoteInput,
  type CastCouncilVoteInput,
} from '../services/council-voting.service.js';
import {
  ADMIN_COUNCIL_CONFIG,
  getActiveCouncilMembers,
  getCouncilMember,
  getTotalVoteWeight,
  getQuorumConfig,
} from '../config/admin-council.config.js';

const router: ExpressRouter = Router();

// ============================================================================
// Council Member Endpoints
// ============================================================================

/**
 * GET /api/mcp/council/members
 *
 * List all council members with their authority and vote weights
 *
 * Response:
 * {
 *   "success": true,
 *   "council": {
 *     "name": "Ectropy Admin Council",
 *     "totalMembers": 2,
 *     "totalVoteWeight": 3
 *   },
 *   "members": [...]
 * }
 */
router.get('/members', async (req: Request, res: Response) => {
  try {
    const members = getActiveCouncilMembers();
    const totalWeight = getTotalVoteWeight();

    return res.json({
      success: true,
      council: {
        name: ADMIN_COUNCIL_CONFIG.councilName,
        description: ADMIN_COUNCIL_CONFIG.description,
        totalMembers: members.length,
        totalVoteWeight: totalWeight,
        defaultVotingPeriodHours: ADMIN_COUNCIL_CONFIG.defaultVotingPeriodHours,
        allowVoteChanges: ADMIN_COUNCIL_CONFIG.allowVoteChanges,
        requireRationale: ADMIN_COUNCIL_CONFIG.requireRationale,
      },
      members: members.map((m) => ({
        userId: m.userId,
        displayName: m.displayName,
        role: m.role,
        authorityLevel: m.authorityLevel,
        voteWeight: m.voteWeight,
        expertise: m.expertise,
        joinedAt: m.joinedAt,
      })),
      quorumConfigs: ADMIN_COUNCIL_CONFIG.quorumConfigs,
      voteTypeConfigs: ADMIN_COUNCIL_CONFIG.voteTypeConfigs,
    });
  } catch (error) {
    console.error('Error fetching council members:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch council members',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/mcp/council/members/:userId
 *
 * Get specific council member details
 */
router.get('/members/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const member = getCouncilMember(userId);

    if (!member) {
      return res.status(404).json({
        success: false,
        error: 'Council member not found',
        userId,
      });
    }

    return res.json({
      success: true,
      member: {
        ...member,
        // Don't expose email in public API
        email: undefined,
      },
    });
  } catch (error) {
    console.error('Error fetching council member:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch council member',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// Council Vote Endpoints
// ============================================================================

/**
 * POST /api/mcp/council/votes
 *
 * Create a new council vote
 *
 * Body:
 * {
 *   "title": "Approve V3 Schema Migration",
 *   "description": "Vote to approve the V3 graph schema migration...",
 *   "category": "architecture",
 *   "proposedBy": "erik",
 *   "decisionId": "d-2026-01-08-v3-migration" (optional),
 *   "voteType": "two-thirds-majority" (optional),
 *   "deadlineHours": 168 (optional)
 * }
 */
router.post('/votes', async (req: Request, res: Response) => {
  try {
    const input: CreateCouncilVoteInput = req.body;

    // Validate required fields
    if (!input.title || !input.description || !input.category || !input.proposedBy) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        required: ['title', 'description', 'category', 'proposedBy'],
      });
    }

    const service = getCouncilVotingService();
    const result = await service.createVote(input);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(201).json(result);
  } catch (error) {
    console.error('Error creating council vote:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create council vote',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/mcp/council/votes
 *
 * List all council votes with optional filters
 *
 * Query params:
 * - status: Filter by status (open, closed)
 * - proposedBy: Filter by proposer userId
 * - decisionId: Filter by related decision
 */
router.get('/votes', async (req: Request, res: Response) => {
  try {
    const { status, proposedBy, decisionId } = req.query;

    const service = getCouncilVotingService();
    const votes = await service.getVotes({
      status: status as string | undefined,
      proposedBy: proposedBy as string | undefined,
      decisionId: decisionId as string | undefined,
    });

    return res.json({
      success: true,
      count: votes.length,
      data: votes,
    });
  } catch (error) {
    console.error('Error fetching council votes:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch council votes',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/mcp/council/votes/:voteId
 *
 * Get specific vote details with full voting breakdown
 */
router.get('/votes/:voteId', async (req: Request, res: Response) => {
  try {
    const { voteId } = req.params;

    const service = getCouncilVotingService();
    const vote = await service.getVote(voteId);

    if (!vote) {
      return res.status(404).json({
        success: false,
        error: 'Vote not found',
        voteId,
      });
    }

    // Get quorum config for context
    const quorumConfig = getQuorumConfig(vote.voteType);

    return res.json({
      success: true,
      data: vote,
      context: {
        quorumConfig,
        totalCouncilWeight: getTotalVoteWeight(),
        isExpired: new Date(vote.deadline) < new Date(),
      },
    });
  } catch (error) {
    console.error('Error fetching council vote:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch council vote',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/mcp/council/votes/:voteId/cast
 *
 * Cast a vote on a council decision
 *
 * Body:
 * {
 *   "voterId": "erik",
 *   "decision": "approve",
 *   "rationale": "This aligns with our Q1 architecture goals..."
 * }
 */
router.post('/votes/:voteId/cast', async (req: Request, res: Response) => {
  try {
    const { voteId } = req.params;
    const { voterId, decision, rationale } = req.body;

    // Validate required fields
    if (!voterId || !decision) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        required: ['voterId', 'decision'],
      });
    }

    // Validate decision value
    if (!['approve', 'reject', 'abstain'].includes(decision)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid decision value',
        valid: ['approve', 'reject', 'abstain'],
      });
    }

    const input: CastCouncilVoteInput = {
      voteId,
      voterId,
      decision,
      rationale,
    };

    const service = getCouncilVotingService();
    const result = await service.castVote(input);

    if (!result.success) {
      const statusCode = result.error?.includes('not found') ? 404 : 400;
      return res.status(statusCode).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error('Error casting council vote:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to cast council vote',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/mcp/council/votes/:voteId/close
 *
 * Close a vote and determine outcome
 *
 * Body:
 * {
 *   "closedBy": "erik"
 * }
 */
router.post('/votes/:voteId/close', async (req: Request, res: Response) => {
  try {
    const { voteId } = req.params;
    const { closedBy } = req.body;

    // Validate required fields
    if (!closedBy) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: closedBy',
      });
    }

    const service = getCouncilVotingService();
    const result = await service.closeVote(voteId, closedBy);

    if (!result.success) {
      const statusCode = result.error?.includes('not found') ? 404 : 400;
      return res.status(statusCode).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error('Error closing council vote:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to close council vote',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// Council Action Endpoints
// ============================================================================

/**
 * GET /api/mcp/council/pending/:userId
 *
 * Get pending votes requiring action from a specific member
 */
router.get('/pending/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Validate user is a council member
    const member = getCouncilMember(userId);
    if (!member) {
      return res.status(404).json({
        success: false,
        error: 'Council member not found',
        userId,
      });
    }

    const service = getCouncilVotingService();
    const pendingVotes = await service.getPendingVotesForMember(userId);

    return res.json({
      success: true,
      member: {
        userId: member.userId,
        displayName: member.displayName,
      },
      pendingCount: pendingVotes.length,
      pendingVotes: pendingVotes.map((v) => ({
        voteId: v.voteId,
        title: v.title,
        category: v.category,
        voteType: v.voteType,
        deadline: v.deadline,
        isExpired: new Date(v.deadline) < new Date(),
        currentTallies: v.weightedTallies,
      })),
    });
  } catch (error) {
    console.error('Error fetching pending votes:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch pending votes',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/mcp/council/process-expired
 *
 * Process and close expired votes automatically
 *
 * This endpoint should be called periodically (e.g., by a cron job)
 * to ensure expired votes are properly closed.
 */
router.post('/process-expired', async (req: Request, res: Response) => {
  try {
    const service = getCouncilVotingService();
    const result = await service.processExpiredVotes();

    return res.json({
      success: true,
      processed: {
        expiredCount: result.expired.length,
        expiredVotes: result.expired,
        errors: result.errors,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error processing expired votes:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process expired votes',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/mcp/council/summary
 *
 * Get a summary of council voting activity
 */
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const service = getCouncilVotingService();
    const allVotes = await service.getVotes();

    const openVotes = allVotes.filter((v) => v.status === 'open');
    const closedVotes = allVotes.filter((v) => v.status === 'closed');
    const approvedVotes = closedVotes.filter((v) => v.outcome?.result === 'approved');
    const rejectedVotes = closedVotes.filter((v) => v.outcome?.result === 'rejected');

    return res.json({
      success: true,
      summary: {
        totalVotes: allVotes.length,
        openVotes: openVotes.length,
        closedVotes: closedVotes.length,
        approvedVotes: approvedVotes.length,
        rejectedVotes: rejectedVotes.length,
        approvalRate: closedVotes.length > 0
          ? `${(approvedVotes.length / closedVotes.length * 100).toFixed(1) }%`
          : 'N/A',
      },
      council: {
        name: ADMIN_COUNCIL_CONFIG.councilName,
        totalMembers: getActiveCouncilMembers().length,
        totalVoteWeight: getTotalVoteWeight(),
      },
      recentVotes: allVotes
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5)
        .map((v) => ({
          voteId: v.voteId,
          title: v.title,
          status: v.status,
          createdAt: v.createdAt,
          outcome: v.outcome?.result,
        })),
    });
  } catch (error) {
    console.error('Error fetching council summary:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch council summary',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
