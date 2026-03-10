import Redis, { RedisOptions } from 'ioredis';
import { Logger } from '../../utils/src/logger.js';

const logger = new Logger('ResilientRedisClient');

export interface ResilientRedisOptions extends RedisOptions {
  serviceName?: string;
  enableOfflineQueue?: boolean;
}

export class ResilientRedisClient {
  private client: Redis;
  private isConnected = false;
  private connectionAttempts = 0;
  private readonly maxRetries = 3;
  private readonly serviceName: string;

  constructor(options: ResilientRedisOptions = {}) {
    this.serviceName = options.serviceName || 'unknown-service';
    
    this.client = new Redis({
      host: options.host || process.env.REDIS_HOST || 'localhost',
      port: options.port || parseInt(process.env.REDIS_PORT || '6379'),
      retryStrategy: (times) => this.retryStrategy(times),
      lazyConnect: true,
      enableOfflineQueue: options.enableOfflineQueue ?? false,
      maxRetriesPerRequest: 1,
      showFriendlyErrorStack: process.env.NODE_ENV === 'development',
      ...options
    });

    this.setupEventHandlers();
  }

  private retryStrategy(times: number): number | null {
    if (times > this.maxRetries) {
      logger.warn(`[${this.serviceName}] Redis connection failed after ${this.maxRetries} attempts. Running in degraded mode.`);
      return null;
    }
    const delay = Math.min(times * 1000, 10000);
    logger.debug(`[${this.serviceName}] Redis retry attempt ${times} in ${delay}ms`);
    return delay;
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      this.isConnected = true;
      this.connectionAttempts = 0;
      logger.info(`[${this.serviceName}] Redis connected successfully`);
    });

    this.client.on('error', (err) => {
      // Suppress connection errors if we're in degraded mode
      if (err.message.includes('ECONNREFUSED') && this.connectionAttempts > this.maxRetries) {
        return; // Silent fail - we're in degraded mode
      }
      logger.error(`[${this.serviceName}] Redis error:`, err.message);
    });

    this.client.on('close', () => {
      this.isConnected = false;
      logger.debug(`[${this.serviceName}] Redis connection closed`);
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
    } catch (error) {
      logger.warn(`[${this.serviceName}] Redis connection failed, running without cache`);
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.isConnected) return null;
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (!this.isConnected) return;
    try {
      if (ttl) {
        await this.client.setex(key, ttl, value);
      } else {
        await this.client.set(key, value);
      }
    } catch {
      // Silent fail in degraded mode
    }
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }

  isHealthy(): boolean {
    return this.isConnected;
  }
}