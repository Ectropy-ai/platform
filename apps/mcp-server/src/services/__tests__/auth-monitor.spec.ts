/**
 * Auth Monitor Test Suite
 * Tests for production vs development behavior
 *
 * ENTERPRISE PATTERN: Uses MSW (Mock Service Worker) to mock HTTP requests
 * This ensures unit tests don't require external services (API Gateway) to be running
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { AuthMonitor } from '../auth-monitor';

// ============================================================================
// MSW MOCK SERVER SETUP - ENTERPRISE UNIT TEST ISOLATION
// ============================================================================

// Mock API Gateway endpoints that auth-monitor's validateEndpointSecurity() calls
const server = setupServer(
  // Mock protected endpoints to return 401 Unauthorized (expected behavior)
  http.get('http://localhost:4000/api/users', () => {
    return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }),
  http.get('http://localhost:4000/api/projects', () => {
    return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }),
  http.get('http://localhost:4000/api/sessions', () => {
    return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }),
  http.get('http://localhost:4000/api/files', () => {
    return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
  })
);

describe('AuthMonitor', { timeout: 30000 }, () => {
  let monitor: AuthMonitor;
  let originalNodeEnv: string | undefined;
  let originalMcpMode: string | undefined;
  let originalRedisUrl: string | undefined;

  // ============================================================================
  // MSW SERVER LIFECYCLE - ENTERPRISE UNIT TEST ISOLATION
  // ============================================================================

  beforeAll(() => {
    // Start MSW mock server (mocks HTTP requests to localhost:4000)
    server.listen({ onUnhandledRequest: 'warn' });
  });

  afterAll(() => {
    // Clean up MSW mock server after all tests
    server.close();
  });

  beforeEach(() => {
    // Save original environment variables
    originalNodeEnv = process.env.NODE_ENV;
    originalMcpMode = process.env.MCP_MODE;
    originalRedisUrl = process.env.REDIS_URL;

    // Clear REDIS_URL to prevent connection attempts during tests
    delete process.env.REDIS_URL;

    monitor = new AuthMonitor();
  });

  afterEach(() => {
    // Reset MSW handlers after each test (ensures test isolation)
    server.resetHandlers();

    // Restore original environment variables
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }

    if (originalMcpMode !== undefined) {
      process.env.MCP_MODE = originalMcpMode;
    } else {
      delete process.env.MCP_MODE;
    }

    if (originalRedisUrl !== undefined) {
      process.env.REDIS_URL = originalRedisUrl;
    } else {
      delete process.env.REDIS_URL;
    }
  });

  describe('Production Mode - NODE_ENV', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('should skip source scanning when NODE_ENV is production', async () => {
      const health = await monitor.checkAuthHealth();

      // Should not fail due to missing source directory
      expect(health).toBeDefined();
      expect(health.checks).toBeDefined();
      expect(health.checks.no_demo_credentials).toBe(true);
    });

    it('should not throw errors when apps directory is missing', async () => {
      // This test verifies that production mode doesn't attempt to scan
      await expect(monitor.checkAuthHealth()).resolves.toBeDefined();
    });
  });

  describe('Production Mode - MCP_MODE', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development'; // Set to dev to test MCP_MODE specifically
      process.env.MCP_MODE = 'production';
    });

    it('should skip source scanning when MCP_MODE is production', async () => {
      const health = await monitor.checkAuthHealth();

      // Should not fail due to missing source directory
      expect(health).toBeDefined();
      expect(health.checks).toBeDefined();
      expect(health.checks.no_demo_credentials).toBe(true);
    });
  });

  describe('Development Mode', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
      delete process.env.MCP_MODE;
    });

    it('should attempt source scanning in development mode', async () => {
      const health = await monitor.checkAuthHealth();

      // In development, it will try to scan but gracefully handle missing directories
      expect(health).toBeDefined();
      expect(health.checks).toBeDefined();
      // no_demo_credentials should be true if no files found or scan succeeds
      expect(typeof health.checks.no_demo_credentials).toBe('boolean');
    });

    it('should return valid health result structure', async () => {
      const health = await monitor.checkAuthHealth();

      expect(health).toHaveProperty('score');
      expect(health).toHaveProperty('checks');
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('recommendations');

      expect(typeof health.score).toBe('number');
      expect(health.score).toBeGreaterThanOrEqual(0);
      expect(health.score).toBeLessThanOrEqual(100);

      expect(['healthy', 'degraded', 'critical']).toContain(health.status);
      expect(Array.isArray(health.recommendations)).toBe(true);
    });
  });

  describe('Health Check Components', () => {
    it('should validate OAuth configuration', async () => {
      const health = await monitor.checkAuthHealth();

      expect(health.checks).toHaveProperty('oauth_configured');
      expect(typeof health.checks.oauth_configured).toBe('boolean');
    });

    it('should check Redis connection', async () => {
      const health = await monitor.checkAuthHealth();

      expect(health.checks).toHaveProperty('redis_connected');
      expect(typeof health.checks.redis_connected).toBe('boolean');
    });

    it('should count active sessions', async () => {
      const health = await monitor.checkAuthHealth();

      expect(health.checks).toHaveProperty('sessions_active');
      expect(typeof health.checks.sessions_active).toBe('number');
      expect(health.checks.sessions_active).toBeGreaterThanOrEqual(0);
    });

    it('should validate endpoint security', async () => {
      const health = await monitor.checkAuthHealth();

      expect(health.checks).toHaveProperty('auth_endpoints_secured');
      expect(typeof health.checks.auth_endpoints_secured).toBe('boolean');
    });

    it('should check for demo credentials', async () => {
      const health = await monitor.checkAuthHealth();

      expect(health.checks).toHaveProperty('no_demo_credentials');
      expect(typeof health.checks.no_demo_credentials).toBe('boolean');
    });
  });

  describe('Score Calculation', () => {
    it('should calculate score based on checks', async () => {
      const health = await monitor.checkAuthHealth();

      // Score should be between 0 and 100
      expect(health.score).toBeGreaterThanOrEqual(0);
      expect(health.score).toBeLessThanOrEqual(100);

      // Score should be a multiple of 20 (4 boolean checks * 20 + sessions check * 20)
      expect(health.score % 20).toBe(0);
    });

    it('should map score to status correctly', async () => {
      const health = await monitor.checkAuthHealth();

      if (health.score >= 80) {
        expect(health.status).toBe('healthy');
      } else if (health.score >= 60) {
        expect(health.status).toBe('degraded');
      } else {
        expect(health.status).toBe('critical');
      }
    });
  });

  describe('Recommendations', () => {
    it('should generate recommendations array', async () => {
      const health = await monitor.checkAuthHealth();

      expect(Array.isArray(health.recommendations)).toBe(true);

      // Each recommendation should be a string
      health.recommendations.forEach((rec) => {
        expect(typeof rec).toBe('string');
        expect(rec.length).toBeGreaterThan(0);
      });
    });
  });
});
