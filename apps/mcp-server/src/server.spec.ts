import { vi, describe, it, expect } from 'vitest';

// Mock shared config — CORS middleware calls getCorsOrigins() on each request
// which fails in test without valid environment configuration
vi.mock('@ectropy/shared/config', () => ({
  getEnvConfig: vi.fn(() => ({
    NODE_ENV: 'test',
    MCP_SERVER_PORT: 3001,
    API_GATEWAY_PORT: 3000,
  })),
  getCorsOrigins: vi.fn(() => [
    'http://localhost:3000',
    'http://localhost:4200',
  ]),
  getMcpUrl: vi.fn(() => 'http://localhost:3001'),
  getApiUrl: vi.fn(() => 'http://localhost:3000'),
}));

// Mock health check service — prevents real database/Redis checks
// ROOT CAUSE (Five Why 2026-02-27): vi.fn().mockResolvedValue() does NOT survive
// restoreMocks: true because _originImpl is unset. Use vi.fn(async () => ...)
// so _originImpl is preserved across mockRestore() cycles.
vi.mock('./health/health-check-service.js', () => {
  const HealthStatus = {
    HEALTHY: 'healthy',
    DEGRADED: 'degraded',
    UNHEALTHY: 'unhealthy',
    UNKNOWN: 'unknown',
  };
  const mockService = {
    checkHealth: vi.fn(async () => ({
      status: HealthStatus.HEALTHY,
      checks: { memory: { status: HealthStatus.HEALTHY, message: 'OK' } },
      timestamp: new Date().toISOString(),
      uptime: 100,
      version: '1.0.0',
    })),
    checkLiveness: vi.fn(async () => ({ status: HealthStatus.HEALTHY })),
    checkReadiness: vi.fn(async () => ({ status: HealthStatus.HEALTHY })),
    checkStartup: vi.fn(async () => ({ status: HealthStatus.HEALTHY })),
  };
  return {
    HealthStatus,
    HealthCheckType: {
      LIVENESS: 'liveness',
      READINESS: 'readiness',
      STARTUP: 'startup',
    },
    initializeHealthCheck: vi.fn(() => mockService),
    getHealthCheckService: vi.fn(() => mockService),
  };
});

import request from 'supertest';
import app from './server';

// Ensure dev mode for auth bypass
process.env.NODE_ENV = 'development';

describe('MCP Server', () => {
  it('should return healthy status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });

  it('should return ping response', async () => {
    const res = await request(app).get('/ping');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
