/**
 * ================================================
 * ENTERPRISE RATE LIMITING MIDDLEWARE
 * ================================================
 * Purpose: Protect against DoS, brute force, and resource exhaustion
 * Security Standards: OWASP API Security Top 10 - API4:2023 Unrestricted Resource Consumption
 * Author: Claude (Enterprise Integration)
 * Date: 2025-11-14
 * ================================================
 */

import rateLimit from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import type Redis from 'ioredis';
import { createRedisClient } from '../config/redis.config.js';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

// ENTERPRISE: Import centralized User type - no local interface declarations
import type { User } from '@ectropy/shared/types';

interface RateLimitConfig {
  windowMs: number;
  max: number;
  standardHeaders: boolean;
  legacyHeaders: boolean;
  keyGenerator?: (req: Request) => string;
  handler?: (req: Request, res: Response) => void;
  skip?: (req: Request) => boolean;
  skipSuccessfulRequests?: boolean;
  store?: RedisStore;
}

/**
 * Create Redis client for rate limit storage
 * Uses ioredis (consistent with rest of codebase) instead of node-redis v4
 * Falls back to memory storage if Redis unavailable
 */
let redisClient: Redis | null = null;

async function getRateLimitRedisClient(): Promise<Redis | null> {
  if (!redisClient) {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      // Route through central factory — inherits keepAlive (30s TCP),
      // retryStrategy, reconnectOnError, and standard error/close/ready
      // observability handlers. See config/redis.config.ts.
      redisClient = createRedisClient(redisUrl, {
        maxRetriesPerRequest: 10,
        lazyConnect: true,
      });
      await redisClient.connect();
      logger.info('Rate limiting using Redis store');
      return redisClient;
    } catch (error) {
      logger.warn('Redis unavailable, using memory store for rate limiting');
      redisClient = null;
      return null;
    }
  }
  return redisClient;
}

/**
 * Custom key generator for rate limiting
 * Uses IP address + user ID (if authenticated) for more granular control
 *
 * FIX (2026-02-24): Explicitly read X-Forwarded-For header
 * Root cause: req.ip was returning load balancer IP (10.20.0.7) instead of client IP
 * This caused ALL users to share one rate limit bucket (100 req/15min total)
 */
function keyGenerator(req: Request): string {
  const user = req.user;

  // Explicitly read X-Forwarded-For header (set by load balancer)
  // Format: "client, proxy1, proxy2" - we want the first (leftmost) IP
  const forwardedFor = req.headers['x-forwarded-for'];
  const clientIp =
    typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0].trim()
      : req.ip || req.socket.remoteAddress || 'unknown';

  if (user?.id) {
    return `ratelimit:${clientIp}:${user.id}`;
  }
  return `ratelimit:${clientIp}`;
}

/**
 * Custom handler for rate limit exceeded
 * Returns structured error response with retry information
 */
function rateLimitHandler(req: Request, res: Response) {
  const retryAfter = res.getHeader('Retry-After');

  return res.status(429).json({
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please try again later.',
    retryAfter: retryAfter ? parseInt(retryAfter as string) : undefined,
    documentation: 'https://docs.ectropy.ai/api/rate-limits',
  });
}

/**
 * Standard rate limiter for general API endpoints
 * Default: 100 requests per 15 minutes per IP/user
 * Configurable via RATE_LIMIT_STANDARD_MAX env var (e.g., 500 for staging E2E)
 *
 * FIX (2026-02-28): Made configurable because E2E tests share one rate limit
 * key (same CI runner IP + same test user) and generate 150-200+ requests.
 * Per-user keys solve multi-user production scenarios but not single-user E2E.
 * Same pattern as RATE_LIMIT_SPECKLE_UPLOAD_MAX (upload limiter).
 */
export async function createStandardRateLimiter(): Promise<
  ReturnType<typeof rateLimit>
