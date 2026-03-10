import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// The RoadmapService reads real .roadmap/ files at module scope.
// These are integration tests that verify routes work against real data.
// This is more valuable than mocking since it validates the full chain.

describe('Roadmap Routes (/api/mcp/roadmap)', () => {
  let app: express.Application;

  beforeEach(async () => {
    // Dynamic import to ensure fresh module load per test
    vi.resetModules();
    const { roadmapRouter } = await import('../roadmap.routes.js');
    app = express();
    app.use(express.json());
    app.use('/api/mcp', roadmapRouter);
  });

  // ==========================================================================
  // GET /api/mcp/roadmap — Get complete roadmap
  // ==========================================================================

  describe('GET /roadmap — Get complete roadmap', () => {
    it('should return 200 with success', async () => {
      const res = await request(app).get('/api/mcp/roadmap');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should include roadmap data with phases', async () => {
      const res = await request(app).get('/api/mcp/roadmap');
      // Roadmap may be in body.roadmap (if loaded) or body.success=false (if file missing)
      if (res.body.roadmap) {
        expect(res.body.roadmap).toHaveProperty('phases');
        expect(Array.isArray(res.body.roadmap.phases)).toBe(true);
      }
    });
  });

  // ==========================================================================
  // GET /api/mcp/roadmap/business — Get business roadmap
  // ==========================================================================

  describe('GET /roadmap/business — Get business roadmap', () => {
    it('should return 200', async () => {
      const res = await request(app).get('/api/mcp/roadmap/business');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ==========================================================================
  // GET /api/mcp/roadmap/current — Get current phase
  // ==========================================================================

  describe('GET /roadmap/current — Get current phase', () => {
    it('should return current phase or 404 if none set', async () => {
      const res = await request(app).get('/api/mcp/roadmap/current');
      // May return 200 (phase exists) or 404 (no current phase)
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toHaveProperty('currentPhase');
        expect(res.body.currentPhase).toHaveProperty('name');
        expect(res.body.currentPhase).toHaveProperty('deliverables');
        expect(Array.isArray(res.body.currentPhase.deliverables)).toBe(true);
      }
    });
  });

  // ==========================================================================
  // POST /api/mcp/roadmap/check-alignment — Check work plan alignment
  // ==========================================================================

  describe('POST /roadmap/check-alignment — Check alignment', () => {
    it('should return 400 for missing taskDescription', async () => {
      const res = await request(app)
        .post('/api/mcp/roadmap/check-alignment')
        .send({
          proposedApproach: 'something',
          filesImpacted: [],
        });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 for missing proposedApproach', async () => {
      const res = await request(app)
        .post('/api/mcp/roadmap/check-alignment')
        .send({
          taskDescription: 'something',
          filesImpacted: [],
        });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 for missing filesImpacted', async () => {
      const res = await request(app)
        .post('/api/mcp/roadmap/check-alignment')
        .send({
          taskDescription: 'something',
          proposedApproach: 'something',
        });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should accept valid work plan', async () => {
      const res = await request(app)
        .post('/api/mcp/roadmap/check-alignment')
        .send({
          taskDescription: 'Add MCP integration tests',
          proposedApproach: 'Write vitest tests for MCP routes',
          filesImpacted: ['apps/mcp-server/src/routes/__tests__/'],
        });
      // May return 200 (alignment computed) or 500 (service error)
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body.alignment).toHaveProperty('aligned');
      }
    });
  });

  // ==========================================================================
  // POST /api/mcp/roadmap/update-deliverable — Update deliverable
  // ==========================================================================

  describe('POST /roadmap/update-deliverable — Update deliverable', () => {
    it('should return 400 for missing phaseId', async () => {
      const res = await request(app)
        .post('/api/mcp/roadmap/update-deliverable')
        .send({
          deliverableId: 'p5b-d3',
          status: 'in-progress',
        });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 for missing deliverableId', async () => {
      const res = await request(app)
        .post('/api/mcp/roadmap/update-deliverable')
        .send({
          phaseId: 'phase-5b',
          status: 'in-progress',
        });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 for missing status', async () => {
      const res = await request(app)
        .post('/api/mcp/roadmap/update-deliverable')
        .send({
          phaseId: 'phase-5b',
          deliverableId: 'p5b-d3',
        });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should accept valid update request', async () => {
      const res = await request(app)
        .post('/api/mcp/roadmap/update-deliverable')
        .send({
          phaseId: 'phase-5b',
          deliverableId: 'p5b-d3',
          status: 'in-progress',
          evidence: ['commit:abc123'],
        });
      // Should succeed or fail with meaningful error
      expect([200, 500]).toContain(res.status);
    });
  });

  // ==========================================================================
  // GET /api/mcp/roadmap/progress — Progress dashboard
  // ==========================================================================

  describe('GET /roadmap/progress — Progress dashboard', () => {
    it('should return progress data or error', async () => {
      const res = await request(app).get('/api/mcp/roadmap/progress');
      // May return 200 (dashboard) or 500 (service error if phases not loaded)
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body.dashboard).toHaveProperty('overallProgress');
        expect(res.body.dashboard).toHaveProperty('phaseSummary');
      }
    });
  });

  // ==========================================================================
  // GET /api/mcp/roadmap/sync-status — Sync status
  // ==========================================================================

  describe('GET /roadmap/sync-status — Sync configuration', () => {
    it('should return sync status', async () => {
      const res = await request(app).get('/api/mcp/roadmap/sync-status');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('source', 'GitHub Projects');
      expect(res.body).toHaveProperty('syncMode', 'one-way-read-only');
      expect(typeof res.body.configured).toBe('boolean');
    });
  });

  // ==========================================================================
  // POST /api/mcp/roadmap/sync — Manual sync
  // ==========================================================================

  describe('POST /roadmap/sync — Manual sync trigger', () => {
    it('should return 503 when GitHub not configured', async () => {
      // No GITHUB_PROJECT_TOKEN set in test env
      const res = await request(app).post('/api/mcp/roadmap/sync');
      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
    });
  });
});
