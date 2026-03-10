/**
 * REST Endpoints for Voting System
 *
 * Provides voting workflow for decision approval:
 * - Create votes for decisions
 * - Cast individual votes
 * - Tally results and close votes
 * - Query vote status and history
 *
 * Uses enterprise DataSource abstraction for data access.
 * Supports both file-based and future database implementations.
 *
 * Milestone 4: Voting System MVP
 */

import {
  Router,
  Request,
  Response,
  type Router as ExpressRouter,
} from 'express';
import { createFileDataSource } from '../services/file-data-source.service.js';
import type { DataSource } from '../services/data-source.interface.js';

const router: ExpressRouter = Router();

// ============================================================================
// Data Source (Singleton Pattern)
// ============================================================================

// Create singleton DataSource instance
let dataSource: DataSource | null = null;

function getDataSource(): DataSource {
  if (!dataSource) {
    dataSource = createFileDataSource();
    console.log('📦 Votes API: DataSource initialized');
  }
  return dataSource;
}

/**
 * Helper to calculate vote tallies
 */
function calculateTallies(
  votes: any[],
  options: string[]
): Record<string, number> {
  const tallies: Record<string, number> = {};
  options.forEach((opt) => (tallies[opt] = 0));

  votes.forEach((v: any) => {
    const vote = v.decision; // Note: DataSource uses 'decision' not 'vote'
    if (tallies[vote] !== undefined) {
      tallies[vote] += 1; // Note: Weight not implemented in DataSource yet
    }
  });

  return tallies;
}

/**
 * Helper to determine vote result
 */
function determineResult(
  tallies: Record<string, number>,
  voteType: string,
  totalVoters: number,
  totalVotes: number
): string {
  const approveVotes = tallies['approve'] || 0;
  const rejectVotes = tallies['reject'] || 0;
  const abstainVotes = tallies['abstain'] || 0;

  const participationRate = totalVotes / totalVoters;

  switch (voteType) {
    case 'unanimous':
      return approveVotes === totalVoters ? 'approved' : 'rejected';

    case 'two-thirds-majority':
      return approveVotes >= (totalVotes * 2) / 3 ? 'approved' : 'rejected';

    case 'simple-majority':
    default:
      if (approveVotes > rejectVotes) {
        return 'approved';
      } else if (rejectVotes > approveVotes) {
        return 'rejected';
      } else {
        return 'tied';
      }
  }
}

// ============================================================================
// VOTE ENDPOINTS
// ============================================================================

/**
 * GET /api/mcp/votes
 *
 * List all votes with optional filters
 *
 * Query params:
 * - status: Filter by status (pending, open, closed, approved, rejected)
 * - decisionId: Filter by decision ID
 *
 * Examples:
 * - GET /api/mcp/votes
 * - GET /api/mcp/votes?status=open
 * - GET /api/mcp/votes?decisionId=d-2025-11-11-apollo-vs-neo4j
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, decisionId } = req.query;
    const ds = getDataSource();

    let votes = await ds.getVotes();

    // Apply filters
    if (status) {
      votes = votes.filter((v: any) => v.status === status);
    }

    if (decisionId) {
      votes = await ds.getVotesForDecision(decisionId as string);
    }

    return res.json({
      success: true,
      count: votes.length,
      data: votes,
    });
  } catch (error) {
    console.error('Error fetching votes:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch votes',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/mcp/votes
 *
 * Create a new vote for a decision
 *
 * Body:
 * {
 *   "decisionId": "d-2025-11-11-apollo-vs-neo4j",
 *   "createdAt": "2025-11-11T00:00:00Z",
 *   "closedAt": "2025-11-18T00:00:00Z",
 *   "votes": [],
 *   "result": null
 * }
 *
 * Note: Simplified API compared to original. DataSource handles ID generation.
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      decisionId,
      createdAt,
      closedAt,
    } = req.body;

    // Validation
    if (!decisionId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: decisionId',
      });
    }

    const ds = getDataSource();

    // Check if decision exists
    const decision = await ds.getDecision(decisionId);

    if (!decision) {
      return res.status(404).json({
        success: false,
        error: 'Decision not found',
        decisionId,
      });
    }

    // Create vote object (DataSource generates voteId)
    const vote = await ds.createVote({
      decisionId,
      status: 'open' as const,
      createdAt: createdAt || new Date().toISOString(),
      closedAt,
      votes: [],
      result: undefined,
    });

    return res.status(201).json({
      success: true,
      data: vote,
    });
  } catch (error) {
    console.error('Error creating vote:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create vote',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/mcp/votes/:voteId
 *
 * Get a specific vote with full details
 *
 * Example:
 * - GET /api/mcp/votes/vote-1731369600000-abc123
 */
router.get('/:voteId', async (req: Request, res: Response) => {
  try {
    const { voteId } = req.params;
    const ds = getDataSource();

    const vote = await ds.getVote(voteId);

    if (!vote) {
      return res.status(404).json({
        success: false,
        error: 'Vote not found',
        voteId,
      });
    }

    return res.json({
      success: true,
      data: vote,
    });
  } catch (error) {
    console.error('Error fetching vote:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch vote',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/mcp/votes/:voteId/cast
 *
 * Cast a vote
 *
 * Body:
 * {
 *   "voter": "user1",
 *   "decision": "approve",
 *   "comment": "Optional comment explaining the vote"
 * }
 *
 * Note: 'decision' field should be one of: 'approve', 'reject', 'abstain'
 */
router.post('/:voteId/cast', async (req: Request, res: Response) => {
  const { voteId } = req.params;

  try {
    const { voter, decision, comment } = req.body;

    // Validation
    if (!voter || !decision) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: voter, decision',
      });
    }

    // Validate decision value
    if (!['approve', 'reject', 'abstain'].includes(decision)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid decision value. Must be: approve, reject, or abstain',
      });
    }

    const ds = getDataSource();

    // Cast the vote (DataSource handles validation and tallying)
    const updatedVote = await ds.castVote(voteId, voter, decision, comment);

    return res.json({
      success: true,
      data: updatedVote,
      message: 'Vote cast successfully',
    });
  } catch (error) {
    console.error('Error casting vote:', error);

    // Check for specific error types
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Vote not found',
        voteId,
      });
    }

    if (errorMessage.includes('not open')) {
      return res.status(400).json({
        success: false,
        error: errorMessage,
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to cast vote',
      message: errorMessage,
    });
  }
});

/**
 * POST /api/mcp/votes/:voteId/close
 *
 * Close a vote and calculate final result
 *
 * Body: (optional)
 * {
 *   "closedBy": "admin",
 *   "finalNotes": "Optional closing notes"
 * }
 *
 * Note: DataSource handles tally calculation and result determination
 */
router.post('/:voteId/close', async (req: Request, res: Response) => {
  const { voteId } = req.params;

  try {
    const ds = getDataSource();

    // Close the vote (DataSource calculates tallies and determines result)
    const closedVote = await ds.closeVote(voteId);

    return res.json({
      success: true,
      data: closedVote,
      message: `Vote closed with result: ${closedVote.result?.outcome || 'unknown'}`,
    });
  } catch (error) {
    console.error('Error closing vote:', error);

    // Check for specific error types
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Vote not found',
        voteId,
      });
    }

    if (errorMessage.includes('not open')) {
      return res.status(400).json({
        success: false,
        error: errorMessage,
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to close vote',
      message: errorMessage,
    });
  }
});

export default router;
