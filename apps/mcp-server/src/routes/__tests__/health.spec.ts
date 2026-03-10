import { describe, it, expect, vi } from 'vitest';
import { Request, Response } from 'express';
import { healthCheck } from '../health-enhanced';

// Mock the cache service
vi.mock('../../services/cache.js', () => ({
  getCacheStatus: vi.fn(() => ({
    type: 'memory',
    connected: true,
  })),
}));

describe('Health Endpoint - Score Field', () => {
  it('should include score field in response', async () => {
    // Mock request and response
    const req = {} as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;

    // Call the health check
    await healthCheck(req, res);

    // Verify response was sent
    expect(res.status).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();

    // Get the response body
    const responseBody = (res.json as any).mock.calls[0][0];

    // Verify score field exists
    expect(responseBody).toHaveProperty('score');
    expect(typeof responseBody.score).toBe('number');
    expect(responseBody.score).toBeGreaterThanOrEqual(0);
    expect(responseBody.score).toBeLessThanOrEqual(100);
  });

  it('should include other expected fields in response', async () => {
    const req = {} as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;

    await healthCheck(req, res);

    const responseBody = (res.json as any).mock.calls[0][0];

    // Verify all expected fields exist
    expect(responseBody).toHaveProperty('status');
    expect(responseBody).toHaveProperty('score');
    expect(responseBody).toHaveProperty('timestamp');
    expect(responseBody).toHaveProperty('uptime');
    expect(responseBody).toHaveProperty('memory');
    expect(responseBody).toHaveProperty('environment');
    expect(responseBody).toHaveProperty('version');
    expect(responseBody).toHaveProperty('checks');
    expect(responseBody).toHaveProperty('response_time');
  });

  it('should calculate score based on check results', async () => {
    const req = {} as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;

    await healthCheck(req, res);

    const responseBody = (res.json as any).mock.calls[0][0];

    // With memory fallback and no database, score should be partial
    // Memory (healthy) = 20 points, Redis (using_fallback) = 7.5 points = 27.5 -> 28
    // (Database not configured = 0 points)
    expect(responseBody.score).toBeGreaterThan(0);
    expect(responseBody.score).toBeLessThan(100);
  });
});
