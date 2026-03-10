/**
 * Project Routes - Project management endpoints
 * Extracted from enhanced-server.ts for better modularity
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
  AuthenticationError,
  AuthorizationError,
  ValidationError,
} from '../../../../libs/shared/errors/src/error-handler.js';
import {
  validationRules,
  handleValidationErrors,
} from '../../../../libs/shared/security/src/security.middleware.js';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

// Project data services for real dashboard data
import {
  getEngineeringTasks,
  getStructuralAlerts,
  getEngineeringStats,
  getConstructionTasks,
  getCrewMembers,
  getContractorStats,
  getBudgetItems,
  getBudgetSummary,
  getActivities,
} from '../services/project-data.service.js';
export class ProjectRoutes {
  private router: IRouter;
  private db: Pool;
  constructor(db: Pool) {
    this.router = express.Router();
    this.db = db;
    this.setupRoutes();
  }
  private setupRoutes(): void {
    // Get projects list with pagination
    this.router.get(
      '/projects',
      asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        // PHASE 3 FIX: Use AuthenticationError (401) instead of AuthorizationError (403)
        // ROOT CAUSE: Wrong error class used for authentication failures
        // SOLUTION: AuthenticationError returns HTTP 401 (Unauthorized) per RFC 9110
        if (!req.user) {
          throw new AuthenticationError('Authentication required');
        }
        const userId = req.user.id;

        // Enterprise pagination with validation
        const page = Math.max(1, parseInt(String(req.query.page || '1')));
        const pageSize = Math.min(
          100,
          Math.max(1, parseInt(String(req.query.pageSize || '20')))
        );
        const offset = (page - 1) * pageSize;

        // Get total count for pagination metadata
        const countQuery = `
          SELECT COUNT(DISTINCT p.id) as total
          FROM projects p
          LEFT JOIN project_roles pr ON p.id = pr.project_id AND pr.user_id = $1
          WHERE pr.is_active = true
        `;
        const countResult = await this.db.query(countQuery, [userId]);
        const totalCount = parseInt(countResult.rows[0]?.total || '0');

        // Get paginated projects - uses status and created_at indexes
        // Column mapping: total_budget (not budget), expected_completion (not end_date)
        // Note: location column does not exist in main Prisma schema
        const projectsQuery = `
          SELECT
            p.id,
            p.name,
            p.description,
            p.status,
            p.total_budget,
            p.start_date,
            p.expected_completion,
            p.created_at,
            p.updated_at,
            pr.role,
            pr.permissions,
            pr.voting_power,
            COUNT(ce.id) as element_count,
            COALESCE(
              ROUND(
                (COUNT(ce.id) FILTER (WHERE ce.status = 'completed') * 100.0)
                / NULLIF(COUNT(ce.id), 0)
              ), 0
            ) as progress
          FROM projects p
          LEFT JOIN project_roles pr ON p.id = pr.project_id AND pr.user_id = $1
          LEFT JOIN construction_elements ce ON p.id = ce.project_id
          WHERE pr.is_active = true
          GROUP BY p.id, pr.role, pr.permissions, pr.voting_power
          ORDER BY p.updated_at DESC
          LIMIT $2 OFFSET $3
        `;
        const result = await this.db.query(projectsQuery, [
          userId,
          pageSize,
          offset,
        ]);

        const projects = result.rows.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description,
          status: row.status,
          progress: Math.floor(Math.random() * 100),
          budget: row.total_budget ? parseFloat(row.total_budget) : null,
          startDate: row.start_date,
          endDate: row.expected_completion,
          elementCount: parseInt(row.element_count) || 0,
          userRole: row.role,
          permissions: row.permissions || [],
          votingPower: row.voting_power || 0,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }));

        // Return projects with pagination metadata
        res.json({
          data: projects,
          pagination: {
            page,
            pageSize,
            totalCount,
            totalPages: Math.ceil(totalCount / pageSize),
            hasNextPage: page * pageSize < totalCount,
            hasPreviousPage: page > 1,
          },
        });
      })
    );

    // Get project details
    this.router.get(
      '/projects/:id',
      validationRules.uuid,
      handleValidationErrors,
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const userId = req.user?.id;
        const projectId = req.params['id'];
        const projectQuery = `
            SELECT p.*, pr.role, pr.permissions, pr.voting_power
            FROM projects p
            JOIN project_roles pr ON p.id = pr.project_id
            WHERE p.id = $2 AND pr.user_id = $1 AND pr.is_active = true
          `;
        const result = await this.db.query(projectQuery, [userId, projectId]);
        if (result.rows.length === 0) {
          throw new AppError('Project not found or access denied', 404);
        }
        const row = result.rows[0];
        const activityQuery = `
            SELECT
              al.action,
              al.entity_type,
              al.timestamp,
              u.full_name as user_name
            FROM audit_log al
            LEFT JOIN users u ON al.user_id = u.id
            WHERE al.project_id = $1
            ORDER BY al.timestamp DESC
            LIMIT 10
          `;
        const activityResult = await this.db.query(activityQuery, [projectId]);
        const project = {
          ...row,
          recentActivity: activityResult.rows.map((a) => ({
            action: a.action,
            entityType: a.entity_type,
            timestamp: a.timestamp,
            user: a.user_name,
          })),
        };
        res.json(project);
      })
    );

    // Get my role for a specific project
    // PHASE 1: Role Switcher Removal (2026-02-09)
    // Returns project-specific role for authenticated user
    this.router.get(
      '/projects/:projectId/my-role',
      validationRules.uuid,
      handleValidationErrors,
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        if (!req.user) {
          throw new AuthenticationError('Authentication required');
        }

        const userId = req.user.id;
        const projectId = req.params['projectId'];

        // Query project_roles table for user's role on this project
        const roleQuery = `
          SELECT
            role,
            permissions,
            voting_power,
            project_id,
            assigned_at
          FROM project_roles
          WHERE user_id = $1 AND project_id = $2 AND is_active = true
        `;

        const result = await this.db.query(roleQuery, [userId, projectId]);

        if (result.rows.length === 0) {
          throw new AuthorizationError('User not assigned to this project');
        }

        const row = result.rows[0];
        const response = {
          role: row.role,
          permissions: row.permissions || [],
          votingPower: row.voting_power,
          projectId: row.project_id,
          assignedAt: row.assigned_at,
        };

        res.json(response);
      })
    );

    // Create project
    this.router.post(
      '/projects',
      validationRules.projectName,
      handleValidationErrors,
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const userId = req.user?.id;
        if (!req.user) {
          throw new ValidationError('User authentication required');
        }
        const { name, description, budget, startDate, endDate } =
          req.body as Record<string, any>;
        const userRole = req.user.role;
        // Only owners, admins and professional roles can create projects
        const allowedRoles = [
          'owner',
          'architect',
          'engineer',
          'contractor',
          'admin',
        ];
        if (!userRole || !allowedRoles.includes(userRole)) {
          throw new AuthorizationError(
            'Insufficient permissions to create projects'
          );
        }

        // Multi-tenant: Extract tenant_id from session (platform admins can override via body)
        const tenantId = req.user?.tenant_id || req.body.tenant_id;
        if (!tenantId) {
          throw new ValidationError(
            'Tenant context required to create a project. Platform admins must specify tenant_id in request body.'
          );
        }

        // Column names match Prisma schema: total_budget, expected_completion
        const insertQuery = `
            INSERT INTO projects (name, description, total_budget, start_date, expected_completion, owner_id, tenant_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, name, description, status, total_budget, start_date, expected_completion, created_at, updated_at
          `;
        const result = await this.db.query(insertQuery, [
          name,
          description || null,
          budget || null,
          startDate || null,
          endDate || null,
          userId,
          tenantId,
        ]);
        const project = result.rows[0];
        // Assign owner role to creator
        const roleQuery = `
            INSERT INTO project_roles (user_id, project_id, role, permissions, is_active, voting_power)
            VALUES ($1, $2, 'owner', ARRAY['read','write','admin'], true, 1)
          `;
        await this.db.query(roleQuery, [userId, project.id]);
        logger.info('Project created', { projectId: project.id, userId });
        res.status(201).json({
          id: project.id,
          name: project.name,
          description: project.description,
          status: project.status,
          budget: project.total_budget ? parseFloat(project.total_budget) : null,
          startDate: project.start_date,
          endDate: project.expected_completion,
          userRole: 'owner',
          permissions: ['read', 'write', 'admin'],
          votingPower: 1,
          elementCount: 0,
          created_at: project.created_at,
          updated_at: project.updated_at,
        });
      })
    );

    // Update project
    this.router.put(
      '/projects/:id',
      validationRules.uuid,
      handleValidationErrors,
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const userId = req.user?.id;
        const projectId = req.params['id'];
        const {
          name,
          description,
          budget,
          startDate,
          endDate,
          status,
        } = req.body as Record<string, any>;
        // Check if user has admin permissions for this project
        const permissionQuery = `
            SELECT permissions FROM project_roles
            WHERE user_id = $1 AND project_id = $2 AND is_active = true
          `;
        const permissionResult = await this.db.query(permissionQuery, [
          userId,
          projectId,
        ]);
        if (
          permissionResult.rows.length === 0 ||
          !permissionResult.rows[0].permissions.includes('admin')
        ) {
          throw new AuthorizationError(
            'Insufficient permissions to update project'
          );
        }
        // Column names match Prisma schema: total_budget, expected_completion
        const updateQuery = `
            UPDATE projects
            SET name = $1, description = $2, total_budget = $3,
                start_date = $4, expected_completion = $5, status = $6, updated_at = NOW()
            WHERE id = $7
            RETURNING id, name, description, status, total_budget, start_date, expected_completion, updated_at
          `;
        const result = await this.db.query(updateQuery, [
          name,
          description,
          budget,
          startDate,
          endDate,
          status || 'active',
          projectId,
        ]);
        if (result.rows.length === 0) {
          throw new AppError('Project not found', 404);
        }
        logger.info('Project updated', { projectId, userId });
        res.json(result.rows[0]);
      })
    );
    // Delete project
    this.router.delete(
      '/projects/:id',
      validationRules.uuid,
      handleValidationErrors,
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const userId = req.user?.id;
        const projectId = req.params['id'];
        // Check if user is project owner or admin
        const ownerQuery = `
            SELECT role FROM project_roles
            WHERE user_id = $1 AND project_id = $2 AND is_active = true
          `;
        const ownerResult = await this.db.query(ownerQuery, [
          userId,
          projectId,
        ]);
        if (
          ownerResult.rows.length === 0 ||
          !['owner', 'admin'].includes(ownerResult.rows[0].role)
        ) {
          throw new AuthorizationError(
            'Only project owners can delete projects'
          );
        }
        // Soft delete project
        const deleteQuery = `
            UPDATE projects
            SET status = 'deleted', updated_at = NOW()
            WHERE id = $1
          `;
        await this.db.query(deleteQuery, [projectId]);
        logger.info('Project deleted', { projectId, userId });
        res.status(204).send('');
      })
    );

    // Get project members
    this.router.get(
      '/projects/:id/members',
      validationRules.uuid,
      handleValidationErrors,
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const userId = req.user?.id;
        const projectId = req.params['id'];

        // Check if user has access to this project
        const accessQuery = `
          SELECT 1 FROM project_roles
          WHERE user_id = $1 AND project_id = $2 AND is_active = true
        `;
        const accessResult = await this.db.query(accessQuery, [
          userId,
          projectId,
        ]);

        if (accessResult.rows.length === 0) {
          throw new AuthorizationError('Access denied to this project');
        }

        // Get all project members
        const membersQuery = `
          SELECT
            u.id,
            u.email,
            u.full_name,
            u.picture,
            u.company,
            pr.role,
            pr.permissions,
            pr.voting_power,
            pr.assigned_at
          FROM project_roles pr
          JOIN users u ON pr.user_id = u.id
          WHERE pr.project_id = $1 AND pr.is_active = true
          ORDER BY pr.assigned_at ASC
        `;
        const result = await this.db.query(membersQuery, [projectId]);

        const members = result.rows.map((row) => ({
          id: row.id,
          email: row.email,
          name: row.full_name,
          avatar: row.picture,
          organization: row.company,
          role: row.role,
          permissions: row.permissions,
          votingPower: row.voting_power,
          joinedAt: row.assigned_at,
        }));

        res.json(members);
      })
    );

    // Add project member
    this.router.post(
      '/projects/:id/members',
      validationRules.uuid,
      handleValidationErrors,
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const userId = req.user?.id;
        const projectId = req.params['id'];
        const { email, role, permissions, votingPower } = req.body as Record<
          string,
          any
        >;

        // Check if user has admin permissions for this project
        const adminQuery = `
          SELECT permissions FROM project_roles
          WHERE user_id = $1 AND project_id = $2 AND is_active = true
        `;
        const adminResult = await this.db.query(adminQuery, [
          userId,
          projectId,
        ]);

        if (
          adminResult.rows.length === 0 ||
          !adminResult.rows[0].permissions.includes('admin')
        ) {
          throw new AuthorizationError('Only project admins can add members');
        }

        // Find user by email
        const userQuery = `SELECT id FROM users WHERE email = $1`;
        const userResult = await this.db.query(userQuery, [email]);

        if (userResult.rows.length === 0) {
          throw new ValidationError('User not found with this email');
        }

        const newUserId = userResult.rows[0].id;

        // Check if user is already a member
        const existingQuery = `
          SELECT id FROM project_roles
          WHERE user_id = $1 AND project_id = $2
        `;
        const existingResult = await this.db.query(existingQuery, [
          newUserId,
          projectId,
        ]);

        if (existingResult.rows.length > 0) {
          throw new ValidationError('User is already a member of this project');
        }

        // Add user to project
        const insertQuery = `
          INSERT INTO project_roles (user_id, project_id, role, permissions, voting_power, is_active)
          VALUES ($1, $2, $3, $4, $5, true)
          RETURNING *
        `;
        const insertResult = await this.db.query(insertQuery, [
          newUserId,
          projectId,
          role || 'contractor',
          permissions || ['read'],
          votingPower || 0,
        ]);

        logger.info('Project member added', { projectId, newUserId, role });

        // Return user details
        const memberQuery = `
          SELECT
            u.id, u.email, u.full_name, u.picture, u.company,
            pr.role, pr.permissions, pr.voting_power, pr.assigned_at
          FROM project_roles pr
          JOIN users u ON pr.user_id = u.id
          WHERE pr.id = $1
        `;
        const memberResult = await this.db.query(memberQuery, [
          insertResult.rows[0].id,
        ]);
        const member = memberResult.rows[0];

        res.status(201).json({
          id: member.id,
          email: member.email,
          name: member.full_name,
          avatar: member.picture,
          organization: member.company,
          role: member.role,
          permissions: member.permissions,
          votingPower: member.voting_power,
          joinedAt: member.assigned_at,
        });
      })
    );

    // Update project member role
    this.router.put(
      '/projects/:id/members/:memberId',
      validationRules.uuid,
      handleValidationErrors,
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const userId = req.user?.id;
        const projectId = req.params['id'];
        const memberId = req.params['memberId'];
        const { role, permissions, votingPower } = req.body as Record<
          string,
          any
        >;

        // Check if user has admin permissions
        const adminQuery = `
          SELECT permissions FROM project_roles
          WHERE user_id = $1 AND project_id = $2 AND is_active = true
        `;
        const adminResult = await this.db.query(adminQuery, [
          userId,
          projectId,
        ]);

        if (
          adminResult.rows.length === 0 ||
          !adminResult.rows[0].permissions.includes('admin')
        ) {
          throw new AuthorizationError(
            'Only project admins can update member roles'
          );
        }

        // Update member role
        const updateQuery = `
          UPDATE project_roles
          SET role = $1, permissions = $2, voting_power = $3
          WHERE user_id = $4 AND project_id = $5
          RETURNING *
        `;
        const updateResult = await this.db.query(updateQuery, [
          role,
          permissions,
          votingPower,
          memberId,
          projectId,
        ]);

        if (updateResult.rows.length === 0) {
          throw new AppError('Member not found', 404);
        }

        logger.info('Project member updated', { projectId, memberId, role });
        res.json(updateResult.rows[0]);
      })
    );

    // Remove project member
    this.router.delete(
      '/projects/:id/members/:memberId',
      validationRules.uuid,
      handleValidationErrors,
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const userId = req.user?.id;
        const projectId = req.params['id'];
        const memberId = req.params['memberId'];

        // Check if user has admin permissions
        const adminQuery = `
          SELECT permissions FROM project_roles
          WHERE user_id = $1 AND project_id = $2 AND is_active = true
        `;
        const adminResult = await this.db.query(adminQuery, [
          userId,
          projectId,
        ]);

        if (
          adminResult.rows.length === 0 ||
          !adminResult.rows[0].permissions.includes('admin')
        ) {
          throw new AuthorizationError(
            'Only project admins can remove members'
          );
        }

        // Prevent removing the last owner
        const ownerCountQuery = `
          SELECT COUNT(*) as count FROM project_roles
          WHERE project_id = $1 AND role = 'owner' AND is_active = true
        `;
        const ownerCountResult = await this.db.query(ownerCountQuery, [
          projectId,
        ]);

        const memberRoleQuery = `
          SELECT role FROM project_roles
          WHERE user_id = $1 AND project_id = $2 AND is_active = true
        `;
        const memberRoleResult = await this.db.query(memberRoleQuery, [
          memberId,
          projectId,
        ]);

        if (
          memberRoleResult.rows.length > 0 &&
          memberRoleResult.rows[0].role === 'owner' &&
          parseInt(ownerCountResult.rows[0].count) <= 1
        ) {
          throw new ValidationError(
            'Cannot remove the last owner from the project'
          );
        }

        // Remove member (soft delete)
        const deleteQuery = `
          UPDATE project_roles
          SET is_active = false
          WHERE user_id = $1 AND project_id = $2
        `;
        await this.db.query(deleteQuery, [memberId, projectId]);

        logger.info('Project member removed', { projectId, memberId });
        res.status(204).send('');
      })
    );

    // ========================================================================
    // PROJECT DATA ENDPOINTS (Real data for dashboards)
    // ========================================================================

    // GET /projects/:id/tasks - Engineering tasks from PMDecision
    this.router.get(
      '/projects/:id/tasks',
      validationRules.uuid,
      handleValidationErrors,
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const userId = req.user?.id;
        const projectId = req.params['id'];

        // Check project access
        await this.checkProjectAccess(userId, projectId);

        const [tasks, stats] = await Promise.all([
          getEngineeringTasks(projectId),
          getEngineeringStats(projectId),
        ]);

        res.json({
          tasks,
          stats,
        });
      })
    );

    // GET /projects/:id/alerts - Structural alerts from VoxelAlert
    this.router.get(
      '/projects/:id/alerts',
      validationRules.uuid,
      handleValidationErrors,
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const userId = req.user?.id;
        const projectId = req.params['id'];

        await this.checkProjectAccess(userId, projectId);

        const alerts = await getStructuralAlerts(projectId);

        res.json({
          alerts,
          count: alerts.length,
        });
      })
    );

    // GET /projects/:id/construction-tasks - Construction tasks from Voxel
    this.router.get(
      '/projects/:id/construction-tasks',
      validationRules.uuid,
      handleValidationErrors,
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const userId = req.user?.id;
        const projectId = req.params['id'];

        await this.checkProjectAccess(userId, projectId);

        const [tasks, stats] = await Promise.all([
          getConstructionTasks(projectId),
          getContractorStats(projectId),
        ]);

        res.json({
          tasks,
          stats,
        });
      })
    );

    // GET /projects/:id/crew - Crew members from Participant
    this.router.get(
      '/projects/:id/crew',
      validationRules.uuid,
      handleValidationErrors,
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const userId = req.user?.id;
        const projectId = req.params['id'];

        await this.checkProjectAccess(userId, projectId);

        const crew = await getCrewMembers(projectId);

        res.json({
          crew,
          count: crew.length,
          activeCount: crew.filter((c) => c.status === 'active').length,
        });
      })
    );

    // GET /projects/:id/budget - Budget items from Voxel aggregation
    this.router.get(
      '/projects/:id/budget',
      validationRules.uuid,
      handleValidationErrors,
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const userId = req.user?.id;
        const projectId = req.params['id'];

        await this.checkProjectAccess(userId, projectId);

        const [items, summary] = await Promise.all([
          getBudgetItems(projectId),
          getBudgetSummary(projectId),
        ]);

        res.json({
          items,
          summary,
        });
      })
    );

    // GET /projects/:id/activities - Activity feed from AuditLog
    this.router.get(
      '/projects/:id/activities',
      validationRules.uuid,
      handleValidationErrors,
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const userId = req.user?.id;
        const projectId = req.params['id'];
        const limit = Math.min(50, parseInt(String(req.query.limit || '10')));

        await this.checkProjectAccess(userId, projectId);

        const activities = await getActivities(projectId, limit);

        res.json({
          activities,
          count: activities.length,
        });
      })
    );
  }

  /**
   * Helper to check project access for a user
   */
  private async checkProjectAccess(
    userId: string | undefined,
    projectId: string
  ): Promise<void> {
    if (!userId) {
      throw new AuthenticationError('Authentication required');
    }

    const accessQuery = `
      SELECT 1 FROM project_roles
      WHERE user_id = $1 AND project_id = $2 AND is_active = true
    `;
    const accessResult = await this.db.query(accessQuery, [userId, projectId]);

    if (accessResult.rows.length === 0) {
      throw new AuthorizationError('Access denied to this project');
    }
  }

  getRouter(): IRouter {
    return this.router;
  }
}
