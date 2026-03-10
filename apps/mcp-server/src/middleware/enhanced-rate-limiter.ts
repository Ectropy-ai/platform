import { Request, Response, NextFunction } from 'express';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

// Enhanced rate limiter with enterprise features but minimal dependencies
interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
    blocked?: boolean;
    blockExpires?: number;
  };
}

interface EnhancedRateLimitConfig {
  windowMs: number;
  max: number;
  blockDurationMs?: number;
  keyPrefix?: string;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
  message?: string;
}

class EnhancedInMemoryRateLimiter {
  private store: RateLimitStore = {};
  private config: EnhancedRateLimitConfig;

  constructor(config: EnhancedRateLimitConfig) {
    this.config = {
      blockDurationMs: 60000,
      keyPrefix: 'rl:',
      standardHeaders: true,
      legacyHeaders: false,
      message: 'Too many requests',
      ...config, // Spread config after defaults to avoid duplicates
    };

    // Clean up expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  private cleanup() {
    const now = Date.now();
    Object.keys(this.store).forEach((key) => {
      const entry = this.store[key];
      if (
        entry.resetTime < now &&
        (!entry.blockExpires || entry.blockExpires < now)
      ) {
        delete this.store[key];
      }
    });
  }

  private getKey(req: Request): string {
    // Authenticated users get per-user limits
    if ((req as any).user?.id) {
      return `${this.config.keyPrefix}user:${(req as any).user.id}`;
    }

    // API keys get per-key limits
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
      return `${this.config.keyPrefix}api:${apiKey}`;
    }

    // Fall back to IP-based limiting
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return `${this.config.keyPrefix}ip:${ip}`;
  }

  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const key = this.getKey(req);
      const now = Date.now();

      // Get or create entry
      let entry = this.store[key];
      if (!entry || entry.resetTime < now) {
        entry = {
          count: 0,
          resetTime: now + this.config.windowMs,
        };
        this.store[key] = entry;
      }

      // Check if currently blocked
      if (entry.blocked && entry.blockExpires && entry.blockExpires > now) {
        const retryAfter = Math.ceil((entry.blockExpires - now) / 1000);

        res.setHeader('Retry-After', retryAfter.toString());
        res.setHeader('X-RateLimit-Limit', this.config.max.toString());
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader(
          'X-RateLimit-Reset',
          new Date(entry.blockExpires).toISOString()
        );

        return res.status(429).json({
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Please retry after ${retryAfter} seconds.`,
          retryAfter,
          timestamp: new Date().toISOString(),
        });
      }

      // Remove block if expired
      if (entry.blocked && entry.blockExpires && entry.blockExpires <= now) {
        entry.blocked = false;
        entry.blockExpires = undefined;
        entry.count = 0;
        entry.resetTime = now + this.config.windowMs;
      }

      // Increment counter
      entry.count++;

      // Check if limit exceeded
      if (entry.count > this.config.max) {
        // Block for specified duration
        entry.blocked = true;
        entry.blockExpires = now + (this.config.blockDurationMs || 60000);

        const retryAfter = Math.ceil((entry.blockExpires - now) / 1000);

        res.setHeader('Retry-After', retryAfter.toString());
        res.setHeader('X-RateLimit-Limit', this.config.max.toString());
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader(
          'X-RateLimit-Reset',
          new Date(entry.blockExpires).toISOString()
        );

        logger.debug('Rate limit exceeded:', {
          key,
          endpoint: req.path,
          retryAfter,
          ip: req.ip,
        });

        return res.status(429).json({
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Please retry after ${retryAfter} seconds.`,
          retryAfter,
          timestamp: new Date().toISOString(),
        });
      }

      // Set success headers
      const remaining = Math.max(0, this.config.max - entry.count);
      res.setHeader('X-RateLimit-Limit', this.config.max.toString());
      res.setHeader('X-RateLimit-Remaining', remaining.toString());
      res.setHeader(
        'X-RateLimit-Reset',
        new Date(entry.resetTime).toISOString()
      );

      // Debug logging for rate limit success
      if (process.env['NODE_ENV'] === 'development') {
        logger.debug('Rate limit check:', {
          key,
          endpoint: req.path,
          remaining,
          count: entry.count,
        });
      }

      next();
    };
  }
}

// Create enhanced rate limiter instances
export const createEnhancedRateLimiter = (config: EnhancedRateLimitConfig) => {
  const limiter = new EnhancedInMemoryRateLimiter(config);
  return limiter.middleware();
};

// Export configured instances for different tiers
export const standardEnhancedRateLimiter = createEnhancedRateLimiter({
  windowMs: 60000, // 1 minute
  max: 100, // 100 requests
  blockDurationMs: 60000, // 1 minute block
  keyPrefix: 'std:',
  message: 'Too many requests - standard limit exceeded',
});

export const strictEnhancedRateLimiter = createEnhancedRateLimiter({
  windowMs: 60000, // 1 minute
  max: 10, // 10 requests
  blockDurationMs: 300000, // 5 minute block
  keyPrefix: 'strict:',
  message: 'Too many requests - strict limit exceeded',
});

export const premiumEnhancedRateLimiter = createEnhancedRateLimiter({
  windowMs: 60000, // 1 minute
  max: 1000, // 1000 requests
  blockDurationMs: 10000, // 10 second block
  keyPrefix: 'premium:',
  message: 'Too many requests - premium limit exceeded',
});

// Default export for backward compatibility
export default standardEnhancedRateLimiter;
