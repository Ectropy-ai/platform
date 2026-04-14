/**
 * Centralized Redis Connection Factory
 * 
 * This module provides a centralized way to create Redis connections with proper
 * password encoding/decoding for special characters (+ and = in production password).
 * 
 * CRITICAL: All Redis clients MUST use this factory to ensure password decoding works correctly.
 * 
 * Usage:
 * - Main app: getRedisClient(REDIS_URL)
 * - Session store: createRedisClient(REDIS_URL, { db: 1 })
 * - Cache layer: createRedisClient(REDIS_URL, { db: 2 })
 * - Rate limiter: createRedisClient(REDIS_URL, { db: 3 })
 * - Bull queues: parseRedisUrl(REDIS_URL) then pass config to Bull
 */

import Redis, { RedisOptions } from 'ioredis';
import { logger } from '../../../../libs/shared/utils/src/logger.js';
import { getConfig } from '@ectropy/shared';

/**
 * Parse Redis URL and decode password with special characters
 * Handles passwords containing +, =, and other URL-unsafe characters
 * 
 * @param redisUrl - Redis connection URL (redis://[:password@]host[:port])
 * @returns Parsed Redis configuration object
 */
export function parseRedisUrl(redisUrl: string): {
  host: string;
  port: number;
  password?: string;
} {
  try {
    const url = new URL(redisUrl);
    
    // Extract and decode password (handles +, =, etc.)
    const password = url.password ? decodeURIComponent(url.password) : undefined;
    
    // ✅ ENTERPRISE (AP-001 FIX): Environment-aware defaults
    const host = url.hostname || getConfig('REDIS_HOST', {
      default: process.env.NODE_ENV === 'development' ? 'redis' : 'localhost'
    });
    const port = parseInt(String(url.port || getConfig('REDIS_PORT', { default: 6379 })), 10);
    
    logger.info('Redis URL parsed successfully', {
      host,
      port,
      hasPassword: !!password,
    });
    
    return { host, port, password };
  } catch (error) {
    logger.error('Failed to parse Redis URL, using fallback', { 
      error: error instanceof Error ? error.message : String(error),
      // Sanitize URL to hide password in logs
      redisUrl: redisUrl.replace(/:[^:@]*@/, ':***@'),
    });
    
    // ✅ ENTERPRISE (AP-001 FIX): Environment-aware fallback (no hardcoded localhost)
    return {
      host: getConfig('REDIS_HOST', {
        default: process.env.NODE_ENV === 'development' ? 'redis' : 'localhost'
      }),
      port: parseInt(String(getConfig('REDIS_PORT', { default: 6379 })), 10),
      password: getConfig('REDIS_PASSWORD', { default: undefined }),
    };
  }
}

/**
 * Attaches a 30-second PING heartbeat to a Redis client.
 * Prevents DO managed Redis LB from culling idle TCP
 * connections. Required for all clients — including
 * redis.duplicate() instances which bypass the factory.
 *
 * PING is allowed in SUBSCRIBE mode per Redis protocol,
 * so this is safe for pub/sub subscriber clients.
 *
 * @param client - Any ioredis Redis instance
 * @param context - Optional label for log messages
 */
export function attachHeartbeat(
  client: Redis,
  context = 'redis',
): void {
  const heartbeat = setInterval(() => {
    client.ping().catch((err: Error) => {
      logger.warn(`Redis heartbeat ping failed [${context}]`, {
        error: err.message,
      });
    });
  }, 30_000);
  client.on('end', () => clearInterval(heartbeat));
}

/**
 * Create Redis client with proper configuration
 * Use this for ALL Redis connections (main, session, cache, rate limiter, queues)
 * 
 * @param redisUrl - Redis connection URL
 * @param options - Additional Redis options (db, keyPrefix, etc.)
 * @returns Configured Redis client instance
 */
export function createRedisClient(
  redisUrl: string,
  options: Partial<RedisOptions> = {}
): Redis {
  const { host, port, password } = parseRedisUrl(redisUrl);
  
  const config: RedisOptions = {
    host,
    port,
    password,
    maxRetriesPerRequest: 3,
    connectTimeout: 10000, // 10 seconds
    // Prevent DO managed Redis idle-timeout disconnect.
    // Without this, DO LB culls idle TCP connections at
    // ~60s → ioredis rejects pending commands as
    // unhandledRejection → process.exit(1).
    // Confirmed via diagnostics/runtime-unhandledRejection-*.txt.
    keepAlive: 30000,
    retryStrategy: (times: number) => {
      if (times > 3) {
        logger.error('❌ Redis connection failed after 3 retries - giving up');
        return null; // Stop retrying
      }
      const delay = Math.min(times * 200, 2000);
      logger.warn(`Redis connection retry attempt ${times}`, { delay });
      return delay; // Exponential backoff
    },
    reconnectOnError: (err: Error) => {
      logger.error('Redis connection error', { error: err.message });
      return true; // Always attempt reconnect
    },
    enableReadyCheck: true,
    lazyConnect: false, // Connect immediately
    ...options, // Allow override of any option
  };
  
  const client = new Redis(config);

  // Keep connection alive through DO Redis LB's ~60s idle cull.
  attachHeartbeat(client, `${host}:${port}/${options.db || 0}`);

  // Event handlers for observability and preventing unhandled errors
  client.on('connect', () => {
    logger.info('✅ Redis client connected', { host, port, db: options.db || 0 });
  });
  
  client.on('ready', () => {
    logger.info('✅ Redis client ready', { host, port, db: options.db || 0 });
  });
  
  client.on('error', (err: Error) => {
    logger.error('❌ Redis client error', { 
      error: err.message,
      host,
      port,
      db: options.db || 0,
      code: (err as any).code,
    });
  });
  
  client.on('close', () => {
    logger.warn('⚠️  Redis client connection closed', { host, port, db: options.db || 0 });
  });
  
  client.on('reconnecting', (delay: number) => {
    logger.info('⏳ Redis client reconnecting', { host, port, db: options.db || 0, delay });
  });
  
  return client;
}

/**
 * Singleton Redis client for main application use
 * This ensures we don't create multiple main Redis connections
 */
let mainRedisClient: Redis | null = null;

/**
 * Get or create the singleton main Redis client
 * 
 * @param redisUrl - Redis connection URL
 * @returns Main Redis client instance
 */
export function getRedisClient(redisUrl: string): Redis {
  if (!mainRedisClient) {
    mainRedisClient = createRedisClient(redisUrl, {
      db: 0, // Use DB 0 for main client
      keyPrefix: 'ectropy:main:',
    });
  }
  return mainRedisClient;
}

/**
 * Close all Redis connections gracefully
 * Call this during application shutdown
 */
export async function closeRedisConnections(): Promise<void> {
  if (mainRedisClient) {
    await mainRedisClient.quit();
    mainRedisClient = null;
    logger.info('✅ Redis connections closed gracefully');
  }
}
