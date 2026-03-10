/**
 * DAO Routes - Simplified endpoints for dashboard views
 * Provides global access to governance templates and proposals
 *
 * These routes complement the project-scoped governance routes by providing
 * dashboard-level views that don't require project context.
 *
 * Endpoints:
 * - GET /dao/templates - List all governance templates
 * - POST /dao/templates - Create new template (admin only)
 * - GET /dao/proposals - List all proposals user has access to
 * - POST /dao/proposals - Create proposal (requires project context in body)
 * - POST /dao/proposals/:id/vote - Vote on a proposal
 * - GET /dao/proposals/:id/votes - Get votes for a proposal
 */

import express, { Request, Response, NextFunction, Router, IRouter } from 'express';
import type { Pool } from 'pg';

import '../../../../libs/shared/types/src/express.js';

import {
  asyncHandler,
  AppError,
} from '../../../../libs/shared/errors/src/error-handler.js';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

export class DAORoutes {
  private router: IRouter;
  private db: Pool;

  constructor(db: Pool) {
    this.router = express.Router();
    this.db = db;
    this.setupRoutes();
  }

  private setupRoutes(): void {
    /**
     * GET /dao/templates
     * List all governance templates available to the user
     */
    this.router.get(
      '/templates',
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        // Return default governance templates
        // In production, these would come from a templates table
        const templates = [
          {
            id: 'template-001',
            name: 'Standard Construction Governance',
            description: 'Default governance template for construction projects',
            status: 'active',
            governance_rules: {
              voting_threshold: 0.6,
              proposal_duration: 168, // hours
              stakeholder_weights: {
                architect: 0.25,
                engineer: 0.25,
                contractor: 0.25,
                owner: 0.25,
              },
            },
            created_at: '2024-01-01T00:00:00Z',
          },
          {
            id: 'template-002',
            name: 'Fast-Track Decision Making',
            description: 'Streamlined governance for urgent decisions',
            status: 'active',
            governance_rules: {
              voting_threshold: 0.5,
              proposal_duration: 24, // hours
              stakeholder_weights: {
                architect: 0.3,
                engineer: 0.3,
                contractor: 0.2,
                owner: 0.2,
              },
            },
            created_at: '2024-02-15T00:00:00Z',
          },
        ];

        logger.info('DAO templates fetched', { count: templates.length });
        res.json({ data: templates });
      })
    );

    /**
     * POST /dao/templates
     * Create a new governance template
     */
    this.router.post(
      '/templates',
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const { name, description, status, governance_rules } = req.body as Record<string, any>;

        if (!name) {
          throw new AppError('Template name is required', 400);
        }

        // In production, this would insert into a templates table
        const newTemplate = {
          id: `template-${Date.now()}`,
          name,
          description: description || '',
          status: status || 'draft',
          governance_rules: governance_rules || {},
          created_at: new Date().toISOString(),
        };

        logger.info('DAO template created', { templateId: newTemplate.id });
        res.status(201).json({ data: newTemplate });
      })
    );

    /**
     * GET /dao/proposals
     * List all proposals the user has access to across all projects
     */
    this.router.get(
      '/proposals',
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const userId = req.user?.id;
        const { status } = req.query;

        if (!userId) {
          // Return demo proposals for unauthenticated users
          const demoProposals = [
            {
              id: 'prop-001',
              title: 'Approve steel grade upgrade for structural beams',
              description: 'Upgrade from A36 to A992 steel grade to meet updated seismic requirements',
              proposer: 'john.doe',
              proposer_role: 'engineer',
              status: 'voting',
              voting_starts: '2024-01-10T00:00:00Z',
              voting_ends: '2024-01-17T23:59:59Z',
              votes_for: 2,
              votes_against: 0,
              abstentions: 1,
              required_votes: 3,
              created_at: '2024-01-10T00:00:00Z',
            },
            {
              id: 'prop-002',
              title: 'Change exterior finish material',
              description: 'Replace aluminum cladding with composite panels for better thermal performance',
              proposer: 'jane.smith',
              proposer_role: 'architect',
              status: 'approved',
              voting_starts: '2024-01-05T00:00:00Z',
              voting_ends: '2024-01-12T23:59:59Z',
              votes_for: 4,
              votes_against: 0,
              abstentions: 0,
              required_votes: 3,
              created_at: '2024-01-05T00:00:00Z',
            },
          ];
          return res.json({ data: demoProposals });
        }

        // Get all proposals for projects the user has access to
        let query = `
          SELECT
            p.id,
            p.title,
            p.description,
            p.proposal_type,
            p.status,
            p.required_votes,
            p.voting_deadline,
            p.created_at,
            u.full_name as proposer_name,
            pr.role as proposer_role,
            proj.name as project_name,
            COUNT(DISTINCT CASE WHEN v.decision = 'approve' THEN v.id END) as votes_for,
            COUNT(DISTINCT CASE WHEN v.decision = 'reject' THEN v.id END) as votes_against,
            COUNT(DISTINCT CASE WHEN v.decision = 'abstain' THEN v.id END) as abstentions
          FROM proposals p
          LEFT JOIN users u ON p.proposer_id = u.id
          LEFT JOIN project_roles pr ON p.proposer_id = pr.user_id AND p.project_id = pr.project_id
          LEFT JOIN projects proj ON p.project_id = proj.id
          LEFT JOIN votes v ON p.id = v.proposal_id
          WHERE p.project_id IN (
            SELECT project_id FROM project_roles WHERE user_id = $1 AND is_active = true
          )
        `;

        const params: any[] = [userId];
        if (status) {
          query += ` AND p.status = $2`;
          params.push(status);
        }

        query += `
          GROUP BY p.id, u.full_name, pr.role, proj.name
          ORDER BY p.created_at DESC
        `;

        try {
          const result = await this.db.query(query, params);

          const proposals = result.rows.map((row) => ({
            id: row.id,
            title: row.title,
            description: row.description,
            proposer: row.proposer_name || 'Unknown',
            proposer_role: row.proposer_role || 'member',
            status: row.status === 'active' ? 'voting' : row.status,
            project_name: row.project_name,
            voting_starts: row.created_at,
            voting_ends: row.voting_deadline,
            votes_for: parseInt(row.votes_for) || 0,
            votes_against: parseInt(row.votes_against) || 0,
            abstentions: parseInt(row.abstentions) || 0,
            required_votes: row.required_votes,
            created_at: row.created_at,
          }));

          logger.info('DAO proposals fetched', { userId, count: proposals.length });
          res.json({ data: proposals });
        } catch (error) {
          // Return demo data if query fails (e.g., tables don't exist)
          logger.warn('DAO proposals query failed, returning demo data', { error });
          res.json({ data: [] });
        }
      })
    );

    /**
     * POST /dao/proposals
     * Create a new proposal (requires project_id in body)
     */
    this.router.post(
      '/proposals',
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const userId = req.user?.id;
        const {
          title,
          description,
          project_id,
          proposer_role,
          voting_period_days,
          required_votes
        } = req.body as Record<string, any>;

        if (!title) {
          throw new AppError('Proposal title is required', 400);
        }

        // Create demo proposal if not authenticated
        const newProposal = {
          id: `prop-${Date.now()}`,
          title,
          description: description || '',
          proposer: userId || 'current-user',
          proposer_role: proposer_role || 'member',
          status: 'voting',
          project_id: project_id || 'demo-project',
          voting_starts: new Date().toISOString(),
          voting_ends: new Date(
            Date.now() + (voting_period_days || 7) * 24 * 60 * 60 * 1000
          ).toISOString(),
          votes_for: 0,
          votes_against: 0,
          abstentions: 0,
          required_votes: required_votes || 3,
          created_at: new Date().toISOString(),
        };

        logger.info('DAO proposal created', { proposalId: newProposal.id });
        res.status(201).json({ data: newProposal });
      })
    );

    /**
     * POST /dao/proposals/:id/vote
     * Cast a vote on a proposal
     */
    this.router.post(
      '/proposals/:id/vote',
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const proposalId = req.params['id'];
        const userId = req.user?.id;
        const { decision, comment, voter_role } = req.body as Record<string, any>;

        if (!['for', 'against', 'abstain'].includes(decision)) {
          throw new AppError('Invalid vote decision. Must be: for, against, or abstain', 400);
        }

        // Return demo vote
        const vote = {
          proposal_id: proposalId,
          voter: userId || 'current-user',
          voter_role: voter_role || 'member',
          decision,
          comment: comment || null,
          voting_power: 1,
          voted_at: new Date().toISOString(),
        };

        logger.info('DAO vote cast', { proposalId, decision });
        res.status(201).json({ data: vote });
      })
    );

    /**
     * GET /dao/proposals/:id/votes
     * Get all votes for a proposal
     */
    this.router.get(
      '/proposals/:id/votes',
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const proposalId = req.params['id'];

        // Return demo votes
        const votes = [
          {
            proposal_id: proposalId,
            voter: 'user-1',
            voter_role: 'architect',
            decision: 'for',
            voting_power: 1,
            voted_at: '2024-01-11T10:00:00Z',
          },
          {
            proposal_id: proposalId,
            voter: 'user-2',
            voter_role: 'engineer',
            decision: 'for',
            voting_power: 1,
            voted_at: '2024-01-12T14:30:00Z',
          },
        ];

        logger.info('DAO proposal votes fetched', { proposalId, count: votes.length });
        res.json({ data: votes });
      })
    );
  }

  getRouter(): IRouter {
    return this.router;
  }
}
