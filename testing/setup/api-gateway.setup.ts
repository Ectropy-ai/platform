/**
 * API Gateway Test Setup
 * Configures testing environment for backend API testing
 */

import '@testing-library/jest-dom';
import jwt from 'jsonwebtoken';

// Mock environment variables for API Gateway tests
process.env.PORT = '3001'; // Different port for tests
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET =
  process.env.TEST_JWT_SECRET || 'test-jwt-secret-for-api-gateway-tests';
process.env.RATE_LIMIT_MAX = '1000'; // Higher limit for tests

// Global test utilities for API Gateway
global.testUtils = {
  /**
   * Create a mock JWT token for testing
   */
  createMockJWT: (payload = {}) => {
    return jwt.sign(
      {
        userId: 'test-user-id',
        email: 'test@example.com',
        role: 'user',
        ...payload,
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  },

  /**
   * Create mock request object for testing
   */
  createMockRequest: (overrides = {}) => ({
    body: {},
    params: {},
    query: {},
    headers: {},
    user: null,
    ...overrides,
  }),

  /**
   * Create mock response object for testing
   */
  createMockResponse: () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    res.cookie = jest.fn().mockReturnValue(res);
    res.clearCookie = jest.fn().mockReturnValue(res);
    return res;
  },

  /**
   * Create mock database pool for testing
   */
  createMockDbPool: () => ({
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
  }),

  /**
   * Create mock Redis client for testing
   */
  createMockRedis: () => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    expire: jest.fn(),
    disconnect: jest.fn(),
  }),
};

// Security testing utilities
global.securityTestUtils = {
  /**
   * Common SQL injection test payloads
   */
  sqlInjectionPayloads: [
    "'; DROP TABLE users; --",
    "' OR 1=1 --",
    "' UNION SELECT * FROM users --",
    "'; INSERT INTO users (email) VALUES ('hacker@evil.com'); --",
  ],

  /**
   * Common XSS test payloads
   */
  xssPayloads: [
    '<script>alert("XSS")</script>',
    'javascript:alert("XSS")',
    '<img src="x" onerror="alert(\'XSS\')" />',
    '"><script>alert("XSS")</script>',
  ],

  /**
   * Test unauthorized access attempts
   */
  testUnauthorizedAccess: async (request, endpoint) => {
    const response = await request.get(endpoint).expect(401);

    expect(response.body.error).toMatch(/unauthorized|forbidden/i);
  },

  /**
   * Test rate limiting
   */
  testRateLimit: async (request, endpoint, limit = 100) => {
    const requests = Array(limit + 10)
      .fill()
      .map(() => request.get(endpoint));

    const responses = await Promise.all(requests);
    const rateLimitedResponses = responses.filter((r) => r.status === 429);

    expect(rateLimitedResponses.length).toBeGreaterThan(0);
  },
};

// Construction industry specific test utilities
global.constructionTestUtils = {
  /**
   * Create mock construction project
   */
  createMockProject: () => ({
    id: 'test-project-id',
    name: 'Test Construction Project',
    type: 'commercial',
    status: 'planning',
    budget: 1000000,
    timeline: {
      start: new Date('2024-01-01'),
      end: new Date('2024-12-31'),
    },
    stakeholders: [
      { role: 'architect', userId: 'architect-id' },
      { role: 'engineer', userId: 'engineer-id' },
      { role: 'contractor', userId: 'contractor-id' },
      { role: 'owner', userId: 'owner-id' },
    ],
  }),

  /**
   * Create mock BIM model data
   */
  createMockBIMModel: () => ({
    id: 'test-bim-model-id',
    projectId: 'test-project-id',
    fileName: 'test-model.ifc',
    version: '1.0',
    elements: [
      { type: 'IFCWALL', id: 'wall-1' },
      { type: 'IFCBEAM', id: 'beam-1' },
      { type: 'IFCCOLUMN', id: 'column-1' },
    ],
    metadata: {
      totalElements: 3,
      fileSize: 1024000, // 1MB
      ifcVersion: 'IFC4',
    },
  }),

  /**
   * Create mock stakeholder user
   */
  createMockStakeholder: (role = 'architect') => ({
    id: `${role}-user-id`,
    email: `${role}@test.com`,
    role,
    permissions: getStakeholderPermissions(role),
    profile: {
      company: `Test ${role.charAt(0).toUpperCase() + role.slice(1)} Company`,
      license: `${role.toUpperCase()}-12345`,
    },
  }),
};

/**
 * Get permissions for construction stakeholder roles
 */
function getStakeholderPermissions(role: string): string[] {
  const permissions = {
    architect: ['design:read', 'design:write', 'bim:read', 'bim:write'],
    engineer: [
      'analysis:read',
      'analysis:write',
      'bim:read',
      'safety:read',
      'safety:write',
    ],
    contractor: [
      'construction:read',
      'construction:write',
      'materials:read',
      'progress:write',
    ],
    owner: [
      'project:read',
      'governance:read',
      'governance:write',
      'finance:read',
    ],
  };

  return permissions[role] || ['basic:read'];
}

// Setup and teardown hooks
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();

  // Reset environment variables that might be modified in tests
  process.env.NODE_ENV = 'test';
});

afterEach(() => {
  // Clean up any test data or connections
  jest.restoreAllMocks();
});

// Global error handling for tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process in tests
});

console.log('🚀 API Gateway test environment configured');
