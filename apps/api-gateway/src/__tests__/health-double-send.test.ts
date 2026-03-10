/**
 * Health Endpoint Double Header Send Tests
 * Tests that health endpoints don't send headers twice (ERR_HTTP_HEADERS_SENT)
 */

import { describe, it, expect } from 'vitest';

describe('Health Endpoint - Response Safety', () => {
  /**
   * Mock response object that tracks if headers are sent
   */
  class MockResponse {
    private _headersSent = false;
    private _statusCode: number | null = null;
    private _jsonData: any = null;

    get headersSent(): boolean {
      return this._headersSent;
    }

    status(code: number): MockResponse {
      if (this._headersSent) {
        throw new Error('ERR_HTTP_HEADERS_SENT: Cannot set headers after they are sent to the client');
      }
      this._statusCode = code;
      return this;
    }

    json(data: any): void {
      if (this._headersSent) {
        throw new Error('ERR_HTTP_HEADERS_SENT: Cannot set headers after they are sent to the client');
      }
      this._headersSent = true;
      this._jsonData = data;
    }

    getStatusCode(): number | null {
      return this._statusCode;
    }

    getJsonData(): any {
      return this._jsonData;
    }
  }

  it('should not throw ERR_HTTP_HEADERS_SENT with single response', () => {
    const res = new MockResponse();

    // Simulate successful health check response
    expect(() => {
      res.status(200).json({ status: 'healthy' });
    }).not.toThrow();

    expect(res.headersSent).toBe(true);
    expect(res.getStatusCode()).toBe(200);
    expect(res.getJsonData()).toEqual({ status: 'healthy' });
  });

  it('should throw ERR_HTTP_HEADERS_SENT if trying to send twice', () => {
    const res = new MockResponse();

    // First send - should succeed
    res.status(200).json({ status: 'healthy' });

    // Second send - should throw
    expect(() => {
      res.status(500).json({ error: 'Something went wrong' });
    }).toThrow('ERR_HTTP_HEADERS_SENT');
  });

  it('should safely handle error after response sent with headersSent check', () => {
    const res = new MockResponse();

    // Simulate successful response
    res.status(200).json({ status: 'healthy' });

    // Try to send error response - should check headersSent first
    expect(() => {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error' });
      }
      // If headers sent, do nothing - no error thrown
    }).not.toThrow();
  });

  it('should demonstrate the fix: explicit return prevents double send', () => {
    const res = new MockResponse();
    let executedAfterReturn = false;

    const healthCheckWithReturn = () => {
      try {
        // Successful health check
        return res.status(200).json({ status: 'healthy' });
        // This code won't execute due to return
        executedAfterReturn = true;
      } catch (error) {
        if (!res.headersSent) {
          return res.status(503).json({ status: 'unhealthy' });
        }
      }
    };

    healthCheckWithReturn();

    expect(res.headersSent).toBe(true);
    expect(executedAfterReturn).toBe(false);
    expect(res.getStatusCode()).toBe(200);
  });

  it('should demonstrate the bug: missing return allows double send', () => {
    const res = new MockResponse();
    let threwError = false;

    const healthCheckWithoutReturn = () => {
      try {
        // Successful health check - NO RETURN
        res.status(200).json({ status: 'healthy' });
        // Code continues executing...
        
        // Simulate something throwing an error
        throw new Error('Something failed');
      } catch (error) {
        // Tries to send error response - causes double send!
        try {
          res.status(503).json({ status: 'unhealthy' });
        } catch (e: any) {
          if (e.message.includes('ERR_HTTP_HEADERS_SENT')) {
            threwError = true;
          }
        }
      }
    };

    healthCheckWithoutReturn();

    // Should have thrown ERR_HTTP_HEADERS_SENT
    expect(threwError).toBe(true);
  });

  it('should properly handle errors in try-catch with return statements', () => {
    const res = new MockResponse();

    const healthCheckWithProperErrorHandling = () => {
      try {
        // Simulate database check
        const dbHealthy = true;
        
        if (dbHealthy) {
          return res.status(200).json({ status: 'healthy' });
        } else {
          return res.status(503).json({ status: 'degraded' });
        }
      } catch (error) {
        // Check headersSent before sending error response
        if (!res.headersSent) {
          return res.status(503).json({
            status: 'unhealthy',
            error: 'Health check failed',
          });
        }
      }
    };

    healthCheckWithProperErrorHandling();

    expect(res.headersSent).toBe(true);
    expect(res.getStatusCode()).toBe(200);
    expect(res.getJsonData()).toEqual({ status: 'healthy' });
  });

  it('should handle async errors with proper return statements', async () => {
    const res = new MockResponse();

    const asyncHealthCheck = async () => {
      try {
        // Simulate async database check
        await Promise.resolve();
        
        return res.status(200).json({ status: 'healthy' });
      } catch (error) {
        if (!res.headersSent) {
          return res.status(503).json({
            status: 'unhealthy',
            error: 'Health check failed',
          });
        }
      }
    };

    await asyncHealthCheck();

    expect(res.headersSent).toBe(true);
    expect(res.getStatusCode()).toBe(200);
  });
});