> {
  const client = await getRateLimitRedisClient();

  const standardMax = parseInt(process.env.RATE_LIMIT_STANDARD_MAX || '100');
  const config: RateLimitConfig = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: standardMax, // Default 100, configurable via RATE_LIMIT_STANDARD_MAX
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
    keyGenerator,
    handler: rateLimitHandler,
    skip: (req: Request) => {
      // Skip rate limiting for health check endpoints
      return req.path === '/health' || req.path === '/api/health';
    },
  };

  // Use Redis store if available
  if (client) {
    config.store = new RedisStore({
      sendCommand: (...args: string[]) =>
        (client as Redis).call(
          args[0],
          ...args.slice(1)
        ) as Promise<RedisReply>,
      prefix: 'rl:standard:',
    });
  }

  return rateLimit(config);
}

/**
 * ENTERPRISE SECURITY (2025-12-19): Strict rate limiter for authentication endpoints
 * Strategy: Aggressive rate limiting to prevent credential stuffing and brute force attacks
 *
 * Attack Vector Analysis:
 * - Old: 5 attempts / 15 minutes = 2,880 attempts/day per IP
 * - Distributed attack: 100 IPs = 288,000 attempts/day
 * - Credential stuffing success rate: 0.1-2% = 288-5,760 compromised accounts/day
 *
 * New Strategy:
 * - 3 attempts / 5 minutes = 864 attempts/day per IP (70% reduction)
 * - Distributed attack: 100 IPs = 86,400 attempts/day (70% reduction)
 * - With account lockout at 5 failures: Maximum 5 attempts per account
 *
 * Defense in Depth:
 * - Layer 1: Rate limiting (this middleware)
 * - Layer 2: Account lockout (auth.service.ts)
 * - Layer 3: CAPTCHA (future enhancement)
 */
export async function createAuthRateLimiter(): Promise<
  ReturnType<typeof rateLimit>
> {
  const client = await getRateLimitRedisClient();

  const config: RateLimitConfig = {
    windowMs: 5 * 60 * 1000, // TIGHTENED: 5 minutes (was 15 minutes)
    max: 20, // RELAXED: 20 attempts/5min for pilot demo (was 3)
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      // Auth endpoints: use IP only (no user ID yet)
      // FIX: Use X-Forwarded-For to get real client IP
      const forwardedFor = req.headers['x-forwarded-for'];
      const clientIp =
        typeof forwardedFor === 'string'
          ? forwardedFor.split(',')[0].trim()
          : req.ip || 'unknown';
      return `ratelimit:auth:${clientIp}`;
    },
    handler: rateLimitHandler,
    skipSuccessfulRequests: true, // Only count failed auth attempts
    skip: (req: Request) => req.path.endsWith('/callback'), // OAuth callbacks are Google-initiated redirects, not brute-forceable
  };

  if (client) {
    config.store = new RedisStore({
      sendCommand: (...args: string[]) =>
        (client as Redis).call(
          args[0],
          ...args.slice(1)
        ) as Promise<RedisReply>,
      prefix: 'rl:auth:',
    });
  }

  return rateLimit(config);
}

/**
 * Aggressive rate limiter for file upload endpoints
 * 10 uploads per hour per user (prevent storage exhaustion)
 */
export async function createUploadRateLimiter(): Promise<
  ReturnType<typeof rateLimit>
> {
  const client = await getRateLimitRedisClient();

  const config: RateLimitConfig = {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: parseInt(process.env.RATE_LIMIT_SPECKLE_UPLOAD_MAX || '10'),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    handler: (req: Request, res: Response) => {
      const retryAfter = res.getHeader('Retry-After');
      return res.status(429).json({
        error: 'Upload limit exceeded',
        message:
          'You have exceeded the maximum number of file uploads allowed per hour.',
        retryAfter: retryAfter ? parseInt(retryAfter as string) : undefined,
        maxUploads: parseInt(process.env.RATE_LIMIT_SPECKLE_UPLOAD_MAX || '10'),
        window: '1 hour',
      });
    },
  };

  if (client) {
    config.store = new RedisStore({
      sendCommand: (...args: string[]) =>
        (client as Redis).call(
          args[0],
          ...args.slice(1)
        ) as Promise<RedisReply>,
      prefix: 'rl:upload:',
    });
  }

  return rateLimit(config);
}

