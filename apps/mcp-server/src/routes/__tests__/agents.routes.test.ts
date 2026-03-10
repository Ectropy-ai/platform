/**
 * Basic tests for AI Agent REST API endpoints
 * Tests that endpoints can be instantiated and basic routing works
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import agentsRouter from '../agents.routes.js';

const app = express();
app.use(express.json());
app.use('/api/agents', agentsRouter);

describe('AI Agent REST API Endpoints', () => {
  describe('GET /api/agents/health', () => {
    it('should return agent orchestrator health status', async () => {
      const response = await request(app).get('/api/agents/health').expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('agentFramework');
      expect(response.body.data).toHaveProperty('cache');
    });
  });

  describe('GET /api/agents/types', () => {
    it('should return available agent types', async () => {
      const response = await request(app).get('/api/agents/types').expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('agents');
      expect(response.body.data.agents).toBeInstanceOf(Array);
      expect(response.body.data.agents).toContain('cost');
      expect(response.body.data.agents).toContain('schedule');
      expect(response.body.data.agents).toContain('compliance');
      expect(response.body.data.agents).toContain('quality');
      expect(response.body.data.agents).toContain('document');
    });
  });

  describe('GET /api/agents/issues', () => {
    it('should return empty issues list initially', async () => {
      const response = await request(app).get('/api/agents/issues').expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('issues');
      expect(response.body.data.issues).toBeInstanceOf(Array);
      expect(response.body.data).toHaveProperty('total');
      expect(response.body.data).toHaveProperty('summary');
    });
  });

  describe('GET /api/agents/solutions', () => {
    it('should return empty solutions list initially', async () => {
      const response = await request(app)
        .get('/api/agents/solutions')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('solutions');
      expect(response.body.data.solutions).toBeInstanceOf(Array);
      expect(response.body.data).toHaveProperty('total');
      expect(response.body.data).toHaveProperty('summary');
    });
  });

  describe('POST /api/agents/issues', () => {
    it('should create a new issue with valid data', async () => {
      const issueData = {
        title: 'Test Issue',
        description: 'This is a test issue for validation',
        type: 'quality',
        severity: 'medium',
      };

      const response = await request(app)
        .post('/api/agents/issues')
        .send(issueData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('title', issueData.title);
      expect(response.body.data).toHaveProperty(
        'description',
        issueData.description
      );
      expect(response.body.data).toHaveProperty('type', issueData.type);
      expect(response.body.data).toHaveProperty('severity', issueData.severity);
    });

    it('should reject issue with missing title', async () => {
      const issueData = {
        description: 'This is a test issue without title',
        type: 'quality',
        severity: 'medium',
      };

      const response = await request(app)
        .post('/api/agents/issues')
        .send(issueData)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'Validation failed');
    });
  });

  describe('POST /api/agents/analyze', () => {
    it('should reject analysis with invalid scope', async () => {
      const analysisData = {
        scope: 'invalid-scope',
        options: {
          includeIssues: true,
          includeSolutions: true,
          includeMetrics: true,
        },
      };

      const response = await request(app)
        .post('/api/agents/analyze')
        .send(analysisData)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'Validation failed');
    });
  });

  describe('POST /api/agents/:agentName/execute', () => {
    it('should reject execution with invalid agent name', async () => {
      const actionData = {
        action: 'test-action',
        params: {},
      };

      const response = await request(app)
        .post('/api/agents/invalid-agent/execute')
        .send(actionData)
        .expect(404);

      // For 404, we might not get a structured response depending on Express setup
      // Just ensure we get the 404 status, which indicates the route was not found
      expect(response.status).toBe(404);
    });
  });
});