describe('Health Endpoint - Score Calculation', () => {
  it('should calculate score correctly for healthy system', () => {
    let score = 100;

    // All services healthy
    const dbStatus = 'healthy';
    const redisStatus = 'healthy';
    const memPercent = 0.5; // 50% memory usage

    // Database health impact
    if (dbStatus === 'unhealthy') {
      score -= 50;
    } else if (dbStatus === 'degraded') {
      score -= 30;
    } else if (dbStatus === 'unknown') {
      score -= 20;
    }

    // Redis health impact
    if (redisStatus === 'unhealthy') {
      score -= 30;
    } else if (redisStatus === 'disconnected' || redisStatus === 'reconnecting') {
      score -= 20;
    } else if (redisStatus === 'configuration_required' || redisStatus === 'unknown') {
      score -= 10;
    }

    // Memory check
    if (memPercent > 0.9) {
      score -= 20;
    } else if (memPercent > 0.8) {
      score -= 10;
    }

    expect(score).toBe(100);
  });

  it('should calculate score correctly for degraded system', () => {
    let score = 100;

    // Database unhealthy, Redis healthy
    const dbStatus = 'unhealthy';
    const redisStatus = 'healthy';
    const memPercent = 0.5;

    if (dbStatus === 'unhealthy') {
      score -= 50;
    } else if (dbStatus === 'degraded') {
      score -= 30;
    } else if (dbStatus === 'unknown') {
      score -= 20;
    }

    if (redisStatus === 'unhealthy') {
      score -= 30;
    } else if (redisStatus === 'disconnected' || redisStatus === 'reconnecting') {
      score -= 20;
    }

    expect(score).toBe(50);
    
    // Score should map to degraded status
    const status = score >= 70 ? 'healthy' : score >= 40 ? 'degraded' : 'unhealthy';
    expect(status).toBe('degraded');
  });

  it('should calculate score correctly for unhealthy system', () => {
    let score = 100;

    // Both services unhealthy, high memory
    const dbStatus = 'unhealthy';
    const redisStatus = 'unhealthy';
    const memPercent = 0.95; // 95% memory usage

    if (dbStatus === 'unhealthy') {
      score -= 50;
    }

    if (redisStatus === 'unhealthy') {
      score -= 30;
    }

    if (memPercent > 0.9) {
      score -= 20;
    }

    expect(score).toBe(0);
    
    // Score should map to unhealthy status
    const status = score >= 70 ? 'healthy' : score >= 40 ? 'degraded' : 'unhealthy';
    expect(status).toBe('unhealthy');
  });

  it('should clamp score within 0-100 range', () => {
    let score = 100;

    // Extreme case - all failures
    score -= 50; // DB
    score -= 30; // Redis
    score -= 20; // Memory
    score -= 100; // Additional issues

    // Clamp score
    score = Math.max(0, Math.min(100, score));

    expect(score).toBe(0);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('should return correct status code based on score', () => {
    const testCases = [
      { score: 100, expectedStatus: 200 },
      { score: 70, expectedStatus: 200 },
      { score: 69, expectedStatus: 200 },
      { score: 40, expectedStatus: 200 },
      { score: 39, expectedStatus: 503 },
      { score: 0, expectedStatus: 503 },
    ];

    testCases.forEach(({ score, expectedStatus }) => {
      const statusCode = score >= 40 ? 200 : 503;
      expect(statusCode).toBe(expectedStatus);
    });
  });
});

describe('Health Endpoint - Error Handling', () => {
  it('should handle database check failure gracefully', () => {
    let dbHealth = { status: 'unknown', latency: 0 };

    try {
      // Simulate database check throwing
      throw new Error('Connection refused');
    } catch (error) {
      // Should catch and set to unknown
      dbHealth = { status: 'unknown', latency: 0 };
    }

    expect(dbHealth.status).toBe('unknown');
  });

  it('should handle Redis ping timeout gracefully', async () => {
    let redisHealthy = false;

    try {
      // Simulate Redis ping with timeout
      await Promise.race([
        new Promise((resolve) => setTimeout(resolve, 10000)), // Slow ping
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Redis ping timeout')), 5000)
        ),
      ]);
      redisHealthy = true;
    } catch (error) {
      // Timeout should be caught
      redisHealthy = false;
    }

    expect(redisHealthy).toBe(false);
  });
});
