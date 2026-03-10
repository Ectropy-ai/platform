/**
 * Performance Caching Middleware
 * Redis-based caching for expensive database queries and API responses
 */

import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { logger } from '../../../../libs/shared/utils/src/logger.js';
import { createRedisClient } from '../config/redis.config.js';

// Cache configuration
const DEFAULT_TTL = 600; // 10 minutes
const CACHE_KEY_PREFIX = 'ectropy:cache:';

// Redis client instance
let redisClient: Redis | null = null;

/**
 * Initialize Redis client for caching
 * CRITICAL FIX: Now uses centralized factory with proper password decoding
 */
export function initializeCache(redis?: Redis): void {
  if (redis) {
    redisClient = redis;
    logger.info('Cache initialized with provided Redis client');
  } else {
    // CRITICAL FIX: Use factory instead of raw env vars to ensure password decoding
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      logger.warn('REDIS_URL not set, cache will not be initialized');
      return;
    }
    
    redisClient = createRedisClient(redisUrl, {
      db: 2, // Use DB 2 for cache (separate from sessions and main)
      keyPrefix: 'cache:',
      lazyConnect: true,
    });

    logger.info('Cache initialized with new Redis client using factory');
  }
}

/**
 * Generate cache key from request
 */
function generateCacheKey(req: Request, prefix?: string): string {
  const baseKey = `${CACHE_KEY_PREFIX}${prefix || 'api'}`;
  const pathKey = req.path.replace(/[^a-zA-Z0-9]/g, '_');
  const queryKey =
    Object.keys(req.query).length > 0
      ? '_' +
        Buffer.from(JSON.stringify(req.query))
          .toString('base64')
          .replace(/[^a-zA-Z0-9]/g, '')
      : '';

  return `${baseKey}:${pathKey}${queryKey}`;
}

/**
 * Cache middleware factory
 */
export function cacheMiddleware(
  options: {
    ttl?: number;
    keyPrefix?: string;
    skipCache?: (req: Request) => boolean;
    varyBy?: string[];
  } = {}
) {
  const ttl = options.ttl || DEFAULT_TTL;
  const keyPrefix = options.keyPrefix || 'api';
  const skipCache = options.skipCache || (() => false);
  const varyBy = options.varyBy || [];

  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Skip if cache is disabled or not available
    if (!redisClient || skipCache(req)) {
      return next();
    }

    try {
      // Generate cache key
      let cacheKey = generateCacheKey(req, keyPrefix);

      // Add vary-by headers to cache key
      if (varyBy.length > 0) {
        const varyValues = varyBy
          .map((header) => req.get(header) || '')
          .join('_');
        cacheKey += `_${Buffer.from(varyValues)
          .toString('base64')
          .replace(/[^a-zA-Z0-9]/g, '')}`;
      }

      // Try to get cached response
      const cachedData = await redisClient.get(cacheKey);

      if (cachedData) {
        const parsed = JSON.parse(cachedData);

        // Set cache headers
        res.set({
          'X-Cache': 'HIT',
          'X-Cache-Key': cacheKey.substring(0, 50) + '...',
          'X-Cache-TTL': parsed.ttl?.toString() || ttl.toString(),
          'Cache-Control': `public, max-age=${ttl}`,
        });

        logger.debug('Cache hit', {
          key: cacheKey,
          path: req.path,
          ttl: parsed.ttl,
        });

        return res.json(parsed.data);
      }

      // Cache miss - continue with request and cache the response
      const originalJson = res.json.bind(res);
      let responseData: any;

      res.json = function (data: any) {
        responseData = data;

        // Set cache headers
        res.set({
          'X-Cache': 'MISS',
          'X-Cache-Key': cacheKey.substring(0, 50) + '...',
          'X-Cache-TTL': ttl.toString(),
          'Cache-Control': `public, max-age=${ttl}`,
        });

        return originalJson(data);
      };

      // Continue to next middleware
      res.on('finish', async () => {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300 && responseData) {
          try {
            const cacheData = {
              data: responseData,
              ttl: ttl,
              timestamp: new Date().toISOString(),
              path: req.path,
            };

            await redisClient!.setex(cacheKey, ttl, JSON.stringify(cacheData));

            logger.debug('Response cached', {
              key: cacheKey,
              path: req.path,
              ttl: ttl,
              size: JSON.stringify(cacheData).length,
            });
          } catch (cacheError) {
            logger.error('Failed to cache response', {
              error:
                cacheError instanceof Error
                  ? cacheError.message
                  : String(cacheError),
              key: cacheKey,
              path: req.path,
            });
          }
        }
      });

      next();
    } catch (error) {
      logger.error('Cache middleware error', {
        error: error instanceof Error ? error.message : String(error),
        path: req.path,
      });

      // Continue without caching on error
      next();
    }
  };
}

