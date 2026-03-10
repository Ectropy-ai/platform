/**
 * Health Endpoint Integration Tests
 * Tests the critical /health endpoint functionality
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { healthCheck } from '../../routes/health-enhanced.js';

describe('Health Endpoint Integration Tests', () => {
  let app: express.Application;

  beforeAll(() => {
    // Create test Express app
    app = express();
    app.get('/health', healthCheck);
  });

  it('should return 200 OK on health check', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.type).toBe('application/json');
  });

  it('should return valid health check structure', async () => {
    const response = await request(app).get('/health');

    expect(response.body).toHaveProperty('status');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('uptime');
    expect(response.body).toHaveProperty('version');
  });

  it('should return status as string', async () => {
    const response = await request(app).get('/health');

    expect(typeof response.body.status).toBe('string');
    expect(['healthy', 'degraded', 'critical', 'operational', 'partial']).toContain(
      response.body.status
    );
  });

  it('should return valid timestamp', async () => {
    const response = await request(app).get('/health');

    const timestamp = new Date(response.body.timestamp);
    expect(timestamp).toBeInstanceOf(Date);
    expect(timestamp.getTime()).toBeGreaterThan(0);
  });

  it('should return numeric uptime', async () => {
    const response = await request(app).get('/health');

    expect(typeof response.body.uptime).toBe('number');
    expect(response.body.uptime).toBeGreaterThanOrEqual(0);
  });

  it('should have version string', async () => {
    const response = await request(app).get('/health');

    expect(typeof response.body.version).toBe('string');
    expect(response.body.version.length).toBeGreaterThan(0);
  });

  it('should respond within acceptable time', async () => {
    const startTime = Date.now();
    await request(app).get('/health');
    const endTime = Date.now();

    const responseTime = endTime - startTime;
    // Health check should respond within 1 second
    expect(responseTime).toBeLessThan(1000);
  });

  it('should handle multiple concurrent requests', async () => {
    const requests = Array(10)
      .fill(null)
      .map(() => request(app).get('/health'));

    const responses = await Promise.all(requests);

    responses.forEach((response) => {
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
    });
  });
});
