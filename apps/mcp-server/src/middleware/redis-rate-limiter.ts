/**
 * =============================================================================
 * ENTERPRISE REDIS-BACKED RATE LIMITER
 *
 * PURPOSE: Production-grade rate limiting with Redis persistence
 * ENTERPRISE PATTERN: Distributed rate limiting across multiple instances
 *
 * FEATURES:
 * - Redis-backed for persistence across restarts
 * - Distributed counting for horizontal scaling
 * - Tiered limits (standard, auth, enterprise, MCP)
 * - IP + User + API Key based limiting
 * - Graceful degradation to in-memory when Redis unavailable
 * - Audit logging for rate limit events
 */

import type { Request, Response, NextFunction } from 'express';
import { mcpLogger } from '../utils/mcp-logger.js';
import { getSafeMCPDatabaseConfig } from '../config/database.config.js';

// Rate limit tiers
export interface RateLimitTier {
  name: string;
  windowMs: number;
  max: number;
  message: string;
  skipSuccessfulRequests?: boolean;
}

export const RATE_LIMIT_TIERS: Record<string, RateLimitTier> = {
  // Standard API access
  standard: {
    name: 'standard',
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    message: 'Rate limit exceeded. Please wait before making more requests.',
  },
  // Authentication endpoints - very strict
  auth: {
    name: 'auth',
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: 'Too many login attempts. Please wait 15 minutes.',
    skipSuccessfulRequests: true,
  },
  // MCP tool endpoints
  mcp: {
    name: 'mcp',
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    message: 'MCP rate limit exceeded. Please wait.',
  },
  // Enterprise tier - high limits
  enterprise: {
    name: 'enterprise',
    windowMs: 60 * 1000, // 1 minute
    max: 1000,
    message: 'Enterprise rate limit reached. Contact support.',
  },
  // Agent analysis - expensive operations
  agent: {
    name: 'agent',
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    message: 'Agent analysis limit reached. Maximum 10 per hour.',
  },
};

/**
 * In-memory rate limit store (fallback when Redis unavailable)
 */
class InMemoryStore {
  private hits: Map<string, { count: number; resetTime: number }> = new Map();

  async increment(
    key: string,
    windowMs: number
  ): Promise<{ count: number; resetTime: number }> {
    const now = Date.now();
    const existing = this.hits.get(key);

    if (existing && existing.resetTime > now) {
      existing.count++;
      return existing;
    }

    const entry = { count: 1, resetTime: now + windowMs };
    this.hits.set(key, entry);
    return entry;
  }

  async get(
    key: string
  ): Promise<{ count: number; resetTime: number } | undefined> {
    const entry = this.hits.get(key);
    if (entry && entry.resetTime > Date.now()) {
      return entry;
    }
    this.hits.delete(key);
    return undefined;
  }

  // Cleanup expired entries periodically
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.hits.entries()) {
      if (entry.resetTime <= now) {
        this.hits.delete(key);
      }
    }
  }
}

/**
 * Redis rate limit store
 */
class RedisStore {
  private redis: any;
  private connected: boolean = false;

  constructor() {
    this.initializeRedis();
  }

  private async initializeRedis(): Promise<void> {
    try {
      const config = getSafeMCPDatabaseConfig();

      if (!config.redis.enabled) {
        mcpLogger.info(
          'Redis rate limiting disabled - using in-memory fallback'
        );
        return;
      }

      const { Redis } = await import('ioredis');

      this.redis = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: 3, // Dedicated DB for rate limiting
        keyPrefix: 'ratelimit:',
        retryStrategy: (times: number) => {
          if (times > 3) {
            return null;
          }
          return Math.min(times * 100, 3000);
        },
        lazyConnect: true,
      });

      this.redis.on('connect', () => {
        this.connected = true;
        mcpLogger.info('Redis rate limiter connected');
      });

      this.redis.on('error', (err: Error) => {
        mcpLogger.warn('Redis rate limiter error', { error: err.message });
        this.connected = false;
      });

