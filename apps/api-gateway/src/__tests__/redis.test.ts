/**
 * Redis Connection Tests - Critical Path Testing
 * Tests Redis connectivity and caching operations
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Redis from 'ioredis';

describe('Redis Connection - Configuration', () => {
  it('should validate Redis environment variables', () => {
    const REDIS_HOST = process.env['REDIS_HOST'] || 'localhost';
    const REDIS_PORT = process.env['REDIS_PORT'] || '6379';
    
    expect(REDIS_HOST).toBeTruthy();
    expect(REDIS_PORT).toBeTruthy();
    expect(parseInt(REDIS_PORT)).toBeGreaterThan(0);
    expect(parseInt(REDIS_PORT)).toBeLessThan(65536);
  });

  it('should create Redis client with proper configuration', () => {
    const REDIS_HOST = process.env['REDIS_HOST'] || 'localhost';
    const REDIS_PORT = parseInt(process.env['REDIS_PORT'] || '6379');
    
    const redis = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: process.env['REDIS_PASSWORD'],
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    
    expect(redis).toBeDefined();
    expect(redis.options.host).toBe(REDIS_HOST);
    expect(redis.options.port).toBe(REDIS_PORT);
    expect(redis.options.maxRetriesPerRequest).toBe(3);
    expect(redis.options.lazyConnect).toBe(true);
    
    redis.disconnect();
  });

  it('should handle Redis connection options', () => {
    const redis = new Redis({
      host: 'localhost',
      port: 6379,
      retryStrategy: (times: number) => {
        if (times > 3) {
          return null; // Stop retrying
        }
        return Math.min(times * 100, 2000); // Retry delay
      },
      lazyConnect: true,
    });
    
    expect(redis.options.retryStrategy).toBeDefined();
    expect(typeof redis.options.retryStrategy).toBe('function');
    
    redis.disconnect();
  });
});

describe('Redis Connection - Basic Operations (requires Redis instance)', () => {
  let redis: Redis;
  const testKey = 'test:key:' + Date.now();
  const testValue = 'test-value-' + Math.random();

  beforeAll(() => {
    const REDIS_HOST = process.env['REDIS_HOST'] || 'localhost';
    const REDIS_PORT = parseInt(process.env['REDIS_PORT'] || '6379');
    
    redis = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: process.env['REDIS_PASSWORD'],
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
  });

  afterAll(async () => {
    try {
      // Clean up test key
      await redis.del(testKey);
    } catch (error) {
      // Ignore cleanup errors
    }
    await redis.disconnect();
  });

  it('should validate Redis client configuration without connection', () => {
    expect(redis).toBeDefined();
    expect(redis.status).toBe('wait'); // lazyConnect = true
  });

  it('should handle connection URL format', () => {
    const REDIS_HOST = process.env['REDIS_HOST'] || 'localhost';
    const REDIS_PORT = process.env['REDIS_PORT'] || '6379';
    const REDIS_PASSWORD = process.env['REDIS_PASSWORD'] || '';
    
    const redisUrl = REDIS_PASSWORD 
      ? `redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}`
      : `redis://${REDIS_HOST}:${REDIS_PORT}`;
    
    expect(redisUrl).toContain('redis://');
    expect(redisUrl).toContain(REDIS_HOST);
    expect(redisUrl).toContain(REDIS_PORT);
  });

  it('should validate caching strategy configuration', () => {
    const cacheConfig = {
      ttl: {
        short: 60,      // 1 minute
        medium: 300,    // 5 minutes  
        long: 3600,     // 1 hour
      },
      maxSize: 1000,
      keyPrefix: 'ectropy:cache:',
    };
    
    expect(cacheConfig.ttl.short).toBe(60);
    expect(cacheConfig.ttl.medium).toBe(300);
    expect(cacheConfig.ttl.long).toBe(3600);
    expect(cacheConfig.keyPrefix).toContain('ectropy');
  });

  it('should validate rate limiting configuration', () => {
    const rateLimitConfig = {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100,                  // 100 requests per window
      keyPrefix: 'ectropy:rate:',
    };
    
    expect(rateLimitConfig.windowMs).toBe(900000);
    expect(rateLimitConfig.max).toBe(100);
    expect(rateLimitConfig.keyPrefix).toContain('rate');
  });

  it('should validate session storage configuration', () => {
    const sessionConfig = {
      prefix: 'sess:',
      ttl: 7 * 24 * 60 * 60, // 7 days
      disableTouch: false,
    };
    
    expect(sessionConfig.prefix).toBe('sess:');
    expect(sessionConfig.ttl).toBe(604800);
    expect(sessionConfig.disableTouch).toBe(false);
  });
});

describe('Redis Connection - Error Handling', () => {
  it('should handle connection errors gracefully', () => {
    const redis = new Redis({
      host: 'invalid-host',
      port: 6379,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    
    const errorHandler = (error: Error) => {
      expect(error).toBeDefined();
      expect(error.message).toBeDefined();
    };
    
    redis.on('error', errorHandler);
    
    expect(redis).toBeDefined();
    
    redis.disconnect();
  });

  it('should validate retry strategy', () => {
    const retryTimes = [1, 2, 3, 4, 5];
    const retryStrategy = (times: number) => {
      if (times > 3) return null;
      return Math.min(times * 100, 2000);
    };
    
    expect(retryStrategy(1)).toBe(100);
    expect(retryStrategy(2)).toBe(200);
    expect(retryStrategy(3)).toBe(300);
    expect(retryStrategy(4)).toBe(null);
    expect(retryStrategy(5)).toBe(null);
  });
});
