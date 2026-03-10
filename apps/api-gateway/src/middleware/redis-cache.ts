/**
 * Redis Caching Middleware - Enterprise Performance Optimization
 * Implements high-performance caching strategy for API responses
 */

import type { Request, Response, NextFunction } from 'express';
import type { Redis } from 'ioredis';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds, default 300 (5 minutes)
  keyPrefix?: string; // Cache key prefix, default 'api_cache'
  skipCache?: (req: Request) => boolean; // Function to determine if caching should be skipped
}

/**
 * Redis caching middleware factory
 * Implements the enterprise-grade caching strategy as specified in the action plan
 */
export function createRedisCacheMiddleware(
  redis: Redis,
  options: CacheOptions = {}
) {
  const { ttl = 300, keyPrefix = 'api_cache', skipCache } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip caching for non-GET requests or if skipCache function returns true
    if (req.method !== 'GET' || (skipCache && skipCache(req))) {
      return next();
    }

    // Generate cache key from request URL and query parameters
    const cacheKey = `${keyPrefix}:${req.originalUrl}`;

    try {
      // Check if cached response exists
      const cachedResponse = await redis.get(cacheKey);

      if (cachedResponse) {
        // Cache hit - return cached response
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('Content-Type', 'application/json');
        return res.send(JSON.parse(cachedResponse));
      }

      // Cache miss - intercept response to cache it
      res.setHeader('X-Cache', 'MISS');

      // Store original res.json method
      const originalJson = res.json;

      // Override res.json to cache the response
      res.json = function (body: any) {
        // Cache the response asynchronously (don't wait for it)
        redis.setex(cacheKey, ttl, JSON.stringify(body)).catch((err) => {
        });

        // Call original res.json method
        return originalJson.call(this, body);
      };

      next();
    } catch (error) {
      // If Redis is unavailable, continue without caching
      res.setHeader('X-Cache', 'ERROR');
      next();
    }
  };
}

/**
 * Cache invalidation utility
 * Removes cached entries matching a pattern
 */
export async function invalidateCache(
  redis: Redis,
  pattern: string
): Promise<number> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      return await redis.del(...keys);
    }
    return 0;
  } catch (error) {
    return 0;
  }
}

/**
 * Pre-configured cache middleware for common use cases
 */
export const cacheMiddleware = {
  // Short-term cache for frequently changing data (1 minute)
  short: (redis: Redis) =>
    createRedisCacheMiddleware(redis, { ttl: 60, keyPrefix: 'short_cache' }),

  // Medium-term cache for semi-static data (5 minutes) - default
  medium: (redis: Redis) =>
    createRedisCacheMiddleware(redis, { ttl: 300, keyPrefix: 'medium_cache' }),

  // Long-term cache for static data (1 hour)
  long: (redis: Redis) =>
    createRedisCacheMiddleware(redis, { ttl: 3600, keyPrefix: 'long_cache' }),

  // Skip cache for authenticated requests or POST/PUT/DELETE
  skipAuth: (req: Request) => {
    return (
      req.headers.authorization !== undefined ||
      ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)
    );
  },
};
