/**
 * Enterprise Unit Tests - DatabaseService
 * Target: 100% code coverage with comprehensive test scenarios
 */

import { Pool, PoolClient } from 'pg';
import {
  DatabaseService,
  CacheService,
  HealthCheckService,
} from '@ectropy/database';
import { DatabaseConfig, RedisConfig } from '@ectropy/database';
import { vi } from 'vitest';

// Mock pg module
vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    query: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
    totalCount: 10,
    idleCount: 5,
    waitingCount: 0,
  })),
}));

// Mock Redis
vi.mock('ioredis', () => {
  const Redis = vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    ping: vi.fn().mockResolvedValue('PONG'),
    on: vi.fn(),
    flushdb: vi.fn().mockResolvedValue('OK'),
  }));
  return { default: Redis };
});

// Mock logger
vi.mock('@ectropy/shared/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('DatabaseService - Enterprise Unit Tests', () => {
  let databaseService: DatabaseService;
  let mockPool: ReturnType<typeof vi.fn>ed<Pool>;
  let mockClient: ReturnType<typeof vi.fn>ed<PoolClient>;
  let config: DatabaseConfig;

  beforeEach(() => {
    // Setup mock configuration
    config = {
      host: 'localhost',
      port: 5432,
      database: 'ectropy_test',
      username: 'test_user',
      password: 'test_password',
      ssl: false,
      maxConnections: 20,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    };

    // Setup mock client
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    } as any;

    // Setup mock pool
    mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
      query: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      totalCount: 10,
      idleCount: 5,
      waitingCount: 0,
    } as any;

    (Pool as ReturnType<typeof vi.fn>).mockImplementation(() => mockPool);

    databaseService = new DatabaseService(config);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Service Initialization', () => {
    it('should initialize service correctly', () => {
      expect(databaseService).toBeDefined();
      expect(databaseService).toBeInstanceOf(DatabaseService);
      expect(Pool).toHaveBeenCalledWith({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.username,
        password: config.password,
        ssl: config.ssl,
        max: config.maxConnections,
        connectionTimeoutMillis: config.connectionTimeoutMillis,
        idleTimeoutMillis: config.idleTimeoutMillis,
      });
    });

    it('should set up pool event handlers', () => {
      expect(mockPool.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockPool.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should have all required public methods', () => {
      expect(typeof databaseService.connect).toBe('function');
      expect(typeof databaseService.disconnect).toBe('function');
      expect(typeof databaseService.query).toBe('function');
      expect(typeof databaseService.transaction).toBe('function');
      expect(typeof databaseService.healthCheck).toBe('function');
      expect(typeof databaseService.getMetrics).toBe('function');
    });
  });

  describe('Connection Management', () => {
    it('should connect successfully', async () => {
      await databaseService.connect();

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle connection errors', async () => {
      const connectionError = new Error('Connection failed');
      mockPool.connect.mockRejectedValueOnce(connectionError);

      await expect(databaseService.connect()).rejects.toThrow(
        'Connection failed'
      );
    });

    it('should disconnect properly', async () => {
      await databaseService.disconnect();

      expect(mockPool.end).toHaveBeenCalled();
    });

    it('should handle disconnect errors gracefully', async () => {
      const disconnectError = new Error('Disconnect failed');
      mockPool.end.mockRejectedValueOnce(disconnectError);

      await expect(databaseService.disconnect()).resolves.not.toThrow();
    });
  });

  describe('Query Execution', () => {
    const testQuery = 'SELECT * FROM users WHERE id = $1';
    const testParams = ['user-123'];
    const mockResult = {
      rows: [{ id: 'user-123', email: 'test@example.com' }],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    };

    it('should execute queries successfully', async () => {
      mockPool.query.mockResolvedValueOnce(mockResult);

      const result = await databaseService.query(testQuery, testParams);

      expect(mockPool.query).toHaveBeenCalledWith(testQuery, testParams);
      expect(result).toEqual(mockResult);
    });

    it('should handle query errors', async () => {
      const queryError = new Error('Query execution failed');
      mockPool.query.mockRejectedValueOnce(queryError);

      await expect(
        databaseService.query(testQuery, testParams)
      ).rejects.toThrow('Query execution failed');
    });

    it('should validate query parameters', async () => {
      const invalidQuery = null as any;

      await expect(databaseService.query(invalidQuery)).rejects.toThrow(
        'Query is required'
      );
    });

    it('should handle empty result sets', async () => {
      const emptyResult = {
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };

      mockPool.query.mockResolvedValueOnce(emptyResult);

      const result = await databaseService.query(
        'SELECT * FROM users WHERE id = $1',
        ['nonexistent']
      );

      expect(result.rows).toHaveLength(0);
      expect(result.rowCount).toBe(0);
    });
  });

  describe('Transaction Management', () => {
    it('should execute transactions successfully', async () => {
      const transactionCallback = jest
        .fn()
        .mockResolvedValue('transaction result');

      mockClient.query
        .mockResolvedValueOnce({ command: 'BEGIN' } as any)
        .mockResolvedValueOnce({ command: 'COMMIT' } as any);

      const result = await databaseService.transaction(transactionCallback);

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(transactionCallback).toHaveBeenCalledWith(mockClient);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toBe('transaction result');
    });

    it('should rollback transactions on error', async () => {
      const transactionError = new Error('Transaction failed');
      const transactionCallback = vi.fn().mockRejectedValue(transactionError);

      mockClient.query
        .mockResolvedValueOnce({ command: 'BEGIN' } as any)
        .mockResolvedValueOnce({ command: 'ROLLBACK' } as any);

      await expect(
        databaseService.transaction(transactionCallback)
      ).rejects.toThrow('Transaction failed');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle nested transactions', async () => {
      const nestedTransactionCallback = vi.fn(async (client) => {
        await client.query('SAVEPOINT nested_transaction');
        await client.query('INSERT INTO test_table VALUES ($1)', ['test']);
        await client.query('RELEASE SAVEPOINT nested_transaction');
        return 'nested result';
      });

      mockClient.query
        .mockResolvedValueOnce({ command: 'BEGIN' } as any)
        .mockResolvedValueOnce({ command: 'SAVEPOINT' } as any)
        .mockResolvedValueOnce({ command: 'INSERT', rowCount: 1 } as any)
        .mockResolvedValueOnce({ command: 'RELEASE' } as any)
        .mockResolvedValueOnce({ command: 'COMMIT' } as any);

      const result = await databaseService.transaction(
        nestedTransactionCallback
      );

      expect(result).toBe('nested result');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        'SAVEPOINT nested_transaction'
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });
  });

  describe('Health Check', () => {
    it('should return healthy status when database is accessible', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ result: 1 }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const health = await databaseService.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.status).toBe('connected');
      expect(health.responseTime).toBeDefined();
      expect(mockPool.query).toHaveBeenCalledWith('SELECT 1 as result');
    });

    it('should return unhealthy status when database is inaccessible', async () => {
      const healthError = new Error('Health check failed');
      mockPool.query.mockRejectedValueOnce(healthError);

      const health = await databaseService.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.status).toBe('error');
      expect(health.error).toBe('Health check failed');
    });
  });

  describe('Connection Pool Metrics', () => {
    it('should return accurate pool metrics', () => {
      const metrics = databaseService.getMetrics();

      expect(metrics).toEqual({
        totalConnections: 10,
        idleConnections: 5,
        waitingConnections: 0,
        activeConnections: 5,
      });
    });

    it('should handle missing pool metrics gracefully', () => {
      // Simulate pool without metrics
      (mockPool as any).totalCount = undefined;
      (mockPool as any).idleCount = undefined;
      (mockPool as any).waitingCount = undefined;

      const metrics = databaseService.getMetrics();

      expect(metrics).toEqual({
        totalConnections: 0,
        idleConnections: 0,
        waitingConnections: 0,
        activeConnections: 0,
      });
    });
  });

  describe('Performance Tests', () => {
    it('should handle high query volume efficiently', async () => {
      const mockQueryResult = {
        rows: [{ id: 1, name: 'Test' }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };

      mockPool.query.mockResolvedValue(mockQueryResult);

      const queries = Array(100)
        .fill(null)
        .map((_, i) =>
          databaseService.query('SELECT * FROM test WHERE id = $1', [
            i.toString(),
          ])
        );

      const startTime = Date.now();
      const results = await Promise.all(queries);
      const endTime = Date.now();

      expect(results).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(2000); // Should complete within 2 seconds
      results.forEach((result) => {
        expect(result.rows).toHaveLength(1);
      });
    });

    it('should maintain performance under concurrent transactions', async () => {
      const transactionCallback = vi.fn().mockResolvedValue('success');

      mockClient.query
        .mockResolvedValue({ command: 'BEGIN' } as any)
        .mockResolvedValue({ command: 'COMMIT' } as any);

      const transactions = Array(10)
        .fill(null)
        .map(() => databaseService.transaction(transactionCallback));

      const startTime = Date.now();
      const results = await Promise.all(transactions);
      const endTime = Date.now();

      expect(results).toHaveLength(10);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
      results.forEach((result) => expect(result).toBe('success'));
    });
  });

  describe('Error Recovery', () => {
    it('should recover from temporary connection failures', async () => {
      // First call fails, second succeeds
      mockPool.connect
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValueOnce(mockClient);

      await expect(databaseService.connect()).rejects.toThrow(
        'Connection failed'
      );

      // Should recover on retry
      await expect(databaseService.connect()).resolves.not.toThrow();
    });

    it('should handle connection pool exhaustion gracefully', async () => {
      const poolExhaustedError = new Error('Connection pool exhausted');
      mockPool.query.mockRejectedValueOnce(poolExhaustedError);

      await expect(databaseService.query('SELECT 1')).rejects.toThrow(
        'Connection pool exhausted'
      );
    });
  });

  describe('Memory Management', () => {
    it('should not cause memory leaks during repeated operations', async () => {
      const mockQueryResult = {
        rows: [{ id: 1, data: new Array(1000).fill('test').join('') }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };

      mockPool.query.mockResolvedValue(mockQueryResult);

      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < 100; i++) {
        await databaseService.query('SELECT * FROM large_table');
      }

      // Force garbage collection if available
      global.gc && global.gc();

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null and undefined parameters', async () => {
      const mockResult = {
        rows: [{ id: null, value: undefined }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };

      mockPool.query.mockResolvedValueOnce(mockResult);

      const result = await databaseService.query(
        'SELECT * FROM test WHERE id = $1',
        [null]
      );

      expect(result.rows[0].id).toBeNull();
      expect(result.rows[0].value).toBeUndefined();
    });

    it('should handle very large result sets', async () => {
      const largeResultSet = {
        rows: new Array(10000)
          .fill(null)
          .map((_, i) => ({ id: i, data: `data-${i}` })),
        rowCount: 10000,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };

      mockPool.query.mockResolvedValueOnce(largeResultSet);

      const result = await databaseService.query('SELECT * FROM large_table');

      expect(result.rows).toHaveLength(10000);
      expect(result.rowCount).toBe(10000);
    });

    it('should handle special characters in queries and parameters', async () => {
      const specialCharsQuery = 'SELECT * FROM test WHERE description = $1';
      const specialCharsParam =
        'Test with \'quotes\' and "double quotes" and ; semicolons';

      const mockResult = {
        rows: [{ id: 1, description: specialCharsParam }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };

      mockPool.query.mockResolvedValueOnce(mockResult);

      const result = await databaseService.query(specialCharsQuery, [
        specialCharsParam,
      ]);

      expect(result.rows[0].description).toBe(specialCharsParam);
      expect(mockPool.query).toHaveBeenCalledWith(specialCharsQuery, [
        specialCharsParam,
      ]);
    });
  });
});
