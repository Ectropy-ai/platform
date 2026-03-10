import { Redis } from 'ioredis';
import crypto from 'crypto';

// Redis configuration with fallback
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  retryStrategy: (times: number) => {
    if (times > 3) {
      return null; // Stop retrying
    }
    return Math.min(times * 100, 3000);
  },
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 3,
};

// Initialize with error handling
let cacheService: Redis | Map<string, any>;
let isRedisConnected = false;

try {
  const redis = new Redis(redisConfig);
  redis.on('error', (_err) => {
    if (isRedisConnected) {
      isRedisConnected = false;
    }
  });
  redis.on('connect', () => {
    isRedisConnected = true;
  });
  redis.on('ready', () => {
    isRedisConnected = true;
  });
  cacheService = redis;
} catch (error) {
  cacheService = new Map(); // In-memory fallback
  isRedisConnected = false;
}

export async function getCachedSearch(query: string, limit: number) {
  const key = `search:${crypto.createHash('md5').update(query).digest('hex')}:${limit}`;

  try {
    if (cacheService instanceof Redis && isRedisConnected) {
      const cached = await cacheService.get(key);
      return cached ? JSON.parse(cached) : null;
    } else {
      // Use memory cache as fallback
      if (!(cacheService instanceof Map)) {
        cacheService = new Map();
      }
      return cacheService.get(key) || null;
    }
  } catch (error) {
    console.error(
      'Cache read failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    if (cacheService instanceof Redis) {
      isRedisConnected = false;
    }
    return null;
  }
}

export async function setCachedSearch(
  query: string,
  limit: number,
  results: any
) {
  const key = `search:${crypto.createHash('md5').update(query).digest('hex')}:${limit}`;

  try {
    if (cacheService instanceof Redis && isRedisConnected) {
      await cacheService.setex(key, 1800, JSON.stringify(results)); // 30 min TTL
    } else {
      // Use memory cache as fallback
      if (!(cacheService instanceof Map)) {
        cacheService = new Map();
      }
      cacheService.set(key, results);
      // Simple TTL for Map cache - remove after 30 minutes
      setTimeout(() => {
        if (cacheService instanceof Map) {
          cacheService.delete(key);
        }
      }, 1800 * 1000);
    }
  } catch (error) {
    console.error(
      'Cache write failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    if (cacheService instanceof Redis) {
      isRedisConnected = false;
    }
  }
}

// Export cache status for health checks
export function getCacheStatus(): { type: string; connected: boolean } {
  return {
    type:
      cacheService instanceof Redis && isRedisConnected ? 'redis' : 'memory',
    connected: isRedisConnected,
  };
}
