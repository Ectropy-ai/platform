import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { pmDecisionRouter } from '../pm-decision.routes';

// Mock rate limiter
vi.mock('../../middleware/rate-limiter-fixed.js', () => ({
  createRateLimiter: vi.fn(
    () =>
      (
        _req: express.Request,
        _res: express.Response,
        next: express.NextFunction
      ) =>
        next()
  ),
}));

describe('PM Decision Routes (/api/mcp/pm-tools)', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/mcp/pm-tools', pmDecisionRouter);
  });

  // ==========================================================================
  // GET /api/mcp/pm-tools — List all PM tools
  // ==========================================================================

  describe('GET / — List all PM Decision tools', () => {
    it('should return 200 with tool definitions', async () => {
      const res = await request(app).get('/api/mcp/pm-tools');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.category).toBe('PM Decision Tools');
      expect(Array.isArray(res.body.tools)).toBe(true);
      expect(res.body.count).toBe(res.body.tools.length);
    });

    it('should return tools with valid properties', async () => {
      const res = await request(app).get('/api/mcp/pm-tools');
      for (const tool of res.body.tools) {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(tool).toHaveProperty('version');
        expect(typeof tool.name).toBe('string');
        expect(tool.inputSchema.type).toBe('object');
      }
    });

    it('should include categorized tool groups', async () => {
      const res = await request(app).get('/api/mcp/pm-tools');
      const categorized = res.body.categorized;
      expect(categorized).toBeDefined();
      expect(categorized).toHaveProperty('decisionManagement');
      expect(categorized).toHaveProperty('authorityGraph');
      expect(categorized).toHaveProperty('voxelOperations');
      expect(categorized).toHaveProperty('toleranceManagement');
      expect(categorized).toHaveProperty('consequenceInspection');
      expect(categorized).toHaveProperty('legacy');
    });

    it('should include expected core tool names', async () => {
      const res = await request(app).get('/api/mcp/pm-tools');
      const names = res.body.tools.map((t: { name: string }) => t.name);
      expect(names).toContain('capture_decision');
      expect(names).toContain('route_decision');
      expect(names).toContain('get_authority_graph');
      expect(names).toContain('attach_decision_to_voxel');
      expect(names).toContain('track_consequence');
      expect(names).toContain('request_inspection');
    });

    it('should include version and server info', async () => {
      const res = await request(app).get('/api/mcp/pm-tools');
      expect(typeof res.body.version).toBe('string');
      expect(res.body.server).toBe('mcp-server');
      expect(typeof res.body.timestamp).toBe('string');
    });
  });

  // ==========================================================================
  // GET /api/mcp/pm-tools/names — List tool names
  // ==========================================================================

  describe('GET /names — List tool names', () => {
    it('should return 200 with names array', async () => {
      const res = await request(app).get('/api/mcp/pm-tools/names');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.tools)).toBe(true);
      expect(res.body.count).toBeGreaterThan(0);
    });

    it('should return strings only', async () => {
      const res = await request(app).get('/api/mcp/pm-tools/names');
      for (const name of res.body.tools) {
        expect(typeof name).toBe('string');
      }
    });
  });

  // ==========================================================================
  // GET /api/mcp/pm-tools/:toolName — Get tool definition
  // ==========================================================================

  describe('GET /:toolName — Get tool definition', () => {
    it('should return definition for capture_decision', async () => {
      const res = await request(app).get('/api/mcp/pm-tools/capture_decision');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.tool.name).toBe('capture_decision');
      expect(res.body.tool).toHaveProperty('description');
      expect(res.body.tool).toHaveProperty('inputSchema');
    });

    it('should return 404 for non-existent tool', async () => {
      const res = await request(app).get('/api/mcp/pm-tools/nonexistent_tool');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('TOOL_NOT_FOUND');
      expect(Array.isArray(res.body.availableTools)).toBe(true);
    });
  });

  // ==========================================================================
  // POST /api/mcp/pm-tools/execute — Execute a PM tool
  // ==========================================================================

  describe('POST /execute — Execute a PM Decision tool', () => {
    it('should return 400 when toolName is missing', async () => {
      const res = await request(app)
        .post('/api/mcp/pm-tools/execute')
        .send({ args: {} });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('MISSING_TOOL_NAME');
    });

    it('should return 400 when args is missing', async () => {
      const res = await request(app)
        .post('/api/mcp/pm-tools/execute')
        .send({ toolName: 'capture_decision' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('MISSING_ARGS');
    });

    it('should return 404 for non-existent tool', async () => {
      const res = await request(app)
        .post('/api/mcp/pm-tools/execute')
        .send({ toolName: 'nonexistent', args: {} });
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('TOOL_NOT_FOUND');
    });

    it('should execute capture_decision and return result with metadata', async () => {
      const res = await request(app)
        .post('/api/mcp/pm-tools/execute')
        .send({
          toolName: 'capture_decision',
          args: {
            title: 'Test Decision',
            description: 'Test decision for integration test',
            category: 'technical',
          },
        });
      expect(res.status).toBe(200);
      expect(res.body.toolName).toBe('capture_decision');
      expect(typeof res.body.executionTime).toBe('number');
    });

    it('should execute get_authority_graph', async () => {
      const res = await request(app).post('/api/mcp/pm-tools/execute').send({
        toolName: 'get_authority_graph',
        args: {},
      });
      expect(res.status).toBe(200);
      expect(res.body.toolName).toBe('get_authority_graph');
    });
  });

  // ==========================================================================
  // POST /api/mcp/pm-tools/:toolName — Execute tool directly
  // ==========================================================================

  describe('POST /:toolName — Execute tool directly', () => {
    it('should execute tool with body as args', async () => {
      const res = await request(app)
        .post('/api/mcp/pm-tools/query_decision_history')
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.toolName).toBe('query_decision_history');
      expect(typeof res.body.executionTime).toBe('number');
    });

    it('should return 404 for non-existent tool', async () => {
      const res = await request(app)
        .post('/api/mcp/pm-tools/fake_tool')
        .send({});
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});
