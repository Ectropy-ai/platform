import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { toolsRouter } from '../tools';

// Mock the rate limiter and auth middleware
vi.mock('../../middleware/rate-limiter-fixed.js', () => ({
  createRateLimiter: vi.fn(() => (req: any, res: any, next: any) => next()),
}));

vi.mock('../../middleware/index.js', () => ({
  validateApiKey: vi.fn((req: any, res: any, next: any) => next()),
}));

describe('MCP Tools Endpoint', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/tools', toolsRouter);
  });

  it('should return JSON array of tools', async () => {
    const response = await request(app).get('/tools');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('tools');
    expect(Array.isArray(response.body.tools)).toBe(true);
    expect(response.body.tools.length).toBeGreaterThan(0);
  });

  it('should include required tool properties', async () => {
    const response = await request(app).get('/tools');

    expect(response.status).toBe(200);
    const tools = response.body.tools;

    tools.forEach((tool: any) => {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('inputSchema');
      expect(tool).toHaveProperty('version');
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(typeof tool.inputSchema).toBe('object');
      expect(typeof tool.version).toBe('string');
    });
  });

  it('should include count, server, version, and timestamp in response', async () => {
    const response = await request(app).get('/tools');

    expect(response.status).toBe(200);
    const responseBody = response.body;

    expect(responseBody).toHaveProperty('count');
    expect(responseBody).toHaveProperty('server');
    expect(responseBody).toHaveProperty('version');
    expect(responseBody).toHaveProperty('timestamp');
    expect(typeof responseBody.count).toBe('number');
    expect(typeof responseBody.server).toBe('string');
    expect(typeof responseBody.version).toBe('string');
    expect(responseBody.count).toBe(responseBody.tools.length);
  });

  it('should return tools with valid JSON Schema inputSchema', async () => {
    const response = await request(app).get('/tools');

    expect(response.status).toBe(200);
    const tools = response.body.tools;

    tools.forEach((tool: any) => {
      // Each tool should have inputSchema with type 'object'
      expect(tool.inputSchema).toHaveProperty('type');
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema).toHaveProperty('properties');
    });
  });

  it('should include expected tool names', async () => {
    const response = await request(app).get('/tools');

    expect(response.status).toBe(200);
    const toolNames = response.body.tools.map((t: any) => t.name);

    // Verify expected tools are present
    expect(toolNames).toContain('health_check');
    expect(toolNames).toContain('analyze_model');
    expect(toolNames).toContain('semantic_search');
    expect(toolNames).toContain('get_agent_status');
    expect(toolNames).toContain('validate_work_plan');
    expect(toolNames).toContain('get_guidance');
  });
});
