/**
 * Vitest Setup File for MCP Server
 * ENTERPRISE: Global mocks and test configuration
 */

import { vi } from 'vitest';

// Mock @ectropy/shared/utils for tests that import server.ts
// This is necessary because Vitest has issues resolving monorepo TypeScript paths
// Mock @ectropy/shared/config for tests that import server.ts or main.ts
// server.ts imports getEnvConfig, getCorsOrigins, getMcpUrl, getApiUrl
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

vi.mock('@ectropy/shared/utils', () => ({
  requestContext: {
    middleware: vi.fn(() => (req: any, res: any, next: any) => next()),
    getContext: vi.fn(() => ({
      requestId: 'test-request-id',
      correlationId: 'test-correlation-id',
      targetService: 'mcp-server-test',
      startTime: Date.now(),
      metadata: {},
    })),
    getLogger: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      http: vi.fn(),
    })),
  },
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    http: vi.fn(),
    child: vi.fn().mockReturnThis(),
  })),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    http: vi.fn(),
  },
}));
