/**
 * Governance Routes - DAO proposal and voting endpoints
 * Enables decentralized decision-making for projects
 */

import express, {
  Request,
  Response,
  NextFunction,
  Router,
  IRouter,
} from 'express';
import type { Pool } from 'pg';

// Import Express type augmentation
import '../../../../libs/shared/types/src/express.js';

import {
  asyncHandler,
  AppError,
  AuthorizationError,
  ValidationError,
} from '../../../../libs/shared/errors/src/error-handler.js';
import {
  validationRules,
  handleValidationErrors,
} from '../../../../libs/shared/security/src/security.middleware.js';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

export class GovernanceRoutes {
  private router: IRouter;
  private db: Pool;

  constructor(db: Pool) {
    this.router = express.Router();
    this.db = db;
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Get proposals for a project
    this.router.get(
      '/projects/:projectId/proposals',
      validationRules.uuid,
      handleValidationErrors,
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const userId = req.user?.id;
        const projectId = req.params['projectId'];
        const { status } = req.query;

        // Check if user has access to this project
        const accessQuery = `
          SELECT 1 FROM project_roles 
          WHERE user_id = $1 AND project_id = $2 AND is_active = true
        `;
        const accessResult = await this.db.query(accessQuery, [userId, projectId]);
        
        if (accessResult.rows.length === 0) {
          throw new AuthorizationError('Access denied to this project');
        }

        // Get proposals
        let proposalsQuery = `
          SELECT 
            p.id,
            p.title,
            p.description,
            p.proposal_type,
            p.status,
            p.required_votes,
            p.voting_deadline,
            p.created_at,
            u.id as proposer_id,
            u.full_name as proposer_name,
            u.role as proposer_role,
            COUNT(DISTINCT v.id) as total_votes,
            COUNT(DISTINCT CASE WHEN v.decision = 'approve' THEN v.id END) as votes_for,
            COUNT(DISTINCT CASE WHEN v.decision = 'reject' THEN v.id END) as votes_against,
            COUNT(DISTINCT CASE WHEN v.decision = 'abstain' THEN v.id END) as votes_abstain
          FROM proposals p
          LEFT JOIN users u ON p.proposer_id = u.id
          LEFT JOIN votes v ON p.id = v.proposal_id
          WHERE p.project_id = $1
        `;

        const queryParams: any[] = [projectId];
        if (status) {
          proposalsQuery += ` AND p.status = $2`;
          queryParams.push(status);
        }

        proposalsQuery += `
          GROUP BY p.id, u.id, u.full_name, u.role
          ORDER BY p.created_at DESC
        `;

        const result = await this.db.query(proposalsQuery, queryParams);

        const proposals = result.rows.map((row) => ({
          id: row.id,
          title: row.title,
          description: row.description,
          proposalType: row.proposal_type,
          status: row.status,
          proposer: {
            id: row.proposer_id,
            name: row.proposer_name,
            role: row.proposer_role,
          },
          votes: {
            for: parseInt(row.votes_for) || 0,
            against: parseInt(row.votes_against) || 0,
            abstain: parseInt(row.votes_abstain) || 0,
            total: parseInt(row.total_votes) || 0,
            required: row.required_votes,
          },
          deadline: row.voting_deadline,
          createdAt: row.created_at,
        }));

        res.json(proposals);
      })
    );

    // Create new proposal
    this.router.post(
      '/projects/:projectId/proposals',
      validationRules.uuid,
      handleValidationErrors,
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const userId = req.user?.id;
        const projectId = req.params['projectId'];
        const { title, description, proposalType, votingDays } = req.body as Record<string, any>;

        if (!req.user) {
          throw new ValidationError('User authentication required');
        }

        // Check if user is a member of this project
        const memberQuery = `
          SELECT role, voting_power FROM project_roles 
          WHERE user_id = $1 AND project_id = $2 AND is_active = true
        `;
        const memberResult = await this.db.query(memberQuery, [userId, projectId]);

        if (memberResult.rows.length === 0) {
          throw new AuthorizationError('Only project members can create proposals');
        }

        // Calculate voting deadline
        const daysToVote = votingDays || 7;
        const votingDeadline = new Date();
        votingDeadline.setDate(votingDeadline.getDate() + daysToVote);

        // Get total voting power in project to calculate required votes
        const votingPowerQuery = `
          SELECT SUM(voting_power) as total_power FROM project_roles
          WHERE project_id = $1 AND is_active = true
        `;
        const votingPowerResult = await this.db.query(votingPowerQuery, [projectId]);
        const totalPower = parseInt(votingPowerResult.rows[0].total_power) || 1;
        const requiredVotes = Math.ceil(totalPower * 0.5); // 50% majority

        // Create proposal
        const insertQuery = `
          INSERT INTO proposals (
            project_id, title, description, proposer_id, 
            proposal_type, status, required_votes, voting_deadline
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `;
        const result = await this.db.query(insertQuery, [
          projectId,
          title,
          description,
          userId,
          proposalType,
          'active',
          requiredVotes,
          votingDeadline,
        ]);

        const proposal = result.rows[0];

        logger.info('Proposal created', { proposalId: proposal.id, projectId, userId });

        res.status(201).json({
          id: proposal.id,
          title: proposal.title,
          description: proposal.description,
          proposalType: proposal.proposal_type,
          status: proposal.status,
          requiredVotes: proposal.required_votes,
          deadline: proposal.voting_deadline,
          createdAt: proposal.created_at,
        });
      })
    );

    // Get proposal details
    this.router.get(
      '/proposals/:id',
      validationRules.uuid,
      handleValidationErrors,
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const userId = req.user?.id;
        const proposalId = req.params['id'];

        // Get proposal with project access check
        const proposalQuery = `
          SELECT 
            p.*,
            u.id as proposer_id,
            u.full_name as proposer_name,
            u.role as proposer_role,
            pr.id as user_role_id
          FROM proposals p
          LEFT JOIN users u ON p.proposer_id = u.id
          LEFT JOIN project_roles pr ON p.project_id = pr.project_id 
            AND pr.user_id = $2 AND pr.is_active = true
          WHERE p.id = $1
        `;
        const result = await this.db.query(proposalQuery, [proposalId, userId]);

        if (result.rows.length === 0 || !result.rows[0].user_role_id) {
          throw new AppError('Proposal not found or access denied', 404);
        }

        const proposal = result.rows[0];

        // Get votes
        const votesQuery = `
          SELECT 
            v.id,
            v.decision,
            v.comment,
            v.weight,
            v.voted_at,
            u.id as voter_id,
            u.full_name as voter_name,
            u.role as voter_role
          FROM votes v
          LEFT JOIN users u ON v.voter_id = u.id
          WHERE v.proposal_id = $1
          ORDER BY v.voted_at DESC
        `;
        const votesResult = await this.db.query(votesQuery, [proposalId]);

        const votes = votesResult.rows.map((row) => ({
          id: row.id,
          voter: {
            id: row.voter_id,
            name: row.voter_name,
            role: row.voter_role,
          },
          decision: row.decision,
          comment: row.comment,
          weight: row.weight,
          timestamp: row.voted_at,
        }));

        // Calculate vote tallies
        const voteTally = {
          for: votes.filter((v) => v.decision === 'approve').reduce((sum, v) => sum + v.weight, 0),
          against: votes.filter((v) => v.decision === 'reject').reduce((sum, v) => sum + v.weight, 0),
          abstain: votes.filter((v) => v.decision === 'abstain').reduce((sum, v) => sum + v.weight, 0),
        };

        res.json({
          id: proposal.id,
          title: proposal.title,
          description: proposal.description,
          proposalType: proposal.proposal_type,
          status: proposal.status,
          proposer: {
            id: proposal.proposer_id,
            name: proposal.proposer_name,
            role: proposal.proposer_role,
          },
          votes: voteTally,
          requiredVotes: proposal.required_votes,
          deadline: proposal.voting_deadline,
          votesList: votes,
          createdAt: proposal.created_at,
        });
      })
    );

    // Cast vote on proposal
    this.router.post(
      '/proposals/:id/vote',
      validationRules.uuid,
      handleValidationErrors,
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const userId = req.user?.id;
        const proposalId = req.params['id'];
        const { decision, comment } = req.body as Record<string, any>;

        if (!req.user) {
          throw new ValidationError('User authentication required');
        }

        // Validate decision
        if (!['approve', 'reject', 'abstain'].includes(decision)) {
          throw new ValidationError('Invalid vote decision');
        }

        // Get proposal and check if user has access
        const proposalQuery = `
          SELECT p.id, p.project_id, p.status, p.voting_deadline,
                 pr.voting_power
          FROM proposals p
          LEFT JOIN project_roles pr ON p.project_id = pr.project_id 
            AND pr.user_id = $2 AND pr.is_active = true
          WHERE p.id = $1
        `;
        const proposalResult = await this.db.query(proposalQuery, [proposalId, userId]);

        if (proposalResult.rows.length === 0 || !proposalResult.rows[0].voting_power) {
          throw new AuthorizationError('Access denied or not a project member');
        }

        const proposal = proposalResult.rows[0];

        // Check if proposal is still active
        if (proposal.status !== 'active') {
          throw new ValidationError('Proposal is not active for voting');
        }

        // Check if voting deadline has passed
        if (new Date(proposal.voting_deadline) < new Date()) {
          throw new ValidationError('Voting deadline has passed');
        }

        // Check for existing vote
        const existingVoteQuery = `
          SELECT id FROM votes WHERE proposal_id = $1 AND voter_id = $2
        `;
        const existingVote = await this.db.query(existingVoteQuery, [proposalId, userId]);

        if (existingVote.rows.length > 0) {
          // Update existing vote
          const updateQuery = `
            UPDATE votes 
            SET decision = $1, comment = $2, voted_at = NOW()
            WHERE proposal_id = $3 AND voter_id = $4
            RETURNING *
          `;
          const result = await this.db.query(updateQuery, [decision, comment, proposalId, userId]);
          
          logger.info('Vote updated', { proposalId, userId, decision });
          
          res.json({
            message: 'Vote updated successfully',
            vote: result.rows[0],
          });
        } else {
          // Insert new vote
          const insertQuery = `
            INSERT INTO votes (proposal_id, voter_id, decision, comment, weight)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
          `;
          const result = await this.db.query(insertQuery, [
            proposalId,
            userId,
            decision,
            comment || null,
            proposal.voting_power,
          ]);

          logger.info('Vote cast', { proposalId, userId, decision });

          res.status(201).json({
            message: 'Vote cast successfully',
            vote: result.rows[0],
          });
        }
      })
    );

    // Update proposal status (for admins)
    this.router.put(
      '/proposals/:id/status',
      validationRules.uuid,
      handleValidationErrors,
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const userId = req.user?.id;
        const proposalId = req.params['id'];
        const { status } = req.body as Record<string, any>;

        // Validate status
        const validStatuses = ['draft', 'active', 'passed', 'rejected', 'expired'];
        if (!validStatuses.includes(status)) {
          throw new ValidationError('Invalid proposal status');
        }

        // Check if user has admin permissions for the project
        const adminQuery = `
          SELECT pr.permissions FROM proposals p
          LEFT JOIN project_roles pr ON p.project_id = pr.project_id 
            AND pr.user_id = $2 AND pr.is_active = true
          WHERE p.id = $1
        `;
        const adminResult = await this.db.query(adminQuery, [proposalId, userId]);

        if (
          adminResult.rows.length === 0 ||
          !adminResult.rows[0].permissions.includes('admin')
        ) {
          throw new AuthorizationError('Only project admins can update proposal status');
        }

        // Update proposal status
        const updateQuery = `
          UPDATE proposals 
          SET status = $1, updated_at = NOW()
          WHERE id = $2
          RETURNING *
        `;
        const result = await this.db.query(updateQuery, [status, proposalId]);

        if (result.rows.length === 0) {
          throw new AppError('Proposal not found', 404);
        }

        logger.info('Proposal status updated', { proposalId, status, userId });
        res.json(result.rows[0]);
      })
    );
  }

  getRouter(): IRouter {
    return this.router;
  }
}
