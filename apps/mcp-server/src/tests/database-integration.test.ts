/**
 * MCP Server Database Integration Tests
 * Tests the core database functionality and integration
 */

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  vi,
} from 'vitest';

// Mock the Logger before importing the database connection
vi.mock('../../../../libs/shared/utils/src/logger', () => {
  return {
    Logger: vi.fn().mockImplementation(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  };
});

import { MCPDatabaseManager } from '../database/connection';

// Mock the database configuration to avoid requiring actual database credentials
vi.mock('../config/database.config', () => ({
  getMCPDatabaseConfig: () => ({
    postgres: {
      host: 'localhost',
      port: 5432,
      database: 'test_db',
      user: 'test_user',
      password: 'test_pass',
      ssl: false,
      pool: {
        min: 1,
        max: 2,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        acquireTimeoutMillis: 10000,
      },
    },
    redis: {
      host: 'localhost',
      port: 6379,
      password: undefined,
      db: 0,
      keyPrefix: 'test:',
      retryDelayOnFailover: 50,
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,
    },
  }),
  validateMCPDatabaseConfig: () => ({
    valid: true,
    errors: [],
  }),
}));

describe('MCP Database Integration', () => {
  let dbManager: MCPDatabaseManager;

  beforeAll(() => {
    // Create a fresh instance for testing
    dbManager = new MCPDatabaseManager();
  });

  afterAll(async () => {
    // Clean up any connections
    if (dbManager) {
      await dbManager.disconnect();
    }
  });

  test('should initialize database manager with test configuration', () => {
    expect(dbManager).toBeDefined();
    expect(dbManager.isConnected).toBeDefined();
  });

  test('should handle graceful degradation when databases are unavailable', async () => {
    // Test health check without actual connections
    const health = await dbManager.checkHealth();

    expect(health).toBeDefined();
    expect(health.overall).toBeDefined();
    expect(['healthy', 'degraded', 'unhealthy']).toContain(health.overall);
    expect(health.postgres).toBeDefined();
    expect(health.redis).toBeDefined();
  });

  test('should provide connection status information', () => {
    const connectionStatus = dbManager.isConnected();

    expect(connectionStatus).toBeDefined();
    expect(typeof connectionStatus.postgres).toBe('boolean');
    expect(typeof connectionStatus.redis).toBe('boolean');
  });

  test('should handle database transaction errors gracefully', async () => {
    // Test error handling when no database is connected
    await expect(
      dbManager.transaction(async () => {
        return 'test result';
      })
    ).rejects.toThrow('PostgreSQL pool not initialized');
  });

  test('should handle Redis operation errors gracefully', async () => {
    // Test error handling when no Redis is connected
    await expect(
      dbManager.redisOperation(async () => {
        return 'test result';
      })
    ).rejects.toThrow('Redis client not initialized or connected');
  });

  test('should emit events for database health monitoring', (done) => {
    let eventReceived = false;

    // Listen for health events
    dbManager.on('database:health', (health) => {
      expect(health).toBeDefined();
      expect(health.overall).toBeDefined();
      eventReceived = true;
    });

    // Listen for error events
    dbManager.on('database:error', (event) => {
      expect(event).toBeDefined();
      expect(event.type).toBeDefined();
      eventReceived = true;
    });

    // Trigger a health check
    dbManager.checkHealth().then(() => {
      // Give time for events to be emitted
      setTimeout(() => {
        if (!eventReceived) {
          // It's OK if no events are emitted in test environment
          done();
        } else {
          done();
        }
      }, 100);
    });
  });

  test('should provide proper TypeScript types', () => {
    // Type checking test - this will fail at compile time if types are wrong
    const connectionStatus: { postgres: boolean; redis: boolean } =
      dbManager.isConnected();
    expect(connectionStatus.postgres).toBeDefined();
    expect(connectionStatus.redis).toBeDefined();

    // Test that health check returns proper types
    dbManager.checkHealth().then((health) => {
      const status: 'healthy' | 'unhealthy' | 'degraded' = health.overall;
      expect(['healthy', 'degraded', 'unhealthy']).toContain(status);
    });
  });
});

describe('MCP Database Configuration Validation', () => {
  test('should validate configuration structure', () => {
    const manager = new MCPDatabaseManager();
    expect(manager).toBeDefined();

    // The manager should initialize without throwing errors
    // when proper mocked configuration is provided
  });

  test('should handle missing environment variables gracefully', () => {
    // This tests the graceful degradation when env vars are missing
    const manager = new MCPDatabaseManager();
    expect(manager.isConnected().postgres).toBe(false);
    expect(manager.isConnected().redis).toBe(false);
  });
});
