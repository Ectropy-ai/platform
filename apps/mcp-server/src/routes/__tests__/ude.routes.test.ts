import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { udeRouter } from '../ude.routes';

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

// Mock adapters startup
vi.mock('../../adapters/startup.js', () => ({
  initializeAdapters: vi.fn(),
}));

describe('UDE Routes (/api/mcp/ude)', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/mcp/ude', udeRouter);
  });

  // ==========================================================================
  // GET /api/mcp/ude — List all UDE tools
  // ==========================================================================

  describe('GET / — List all UDE tools', () => {
    it('should return 200 with tool definitions', async () => {
      const res = await request(app).get('/api/mcp/ude');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.category).toBe('Unified Decision Engine Tools');
      expect(Array.isArray(res.body.tools)).toBe(true);
      expect(res.body.count).toBe(res.body.tools.length);
    });

    it('should return exactly 6 tools', async () => {
      const res = await request(app).get('/api/mcp/ude');
      expect(res.body.count).toBe(6);
    });

    it('should include expected tool names', async () => {
      const res = await request(app).get('/api/mcp/ude');
      const names = res.body.tools.map((t: { name: string }) => t.name);
      expect(names).toContain('read_current_truth');
      expect(names).toContain('read_roadmap');
      expect(names).toContain('read_decision_log');
      expect(names).toContain('get_feature_status');
      expect(names).toContain('get_next_work');
      expect(names).toContain('get_health_assessment');
    });

    it('should include valid tool properties', async () => {
      const res = await request(app).get('/api/mcp/ude');
      for (const tool of res.body.tools) {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(tool).toHaveProperty('version');
        expect(typeof tool.name).toBe('string');
        expect(typeof tool.description).toBe('string');
        expect(typeof tool.inputSchema).toBe('object');
        expect(tool.inputSchema.type).toBe('object');
      }
    });

    it('should categorize tools into dataAccess and intelligence', async () => {
      const res = await request(app).get('/api/mcp/ude');
      expect(res.body.categorized).toBeDefined();
      expect(res.body.categorized.dataAccess).toHaveLength(3);
      expect(res.body.categorized.intelligence).toHaveLength(3);
    });

    it('should include version and timestamp', async () => {
      const res = await request(app).get('/api/mcp/ude');
      expect(typeof res.body.version).toBe('string');
      expect(typeof res.body.timestamp).toBe('string');
      expect(res.body.server).toBe('mcp-server');
    });
  });

  // ==========================================================================
  // GET /api/mcp/ude/names — List tool names
  // ==========================================================================

  describe('GET /names — List tool names', () => {
    it('should return 200 with tool names array', async () => {
      const res = await request(app).get('/api/mcp/ude/names');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.tools)).toBe(true);
      expect(res.body.count).toBe(6);
    });

    it('should return string array of names', async () => {
      const res = await request(app).get('/api/mcp/ude/names');
      for (const name of res.body.tools) {
        expect(typeof name).toBe('string');
      }
    });
  });

  // ==========================================================================
  // GET /api/mcp/ude/health — Adapter health check
  // ==========================================================================

  describe('GET /health — Adapter health', () => {
    it('should return 200 with health status', async () => {
      const res = await request(app).get('/api/mcp/ude/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('registry');
      expect(res.body).toHaveProperty('adapters');
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  // ==========================================================================
  // GET /api/mcp/ude/:toolName — Get tool definition
  // ==========================================================================

  describe('GET /:toolName — Get tool definition', () => {
    it('should return tool definition for valid tool name', async () => {
      const res = await request(app).get('/api/mcp/ude/read_current_truth');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.tool.name).toBe('read_current_truth');
      expect(res.body.tool).toHaveProperty('description');
      expect(res.body.tool).toHaveProperty('inputSchema');
      expect(res.body.tool).toHaveProperty('version');
    });

    it('should return 404 for non-existent tool', async () => {
      const res = await request(app).get('/api/mcp/ude/nonexistent_tool');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('TOOL_NOT_FOUND');
      expect(res.body.availableTools).toBeDefined();
      expect(Array.isArray(res.body.availableTools)).toBe(true);
    });

    it('should return definitions for all 6 tools', async () => {
      const toolNames = [
        'read_current_truth',
        'read_roadmap',
        'read_decision_log',
        'get_feature_status',
        'get_next_work',
        'get_health_assessment',
      ];
      for (const name of toolNames) {
        const res = await request(app).get(`/api/mcp/ude/${name}`);
        expect(res.status).toBe(200);
        expect(res.body.tool.name).toBe(name);
      }
    });
  });

  // ==========================================================================
  // POST /api/mcp/ude/execute — Execute a UDE tool
  // ==========================================================================

  describe('POST /execute — Execute a UDE tool', () => {
    it('should return 400 when toolName is missing', async () => {
      const res = await request(app)
        .post('/api/mcp/ude/execute')
        .send({ args: {} });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('MISSING_TOOL_NAME');
    });

    it('should return 404 for non-existent tool', async () => {
      const res = await request(app)
        .post('/api/mcp/ude/execute')
        .send({ toolName: 'nonexistent_tool', args: {} });
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('TOOL_NOT_FOUND');
    });

    it('should execute read_current_truth and return result', async () => {
      const res = await request(app)
        .post('/api/mcp/ude/execute')
        .send({ toolName: 'read_current_truth', args: {} });
      // Tool execution may succeed or fail depending on adapter state,
      // but the route should return 200 (tool result contains success/error)
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('toolName', 'read_current_truth');
      expect(typeof res.body.executionTime).toBe('number');
    });

    it('should execute get_next_work with limit arg', async () => {
      const res = await request(app)
        .post('/api/mcp/ude/execute')
        .send({ toolName: 'get_next_work', args: { limit: 3 } });
      expect(res.status).toBe(200);
      expect(res.body.toolName).toBe('get_next_work');
    });

    it('should execute get_health_assessment', async () => {
      const res = await request(app)
        .post('/api/mcp/ude/execute')
        .send({ toolName: 'get_health_assessment', args: {} });
      expect(res.status).toBe(200);
      expect(res.body.toolName).toBe('get_health_assessment');
    });
  });

  // ==========================================================================
  // POST /api/mcp/ude/:toolName — Execute tool directly
  // ==========================================================================

  describe('POST /:toolName — Execute tool directly', () => {
    it('should execute tool with body as args', async () => {
      const res = await request(app)
        .post('/api/mcp/ude/read_roadmap')
        .send({ activeOnly: true });
      expect(res.status).toBe(200);
      expect(res.body.toolName).toBe('read_roadmap');
      expect(typeof res.body.executionTime).toBe('number');
    });

    it('should return 404 for non-existent tool', async () => {
      const res = await request(app).post('/api/mcp/ude/fake_tool').send({});
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('TOOL_NOT_FOUND');
    });

    it('should execute read_decision_log', async () => {
      const res = await request(app)
        .post('/api/mcp/ude/read_decision_log')
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.toolName).toBe('read_decision_log');
    });

    it('should execute get_feature_status with id arg', async () => {
      const res = await request(app)
        .post('/api/mcp/ude/get_feature_status')
        .send({ id: 'p5b-d21' });
      expect(res.status).toBe(200);
      expect(res.body.toolName).toBe('get_feature_status');
    });
  });
});
