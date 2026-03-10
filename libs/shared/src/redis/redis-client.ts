import { Redis, RedisOptions } from 'ioredis';
import { Logger } from '../../utils/src/logger.js';

/**
 * Circuit breaker states
 */
type CircuitBreakerState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker configuration
 */
interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeoutMs: number;
  monitoringWindowMs: number;
}

/**
 * Resilient Redis client with circuit breaker pattern
 * Prevents cascade failures when Redis becomes unresponsive
 */
export class ResilientRedisClient {
  private client: Redis | null = null;
  private logger = new Logger('ResilientRedisClient');
  
  // Circuit breaker state
  private failures = 0;
  private lastFailureTime = 0;
  private state: CircuitBreakerState = 'closed';
  
  // Configuration
  private readonly config: CircuitBreakerConfig;
  private readonly redisOptions: RedisOptions;

  constructor(
    redisOptions: RedisOptions = {},
    circuitBreakerConfig: Partial<CircuitBreakerConfig> = {}
  ) {
    this.config = {
      failureThreshold: circuitBreakerConfig.failureThreshold || 5,
      recoveryTimeoutMs: circuitBreakerConfig.recoveryTimeoutMs || 30000,
      monitoringWindowMs: circuitBreakerConfig.monitoringWindowMs || 60000,
    };

    this.redisOptions = {
      ...redisOptions,
      retryStrategy: (times) => {
        if (times > 3) {
          this.logger.error('Redis connection failed after max retries');
          return null; // Stop retrying
        }
        const delay = Math.min(times * 1000, 10000);
        this.logger.warn(`Redis retry attempt ${times}, waiting ${delay}ms`);
        return delay;
      },
      lazyConnect: true,
      showFriendlyErrorStack: process.env.NODE_ENV === 'development'
    };

    this.initializeClient();
  }

  /**
   * Initialize Redis client with error handling
   */
  private initializeClient(): void {
    try {
      this.client = new Redis(this.redisOptions);

      this.client.on('error', (error) => {
        this.recordFailure();
        this.logger.error('Redis connection error:', error.message);
      });

      this.client.on('connect', () => {
        this.reset();
        this.logger.info('Redis connected successfully');
      });

      this.client.on('ready', () => {
        this.reset();
        this.logger.info('Redis ready for operations');
      });

      this.client.on('close', () => {
        this.logger.warn('Redis connection closed');
      });

    } catch (error) {
      this.recordFailure();
      this.logger.error('Failed to initialize Redis client:', error);
    }
  }

  /**
   * Execute Redis operation with circuit breaker protection
   */
  private async execute<T>(operation: () => Promise<T>): Promise<T | null> {
    // Check circuit breaker state
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime < this.config.recoveryTimeoutMs) {
        this.logger.debug('Circuit breaker is OPEN - operation blocked');
        return null;
      } else {
        this.state = 'half-open';
        this.logger.info('Circuit breaker moved to HALF-OPEN state');
      }
    }

    if (!this.client) {
      this.logger.warn('Redis client not available');
      return null;
    }

    try {
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error('Redis operation timeout')),
            10000 // 10 second timeout
          );
        }),
      ]);

      // Success - reset circuit breaker
      if (this.state === 'half-open') {
        this.reset();
        this.logger.info('Circuit breaker reset to CLOSED state');
      }

      return result;
    } catch (error) {
      this.recordFailure();
      this.logger.error('Redis operation failed:', error);
      return null;
    }
  }

  /**
   * Record a failure and update circuit breaker state
   */
  private recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.config.failureThreshold) {
      this.state = 'open';
      this.logger.error(
        `Circuit breaker OPENED after ${this.failures} failures`
      );
    }
  }

  /**
   * Reset circuit breaker to healthy state
   */
  private reset(): void {
    this.failures = 0;
    this.state = 'closed';
    this.lastFailureTime = 0;
  }

  /**
   * Get circuit breaker status
   */
  public getStatus(): {
    state: CircuitBreakerState;
    failures: number;
    lastFailureTime: number;
    isHealthy: boolean;
  } {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      isHealthy: this.state === 'closed',
    };
  }

  /**
   * Redis GET operation with circuit breaker protection
   */
  public async get<T = unknown>(key: string): Promise<T | null> {
    return this.execute(async () => {
      if (!this.client) return null;
      const data = await this.client.get(key);
      return data ? (JSON.parse(data) as T) : null;
    });
  }

  /**
   * Redis SET operation with circuit breaker protection
   */
  public async set(
    key: string,
    value: unknown,
    ttlSeconds?: number
  ): Promise<boolean> {
    const result = await this.execute(async () => {
      if (!this.client) return false;
      const payload = JSON.stringify(value);
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(key, payload, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, payload);
      }
      return true;
    });
    return result || false;
  }

  /**
   * Redis DEL operation with circuit breaker protection
   */
  public async del(key: string | string[]): Promise<number> {
    const result = await this.execute(async () => {
      if (!this.client) return 0;
      const keys = Array.isArray(key) ? key : [key];
      return await this.client.del(...keys);
    });
    return result || 0;
  }

  /**
   * Redis EXISTS operation with circuit breaker protection
   */
  public async exists(key: string): Promise<boolean> {
    const result = await this.execute(async () => {
      if (!this.client) return false;
      const count = await this.client.exists(key);
      return count > 0;
    });
    return result || false;
  }

  /**
   * Redis TTL operation with circuit breaker protection
   */
  public async ttl(key: string): Promise<number> {
    const result = await this.execute(async () => {
      if (!this.client) return -2;
      return await this.client.ttl(key);
    });
    return result || -2;
  }

  /**
   * Check if Redis is available and healthy
   */
  public async ping(): Promise<boolean> {
    const result = await this.execute(async () => {
      if (!this.client) return false;
      const response = await this.client.ping();
      return response === 'PONG';
    });
    return result || false;
  }

  /**
   * Gracefully disconnect from Redis
   */
  public async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
        this.logger.info('Redis client disconnected gracefully');
      } catch (error) {
        this.logger.warn('Error during Redis disconnect:', error);
      } finally {
        this.client = null;
      }
    }
  }

  /**
   * Force reconnection (useful for recovery scenarios)
   */
  public async reconnect(): Promise<void> {
    this.logger.info('Forcing Redis reconnection...');
    if (this.client) {
      await this.disconnect();
    }
    this.reset();
    this.initializeClient();
  }
}

/**
 * Factory function to create a resilient Redis client with environment-based configuration
 */
export function createResilientRedisClient(): ResilientRedisClient {
  const redisOptions: RedisOptions = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  };

  const circuitBreakerConfig = {
    failureThreshold: parseInt(process.env.REDIS_FAILURE_THRESHOLD || '5'),
    recoveryTimeoutMs: parseInt(process.env.REDIS_RECOVERY_TIMEOUT || '30000'),
    monitoringWindowMs: parseInt(process.env.REDIS_MONITORING_WINDOW || '60000'),
  };

  return new ResilientRedisClient(redisOptions, circuitBreakerConfig);
}