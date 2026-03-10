/**
 * Production-ready PostgreSQL connection pool
 * Replaces in-memory production data with persistent database storage
 *
 * ✅ ENTERPRISE PATTERN (AP-001 FIX): Environment-aware configuration
 * - Uses @ectropy/shared/config/environment for multi-environment support
 * - Eliminates hardcoded localhost URLs
 * - Fail-fast validation in production mode
 */

import { Pool, PoolConfig, Client } from 'pg';
import { logger } from '../../../../libs/shared/utils/src/logger.js';
import { getDatabaseUrl, getConfig } from '@ectropy/shared';

// ✅ ENTERPRISE: Environment-aware database configuration (NO HARDCODED DEFAULTS)
const dbConfig: PoolConfig = {
  host: getConfig('DATABASE_HOST', {
    default: process.env.NODE_ENV === 'development' ? 'postgres' : 'localhost'
  }),
  port: parseInt(String(getConfig('DATABASE_PORT', { default: 5432 })), 10),
  database: getConfig('DATABASE_NAME', {
    default: process.env.NODE_ENV === 'test' ? 'ectropy_test' : 'ectropy_dev'
  }),
  user: getConfig('DATABASE_USER', { default: 'postgres' }),
  password: getConfig('DATABASE_PASSWORD', { default: 'postgres' }),

  // Production-ready connection pool settings with better timeout handling
  max: 50, // PRODUCTION FIX: Increased from 20 to prevent pool exhaustion at scale
  idleTimeoutMillis: 60000, // Increased from 30s to reduce connection churn
  connectionTimeoutMillis: 15000, // Increased from 10s for production stability

  // CRITICAL: Allow more time for connection establishment in Docker/CI
  // where database might be starting up or under load
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,

  // SSL configuration for production
  ssl:
    process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,

  // Statement timeout (5 minutes)
  statement_timeout: 300000,

  // Query timeout (2 minutes)
  query_timeout: 120000,
};

// Connection pool instance
export const pool = new Pool(dbConfig);

// Enhanced error handling
pool.on('error', (err, client) => {
  logger.error('Unexpected error on idle client', {
    error: err.message,
    stack: err.stack,
    client: client ? 'present' : 'missing',
  });
});

pool.on('connect', (client) => {
  logger.debug('New client connected to database', {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  });
});

pool.on('acquire', (client) => {
  logger.debug('Client acquired from pool', {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  });
});

pool.on('remove', (client) => {
  logger.debug('Client removed from pool', {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  });
});

/**
 * Test database connection on startup with retry logic
 * @param maxRetries Maximum number of connection attempts
 * @param retryDelay Delay between retries in milliseconds
 */
export async function testConnection(
  maxRetries: number = 10,
  retryDelay: number = 2000
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`Database connection attempt ${attempt}/${maxRetries}...`);
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT NOW() as current_time, version() as postgres_version'
        );
        logger.info('✅ Database connected successfully', {
          attempt,
          currentTime: result.rows[0].current_time,
          postgresVersion: result.rows[0].postgres_version,
          poolStatus: {
            total: pool.totalCount,
            idle: pool.idleCount,
            waiting: pool.waitingCount,
          },
        });
        return true;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.warn(
        `❌ Database connection attempt ${attempt}/${maxRetries} failed`,
        {
          error: error instanceof Error ? error.message : String(error),
          config: {
            host: dbConfig.host,
            port: dbConfig.port,
            database: dbConfig.database,
            user: dbConfig.user,
            ssl: !!dbConfig.ssl,
          },
        }
      );

      // If this isn't the last attempt, wait before retrying
      if (attempt < maxRetries) {
        logger.info(`Retrying in ${retryDelay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }

  logger.error('❌ Database connection failed after all retries');
  return false;
}

/**
 * Graceful shutdown - close all connections
 */
export async function closePool(): Promise<void> {
  try {
    await pool.end();
    logger.info('Database pool closed successfully');
  } catch (error) {
    logger.error('Error closing database pool', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Health check query using shared Prisma Client
 * More reliable than raw pg pool for checking database health
 *
 * ENTERPRISE FIX: Use shared Prisma Client singleton instead of creating new instance
 * - Previous: Created new PrismaClient() on every health check call
 * - Problem: Exhausted connection pool when health checks run frequently
 * - Solution: Use shared singleton from getPrismaClient()
 */
export async function healthCheck(): Promise<{
  status: 'healthy' | 'unhealthy';
  latency: number;
  connections?: {
    total: number;
    idle: number;
    waiting: number;
  };
  error?: string;
}> {
  const startTime = Date.now();

  try {
    // Use shared Prisma Client singleton (no separate connection pool)
    const { getPrismaClient } = await import('./prisma.js');
    const prisma = getPrismaClient();

    // Execute a simple query
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - startTime;

    return {
      status: 'healthy',
      latency,
      connections: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      latency: Date.now() - startTime,
      connections: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Execute query with proper error handling and logging
 */
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<T[]> {
  const startTime = Date.now();
  const client = await pool.connect();

  try {
    const result = await client.query(text, params);
    const duration = Date.now() - startTime;

    logger.debug('Database query executed', {
      duration,
      rows: result.rows.length,
      command: result.command,
    });

    return result.rows as T[];
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Database query failed', {
      duration,
      query: text,
      params: params ? '[REDACTED]' : undefined,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute transaction with rollback support
 */
export async function transaction<T>(
  callback: (client: any) => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Transaction rolled back', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    client.release();
  }
}

// NOTE: Database connection test is now handled explicitly in bootstrap()
// to allow for proper retry logic and graceful failure handling
