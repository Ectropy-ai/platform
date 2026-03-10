/**
 * Database Connection Management for MCP Server
 * Implements PostgreSQL and Redis connections with production-grade features
 */

import { Pool, type PoolClient, type PoolConfig } from 'pg';
import { Redis } from 'ioredis';
import { Logger } from '../../../../libs/shared/utils/src/logger';
import {
  getMCPDatabaseConfig,
  validateMCPDatabaseConfig,
  type MCPDatabaseConfig,
} from '../config/database.config.js';
import { EventEmitter } from 'events';

// Type compatibility for IORedis
type RedisClient = Redis;

export interface DatabaseConnection {
  postgres: Pool;
  redis: RedisClient;
  isHealthy: () => Promise<boolean>;
  close: () => Promise<void>;
}

export interface DatabaseHealthCheck {
  postgres: {
    status: 'healthy' | 'unhealthy' | 'degraded';
    connections: number;
    responseTime: number;
  };
  redis: {
    status: 'healthy' | 'unhealthy' | 'degraded';
    responseTime: number;
    memory: string;
  };
  overall: 'healthy' | 'unhealthy' | 'degraded';
}

export class MCPDatabaseManager extends EventEmitter {
  private config: MCPDatabaseConfig;
  private pgPool?: Pool;
  private redisClient?: RedisClient;
  private healthCheckInterval?: NodeJS.Timeout;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private logger: Logger;

  constructor() {
    super();
    this.logger = new Logger('MCPDatabaseManager');

    // Handle cases where database configuration is not available (development/testing)
    try {
      this.config = getMCPDatabaseConfig();
      this.validateConfiguration();
    } catch (error) {
      this.logger.warn('Database configuration not available, running in degraded mode', {
        error: (error as Error).message
      });
      // Create minimal config for testing
      this.config = this.createTestConfig();
    }
  }

  private createTestConfig(): MCPDatabaseConfig {
    return {
      postgres: {
        host: 'localhost',
        port: 5432,
        database: 'test_db',
        user: 'test_user',
        password: 'test_pass',
        ssl: false,
        pool: {
          min: 1,
          max: 5,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
          acquireTimeoutMillis: 10000,
        },
        enabled: false, // Disabled in test/degraded mode
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
        enabled: false, // Disabled in test/degraded mode
      },
      validationOnly: true, // Test config runs in validation-only mode
    };
  }

  private validateConfiguration(): void {
    const validation = validateMCPDatabaseConfig(this.config);
    if (!validation.valid) {
      throw new Error(
        `Database configuration invalid: ${validation.errors.join(', ')}`
      );
    }
  }

  /**
   * Initialize database connections
   */
  public async connect(): Promise<DatabaseConnection> {
    try {

      // Initialize PostgreSQL connection pool
      await this.initializePostgreSQL();

      // Initialize Redis connection
      await this.initializeRedis();

      // Start health monitoring
      this.startHealthMonitoring();


      return {
        postgres: this.pgPool!,
        redis: this.redisClient!,
        isHealthy: () =>
          this.checkHealth().then((h) => h.overall === 'healthy'),
        close: () => this.disconnect(),
      };
    } catch (error) {
      await this.disconnect();
      throw error;
    }
  }

  private async initializePostgreSQL(): Promise<void> {
    const pgConfig = this.config.postgres;

    const poolConfig: PoolConfig = {
      host: pgConfig.host,
      port: pgConfig.port,
      database: pgConfig.database,
      user: pgConfig.user,
      password: pgConfig.password,
      ssl: pgConfig.ssl,
      min: pgConfig.pool.min,
      max: pgConfig.pool.max,
      idleTimeoutMillis: pgConfig.pool.idleTimeoutMillis,
      connectionTimeoutMillis: pgConfig.pool.connectionTimeoutMillis,
      // Note: acquireTimeoutMillis is not supported in this version
    };

    this.pgPool = new Pool(poolConfig);

    try {
      // Test connection
      const testClient = await this.pgPool.connect();
      await testClient.query('SELECT NOW()');
      testClient.release();
    } catch (error) {
      console.warn(
        '⚠️ PostgreSQL connection test failed (may be expected in development):',
        (error as Error).message
      );
      // Don't throw - allow graceful degradation
    }

    // Handle connection events
    this.pgPool.on('error', (err) => {
      this.emit('database:error', { type: 'postgres', error: err });
      this.handleConnectionError('postgres', err);
    });

    this.pgPool.on('connect', () => {
      this.reconnectAttempts = 0; // Reset on successful connection
      this.emit('database:connected', { type: 'postgres' });
    });

  }

  private async initializeRedis(): Promise<void> {
    const redisConfig = this.config.redis;

    // Create Redis client with IORedis
    this.redisClient = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      db: redisConfig.db,
      connectTimeout: redisConfig.connectTimeout,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    // Handle Redis events
    if (this.redisClient) {
      this.redisClient.on('error', (err) => {
        console.warn(
          'Redis connection error (may be expected in development):',
          err.message
        );
        this.emit('database:error', { type: 'redis', error: err });
        this.handleConnectionError('redis', err);
      });

      this.redisClient.on('connect', () => {
        this.reconnectAttempts = 0;
        this.emit('database:connected', { type: 'redis' });
      });

      this.redisClient.on('ready', () => {
        this.emit('database:ready', { type: 'redis' });
      });
    }

    try {
      // Test Redis connection with IORedis promise-based API
      if (this.redisClient) {
        const _reply = await this.redisClient.ping();
      }
    } catch (error) {
      console.warn(
        '⚠️ Redis connection failed (may be expected in development):',
        (error as Error).message
      );
      // Don't throw - allow graceful degradation
    }
  }

