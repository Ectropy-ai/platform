/**
 * Redis Cache Service with TypeScript Support
 */

import { logger } from '../utils/logger.js';
import Redis from 'ioredis';
import { CacheEntry, RedisConfig } from '../types/database.types.js';
export class CacheService {
  private redis: Redis;
  private config: RedisConfig;
  private isConnected: boolean = false;
  constructor(config: RedisConfig) {
    this.config = config;
    this.redis = this.createRedisClient();
  }
  private createRedisClient(): Redis {
    const redisOptions: any = {
      host: this.config.host,
      port: this.config.port,
      db: this.config.db || 0,
      keyPrefix: this.config.keyPrefix || 'ectropy:',
      retryDelayOnFailover: this.config.retryDelayOnFailover || 100,
      maxRetriesPerRequest: this.config.maxRetriesPerRequest || 3,
      lazyConnect: true,
    };
    // Only add password if it exists
    if (this.config.password) {
      redisOptions.password = this.config.password;
    }
    const redis = new Redis(redisOptions);
    // Event handlers
    (redis as any).on('connect', () => {
      logger.info('Redis client connected');
      this.isConnected = true;
    });
    (redis as any).on('error', (error: Error) => {
      logger.error('Redis connection error', {
        error: { name: 'Redis Error', message: error.message },
      });
    });
    (redis as any).on('close', () => {
      logger.warn('Redis connection closed');
    });
    return redis;
  }

  public async connect(): Promise<void> {
    try {
      await (this.redis as any).connect();
      logger.info('Redis connection established successfully');
    } catch (error) {
      logger.error('Failed to connect to Redis', { error: error as Error });
      throw error;
    }
  }
  public async disconnect(): Promise<void> {
    try {
      await (this.redis as any).disconnect();
      logger.info('Redis connection closed');
    } catch (error) {
      logger.error('Error closing Redis connection', { error: error as Error });
    }
  }
  public async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const entry: CacheEntry<T> = {
        value,
        createdAt: new Date(),
      };
      // Only add ttl if it exists
      if (ttl !== undefined) {
        entry.ttl = ttl;
      }
      const serialized = JSON.stringify(entry);
      if (ttl) {
        await (this.redis as any).setex(key, ttl, serialized);
      } else {
        await (this.redis as any).set(key, serialized);
      }
      logger.debug('Cache entry set', { key, ttl });
    } catch (error) {
      logger.error('Failed to set cache entry', { key, error: error as Error });
      throw error;
    }
  }
  public async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await (this.redis as any).get(key);
      if (!cached) {
        return null;
      }
      const entry: CacheEntry<T> = JSON.parse(cached);
      logger.debug('Cache entry retrieved', { key });
      return entry.value;
    } catch (error) {
      logger.error('Failed to get cache entry', { key, error: error as Error });
      return null;
    }
  }
  public async delete(key: string): Promise<boolean> {
    try {
      const result = await (this.redis as any).del(key);
      logger.debug('Cache entry deleted', { key, deleted: result > 0 });
      return result > 0;
    } catch (error) {
      logger.error('Failed to delete cache entry', {
        key,
        error: error as Error,
      });
      return false;
    }
  }
  public async exists(key: string): Promise<boolean> {
    try {
      const result = await (this.redis as any).exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Failed to check cache entry existence', {
        key,
        error: error as Error,
      });
      return false;
    }
  }
  public async flush(): Promise<void> {
    try {
      await (this.redis as any).flushdb();
      logger.info('Cache flushed');
    } catch (error) {
      logger.error('Failed to flush cache', { error: error as Error });
      throw error;
    }
  }
  public async keys(pattern: string = '*'): Promise<string[]> {
    try {
      const keys: string[] = await (this.redis as any).keys(pattern);
      return keys.map((key: string) =>
        key.replace(this.config.keyPrefix || '', '')
      );
    } catch (error) {
      logger.error('Failed to get cache keys', {
        pattern,
        error: error as Error,
      });
      return [];
    }
  }

  public isHealthy(): boolean {
    return this.isConnected && (this.redis as any).status === 'ready';
  }

  public async healthCheck(): Promise<boolean> {
    try {
      const result = await (this.redis as any).ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis health check failed', { error: error as Error });
      return false;
    }
  }
  public getInfo(): any {
    return {
      status: (this.redis as any).status,
      isConnected: this.isConnected,
      config: {
        host: this.config.host,
        port: this.config.port,
        db: this.config.db,
        keyPrefix: this.config.keyPrefix,
      },
    };
  }
}
