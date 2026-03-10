/**
 * Enhanced Authentication Middleware
 * Production-ready middleware with comprehensive security features
 *
 * 🔄 MIGRATION NOTES:
 * This replaces the old AuthMiddleware pattern:
 *
 * OLD PATTERN:
 * - AuthMiddleware(authService) - required service injection
 * - Used in: libs/shared/middleware/src/auth.middleware.ts
 *
 * NEW PATTERN:
 * - EnhancedAuthMiddleware() - self-contained, creates own service
 * - Better encapsulation and testing
 * - Enhanced security features built-in
 *
 * 🚀 USAGE IN API GATEWAY:
 * const authMiddleware = new EnhancedAuthMiddleware();
 * app.use(authMiddleware.authenticate());
 * app.use(authMiddleware.authorize(['admin']));
 *
 * 💡 FEATURES:
 * - JWT token validation
 * - Role-based authorization
 * - Rate limiting
 * - Security headers
 * - Session management
 * - CORS configuration
 *
 * 🔗 INTEGRATION STATUS:
 * ✅ Migrated from libs/auth/enhanced/middleware/auth.middleware.ts
 * ✅ Centralized in shared location for consistent usage
 */
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import { EnhancedJWTAuthService } from '@ectropy/auth/enhanced';
export class EnhancedAuthMiddleware {
  constructor() {
    this.authService = new EnhancedJWTAuthService();
  }
  /**
   * Security headers middleware
   */
  securityHeaders() {
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
  /**
   * Rate limiting middleware
   */
  rateLimit(windowMs = 15 * 60 * 1000, max = 100) {
    return rateLimit({
      windowMs,
      max,
      message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil(windowMs / 1000),
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        res.status(429).json({
          error: 'Rate limit exceeded',
          message: 'Too many requests from this IP, please try again later.',
          retryAfter: Math.ceil(windowMs / 1000),
        });
      },
    });
  }
  /**
   * Authentication middleware
   */
  authenticate(options = {}) {
    return async (req, res, next) => {
      try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({
            error: 'Access denied',
            message: 'No token provided',
          });
        }
        const token = 'REDACTED';
        // Add timeout for token verification to prevent hanging
        const verificationPromise = this.authService.verifyToken(token);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(
            () => reject(new Error('Token verification timeout')),
            3000
          );
        });
        const result = await Promise.race([
          verificationPromise,
          timeoutPromise,
        ]);
        if (!result.valid) {
          return res.status(401).json({
            error: 'Access denied',
            message: result.error || 'Invalid token',
          });
        }
        // Check role authorization
        if (
          options.roles !== null &&
          !options.roles.includes(result.user.role)
        ) {
          return res.status(403).json({
            error: 'Access denied',
            message: 'Insufficient permissions',
          });
        }
        // Add user to request
        req.user = result.user;
        next();
      } catch (_error) {
        // console.error('Authentication middleware error:', error);
        return res.status(500).json({
          error: 'Authentication error',
          message: 'Internal server error',
        });
      }
    };
  }
  /**
   * Role-based authorization middleware
   */
  authorize(requiredRoles) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Access denied',
          message: 'Authentication required',
        });
      }
      if (!requiredRoles.includes(req.user.role)) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'Insufficient permissions',
        });
      }
      next();
    };
  }
  /**
   * Admin only middleware
   */
  adminOnly() {
    return this.authorize(['admin']);
  }
  /**
   * Owner or admin middleware
   */
  ownerOrAdmin() {
    return this.authorize(['owner', 'admin']);
  }
  /**
   * Professional roles middleware (architect, engineer, contractor)
   */
  professionalRoles() {
    return this.authorize(['architect', 'engineer', 'contractor', 'admin']);
  }
  /**
   * CORS middleware with security considerations
   */
  cors() {
    return (req, res, next) => {
      const allowedOrigins = [
        'http://localhost:3000',
        'https://localhost:3000',
        'https://refactored-space-waddle-674rvp66976f5jg7-3000.app.github.dev',
        process.env.FRONTEND_URL,
      ].filter(Boolean);
      const origin = req.headers.origin;
      if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, OPTIONS'
      );
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With'
      );
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Max-Age', '86400');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    };
  }
  /**
   * Request validation middleware
   */
  validateRequest(schema) {
    return (req, res, next) => {
      const { error } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: 'Validation error',
          message: error.details[0].message,
          details: error.details,
        });
      }
      next();
    };
  }
  /**
   * Session management middleware
   */
  sessionManagement() {
    return (req, res, next) => {
      // Add session context to request (as a custom property)
      req.sessionContext = {
        id: req.headers['x-session-id'] || 'anonymous',
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'] || null,
        timestamp: new Date().toISOString(),
      };
      next();
    };
  }
  /**
   * Audit logging middleware
   */
  auditLog() {
    return (req, res, next) => {
      const startTime = Date.now();
      // Log request
      const logData = {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        userId: req.user?.id || null,
        timestamp: new Date().toISOString(),
        body: req.method !== 'GET' ? req.body : null,
      };
      // Override end method to capture response
      const originalEnd = res.end;
      res.end = function (chunk, encoding, cb) {
        const responseTime = Date.now() - startTime;
        // Log response
        console.log(
          JSON.stringify({
            ...logData,
            statusCode: res.statusCode,
            responseTime,
            timestamp: new Date().toISOString(),
          })
        );
        return originalEnd.call(this, chunk, encoding, cb);
      };
      next();
    };
  }
}
// Legacy exports for backward compatibility
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  jwt.verify(
    token,
    process.env.JWT_SECRET || 'your-secret-key',
    (err, user) => {
      if (err) {
        return res.status(403).json({ error: 'Invalid or expired token' });
      }
      req.user = user;
      next();
    }
  );
};
export const requireRoles = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const hasRole = roles.some((role) => req.user.roles.includes(role));
    if (!hasRole) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};
//# sourceMappingURL=auth.middleware.js.map
