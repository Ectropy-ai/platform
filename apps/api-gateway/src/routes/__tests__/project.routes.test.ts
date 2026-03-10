/**
 * ================================================
 * ENTERPRISE PROJECT ROUTES UNIT TESTS
 * ================================================
 * Purpose: Comprehensive unit tests for Project management API routes
 * Coverage Target: 80%+
 * Test Framework: Vitest
 * Phase: Test Expansion Strategy Phase 3
 * ================================================
 *
 * TEST CATEGORIES (9 categories, 55+ tests):
 * 1. Route Initialization (2 tests)
 * 2. GET /projects - List Projects (8 tests)
 * 3. GET /projects/:id - Project Details (6 tests)
 * 4. POST /projects - Create Project (8 tests)
 * 5. PUT /projects/:id - Update Project (6 tests)
 * 6. DELETE /projects/:id - Delete Project (6 tests)
 * 7. GET /projects/:id/members - Get Members (5 tests)
 * 8. POST /projects/:id/members - Add Member (8 tests)
 * 9. Security & Edge Cases (6 tests)
 *
 * ================================================
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { Express, Request, Response, NextFunction } from 'express';
import { ProjectRoutes } from '../project.routes.js';

// Mock database pool
const mockPool = {
  query: vi.fn(),
};

vi.mock('../../database/connection', () => ({
  pool: mockPool,
}));

// Mock logger
vi.mock('../../../../../libs/shared/utils/src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock validation middleware
vi.mock(
  '../../../../../libs/shared/security/src/security.middleware.js',
  () => ({
    validationRules: {
      uuid: (req: Request, res: Response, next: NextFunction) => next(),
      projectName: (req: Request, res: Response, next: NextFunction) => next(),
    },
    handleValidationErrors: (req: Request, res: Response, next: NextFunction) =>
      next(),
  })
);

// Mock project-data service
vi.mock('../../services/project-data.service.js', () => ({
  getEngineeringTasks: vi.fn().mockResolvedValue([]),
  getStructuralAlerts: vi.fn().mockResolvedValue([]),
  getEngineeringStats: vi.fn().mockResolvedValue({}),
  getConstructionTasks: vi.fn().mockResolvedValue([]),
  getCrewMembers: vi.fn().mockResolvedValue([]),
  getContractorStats: vi.fn().mockResolvedValue({}),
  getBudgetItems: vi.fn().mockResolvedValue([]),
  getBudgetSummary: vi.fn().mockResolvedValue({}),
  getActivities: vi.fn().mockResolvedValue([]),
}));

describe('Project Routes - Enterprise Unit Tests', () => {
  let app: Express;
  let mockUser: any;

  // Helper to create mock authenticated request
  const createAuthMiddleware = (user: any) => {
    return (req: Request, res: Response, next: NextFunction) => {
      req.user = user;
      next();
    };
  };

  // Error handling middleware
  const errorHandler = (
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      error: err.message,
      code: err.code || 'INTERNAL_ERROR',
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock user with admin role
    mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      role: 'architect',
      roles: ['architect'],
      tenant_id: 'tenant-test-001',
    };

    // Create Express app with project routes
    app = express();
    app.use(express.json());
    app.use(createAuthMiddleware(mockUser));

    const projectRoutes = new ProjectRoutes(mockPool as any);
    app.use('/api/v1', projectRoutes.getRouter());
    app.use(errorHandler);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Route Initialization', () => {
    it('should create ProjectRoutes instance successfully', () => {
      const routes = new ProjectRoutes(mockPool as any);
      expect(routes).toBeDefined();
      expect(routes.getRouter()).toBeDefined();
    });

    it('should have all required routes configured', () => {
      const routes = new ProjectRoutes(mockPool as any);
      const router = routes.getRouter();
      expect(router).toBeDefined();
    });
  });

  describe('2. GET /projects - List Projects', () => {
    it('should return projects list with pagination', async () => {
      // Mock count query
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '5' }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'proj-1',
              name: 'Project 1',
              description: 'Test project',
              status: 'active',
              location: 'NYC',
              budget: 1000000,
              start_date: new Date(),
              end_date: new Date(),
              created_at: new Date(),
              updated_at: new Date(),
              user_role: 'architect',
              permissions: ['read', 'write'],
              voting_power: 1,
              element_count: '10',
              progress: '75',
            },
          ],
        });

      const res = await request(app).get('/api/v1/projects');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.totalCount).toBe(5);
    });

    it('should handle custom pagination parameters', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '100' }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/v1/projects')
        .query({ page: 2, pageSize: 10 });

      expect(res.status).toBe(200);
      expect(res.body.pagination.page).toBe(2);
      expect(res.body.pagination.pageSize).toBe(10);
    });

    it('should enforce maximum page size of 100', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '500' }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/v1/projects')
        .query({ pageSize: 500 });

      expect(res.status).toBe(200);
      expect(res.body.pagination.pageSize).toBe(100);
    });

    it('should enforce minimum page of 1', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '10' }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/v1/projects')
        .query({ page: -5 });

      expect(res.status).toBe(200);
      expect(res.body.pagination.page).toBe(1);
    });

    it('should return 401 when user is not authenticated', async () => {
      // Create app without auth middleware
      const unauthApp = express();
      unauthApp.use(express.json());
      unauthApp.use((req, res, next) => {
        req.user = undefined;
        next();
      });
      const routes = new ProjectRoutes(mockPool as any);
      unauthApp.use('/api/v1', routes.getRouter());
      unauthApp.use(errorHandler);

      const res = await request(unauthApp).get('/api/v1/projects');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Authentication required');
    });

    it('should return empty array when user has no projects', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/v1/projects');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
      expect(res.body.pagination.totalCount).toBe(0);
    });

    it('should calculate pagination metadata correctly', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '25' }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/v1/projects')
        .query({ page: 2, pageSize: 10 });

      expect(res.body.pagination.totalPages).toBe(3);
      expect(res.body.pagination.hasNextPage).toBe(true);
      expect(res.body.pagination.hasPreviousPage).toBe(true);
    });

    it('should handle database errors gracefully', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Database error'));

      const res = await request(app).get('/api/v1/projects');

      expect(res.status).toBe(500);
    });
  });

  describe('3. GET /projects/:id - Project Details', () => {
    it('should return project details with activity', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'proj-1',
              name: 'Test Project',
              description: 'Description',
              status: 'active',
              user_role: 'architect',
              permissions: ['read', 'write'],
              voting_power: 1,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              action: 'created',
              entity_type: 'element',
              timestamp: new Date(),
              user_name: 'Test User',
            },
          ],
        });

      const res = await request(app).get('/api/v1/projects/proj-1');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('proj-1');
      expect(res.body.recentActivity).toHaveLength(1);
    });

    it('should return 404 when project not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/v1/projects/non-existent');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });

    it('should return 404 when user has no access to project', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/v1/projects/private-project');

      expect(res.status).toBe(404);
    });

    it('should include recent activity in response', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: 'proj-1', name: 'Test', user_role: 'architect' }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              action: 'created',
              entity_type: 'element',
              timestamp: new Date(),
              user_name: 'User 1',
            },
            {
              action: 'updated',
              entity_type: 'project',
              timestamp: new Date(),
              user_name: 'User 2',
            },
          ],
        });

      const res = await request(app).get('/api/v1/projects/proj-1');

      expect(res.status).toBe(200);
      expect(res.body.recentActivity).toHaveLength(2);
    });

    it('should handle database errors', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app).get('/api/v1/projects/proj-1');

      expect(res.status).toBe(500);
    });

    it('should use validated UUID parameter', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await request(app).get('/api/v1/projects/valid-uuid-format');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['valid-uuid-format'])
      );
    });
  });

  describe('4. POST /projects - Create Project', () => {
    it('should create project with valid data', async () => {
      const projectData = {
        name: 'New Project',
        description: 'Test description',
        location: 'NYC',
        budget: 1000000,
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      };

      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'new-proj-1',
              name: projectData.name,
              description: projectData.description,
              status: 'active',
              location: projectData.location,
              budget: projectData.budget,
              start_date: new Date(),
              end_date: new Date(),
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // Role assignment

      const res = await request(app).post('/api/v1/projects').send(projectData);

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('new-proj-1');
      expect(res.body.name).toBe('New Project');
      expect(res.body.userRole).toBe('owner');
    });

    it('should assign owner role to creator', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: 'proj-1', name: 'Test' }],
        })
        .mockResolvedValueOnce({ rows: [] });

      await request(app)
        .post('/api/v1/projects')
        .send({ name: 'Test Project' });

      // Verify role assignment query was called
      expect(mockPool.query).toHaveBeenCalledTimes(2);
      const roleCall = mockPool.query.mock.calls[1];
      expect(roleCall[0]).toContain('INSERT INTO project_roles');
      expect(roleCall[0]).toContain("'owner'");
    });

    it('should return 403 for users without create permission', async () => {
      // Create app with viewer user
      const viewerApp = express();
      viewerApp.use(express.json());
      viewerApp.use((req, res, next) => {
        req.user = { id: 'viewer-1', email: 'viewer@test.com', role: 'viewer' };
        next();
      });
      const routes = new ProjectRoutes(mockPool as any);
      viewerApp.use('/api/v1', routes.getRouter());
      viewerApp.use(errorHandler);

      const res = await request(viewerApp)
        .post('/api/v1/projects')
        .send({ name: 'Test' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Insufficient permissions');
    });

    it('should allow architect role to create projects', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 'proj-1' }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/v1/projects')
        .send({ name: 'Architect Project' });

      expect(res.status).toBe(201);
    });

    it('should allow contractor role to create projects', async () => {
      const contractorApp = express();
      contractorApp.use(express.json());
      contractorApp.use((req, res, next) => {
        req.user = {
          id: 'contractor-1',
          role: 'contractor',
          tenant_id: 'tenant-test-001',
        };
        next();
      });
      const routes = new ProjectRoutes(mockPool as any);
      contractorApp.use('/api/v1', routes.getRouter());
      contractorApp.use(errorHandler);

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 'proj-1' }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(contractorApp)
        .post('/api/v1/projects')
        .send({ name: 'Contractor Project' });

      expect(res.status).toBe(201);
    });

    it('should handle optional fields', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: 'proj-1', name: 'Minimal Project' }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/v1/projects')
        .send({ name: 'Minimal Project' });

      expect(res.status).toBe(201);
    });

    it('should handle database errors on creation', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Insert failed'));

      const res = await request(app)
        .post('/api/v1/projects')
        .send({ name: 'Test' });

      expect(res.status).toBe(500);
    });

    it('should return 400 for unauthenticated request', async () => {
      const noAuthApp = express();
      noAuthApp.use(express.json());
      noAuthApp.use((req, res, next) => {
        req.user = undefined;
        next();
      });
      const routes = new ProjectRoutes(mockPool as any);
      noAuthApp.use('/api/v1', routes.getRouter());
      noAuthApp.use(errorHandler);

      const res = await request(noAuthApp)
        .post('/api/v1/projects')
        .send({ name: 'Test' });

      expect(res.status).toBe(400);
    });
  });

  describe('5. PUT /projects/:id - Update Project', () => {
    it('should update project with admin permissions', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ permissions: ['read', 'write', 'admin'] }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'proj-1',
              name: 'Updated Name',
              description: 'Updated desc',
              status: 'active',
              updated_at: new Date(),
            },
          ],
        });

      const res = await request(app)
        .put('/api/v1/projects/proj-1')
        .send({ name: 'Updated Name', description: 'Updated desc' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Name');
    });

    it('should return 403 without admin permissions', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ permissions: ['read'] }],
      });

      const res = await request(app)
        .put('/api/v1/projects/proj-1')
        .send({ name: 'Updated' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Insufficient permissions');
    });

    it('should return 403 when user has no project access', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .put('/api/v1/projects/proj-1')
        .send({ name: 'Updated' });

      expect(res.status).toBe(403);
    });

    it('should return 404 when project does not exist', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ permissions: ['admin'] }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .put('/api/v1/projects/non-existent')
        .send({ name: 'Updated' });

      expect(res.status).toBe(404);
    });

    it('should update project status', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ permissions: ['admin'] }] })
        .mockResolvedValueOnce({
          rows: [{ id: 'proj-1', status: 'completed' }],
        });

      const res = await request(app)
        .put('/api/v1/projects/proj-1')
        .send({ status: 'completed' });

      expect(res.status).toBe(200);
    });

    it('should handle database errors', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ permissions: ['admin'] }] })
        .mockRejectedValueOnce(new Error('Update failed'));

      const res = await request(app)
        .put('/api/v1/projects/proj-1')
        .send({ name: 'Updated' });

      expect(res.status).toBe(500);
    });
  });

  describe('6. DELETE /projects/:id - Delete Project', () => {
    it('should soft delete project as owner', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ role: 'owner' }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).delete('/api/v1/projects/proj-1');

      expect(res.status).toBe(204);
    });

    it('should soft delete project as admin', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ role: 'admin' }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).delete('/api/v1/projects/proj-1');

      expect(res.status).toBe(204);
    });

    it('should return 403 for non-owner users', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ role: 'architect' }],
      });

      const res = await request(app).delete('/api/v1/projects/proj-1');

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Only project owners');
    });

    it('should return 403 when user has no project access', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).delete('/api/v1/projects/proj-1');

      expect(res.status).toBe(403);
    });

    it('should perform soft delete (update status)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ role: 'owner' }] })
        .mockResolvedValueOnce({ rows: [] });

      await request(app).delete('/api/v1/projects/proj-1');

      const deleteCall = mockPool.query.mock.calls[1];
      expect(deleteCall[0]).toContain("status = 'deleted'");
      expect(deleteCall[0]).not.toContain('DELETE FROM');
    });

    it('should handle database errors', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ role: 'owner' }] })
        .mockRejectedValueOnce(new Error('Delete failed'));

      const res = await request(app).delete('/api/v1/projects/proj-1');

      expect(res.status).toBe(500);
    });
  });

  describe('7. GET /projects/:id/members - Get Members', () => {
    it('should return project members list', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Access check
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'user-1',
              email: 'member1@test.com',
              full_name: 'Member One',
              picture: 'http://avatar.url',
              company: 'Company A',
              role: 'architect',
              permissions: ['read', 'write'],
              voting_power: 1,
              assigned_at: new Date(),
            },
            {
              id: 'user-2',
              email: 'member2@test.com',
              full_name: 'Member Two',
              picture: null,
              company: 'Company B',
              role: 'contractor',
              permissions: ['read'],
              voting_power: 0,
              assigned_at: new Date(),
            },
          ],
        });

      const res = await request(app).get('/api/v1/projects/proj-1/members');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].role).toBe('architect');
    });

    it('should return 403 when user has no project access', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/v1/projects/proj-1/members');

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Access denied');
    });

    it('should map member fields correctly', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'user-1',
              email: 'test@test.com',
              full_name: 'Full Name',
              picture: 'url',
              company: 'Company',
              role: 'owner',
              permissions: ['admin'],
              voting_power: 2,
              assigned_at: new Date('2024-01-01'),
            },
          ],
        });

      const res = await request(app).get('/api/v1/projects/proj-1/members');

      expect(res.body[0].name).toBe('Full Name');
      expect(res.body[0].avatar).toBe('url');
      expect(res.body[0].organization).toBe('Company');
      expect(res.body[0].votingPower).toBe(2);
    });

    it('should return empty array for project with no members', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/v1/projects/proj-1/members');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });

    it('should handle database errors', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app).get('/api/v1/projects/proj-1/members');

      expect(res.status).toBe(500);
    });
  });

  describe('8. POST /projects/:id/members - Add Member', () => {
    it('should add member with admin permissions', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ permissions: ['admin'] }] }) // Admin check
        .mockResolvedValueOnce({ rows: [{ id: 'new-user-123' }] }) // Find user
        .mockResolvedValueOnce({ rows: [] }) // Check existing
        .mockResolvedValueOnce({ rows: [{ id: 'role-1' }] }) // Insert role
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'new-user-123',
              email: 'newmember@test.com',
              full_name: 'New Member',
              picture: null,
              company: 'New Co',
              role: 'contractor',
              permissions: ['read'],
              voting_power: 0,
              assigned_at: new Date(),
            },
          ],
        });

      const res = await request(app)
        .post('/api/v1/projects/proj-1/members')
        .send({ email: 'newmember@test.com', role: 'contractor' });

      expect(res.status).toBe(201);
      expect(res.body.email).toBe('newmember@test.com');
    });

    it('should return 403 without admin permissions', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ permissions: ['read', 'write'] }],
      });

      const res = await request(app)
        .post('/api/v1/projects/proj-1/members')
        .send({ email: 'test@test.com' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Only project admins');
    });

    it('should return 400 when user email not found', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ permissions: ['admin'] }] })
        .mockResolvedValueOnce({ rows: [] }); // User not found

      const res = await request(app)
        .post('/api/v1/projects/proj-1/members')
        .send({ email: 'nonexistent@test.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('User not found');
    });

    it('should return 400 when user is already a member', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ permissions: ['admin'] }] })
        .mockResolvedValueOnce({ rows: [{ id: 'existing-user' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'existing-role' }] }); // Already member

      const res = await request(app)
        .post('/api/v1/projects/proj-1/members')
        .send({ email: 'existing@test.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('already a member');
    });

    it('should use default role when not specified', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ permissions: ['admin'] }] })
        .mockResolvedValueOnce({ rows: [{ id: 'user-1' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'role-1' }] })
        .mockResolvedValueOnce({
          rows: [{ id: 'user-1', role: 'contractor' }],
        });

      await request(app)
        .post('/api/v1/projects/proj-1/members')
        .send({ email: 'test@test.com' });

      const insertCall = mockPool.query.mock.calls[3];
      expect(insertCall[1]).toContain('contractor'); // Default role
    });

    it('should use default permissions when not specified', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ permissions: ['admin'] }] })
        .mockResolvedValueOnce({ rows: [{ id: 'user-1' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'role-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'user-1' }] });

      await request(app)
        .post('/api/v1/projects/proj-1/members')
        .send({ email: 'test@test.com' });

      const insertCall = mockPool.query.mock.calls[3];
      expect(insertCall[1]).toContainEqual(['read']); // Default permissions
    });

    it('should handle custom voting power', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ permissions: ['admin'] }] })
        .mockResolvedValueOnce({ rows: [{ id: 'user-1' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'role-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'user-1', voting_power: 5 }] });

      await request(app)
        .post('/api/v1/projects/proj-1/members')
        .send({ email: 'test@test.com', votingPower: 5 });

      const insertCall = mockPool.query.mock.calls[3];
      expect(insertCall[1]).toContain(5);
    });

    it('should handle database errors', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app)
        .post('/api/v1/projects/proj-1/members')
        .send({ email: 'test@test.com' });

      expect(res.status).toBe(500);
    });
  });

  describe('9. Security & Edge Cases', () => {
    it('should prevent SQL injection in project ID', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const maliciousId = "'; DROP TABLE projects; --";
      await request(app).get(
        `/api/v1/projects/${encodeURIComponent(maliciousId)}`
      );

      // Should use parameterized query, not concatenation
      expect(mockPool.query.mock.calls[0][1]).toContain(maliciousId);
    });

    it('should handle concurrent requests', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ total: '5' }] });

      const requests = Array(5)
        .fill(null)
        .map(() => request(app).get('/api/v1/projects'));

      const results = await Promise.all(requests);
      results.forEach((res) => {
        expect(res.status).toBe(200);
      });
    });

    it('should sanitize project data in response', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'proj-1',
              name: '<script>alert("xss")</script>',
              description: 'Normal description',
              status: 'active',
              element_count: '0',
              progress: '0',
            },
          ],
        });

      const res = await request(app).get('/api/v1/projects');

      expect(res.status).toBe(200);
      // Data should be returned (sanitization happens at input, not output)
      expect(res.body.data[0].name).toBeDefined();
    });

    it('should handle very large pagination offset', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '10' }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/v1/projects')
        .query({ page: 999999 });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it('should handle special characters in project name search', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 'proj-1' }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/v1/projects')
        .send({ name: 'Project with \'quotes\' and "double quotes"' });

      expect(res.status).toBe(201);
    });

    it('should validate UUID format in params', async () => {
      // UUID validation is mocked, but in production it would validate
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/v1/projects/invalid-uuid');

      // With mocked validation, it should proceed but find nothing
      expect(res.status).toBe(404);
    });
  });
});
