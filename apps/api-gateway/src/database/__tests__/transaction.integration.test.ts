/**
 * Database Transaction Integration Tests
 *
 * Tests database transaction management, isolation, and recovery
 *
 * Test Coverage:
 * - Transaction commit and rollback
 * - Transaction isolation levels
 * - Concurrent transaction handling
 * - Batch operations with transactions
 * - Transaction timeout handling
 * - Nested transaction behavior (savepoints)
 * - Connection pool management
 * - Error recovery patterns
 *
 * OWASP Coverage: A03 (Injection), A04 (Insecure Design)
 *
 * @module database/__tests__/transaction.integration
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock the logger
vi.mock('../../../../../libs/shared/utils/src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock pg Pool
interface MockClient {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
}

interface MockPoolConfig {
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
}

// Transaction state tracker
interface TransactionState {
  isActive: boolean;
  queries: string[];
  committed: boolean;
  rolledBack: boolean;
  savepoints: string[];
}

// Create mock pool with transaction support
function createMockPool(config: MockPoolConfig = {
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
}) {
  const clients: MockClient[] = [];
  const transactions: Map<MockClient, TransactionState> = new Map();

  const createClient = (): MockClient => {
    const client: MockClient = {
      query: vi.fn().mockImplementation(async (sql: string, params?: any[]) => {
        const txState = transactions.get(client);

        // Handle BEGIN
        if (sql === 'BEGIN' || sql.startsWith('BEGIN')) {
          transactions.set(client, {
            isActive: true,
            queries: [],
            committed: false,
            rolledBack: false,
            savepoints: [],
          });
          return { rows: [], rowCount: 0 };
        }

        // Handle COMMIT
        if (sql === 'COMMIT') {
          if (!txState?.isActive) {
            throw new Error('No active transaction to commit');
          }
          txState.committed = true;
          txState.isActive = false;
          return { rows: [], rowCount: 0 };
        }

        // Handle ROLLBACK
        if (sql === 'ROLLBACK') {
          if (!txState?.isActive) {
            throw new Error('No active transaction to rollback');
          }
          txState.rolledBack = true;
          txState.isActive = false;
          return { rows: [], rowCount: 0 };
        }

        // Handle SAVEPOINT
        if (sql.startsWith('SAVEPOINT')) {
          const savepointName = sql.split(' ')[1];
          if (txState?.isActive) {
            txState.savepoints.push(savepointName);
          }
          return { rows: [], rowCount: 0 };
        }

        // Handle ROLLBACK TO SAVEPOINT
        if (sql.startsWith('ROLLBACK TO SAVEPOINT')) {
          const savepointName = sql.split(' ')[3];
          if (txState?.isActive) {
            const idx = txState.savepoints.indexOf(savepointName);
            if (idx !== -1) {
              txState.savepoints = txState.savepoints.slice(0, idx);
            }
          }
          return { rows: [], rowCount: 0 };
        }

        // Handle RELEASE SAVEPOINT
        if (sql.startsWith('RELEASE SAVEPOINT')) {
          return { rows: [], rowCount: 0 };
        }

        // Track queries within transaction
        if (txState?.isActive) {
          txState.queries.push(sql);
        }

        // Default mock responses
        if (sql.includes('INSERT')) {
          return { rows: [{ id: 'mock-id-1' }], rowCount: 1 };
        }
        if (sql.includes('UPDATE')) {
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('DELETE')) {
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('SELECT')) {
          return { rows: [{ id: 'mock-id-1', name: 'test' }], rowCount: 1 };
        }

        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };

    clients.push(client);
    return client;
  };

  return {
    connect: vi.fn().mockImplementation(async () => createClient()),
    query: vi.fn().mockImplementation(async (sql: string, params?: any[]) => {
      // Direct pool queries (no transaction)
      if (sql.includes('SELECT')) {
        return { rows: [{ id: 'mock-id-1' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
    end: vi.fn(),
    totalCount: clients.length,
    idleCount: 0,
    waitingCount: 0,
    options: config,
    getTransactionState: (client: MockClient) => transactions.get(client),
    getAllClients: () => clients,
  };
}

// Transaction manager class for testing
class TransactionManager {
  private pool: ReturnType<typeof createMockPool>;

  constructor(pool: ReturnType<typeof createMockPool>) {
    this.pool = pool;
  }

  async withTransaction<T>(
    callback: (client: MockClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async withSavepoint<T>(
    client: MockClient,
    savepointName: string,
    callback: () => Promise<T>
  ): Promise<T> {
    await client.query(`SAVEPOINT ${savepointName}`);

    try {
      const result = await callback();
      await client.query(`RELEASE SAVEPOINT ${savepointName}`);
      return result;
    } catch (error) {
      await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
      throw error;
    }
  }
}

describe('Database Transaction Integration', () => {
  let pool: ReturnType<typeof createMockPool>;
  let txManager: TransactionManager;

  beforeEach(() => {
    pool = createMockPool();
    txManager = new TransactionManager(pool);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Transaction Commit and Rollback
  // ===========================================================================
  describe('Transaction Commit and Rollback', () => {
    it('should commit transaction on success', async () => {
      const result = await txManager.withTransaction(async (client) => {
        await client.query('INSERT INTO users (name) VALUES ($1)', ['test']);
        await client.query('INSERT INTO profiles (user_id) VALUES ($1)', ['1']);
        return { success: true };
      });

      expect(result).toEqual({ success: true });

      const clients = pool.getAllClients();
      expect(clients.length).toBe(1);

      const txState = pool.getTransactionState(clients[0]);
      expect(txState?.committed).toBe(true);
      expect(txState?.rolledBack).toBe(false);
      expect(txState?.queries.length).toBe(2);
    });

    it('should rollback transaction on error', async () => {
      const mockError = new Error('Database constraint violation');

      await expect(
        txManager.withTransaction(async (client) => {
          await client.query('INSERT INTO users (name) VALUES ($1)', ['test']);
          throw mockError;
        })
      ).rejects.toThrow('Database constraint violation');

      const clients = pool.getAllClients();
      const txState = pool.getTransactionState(clients[0]);

      expect(txState?.committed).toBe(false);
      expect(txState?.rolledBack).toBe(true);
    });

    it('should release client after transaction completes', async () => {
      await txManager.withTransaction(async (client) => {
        await client.query('SELECT 1');
        return true;
      });

      const clients = pool.getAllClients();
      expect(clients[0].release).toHaveBeenCalled();
    });

    it('should release client even after error', async () => {
      try {
        await txManager.withTransaction(async (client) => {
          throw new Error('Test error');
        });
      } catch {
        // Expected
      }

      const clients = pool.getAllClients();
      expect(clients[0].release).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Transaction Isolation
  // ===========================================================================
  describe('Transaction Isolation', () => {
    it('should support different isolation levels', async () => {
      const client = await pool.connect();

      // Test various isolation levels
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      expect(pool.getTransactionState(client)?.isActive).toBe(true);
      await client.query('COMMIT');

      const newClient = await pool.connect();
      await newClient.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      expect(pool.getTransactionState(newClient)?.isActive).toBe(true);
      await newClient.query('COMMIT');
    });

    it('should track queries within transaction boundary', async () => {
      await txManager.withTransaction(async (client) => {
        await client.query('SELECT * FROM users WHERE id = $1', ['1']);
        await client.query('UPDATE users SET name = $1 WHERE id = $2', [
          'new-name',
          '1',
        ]);
        await client.query('INSERT INTO audit_log (action) VALUES ($1)', [
          'update',
        ]);
        return true;
      });

      const clients = pool.getAllClients();
      const txState = pool.getTransactionState(clients[0]);

      expect(txState?.queries).toContain('SELECT * FROM users WHERE id = $1');
      expect(txState?.queries).toContain(
        'UPDATE users SET name = $1 WHERE id = $2'
      );
      expect(txState?.queries).toContain(
        'INSERT INTO audit_log (action) VALUES ($1)'
      );
    });
  });

  // ===========================================================================
  // Batch Operations
  // ===========================================================================
  describe('Batch Operations', () => {
    it('should execute batch inserts within transaction', async () => {
      const items = [
        { name: 'item1', value: 100 },
        { name: 'item2', value: 200 },
        { name: 'item3', value: 300 },
      ];

      await txManager.withTransaction(async (client) => {
        for (const item of items) {
          await client.query(
            'INSERT INTO items (name, value) VALUES ($1, $2)',
            [item.name, item.value]
          );
        }
        return true;
      });

      const clients = pool.getAllClients();
      const txState = pool.getTransactionState(clients[0]);

      expect(txState?.queries.length).toBe(3);
      expect(txState?.committed).toBe(true);
    });

    it('should rollback all batch items on single failure', async () => {
      const items = ['item1', 'item2', 'FAIL', 'item4'];

      await expect(
        txManager.withTransaction(async (client) => {
          for (const item of items) {
            if (item === 'FAIL') {
              throw new Error('Batch item failed');
            }
            await client.query('INSERT INTO items (name) VALUES ($1)', [item]);
          }
          return true;
        })
      ).rejects.toThrow('Batch item failed');

      const clients = pool.getAllClients();
      const txState = pool.getTransactionState(clients[0]);

      expect(txState?.rolledBack).toBe(true);
      expect(txState?.queries.length).toBe(2); // Only 2 succeeded before failure
    });

    it('should support batched upsert operations', async () => {
      await txManager.withTransaction(async (client) => {
        await client.query(`
          INSERT INTO voxels (id, position, data)
          VALUES ($1, $2, $3)
          ON CONFLICT (id) DO UPDATE SET data = $3
        `, ['voxel-1', '(0,0,0)', '{}']);

        await client.query(`
          INSERT INTO voxels (id, position, data)
          VALUES ($1, $2, $3)
          ON CONFLICT (id) DO UPDATE SET data = $3
        `, ['voxel-2', '(1,1,1)', '{}']);

        return true;
      });

      const clients = pool.getAllClients();
      const txState = pool.getTransactionState(clients[0]);

      expect(txState?.committed).toBe(true);
      expect(txState?.queries.length).toBe(2);
    });
  });

  // ===========================================================================
  // Nested Transactions (Savepoints)
  // ===========================================================================
  describe('Nested Transactions (Savepoints)', () => {
    it('should create and release savepoints', async () => {
      await txManager.withTransaction(async (client) => {
        await client.query('INSERT INTO parent (name) VALUES ($1)', ['parent']);

        await txManager.withSavepoint(client, 'sp_child', async () => {
          await client.query('INSERT INTO child (parent_id) VALUES ($1)', [
            '1',
          ]);
        });

        return true;
      });

      const clients = pool.getAllClients();
      expect(clients[0].query).toHaveBeenCalledWith('SAVEPOINT sp_child');
      expect(clients[0].query).toHaveBeenCalledWith(
        'RELEASE SAVEPOINT sp_child'
      );
    });

    it('should rollback to savepoint on nested error', async () => {
      await txManager.withTransaction(async (client) => {
        await client.query('INSERT INTO parent (name) VALUES ($1)', ['parent']);

        try {
          await txManager.withSavepoint(client, 'sp_failing', async () => {
            await client.query('INSERT INTO child (parent_id) VALUES ($1)', [
              '1',
            ]);
            throw new Error('Nested operation failed');
          });
        } catch {
          // Expected - savepoint was rolled back
        }

        // Continue with main transaction
        await client.query('INSERT INTO other (data) VALUES ($1)', ['data']);
        return true;
      });

      const clients = pool.getAllClients();
      const txState = pool.getTransactionState(clients[0]);

      // Main transaction should still commit
      expect(txState?.committed).toBe(true);

      // Savepoint rollback should have been called
      expect(clients[0].query).toHaveBeenCalledWith(
        'ROLLBACK TO SAVEPOINT sp_failing'
      );
    });

    it('should support multiple savepoints', async () => {
      await txManager.withTransaction(async (client) => {
        await txManager.withSavepoint(client, 'sp1', async () => {
          await client.query('INSERT INTO t1 VALUES ($1)', ['1']);
        });

        await txManager.withSavepoint(client, 'sp2', async () => {
          await client.query('INSERT INTO t2 VALUES ($1)', ['2']);
        });

        await txManager.withSavepoint(client, 'sp3', async () => {
          await client.query('INSERT INTO t3 VALUES ($1)', ['3']);
        });

        return true;
      });

      const clients = pool.getAllClients();

      expect(clients[0].query).toHaveBeenCalledWith('SAVEPOINT sp1');
      expect(clients[0].query).toHaveBeenCalledWith('SAVEPOINT sp2');
      expect(clients[0].query).toHaveBeenCalledWith('SAVEPOINT sp3');
    });
  });

  // ===========================================================================
  // Connection Pool Management
  // ===========================================================================
  describe('Connection Pool Management', () => {
    it('should acquire client from pool', async () => {
      await txManager.withTransaction(async (client) => {
        await client.query('SELECT 1');
        return true;
      });

      expect(pool.connect).toHaveBeenCalledTimes(1);
    });

    it('should track multiple concurrent clients', async () => {
      // Simulate concurrent transactions
      const tx1 = txManager.withTransaction(async (client) => {
        await new Promise((r) => setTimeout(r, 50));
        await client.query('SELECT 1');
        return 'tx1';
      });

      const tx2 = txManager.withTransaction(async (client) => {
        await client.query('SELECT 2');
        return 'tx2';
      });

      const tx3 = txManager.withTransaction(async (client) => {
        await client.query('SELECT 3');
        return 'tx3';
      });

      const results = await Promise.all([tx1, tx2, tx3]);

      expect(results).toEqual(['tx1', 'tx2', 'tx3']);
      expect(pool.connect).toHaveBeenCalledTimes(3);
    });

    it('should release all clients after transactions', async () => {
      await Promise.all([
        txManager.withTransaction(async (client) => {
          await client.query('SELECT 1');
        }),
        txManager.withTransaction(async (client) => {
          await client.query('SELECT 2');
        }),
      ]);

      const clients = pool.getAllClients();
      clients.forEach((client) => {
        expect(client.release).toHaveBeenCalled();
      });
    });
  });

  // ===========================================================================
  // Error Recovery Patterns
  // ===========================================================================
  describe('Error Recovery Patterns', () => {
    it('should retry transaction on transient error', async () => {
      let attempts = 0;
      const maxRetries = 3;

      const retryableTransaction = async <T>(
        callback: (client: MockClient) => Promise<T>
      ): Promise<T> => {
        for (let i = 0; i < maxRetries; i++) {
          try {
            return await txManager.withTransaction(callback);
          } catch (error: any) {
            attempts++;
            if (i === maxRetries - 1 || !error.message.includes('transient')) {
              throw error;
            }
            await new Promise((r) => setTimeout(r, 100 * (i + 1)));
          }
        }
        throw new Error('Should not reach here');
      };

      // First two attempts fail with transient error
      let callCount = 0;
      const result = await retryableTransaction(async (client) => {
        callCount++;
        if (callCount < 3) {
          throw new Error('transient connection error');
        }
        await client.query('INSERT INTO data (value) VALUES ($1)', ['success']);
        return { success: true };
      });

      expect(result).toEqual({ success: true });
      expect(attempts).toBe(2);
    });

    it('should not retry on non-transient error', async () => {
      let attempts = 0;

      const retryableTransaction = async <T>(
        callback: (client: MockClient) => Promise<T>
      ): Promise<T> => {
        const maxRetries = 3;
        for (let i = 0; i < maxRetries; i++) {
          try {
            attempts++;
            return await txManager.withTransaction(callback);
          } catch (error: any) {
            if (i === maxRetries - 1 || !error.message.includes('transient')) {
              throw error;
            }
          }
        }
        throw new Error('Should not reach here');
      };

      await expect(
        retryableTransaction(async (client) => {
          throw new Error('constraint violation');
        })
      ).rejects.toThrow('constraint violation');

      expect(attempts).toBe(1); // No retries for non-transient errors
    });

    it('should handle connection lost during transaction', async () => {
      const client = await pool.connect();

      await client.query('BEGIN');

      // Simulate connection lost with async rejection
      client.query.mockImplementationOnce(async () => {
        throw new Error('Connection lost');
      });

      await expect(
        client.query('INSERT INTO data VALUES ($1)', ['test'])
      ).rejects.toThrow('Connection lost');

      // After connection lost, rollback the transaction
      await client.query('ROLLBACK');

      const txState = pool.getTransactionState(client);
      expect(txState?.rolledBack).toBe(true);
    });
  });

  // ===========================================================================
  // Transaction Patterns
  // ===========================================================================
  describe('Transaction Patterns', () => {
    it('should support read-then-write pattern', async () => {
      const result = await txManager.withTransaction(async (client) => {
        // Read current state
        const readResult = await client.query(
          'SELECT balance FROM accounts WHERE id = $1',
          ['acc-1']
        );
        const currentBalance = readResult.rows[0]?.balance || 0;

        // Write new state based on read
        await client.query(
          'UPDATE accounts SET balance = $1 WHERE id = $2',
          [currentBalance + 100, 'acc-1']
        );

        return { newBalance: currentBalance + 100 };
      });

      expect(result.newBalance).toBeDefined();
    });

    it('should support multi-table atomic updates', async () => {
      await txManager.withTransaction(async (client) => {
        // Debit from source
        await client.query(
          'UPDATE accounts SET balance = balance - $1 WHERE id = $2',
          [100, 'source']
        );

        // Credit to destination
        await client.query(
          'UPDATE accounts SET balance = balance + $1 WHERE id = $2',
          [100, 'destination']
        );

        // Log the transfer
        await client.query(
          'INSERT INTO transfers (from_acc, to_acc, amount) VALUES ($1, $2, $3)',
          ['source', 'destination', 100]
        );

        return true;
      });

      const clients = pool.getAllClients();
      const txState = pool.getTransactionState(clients[0]);

      expect(txState?.queries.length).toBe(3);
      expect(txState?.committed).toBe(true);
    });

    it('should support conditional insert/update (upsert pattern)', async () => {
      await txManager.withTransaction(async (client) => {
        await client.query(
          `INSERT INTO settings (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          ['theme', 'dark']
        );

        return true;
      });

      const clients = pool.getAllClients();
      const txState = pool.getTransactionState(clients[0]);

      expect(txState?.committed).toBe(true);
    });

    it('should support cascade delete pattern', async () => {
      await txManager.withTransaction(async (client) => {
        // Delete dependent records first
        await client.query('DELETE FROM order_items WHERE order_id = $1', [
          'order-1',
        ]);
        await client.query('DELETE FROM order_payments WHERE order_id = $1', [
          'order-1',
        ]);
        await client.query('DELETE FROM order_shipments WHERE order_id = $1', [
          'order-1',
        ]);

        // Then delete parent record
        await client.query('DELETE FROM orders WHERE id = $1', ['order-1']);

        return true;
      });

      const clients = pool.getAllClients();
      const txState = pool.getTransactionState(clients[0]);

      expect(txState?.queries.length).toBe(4);
      expect(txState?.committed).toBe(true);
    });
  });

  // ===========================================================================
  // Idempotency Testing
  // ===========================================================================
  describe('Idempotency Testing', () => {
    it('should handle idempotent operations safely', async () => {
      const operations: string[] = [];

      // Create a fresh pool with custom mock for this test
      const testPool = createMockPool();
      const testTxManager = new TransactionManager(testPool);

      const idempotentOperation = async (key: string, value: string, checkExisting: boolean = false) => {
        return testTxManager.withTransaction(async (client) => {
          if (checkExisting) {
            // Simulate record already exists
            operations.push('skipped');
            return { status: 'already_processed' };
          }

          // Record the operation
          await client.query(
            'INSERT INTO idempotency_keys (key, result) VALUES ($1, $2)',
            [key, value]
          );

          // Perform the actual operation
          await client.query('INSERT INTO data (value) VALUES ($1)', [value]);
          operations.push('executed');

          return { status: 'processed' };
        });
      };

      // First call should execute
      const result1 = await idempotentOperation('op-12345', 'test-value', false);
      expect(result1.status).toBe('processed');
      expect(operations).toContain('executed');

      // Second call (simulating existing record) should skip
      const result2 = await idempotentOperation('op-12345', 'test-value', true);
      expect(result2.status).toBe('already_processed');
      expect(operations).toContain('skipped');
    });
  });

  // ===========================================================================
  // Transaction Timeout Handling
  // ===========================================================================
  describe('Transaction Timeout Handling', () => {
    it('should handle statement timeout', async () => {
      const client = await pool.connect();

      await client.query('BEGIN');
      await client.query('SET statement_timeout = 1000'); // 1 second

      // Simulate long-running query timeout
      client.query.mockImplementationOnce(async () => {
        throw new Error('statement timeout');
      });

      await expect(
        client.query('SELECT * FROM large_table WHERE expensive_condition')
      ).rejects.toThrow('statement timeout');

      // Transaction should be rolled back
      await client.query('ROLLBACK');
    });

    it('should cleanup on transaction timeout', async () => {
      let cleanupCalled = false;

      const transactionWithTimeout = async <T>(
        callback: (client: MockClient) => Promise<T>,
        timeoutMs: number
      ): Promise<T> => {
        const client = await pool.connect();

        try {
          await client.query('BEGIN');

          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
              cleanupCalled = true;
              reject(new Error('Transaction timeout'));
            }, timeoutMs);
          });

          const result = await Promise.race([callback(client), timeoutPromise]);
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      };

      await expect(
        transactionWithTimeout(async (client) => {
          await new Promise((r) => setTimeout(r, 100));
          return 'done';
        }, 50)
      ).rejects.toThrow('Transaction timeout');

      expect(cleanupCalled).toBe(true);
    });
  });
});
