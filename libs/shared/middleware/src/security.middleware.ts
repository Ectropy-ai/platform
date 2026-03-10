/**
 * Security-related Express middleware including rate limiting and headers.
 */
/// <reference types="node" />
import type { NextFunction, Request, Response } from 'express';

// Define RequestHandler type locally
type RequestHandler = (req: Request, res: Response, next: NextFunction) => void;
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';

export class SecurityMiddleware {
  /**
   * Rate limiting configuration - with dynamic import for Node v20 compatibility
   */
  static async createRateLimiter(
    windowMs: number = 15 * 60 * 1000,
    max: number = 100
  ) {
    try {
      // Dynamic import for Node v20 ESM compatibility
      const rateLimitModule = await import('express-rate-limit');
      const rateLimit = rateLimitModule.default || rateLimitModule;

      return rateLimit({
        windowMs, // 15 minutes by default
        max, // limit each IP to 100 requests per windowMs
        message: 'Too many requests from this IP, please try again later.',
      });
    } catch (error) {
      // Return a simple alternative middleware
      return (req: Request, res: Response, next: NextFunction) => {
        // Simple alternative - could enhance with in-memory tracking
        next();
      };
    }
  }

  /**
   * API-specific rate limiter (more restrictive)
   */
  static async createApiRateLimiter() {
    try {
      const rateLimitModule = await import('express-rate-limit');
      const rateLimit = rateLimitModule.default || rateLimitModule;

      return rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 1000, // limit each IP to 1000 requests per windowMs
        message: 'Too many API requests from this IP, please try again later.',
      });
    } catch (error) {
      console.warn(
        'express-rate-limit not available for API limiter, using fallback'
      );
      return (req: Request, res: Response, next: NextFunction) => next();
    }
  }

  /**
   * Auth endpoints rate limiter (very restrictive)
   */
  static async createAuthRateLimiter() {
    try {
      const rateLimitModule = await import('express-rate-limit');
      const rateLimit = rateLimitModule.default || rateLimitModule;

      return rateLimit({
        max: 5, // limit each IP to 5 login attempts per windowMs
        message:
          'Too many login attempts from this IP, please try again later.',
      });
    } catch (error) {
      console.warn(
        'express-rate-limit not available for auth limiter, using fallback'
      );
      return (req: Request, res: Response, next: NextFunction) => next();
    }
  }

  /**
   * Security headers middleware
   */
  static securityHeaders = helmet({
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

  /**
   * CORS configuration
   */
  static corsOptions = cors({
    origin: [
      'http://localhost:3000',
      'https://localhost:3000',
      'https://refactored-space-waddle-674rvp66976f5jg7-3000.app.github.dev',
      ...(process.env['ALLOWED_ORIGINS']?.split(',') || []),
    ],
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  /**
   * Compression middleware
   */
  static compression: RequestHandler = compression();

  /**
   * Request logging middleware
   */
  static requestLogger = (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    // Store original end method and override to log when response finishes
    const originalEnd = res.end.bind(res) as any;
    res.end = function (chunk?: any, encoding?: any, cb?: any): Response {
      const duration = Date.now() - start;
      console.log(
        `${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`
      );
      // Call original end method with original arguments
      if (arguments.length === 0) {
        originalEnd();
      } else if (arguments.length === 1) {
        originalEnd(chunk);
      } else if (arguments.length === 2) {
        originalEnd(chunk, encoding);
      } else {
        originalEnd(chunk, encoding, cb);
      }
      return this as Response;
    };
    next();
  };
  /**
   * Error handling middleware
   */
  static errorHandler = (
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    // Don't leak error details in production
    const isDevelopment = process.env['NODE_ENV'] === 'development';
    if (err.name === 'ValidationError') {
      res.status(400).json({
        error: 'Validation Error',
        message: isDevelopment ? err.message : 'Invalid input data',
      });
      return;
    }
    if (err.name === 'UnauthorizedError') {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }
    if (err.name === 'ForbiddenError') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Access denied',
      });
      return;
    }
    // Default error response
    res.status(500).json({
      error: 'Internal Server Error',
      message: isDevelopment ? err.message : 'Something went wrong',
    });
  };
  /**
   * Health check endpoint
   */
  static healthCheck = (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: (process as NodeJS.Process).uptime(),
    });
  };

  /**
   * Static rate limiter instances for direct usage
   */
  static apiRateLimiter = SecurityMiddleware.createApiRateLimiter();
  static authRateLimiter = SecurityMiddleware.createAuthRateLimiter();
  static standardRateLimiter = SecurityMiddleware.createRateLimiter();
}
export default SecurityMiddleware;