      await this.redis.connect();
    } catch (error) {
      mcpLogger.warn('Failed to initialize Redis rate limiter', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  isConnected(): boolean {
    return this.connected && this.redis?.status === 'ready';
  }

  async increment(
    key: string,
    windowMs: number
  ): Promise<{ count: number; resetTime: number }> {
    if (!this.isConnected()) {
      throw new Error('Redis not connected');
    }

    const now = Date.now();
    const windowKey = `${key}:${Math.floor(now / windowMs)}`;
    const resetTime = (Math.floor(now / windowMs) + 1) * windowMs;

    const multi = this.redis.multi();
    multi.incr(windowKey);
    multi.pexpire(windowKey, windowMs + 1000); // Add buffer for cleanup

    const results = await multi.exec();
    const count = results[0][1] as number;

    return { count, resetTime };
  }

  async get(
    key: string,
    windowMs: number
  ): Promise<{ count: number; resetTime: number } | undefined> {
    if (!this.isConnected()) {
      return undefined;
    }

    const now = Date.now();
    const windowKey = `${key}:${Math.floor(now / windowMs)}`;
    const count = await this.redis.get(windowKey);

    if (!count) {
      return undefined;
    }

    const resetTime = (Math.floor(now / windowMs) + 1) * windowMs;
    return { count: parseInt(count, 10), resetTime };
  }
}

/**
 * Enterprise Rate Limiter Manager
 */
class EnterpriseRateLimiter {
  private redisStore: RedisStore;
  private memoryStore: InMemoryStore;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.redisStore = new RedisStore();
    this.memoryStore = new InMemoryStore();

    // Periodic cleanup of in-memory store
    this.cleanupInterval = setInterval(() => {
      this.memoryStore.cleanup();
    }, 60000); // Every minute
  }

  /**
   * Generate rate limit key from request
   */
  private generateKey(req: Request, tier: string): string {
    // Priority: API Key > User ID > IP
    const apiKey = req.headers['x-api-key'] as string;
    if (apiKey) {
      return `${tier}:api:${apiKey.substring(0, 8)}`; // Only use prefix for privacy
    }

    const userId = (req as any).user?.id || (req as any).context?.userId;
    if (userId) {
      return `${tier}:user:${userId}`;
    }

    const ip = this.getClientIp(req);
    return `${tier}:ip:${ip}`;
  }

  /**
   * Get client IP with proxy support
   */
  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return ips.split(',')[0].trim();
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
  }

  /**
   * Check and apply rate limit
   */
  async checkLimit(
    req: Request,
    tier: RateLimitTier
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
    retryAfter?: number;
  }> {
    const key = this.generateKey(req, tier.name);
    let result: { count: number; resetTime: number };

    try {
      // Try Redis first
      result = await this.redisStore.increment(key, tier.windowMs);
    } catch {
      // Fallback to in-memory
      result = await this.memoryStore.increment(key, tier.windowMs);
    }

    const allowed = result.count <= tier.max;
    const remaining = Math.max(0, tier.max - result.count);
    const retryAfter = allowed
      ? undefined
      : Math.ceil((result.resetTime - Date.now()) / 1000);

    // Log rate limit events
    if (!allowed) {
      mcpLogger.security('Rate limit exceeded', 'medium', {
        tier: tier.name,
        key,
        count: result.count,
        max: tier.max,
        clientIp: this.getClientIp(req),
        path: req.path,
      });
    }

    return {
      allowed,
      remaining,
      resetTime: result.resetTime,
      retryAfter,
    };
  }

  /**
   * Create middleware for a specific tier
   */
  createMiddleware(tier: RateLimitTier) {
    return async (
      req: Request,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const result = await this.checkLimit(req, tier);

        // Set standard rate limit headers
        res.setHeader('X-RateLimit-Limit', tier.max);
        res.setHeader('X-RateLimit-Remaining', result.remaining);
        res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));

        if (!result.allowed) {
          res.setHeader('Retry-After', result.retryAfter || 60);
          res.status(429).json({
            error: 'Too Many Requests',
            message: tier.message,
            retryAfter: result.retryAfter,
            tier: tier.name,
          });
          return;
        }

        next();
      } catch (error) {
        // On error, allow request but log
        mcpLogger.warn('Rate limiter error, allowing request', {
          error: error instanceof Error ? error.message : 'Unknown',
        });
        next();
      }
    };
  }

  /**
   * Cleanup resources
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Singleton instance
let rateLimiterInstance: EnterpriseRateLimiter | null = null;

function getInstance(): EnterpriseRateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new EnterpriseRateLimiter();
  }
  return rateLimiterInstance;
}

// Export pre-configured middlewares
export const standardRateLimiter = getInstance().createMiddleware(
  RATE_LIMIT_TIERS.standard
);
export const authRateLimiter = getInstance().createMiddleware(
  RATE_LIMIT_TIERS.auth
);
export const mcpRateLimiter = getInstance().createMiddleware(
  RATE_LIMIT_TIERS.mcp
);
export const enterpriseRateLimiter = getInstance().createMiddleware(
  RATE_LIMIT_TIERS.enterprise
);
export const agentRateLimiter = getInstance().createMiddleware(
  RATE_LIMIT_TIERS.agent
);

// Default export - standard rate limiter
export default standardRateLimiter;

// Export the class for testing
export { EnterpriseRateLimiter };
