/**
 * Enterprise Rate Limiting Middleware
 * Provides configurable rate limiting with ESM compatibility
 */

import type { Request, Response, NextFunction } from 'express';

const logger = {
  info: (message: string, ...args: any[]) => console.log(message, ...args),
  error: (message: string, ...args: any[]) => console.error(message, ...args),
  warn: (message: string, ...args: any[]) => console.warn(message, ...args)
};

// Dynamic import for ESM compatibility
let rateLimitModule: any;
let isInitialized = false;

/**
 * Initialize rate limiter with dynamic import
 */
async function initializeRateLimiter() {
  if (isInitialized) {
    return;
  }
  
  try {
    // Use dynamic import for ESM module
    const module = await import('express-rate-limit');
    rateLimitModule = module.default || module;
    isInitialized = true;
    logger.info('Rate limiter module loaded successfully');
  } catch (error) {
    logger.error('Failed to load rate limiter module', error);
    throw new Error('Rate limiter initialization failed');
  }
}

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  windowMs?: number;
  max?: number;
  message?: string;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (_req: Request) => string;
}

/**
 * Enterprise Rate Limiter for AECO Platform
 * Handles different tiers: Free, Pro, Enterprise
 */
export class RateLimiterFactory {
  /**
   * Standard rate limiter for public endpoints
   */
  static async createStandard() {
    await initializeRateLimiter();
    
    if (!rateLimitModule) {
      throw new Error('Rate limiter not initialized');
    }
    
    return rateLimitModule({
      windowMs: 60 * 1000, // 1 minute
      max: 100,
      message: 'Rate limit exceeded. Please upgrade to Pro for higher limits.',
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: this.getKeyGenerator
    });
  }

  /**
   * Strict rate limiter for authentication
   */
  static async createAuth() {
    await initializeRateLimiter();
    
    if (!rateLimitModule) {
      throw new Error('Rate limiter not initialized');
    }
    
    return rateLimitModule({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5,
      message: 'Too many login attempts. Please wait 15 minutes.',
      skipSuccessfulRequests: true,
      keyGenerator: this.getKeyGenerator
    });
  }

  /**
   * Enterprise rate limiter with higher limits
   */
  static async createEnterprise() {
    await initializeRateLimiter();
    
    if (!rateLimitModule) {
      throw new Error('Rate limiter not initialized');
    }
    
    return rateLimitModule({
      windowMs: 60 * 1000,
      max: 1000, // 10x standard limit
      message: 'Enterprise rate limit reached. Contact support for increased capacity.',
      keyGenerator: this.getKeyGenerator
    });
  }

  /**
   * Intelligent key generation for rate limiting
   */
  private static getKeyGenerator(req: Request): string {
    // Priority: API Key > User ID > IP
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
      return `api:${apiKey}`;
    }
    
    const userId = (req as any).user?.id;
    if (userId) {
      return `user:${userId}`;
    }
    
    return `ip:${req.ip || 'unknown'}`;
  }
}

/**
 * Create rate limiter with configuration
 */
export async function createRateLimiter(config?: RateLimiterConfig) {
  await initializeRateLimiter();
  
  if (!rateLimitModule) {
    throw new Error('Rate limiter not initialized');
  }

  const defaultConfig: RateLimiterConfig = {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    keyGenerator: (req) => {
      // Use IP address as key, with fallback
      return (
        req.ip ||
        req.socket.remoteAddress ||
        req.headers['x-forwarded-for']?.toString().split(',')[0] ||
        'unknown'
      );
    },
  };

  const finalConfig = { ...defaultConfig, ...config };

  // Create and return the rate limiter
  return rateLimitModule(finalConfig);
}

// Lazy-initialized rate limiters
let standardRateLimiter: any;
let authRateLimiter: any;
let enterpriseRateLimiter: any;

/**
 * Get or create standard rate limiter
 */
export async function getStandardRateLimiter() {
  if (!standardRateLimiter) {
    standardRateLimiter = await RateLimiterFactory.createStandard();
  }
  return standardRateLimiter;
}

/**
 * Get or create auth rate limiter
 */
export async function getAuthRateLimiter() {
  if (!authRateLimiter) {
    authRateLimiter = await RateLimiterFactory.createAuth();
  }
  return authRateLimiter;
}

/**
 * Get or create enterprise rate limiter
 */
export async function getEnterpriseRateLimiter() {
  if (!enterpriseRateLimiter) {
    enterpriseRateLimiter = await RateLimiterFactory.createEnterprise();
  }
  return enterpriseRateLimiter;
}

// Lazy initialized limiters
let strictRateLimiter: any;
let apiRateLimiter: any;

/**
 * Get or create strict rate limiter
 */
export async function getStrictRateLimiter() {
  if (!strictRateLimiter) {
    strictRateLimiter = await createRateLimiter({
      windowMs: 1 * 60 * 1000,
      max: 10,
      message: 'Rate limit exceeded. Maximum 10 requests per minute allowed.',
    });
  }
  return strictRateLimiter;
}

/**
 * Get or create API rate limiter
 */
export async function getApiRateLimiter() {
  if (!apiRateLimiter) {
    apiRateLimiter = await createRateLimiter({
      windowMs: 1 * 60 * 1000,
      max: 60,
      message: 'API rate limit exceeded.',
      keyGenerator: (req) => {
        // Use API key if available, otherwise IP
        const apiKey = req.headers['x-api-key'];
        if (apiKey) {
          return `api_${apiKey}`;
        }
        return req.ip || 'unknown';
      },
    });
  }
  return apiRateLimiter;
}

// For backward compatibility - asynchronous wrapper
export const rateLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (isInitialized) {
      const limiter = await getStandardRateLimiter();
      return limiter(req, res, next);
    } else {
      // Fallback if rate limiter not available
      logger.warn('Rate limiter not available, allowing request');
      next();
    }
  } catch (error) {
    logger.warn('Rate limiter error, allowing request:', error);
    next();
  }
};

// Default export - get standard rate limiter
export default getStandardRateLimiter;
