import { describe, it, expect, vi } from 'vitest';

// Mock server.js to prevent Express app creation and middleware initialization
vi.mock('../server.js', () => {
  const mockApp = {
    use: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    listen: vi.fn((_port: number, cb?: () => void) => {
      if (cb) cb();
      return { close: vi.fn() };
    }),
  };
  return { default: mockApp };
});

// Mock config to set VALIDATION_ONLY=true — prevents server.listen() in main.ts
vi.mock('../config/environment.config.js', () => ({
  config: {
    server: {
      stdioPort: 0,
      expressPort: 0,
      validationOnly: true,
    },
    database: { url: '' },
  },
  validateConfig: vi.fn(),
  logConfig: vi.fn(),
}));

// Mock services that create intervals or side effects at import time
vi.mock('../services/auto-monitor.js', () => ({
  AutoMonitor: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));
vi.mock('../services/auth-monitor.js', () => ({
  AuthMonitor: vi.fn().mockImplementation(() => ({
    checkAuthHealth: vi.fn(),
  })),
}));
vi.mock('../services/health-aggregator.js', () => ({
  HealthAggregator: vi.fn().mockImplementation(() => ({
    aggregate: vi.fn(),
  })),
}));
vi.mock('../services/pm-decision-tools.js', () => ({
  pmDecisionTools: [],
}));
vi.mock('../services/council-voting-tools.js', () => ({
  councilVotingToolSchemas: [],
}));
vi.mock('../services/ude-tools.js', () => ({
  udeTools: [],
}));
vi.mock('../adapters/startup.js', () => ({
  initializeAdapters: vi.fn(async () => ({ registered: [], failed: [] })),
}));
vi.mock('../health/health-check-service.js', () => ({
  completeHealthCheckStartup: vi.fn(),
  initializeHealthCheck: vi.fn(() => ({
    checkHealth: vi.fn(),
    checkLiveness: vi.fn(),
    checkReadiness: vi.fn(),
  })),
}));
vi.mock('../utils/security.utils.js', () => ({
  constantTimeCompare: vi.fn(),
  sanitizeInput: vi.fn((s: string) => s),
  securityHeadersConfig: {},
}));
vi.mock('../utils/version.js', () => ({
  getCurrentVersion: vi.fn(() => '1.0.0-test'),
  VERSION_STRATEGY: 'package.json',
}));
vi.mock('../graphql/index.js', () => ({
  setupGraphQL: vi.fn(),
}));

import { mcp } from '../main';

describe('Truth Endpoint', () => {
  describe('getRepositoryTruth', () => {
    it('should return truth with success status', async () => {
      const result = await mcp.getRepositoryTruth();

      expect(result).toBeDefined();
      expect(result.status).toBe('success');
      expect(result.timestamp).toBeDefined();
      expect(typeof result.truth).toBe('string');
      expect(result.truth.length).toBeGreaterThan(0);
    });

    it('should include platform information in truth', async () => {
      const result = await mcp.getRepositoryTruth();

      expect(result.status).toBe('success');
      expect(result.truth).toContain('Platform');
    });

    it('should include timestamp in response', async () => {
      const result = await mcp.getRepositoryTruth();

      expect(result.timestamp).toBeDefined();
      const timestamp = new Date(result.timestamp);
      expect(timestamp.getTime()).toBeGreaterThan(0);
    });

    it('should handle errors gracefully and return fallback', async () => {
      // The method should always return success with fallback if script fails
      const result = await mcp.getRepositoryTruth();

      expect(result).toBeDefined();
      expect(result.status).toBe('success');
      // Should never throw or return error status due to fallback
    });
  });
});