/**
 * Invalidate cache entries by pattern
 */
export async function invalidateCache(pattern: string): Promise<number> {
  if (!redisClient) {
    logger.warn('Cache invalidation skipped - Redis not available');
    return 0;
  }

  try {
    const keys = await redisClient.keys(`${CACHE_KEY_PREFIX}${pattern}`);
    if (keys.length > 0) {
      const result = await redisClient.del(...keys);
      logger.info('Cache invalidated', { pattern, keysDeleted: result });
      return result;
    }
    return 0;
  } catch (error) {
    logger.error('Cache invalidation failed', {
      error: error instanceof Error ? error.message : String(error),
      pattern,
    });
    return 0;
  }
}

/**
 * Clear all cache entries
 */
export async function clearCache(): Promise<boolean> {
  if (!redisClient) {
    logger.warn('Cache clear skipped - Redis not available');
    return false;
  }

  try {
    const keys = await redisClient.keys(`${CACHE_KEY_PREFIX}*`);
    if (keys.length > 0) {
      await redisClient.del(...keys);
      logger.info('All cache cleared', { keysDeleted: keys.length });
    }
    return true;
  } catch (error) {
    logger.error('Cache clear failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  totalKeys: number;
  memoryUsage: string;
  hitRate?: number;
  connected: boolean;
}> {
  if (!redisClient) {
    return {
      totalKeys: 0,
      memoryUsage: '0B',
      connected: false,
    };
  }

  try {
    const keys = await redisClient.keys(`${CACHE_KEY_PREFIX}*`);

    return {
      totalKeys: keys.length,
      memoryUsage: '0B', // Redis memory info not easily available in all Redis versions
      connected: redisClient.status === 'ready',
    };
  } catch (error) {
    logger.error('Failed to get cache stats', {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      totalKeys: 0,
      memoryUsage: '0B',
      connected: false,
    };
  }
}

/**
 * Predefined cache configurations for different endpoints
 */
export const cacheConfigs = {
  // Project data - moderate caching (5 minutes)
  projects: cacheMiddleware({
    ttl: 300,
    keyPrefix: 'projects',
    varyBy: ['authorization'],
  }),

  // Project elements - short caching (2 minutes) due to frequent updates
  projectElements: cacheMiddleware({
    ttl: 120,
    keyPrefix: 'elements',
    varyBy: ['authorization'],
  }),

  // Proposals - short caching (3 minutes) due to voting activity
  proposals: cacheMiddleware({
    ttl: 180,
    keyPrefix: 'proposals',
    varyBy: ['authorization'],
  }),

  // User data - long caching (15 minutes)
  users: cacheMiddleware({
    ttl: 900,
    keyPrefix: 'users',
    varyBy: ['authorization'],
  }),

  // Static content - very long caching (1 hour)
  static: cacheMiddleware({
    ttl: 3600,
    keyPrefix: 'static',
  }),

  // Health checks - very short caching (30 seconds)
  health: cacheMiddleware({
    ttl: 30,
    keyPrefix: 'health',
  }),
};

/**
 * Cache warming function for critical data
 */
export async function warmCache(endpoints: string[]): Promise<void> {
  if (!redisClient) {
    logger.warn('Cache warming skipped - Redis not available');
    return;
  }

  logger.info('Starting cache warm-up', { endpoints });

  for (const endpoint of endpoints) {
    try {
      // This would typically make internal API calls to populate cache
      // For now, we'll just log the intent
      logger.debug('Cache warming endpoint', { endpoint });
    } catch (error) {
      logger.error('Cache warm-up failed for endpoint', {
        endpoint,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info('Cache warm-up completed');
}

/**
 * Middleware to invalidate cache on data modifications
 */
export function cacheInvalidationMiddleware(patterns: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);

    res.json = function (data: any) {
      // Invalidate cache after successful modification
      if (res.statusCode >= 200 && res.statusCode < 300) {
        setImmediate(async () => {
          for (const pattern of patterns) {
            await invalidateCache(pattern);
          }
        });
      }
      return originalJson(data);
    };

    next();
  };
}