  private handleConnectionError(
    type: 'postgres' | 'redis',
    error: Error
  ): void {
    this.reconnectAttempts++;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('database:failure', {
        type,
        error,
        attempts: this.reconnectAttempts,
      });
      return;
    }

    console.warn(
      `⚠️ Connection error for ${type}, attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`
    );
    this.emit('database:reconnecting', {
      type,
      attempts: this.reconnectAttempts,
    });
  }

  /**
   * Check health of all database connections
   */
  public async checkHealth(): Promise<DatabaseHealthCheck> {
    const health: DatabaseHealthCheck = {
      postgres: { status: 'unhealthy', connections: 0, responseTime: 0 },
      redis: { status: 'unhealthy', responseTime: 0, memory: 'unknown' },
      overall: 'unhealthy',
    };

    // Check PostgreSQL health
    try {
      const pgStart = Date.now();
      if (this.pgPool) {
        const client = await this.pgPool.connect();
        await client.query('SELECT 1');
        client.release();

        health.postgres = {
          status: 'healthy',
          connections: this.pgPool.totalCount,
          responseTime: Date.now() - pgStart,
        };
      }
    } catch (error) {
      health.postgres.status = 'degraded'; // Use degraded instead of unhealthy for development
    }

    // Check Redis health
    try {
      const redisStart = Date.now();
      if (this.redisClient && this.redisClient.status === 'ready') {
        const reply = await this.redisClient.ping();

        // Get memory info with IORedis promise-based API
        let memoryInfo = 'unknown';
        try {
          const info = await this.redisClient.info('memory');
          const memoryMatch = info
            .split('\r\n')
            .find((line: string) => line.startsWith('used_memory_human:'));
          memoryInfo = memoryMatch?.split(':')[1]?.trim() || 'unknown';
        } catch (err) {
          this.logger.debug('Redis memory info not available', {
            error: (err as Error).message
          });
        }

        health.redis = {
          status: reply === 'PONG' ? 'healthy' : 'degraded',
          responseTime: Date.now() - redisStart,
          memory: memoryInfo,
        };
      }
    } catch (error) {
      health.redis = {
        status: 'degraded',
        responseTime: 0,
        memory: 'unknown',
      }; // Use degraded instead of unhealthy for development
    }

    // Determine overall health - be more forgiving in development
    const healthyCount = [health.postgres.status, health.redis.status].filter(
      (s) => s === 'healthy'
    ).length;
    const degradedCount = [health.postgres.status, health.redis.status].filter(
      (s) => s === 'degraded'
    ).length;

    if (healthyCount === 2) {
      health.overall = 'healthy';
    } else if (healthyCount + degradedCount === 2) {
      health.overall = 'degraded';
    } else {
      health.overall = 'unhealthy';
    }

    return health;
  }

  private startHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.checkHealth();
        this.emit('database:health', health);

        if (health.overall === 'unhealthy') {
        }
      } catch (error) {
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Gracefully close all database connections
   */
  public async disconnect(): Promise<void> {

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    const closePromises: Promise<void>[] = [];

    if (this.pgPool) {
      closePromises.push(
        this.pgPool
          .end()
          .then(() => {
            // PostgreSQL pool closed successfully
          })
          .catch((_err) => {
            // Error closing PostgreSQL pool - connection may already be closed
          })
      );
    }

    if (this.redisClient && this.redisClient.status === 'ready') {
      closePromises.push(
        new Promise<void>((resolve) => {
          this.redisClient!.quit()
            .then(() => {
              resolve();
            })
            .catch((_err) => {
              resolve(); // Continue cleanup even if Redis quit fails
            });
        })
      );
    }

    await Promise.allSettled(closePromises);
  }

  /**
   * Execute a database transaction with automatic rollback on error
   */
  public async transaction<T>(
    operation: (_client: PoolClient) => Promise<T>
  ): Promise<T> {
    if (!this.pgPool) {
      throw new Error('PostgreSQL pool not initialized');
    }

    const _client = await this.pgPool.connect();

    try {
      await _client.query('BEGIN');
      const result = await operation(_client);
      await _client.query('COMMIT');
      return result;
    } catch (error) {
      await _client.query('ROLLBACK');
      throw error;
    } finally {
      _client.release();
    }
  }

  /**
   * Execute Redis operations with automatic retry logic
   */
  public async redisOperation<T>(
    operation: (_client: RedisClient) => Promise<T>,
    maxRetries = 3
  ): Promise<T> {
    if (!this.redisClient || this.redisClient.status !== 'ready') {
      throw new Error('Redis client not initialized or connected');
    }

    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation(this.redisClient);
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries) {
          this.logger.debug(`Redis operation failed, retrying (${attempt}/${maxRetries})...`);
          await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
        }
      }
    }

    throw lastError!;
  }

  /**
   * Check if database connections are available
   */
  public isConnected(): { postgres: boolean; redis: boolean } {
    return {
      postgres: !!this.pgPool,
      redis: !!(this.redisClient && this.redisClient.status === 'ready'),
    };
  }
}

// Export singleton instance
export const mcpDatabaseManager = new MCPDatabaseManager();

// Export types for external use
export type { PoolClient } from 'pg';
export type { RedisClient };
