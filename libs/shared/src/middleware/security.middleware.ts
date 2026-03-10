/**
 * Enterprise Security Middleware
 * Provides comprehensive security features including rate limiting, CORS, headers, etc.
 */

import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';

const logger = {
};

/**
 * Security middleware class with enterprise-grade features
 */
export class SecurityMiddleware {
  /**
   * Security Headers middleware
   */
  static securityHeaders() {
    return (req: Request, res: Response, next: NextFunction) => {
      // X-Content-Type-Options
      res.setHeader('X-Content-Type-Options', 'nosniff');
      
      // X-Frame-Options
      res.setHeader('X-Frame-Options', 'DENY');
      
      // X-XSS-Protection
      res.setHeader('X-XSS-Protection', '1; mode=block');
      
      // Strict-Transport-Security (HTTPS only)
      if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
      }
      
      // Content-Security-Policy
      const csp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self'",
        "connect-src 'self' ws: wss:",
        "frame-ancestors 'none'",
      ].join('; ');
      res.setHeader('Content-Security-Policy', csp);
      
      // Remove server header
      res.removeHeader('X-Powered-By');
      
      next();
    };
  }

  /**
   * CORS Configuration middleware
   */
  static cors(options?: { 
    origins?: string[]; 
    credentials?: boolean;
    methods?: string[];
    headers?: string[];
  }) {
    const {
      origins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
        'http://localhost:4200',
        process.env.FRONTEND_URL,
        process.env.CLIENT_URL,
      ].filter(Boolean),
      credentials = true,
      methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      headers = [
        'Content-Type', 
        'Authorization', 
        'X-Request-ID',
        'X-Forwarded-For',
        'Accept',
        'Origin'
      ],
    } = options || {};

    return (req: Request, res: Response, next: NextFunction) => {
      const requestOrigin = req.headers.origin;

      // Check if origin is allowed
      if (requestOrigin && origins.includes(requestOrigin)) {
        res.setHeader('Access-Control-Allow-Origin', requestOrigin);
      } else if (process.env.NODE_ENV === 'development') {
        // Allow all origins in development
        res.setHeader('Access-Control-Allow-Origin', requestOrigin || '*');
      }

      res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
      res.setHeader('Access-Control-Allow-Headers', headers.join(', '));
      res.setHeader('Access-Control-Allow-Credentials', String(credentials));
      res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        return res.status(204).end();
      }

      next();
    };
  }

  /**
   * Request validation middleware
   */
  static validateRequest() {
    return (req: Request, res: Response, next: NextFunction) => {
      const errors = validationResult(req);

      if (!errors.isEmpty()) {
        const validationErrors = errors.array().map(error => ({
          field: error.type === 'field' ? error.path : 'unknown',
          message: error.msg,
          value: error.type === 'field' ? error.value : undefined,
        }));

        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: validationErrors,
        });
      }

      next();
    };
  }

  /**
   * Request ID middleware
   */
  static requestId() {
    return (req: Request, res: Response, next: NextFunction) => {
      const requestId = req.headers['x-request-id'] as string || 
        `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      req.headers['x-request-id'] = requestId;
      res.setHeader('X-Request-ID', requestId);

      next();
    };
  }

  /**
   * Rate limiting middleware (basic implementation)
   * In production, use redis-based rate limiting
   */
  static rateLimit(options?: {
    windowMs?: number;
    maxRequests?: number;
    message?: string;
  }) {
    const {
      windowMs = 15 * 60 * 1000, // 15 minutes
      maxRequests = 100,
      message = 'Too many requests from this IP',
    } = options || {};

    const requests = new Map<string, { count: number; resetTime: number }>();

    return (req: Request, res: Response, next: NextFunction) => {
      const clientIp = req.ip || 
        req.headers['x-forwarded-for'] as string || 
        req.connection.remoteAddress || 
        'unknown';

      const now = Date.now();
      const windowStart = now - windowMs;
      
      // Clean up old entries
      for (const [ip, data] of requests.entries()) {
        if (data.resetTime < windowStart) {
          requests.delete(ip);
        }
      }

      const clientData = requests.get(clientIp) || { count: 0, resetTime: now + windowMs };
      
      if (clientData.resetTime < now) {
        // Reset the window
        clientData.count = 0;
        clientData.resetTime = now + windowMs;
      }

      clientData.count++;
      requests.set(clientIp, clientData);

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - clientData.count));
      res.setHeader('X-RateLimit-Reset', Math.ceil(clientData.resetTime / 1000));

      if (clientData.count > maxRequests) {
        return res.status(429).json({
          success: false,
          error: message,
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil((clientData.resetTime - now) / 1000),
        });
      }

      next();
    };
  }

  /**
   * Input sanitization middleware
   */
  static sanitizeInput() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Basic XSS protection
      const sanitize = (obj: any): any => {
        if (typeof obj === 'string') {
          return obj
            .replace(/[<>]/g, '') // Remove basic HTML tags
            .replace(/javascript:/gi, '') // Remove javascript: protocol
            .replace(/on\w+=/gi, ''); // Remove event handlers
        }
        
        if (Array.isArray(obj)) {
          return obj.map(sanitize);
        }
        
        if (typeof obj === 'object' && obj !== null) {
          const sanitized: any = {};
          for (const [key, value] of Object.entries(obj)) {
            sanitized[key] = sanitize(value);
          }
          return sanitized;
        }
        
        return obj;
      };

      if (req.body) {
        req.body = sanitize(req.body);
      }
      
      if (req.query) {
        req.query = sanitize(req.query);
      }

      next();
    };
  }
}