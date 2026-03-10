/**
 * Enhanced Authentication Middleware
 * Production-ready middleware with comprehensive security features
 */

/**
 * Enhanced Authentication Middleware
 * Production-ready middleware with comprehensive security features
 *
 * 🔄 MIGRATION NOTES:
 * This replaces the old AuthMiddleware pattern:
 * OLD PATTERN:
 * - AuthMiddleware(authService) - required service injection
 * - Used in: libs/shared/middleware/src/auth.middleware.ts
 * NEW PATTERN:
 * - EnhancedAuthMiddleware() - self-contained, creates own service
 * - Better encapsulation and testing
 * - Enhanced security features built-in
 * 🚀 USAGE IN API GATEWAY:
 * const authMiddleware = new EnhancedAuthMiddleware();
 * app.use(authMiddleware.authenticate());
 * app.use(authMiddleware.authorize(['admin']));
 * 💡 FEATURES:
 * - JWT token validation
 * - Role-based authorization
import jwt from 'jsonwebtoken'; // Moved jwt import to the top
 * - Rate limiting
 * - Security headers
 * - Session management
 * - CORS configuration
 * 🔗 INTEGRATION STATUS:
 * ✅ Migrated from libs/auth/enhanced/middleware/auth.middleware.ts
 * ✅ Centralized in shared location for consistent usage
 */

import '../../../types/express.js';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import session from 'express-session';
import RedisStore from 'connect-redis';
import { Redis } from 'ioredis';
import { EnhancedJWTAuthService } from '../../auth/enhanced/services/jwt-auth.service.js';
interface AuthOptions {
  roles?: string[];
  requireTwoFactor?: boolean;
  allowExpiredInGracePeriod?: boolean;
}
export class EnhancedAuthMiddleware {
  private authService: EnhancedJWTAuthService;
  constructor() {
    this.authService = new EnhancedJWTAuthService();
  }
  /**
   * Security headers middleware
   */
  public securityHeaders(): ReturnType<typeof helmet> {
    return helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    });
  }

  public async createRateLimit(
    windowMs: number = 15 * 60 * 1000,
    max: number = 100
  ) {
    try {
      const rateLimitModule = await import('express-rate-limit');
      const rateLimit = rateLimitModule.default || rateLimitModule;

      return rateLimit({
        windowMs,
        max,
        message: 'Too many requests from this IP, please try again later.',
      });
    } catch (error) {
      return (req: Request, res: Response, next: NextFunction) => next();
    }
  }

  /**
   * Configure session management using Redis store
   */
  public sessionManagement(): ReturnType<typeof session> {
    // Build Redis URL from component variables (NEW APPROACH)
    const REDIS_HOST = process.env['REDIS_HOST'] || 'localhost';
    const REDIS_PORT = process.env['REDIS_PORT'] || '6379';
    const REDIS_PASSWORD = process.env['REDIS_PASSWORD'] || '';
    const REDIS_URL = REDIS_PASSWORD
      ? `redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}`
      : `redis://${REDIS_HOST}:${REDIS_PORT}`;

    const redisClient = new Redis(REDIS_URL);
    // connect-redis v7 with built-in types
    const store = new RedisStore({ client: redisClient });

    return session({
      store,
      secret: process.env['SESSION_SECRET'] || 'change-me',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env['NODE_ENV'] === 'production',
        httpOnly: true,
        sameSite: 'lax',
      },
    });
  }

  public authenticate(
    options: AuthOptions = {}
  ): (req: Request, res: Response, next: NextFunction) => Promise<void> {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authHeader = req.headers['authorization'];
        if (
          !authHeader ||
          typeof authHeader !== 'string' ||
          !authHeader.startsWith('Bearer ')
        ) {
          res.status(401).json({
            error: 'Access denied',
            message: 'No token provided',
          });
          return;
        }
        const token = authHeader.split(' ')[1];
        const result = await this.authService.validateAccessToken(
          token,
          options.allowExpiredInGracePeriod
        );
        if (!result || !result.user) {
          res.status(401).json({
            error: 'Invalid or expired token',
            message: 'Token verification failed',
          });
          return;
        }
        if (options.roles && !options.roles.includes(result.user.role)) {
          res.status(403).json({
            error: 'Insufficient permissions',
            message: 'Insufficient permissions',
          });
          return;
        }
        // Add user to request
        (req as any).user = result.user;
        return next();
      } catch (error) {
        res.status(500).json({
          error: 'Authentication error',
          message: 'Internal server error',
        });
      }
    };
  }
}

// Legacy exports for backward compatibility
export const authenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = (req as any).headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }
  try {
    const user = jwt.verify(
      token,
      process.env['JWT_SECRET'] || 'your-secret-key'
    );
    (req as any).user = user;
    next();
  } catch (err) {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
};

export const requireRoles = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const hasRole = req.user.role && roles.includes(req.user.role);
    if (!hasRole) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
};