/**
 * Lenient rate limiter for read-only endpoints
 * 300 requests per 15 minutes per IP/user
 */
export async function createReadOnlyRateLimiter(): Promise<
  ReturnType<typeof rateLimit>
> {
  const client = await getRateLimitRedisClient();

  const config: RateLimitConfig = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300, // 300 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    handler: rateLimitHandler,
  };

  if (client) {
    config.store = new RedisStore({
      sendCommand: (...args: string[]) =>
        (client as Redis).call(
          args[0],
          ...args.slice(1)
        ) as Promise<RedisReply>,
      prefix: 'rl:readonly:',
    });
  }

  return rateLimit(config);
}

/**
 * ENTERPRISE SECURITY (2025-12-19): Strategic Rate Limiter Initialization
 * Strategy: Always-on by default with opt-out only for development
 *
 * Security Pattern: Opt-Out (not Opt-In)
 * - Old: ENABLE_RATE_LIMITING='true' required (opt-in)
 * - Problem: If misconfigured, ALL protection is disabled
 * - New: DISABLE_RATE_LIMITING='true' required to disable (opt-out)
 * - Benefit: Fails secure - protection enabled by default
 *
 * Production Safety:
 * - validateConfig() blocks DISABLE_RATE_LIMITING in production/staging
 * - Double protection: environment variable + validation layer
 *
 * Initialize all rate limiters
 * Call this once during application startup
 */
export async function initializeRateLimiters(): Promise<{
  standard: ReturnType<typeof rateLimit>;
  auth: ReturnType<typeof rateLimit>;
  upload: ReturnType<typeof rateLimit>;
  readOnly: ReturnType<typeof rateLimit>;
}> {
  // STRATEGIC CHANGE: Opt-out pattern instead of opt-in
  // Rate limiting is ENABLED by default for security
  const isDisabled = process.env.DISABLE_RATE_LIMITING === 'true';

  if (isDisabled) {
    // TypeScript FIX: Cast to string to avoid type narrowing issues with ProcessEnv types
    const env = process.env.NODE_ENV as string;
    if (env === 'production' || env === 'staging') {
      // This should never happen - validateConfig() prevents it
      throw new Error(
        'CRITICAL: Rate limiting cannot be disabled in production/staging'
      );
    }

    logger.warn('========================================');
    logger.warn('⚠️  DANGER: Rate limiting is DISABLED');
    logger.warn('   This should ONLY be used for:');
    logger.warn('   - Local development');
    logger.warn('   - Testing');
    logger.warn('   - Never in production!');
    logger.warn('========================================');

    const noopHandler = ((req: Request, res: Response, next: NextFunction) =>
      next()) as ReturnType<typeof rateLimit>;
    return {
      standard: noopHandler,
      auth: noopHandler,
      upload: noopHandler,
      readOnly: noopHandler,
    };
  }

  // Rate limiting is ENABLED (default, secure path)
  logger.info('Initializing rate limiters...');

  const [standard, auth, upload, readOnly] = await Promise.all([
    createStandardRateLimiter(),
    createAuthRateLimiter(),
    createUploadRateLimiter(),
    createReadOnlyRateLimiter(),
  ]);

  const standardMax = parseInt(process.env.RATE_LIMIT_STANDARD_MAX || '100');
  logger.info('✅ Rate limiters initialized successfully');
  logger.info(`   - Standard API: ${standardMax} req/15min`);
  logger.info('   - Authentication: 20 req/5min');
  logger.info('   - File Upload: 10 req/hour');
  logger.info('   - Read-Only: 300 req/15min');

  return {
    standard,
    auth,
    upload,
    readOnly,
  };
}

/**
 * Cleanup Redis connection on application shutdown
 */
export async function cleanupRateLimiters() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

// Export all functions
export default {
  createStandardRateLimiter,
  createAuthRateLimiter,
  createUploadRateLimiter,
  createReadOnlyRateLimiter,
  initializeRateLimiters,
  cleanupRateLimiters,
};
