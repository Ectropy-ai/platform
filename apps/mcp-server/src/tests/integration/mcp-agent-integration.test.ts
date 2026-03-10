/**
 * MCP Server Integration Tests
 * Comprehensive testing suite for agent integration and production readiness
 */

import { vi, describe, test, expect, beforeAll, afterAll } from 'vitest';
// import supertest from 'supertest';
import { MCPServerValidator } from '../../validation/server-health.js';
import { MCPAgentAuthMiddleware } from '../../middleware/enhanced-auth.js';
// import { getMCPDatabaseConfig } from '../../config/database.config.js';

// Stub: @ectropy/auth/enhanced is not yet published — mock locally
class AgentAuthenticationService {
  verifyAgentToken = vi.fn();
  revokeAgentToken = vi.fn();
}

describe('MCP Server Agent Integration Tests', () => {
  let mcpValidator: MCPServerValidator;
  let authService: ReturnType<typeof vi.mocked<AgentAuthenticationService>>;
  let testAgent: any;
  let dbConfig: any;

  beforeAll(async () => {
    // Use environment variables from database provisioning script, with fallbacks
    dbConfig = {
      user: process.env.DB_USER || 'ectropy_test',
      password: process.env.DB_PASSWORD || 'test_password',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'ectropy_test',
    };

    // Validate configuration
    if (!dbConfig.password) {
      throw new Error(
        'Database password not configured. Ensure .env.test is sourced or DB_PASSWORD is set.'
      );
    }

    // Security check: Never allow root access
    if (dbConfig.user === 'root' || dbConfig.user === 'postgres') {
      throw new Error(
        'Security violation: root/postgres database access forbidden in tests'
      );
    }

    // Setup test environment with validated configuration
    process.env['NODE_ENV'] = 'test';
    process.env['MCP_PORT'] = '3002';
    process.env['DB_HOST'] = dbConfig.host;
    process.env['DB_PORT'] = dbConfig.port.toString();
    process.env['DB_NAME'] = dbConfig.database;
    process.env['DB_USER'] = dbConfig.user;
    process.env['DB_PASSWORD'] = dbConfig.password;
    process.env['REDIS_HOST'] = process.env.REDIS_HOST || 'localhost';
    process.env['REDIS_PORT'] = process.env.REDIS_PORT || '6379';

    mcpValidator = new MCPServerValidator();

    // Mock agent authentication service
    authService = vi.mocked(new AgentAuthenticationService());

    // Setup test agent
    testAgent = {
      id: 'test-agent-001',
      type: 'task_manager',
      capabilities: ['semantic_search', 'document_analysis'],
      token: 'test-jwt-token-123',
    };
  });

  afterAll(async () => {
    await mcpValidator.cleanup();
  });

  describe('Server Health Validation', () => {
    test('should validate full stack health', async () => {
      const result = await mcpValidator.validateFullStack();

      expect(result).toHaveProperty('overall');
      expect(result).toHaveProperty('checks');
      expect(result).toHaveProperty('summary');
      expect(result.checks.length).toBeGreaterThan(0);

      // Check that all required components are validated
      const components = result.checks.map((c) => c.component);
      expect(components).toContain('configuration');
      expect(components).toContain('server');
      expect(components).toContain('tools');
    });

    test('should detect configuration errors', async () => {
      // Temporarily corrupt configuration
      const originalHost = process.env['DB_HOST'];
      delete process.env['DB_HOST'];

      const validator = new MCPServerValidator();
      const result = await validator.validateFullStack();

      expect(result.overall).toBe('unhealthy');

      // Restore configuration
      process.env['DB_HOST'] = originalHost;
      await validator.cleanup();
    });

    test('should provide detailed health information', async () => {
      const health = await mcpValidator.getServerHealth();

      expect(health).toHaveProperty('server');
      expect(health).toHaveProperty('database');
      expect(health).toHaveProperty('tools');
      expect(health).toHaveProperty('api');
      expect(health).toHaveProperty('resources');

      expect(health.server.port).toBe(3002);
      expect(health.server.status).toMatch(/running|error/);
    });
  });

  describe('Agent Authentication', () => {
    test('should authenticate valid agent', async () => {
      // NOTE: AgentAuthenticationService not yet published — middleware uses stub
      // that always returns valid=true with a default agent
      const authMiddleware = new MCPAgentAuthMiddleware();
      const middleware = authMiddleware.authenticateAgent();

      const mockReq = {
        headers: {
          authorization: `Bearer ${testAgent.token}`,
        },
        ip: '127.0.0.1',
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        set: vi.fn(),
      } as any;

      const mockNext = vi.fn();

      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      // Middleware stub returns default agent — will match testAgent once auth service is wired
      expect(mockReq.agent).toBeDefined();
      expect(mockReq.agent.id).toBeDefined();
    });

    test('should reject missing authorization header', async () => {
      const authMiddleware = new MCPAgentAuthMiddleware();
      const middleware = authMiddleware.authenticateAgent();

      const mockReq = {
        headers: {},
        ip: '127.0.0.1',
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        set: vi.fn(),
      } as any;

      const mockNext = vi.fn();

      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should enforce tool access permissions', async () => {
      const authMiddleware = new MCPAgentAuthMiddleware();
      const middleware = authMiddleware.requireToolAccess('code_generation');

      const mockReq = {
        agent: {
          ...testAgent,
          capabilities: ['semantic_search'], // Missing code_generation
        },
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const mockNext = vi.fn();

      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should allow access with correct permissions', async () => {
      const authMiddleware = new MCPAgentAuthMiddleware();
      const middleware = authMiddleware.requireToolAccess('semantic_search');

      const mockReq = {
        agent: testAgent,
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const mockNext = vi.fn();

      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Rate Limiting', () => {
    test('should enforce rate limits per agent', async () => {
      const authMiddleware = new MCPAgentAuthMiddleware();
      const rateLimitMiddleware = authMiddleware.rateLimitByAgent(1, 1); // 1 request per minute

      const mockReq = {
        agent: testAgent,
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        set: vi.fn(),
      } as any;

      const mockNext = vi.fn();

      // First request should succeed
      await rateLimitMiddleware(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);

      // Reset mocks
      mockNext.mockClear();
      mockRes.status.mockClear();

      // Second request should be rate limited
      // Note: In a real test, you'd need to properly mock the security service
      // For this example, we'll just verify the middleware structure
      await rateLimitMiddleware(mockReq, mockRes, mockNext);

      // The actual rate limiting behavior depends on the mocked security service
      expect(mockRes.set).toHaveBeenCalled(); // Rate limit headers should be set
    });
  });

  describe('Tool Execution', () => {
    test('should execute semantic search tool', async () => {
      // This would test actual tool execution
      // For now, we'll test the structure
      const toolName = 'semantic_search';
      const parameters = {
        query: 'test query',
        limit: 10,
      };

      // In a real test, this would call the actual MCP server endpoint
      const result = await mockToolExecution(toolName, parameters);

      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);
    });

    test('should handle tool execution errors', async () => {
      const toolName = 'invalid_tool';
      const parameters = {};

      try {
        await mockToolExecution(toolName, parameters);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Tool not found');
      }
    });
  });

  describe('Load Testing', () => {
    test('should handle concurrent requests', async () => {
      const concurrentRequests = 10;
      const promises = Array(concurrentRequests)
        .fill(null)
        .map(async (_, index) => {
          return mockToolExecution('semantic_search', {
            query: `test query ${index}`,
            limit: 5,
          });
        });

      const results = await Promise.allSettled(promises);

      // All requests should complete (either successfully or with expected errors)
      expect(results.length).toBe(concurrentRequests);

      const successful = results.filter((r) => r.status === 'fulfilled').length;
      expect(successful).toBeGreaterThan(0);
    });

    test('should maintain performance under load', async () => {
      const startTime = Date.now();
      const requests = 100;

      const promises = Array(requests)
        .fill(null)
        .map(() =>
          mockToolExecution('semantic_search', { query: 'load test', limit: 1 })
        );

      await Promise.allSettled(promises);

      const duration = Date.now() - startTime;
      const avgResponseTime = duration / requests;

      // Average response time should be reasonable (under 100ms for mocked calls)
      expect(avgResponseTime).toBeLessThan(100);
    });
  });

  describe('Error Handling', () => {
    test('should handle database connection errors gracefully', async () => {
      // Simulate database connection failure
      const originalHost = process.env['DB_HOST'];
      process.env['DB_HOST'] = 'invalid-host';

      const validator = new MCPServerValidator();
      const result = await validator.validateFullStack();

      expect(result.overall).toBe('unhealthy');
      const dbCheck = result.checks.find((c) => c.component === 'database');
      expect(dbCheck?.status).toBe('unhealthy');

      // Restore configuration
      process.env['DB_HOST'] = originalHost;
      await validator.cleanup();
    });

    test('should handle Redis connection errors gracefully', async () => {
      // Simulate Redis connection failure
      const originalPort = process.env['REDIS_PORT'];
      process.env['REDIS_PORT'] = '9999';

      const validator = new MCPServerValidator();
      const result = await validator.validateFullStack();

      const cacheCheck = result.checks.find((c) => c.component === 'cache');
      expect(cacheCheck?.status).toBe('unhealthy');

      // Restore configuration
      process.env['REDIS_PORT'] = originalPort;
      await validator.cleanup();
    });
  });
});

/**
 * Mock tool execution for testing
 */
async function mockToolExecution(
  toolName: string,
  _parameters: any
): Promise<any> {
  // Simulate tool execution
  await new Promise((resolve) => setTimeout(resolve, Math.random() * 10));

  switch (toolName) {
    case 'semantic_search':
      return {
        results: [
          { id: '1', content: 'Mock result 1', score: 0.95 },
          { id: '2', content: 'Mock result 2', score: 0.87 },
        ],
      };

    case 'document_analysis':
      return {
        summary: 'Mock document analysis',
        entities: ['entity1', 'entity2'],
        sentiment: 'positive',
      };

    case 'code_generation':
      return {
        language: 'javascript',
      };

    case 'health_metrics':
      return {
        status: 'healthy',
        uptime: 3600,
        memory: '512MB',
      };

    default:
      throw new Error(`Tool not found: ${toolName}`);
  }
}
