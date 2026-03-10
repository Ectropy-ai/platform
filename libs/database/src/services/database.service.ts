/**
 * PostgreSQL Database Service with Connection Pooling
 */

import { logger } from '../utils/logger.js';
import { Pool, PoolClient } from 'pg';
import {
  ConnectionPoolMetrics,
  DatabaseConfig,
  QueryResult,
} from '../types/database.types.js';
export class DatabaseService {
  private pool: Pool;
  private config: DatabaseConfig;
  private isConnected: boolean = false;
  constructor(config: DatabaseConfig) {
    this.config = config;
    this.pool = this.createPool();
  }
  private createPool(): Pool {
    const pool = new Pool({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl !== undefined ? this.config.ssl : false,
      max: this.config.maxConnections || 20,
      connectionTimeoutMillis: this.config.connectionTimeoutMillis || 5000,
      idleTimeoutMillis: this.config.idleTimeoutMillis || 30000,
      // maxUses: this.config.maxUses || 7500, // Comment out unsupported property
    });
    // Test the connection
    pool
      .connect()
      .then((client: PoolClient) => {
        logger.info('New database client connected');
        this.isConnected = true;
        client.release();
      })
      .catch((err: Error) => {
        logger.error('Unexpected database pool error', {
          error: { name: 'Database Error', message: err.message },
        });
        this.isConnected = false;
      });
    return pool;
  }
  public async connect(): Promise<void> {
    try {
      const client = await this.pool.connect();
      client.release();
      logger.info('Database connection established successfully');
    } catch (error) {
      logger.error('Failed to connect to database', { error: error as Error });
      throw error;
    }
  }
  public async disconnect(): Promise<void> {
    try {
      await this.pool.end();
      logger.info('Database connection closed');
    } catch (error) {
      logger.error('Error closing database connection', {
        error: error as Error,
      });
    }
  }
  public async query<T = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      logger.debug('Database query executed', {
        query: text.substring(0, 100),
        duration,
        rowCount: result.rowCount,
      });
      return {
        rows: result.rows,
        rowCount: result.rowCount || 0,
        command: result.command || '',
        fields: result.fields || [],
      };
    } catch (error) {
      logger.error('Database query failed', {
        error: error as Error,
        query: text.substring(0, 100),
      });
      throw error;
    }
  }
  public async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
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
  public getMetrics(): ConnectionPoolMetrics {
    return {
      totalConnections: (this.pool as any).totalCount || 0,
      idleConnections: (this.pool as any).idleCount || 0,
      waitingCount: (this.pool as any).waitingCount || 0,
    };
  }
  public isHealthy(): boolean {
    return this.isConnected && ((this.pool as any).totalCount || 0) > 0;
  }
  public async healthCheck(): Promise<boolean> {
    try {
      const result = await this.query('SELECT 1 as health_check');
      return result.rows.length > 0 && result.rows[0].health_check === 1;
    } catch (error) {
      logger.error('Database health check failed', { error: error as Error });
      return false;
    }
  }
}
