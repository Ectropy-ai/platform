/**
 * Security Middleware - Ectropy Platform
 * Comprehensive input validation and security protection
 */

/// <reference types="node" />
import { logger } from '@ectropy/shared/utils';
// FIXME: Temporarily disabled - missing module '@ectropy/shared/audit'
// import { auditLogger } from '@ectropy/shared/audit';
import type { NextFunction, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import helmet from 'helmet';
import * as DOMPurify from 'isomorphic-dompurify';

// Import Express type augmentation
import '@ectropy/shared/types/express';

// Placeholder audit logger until module is available
const auditLogger = {
  logRateLimitEvent: (_details: any) => {
    logger.warn('Rate limit event (audit logger placeholder)', _details);
  }
};

/**
 * SQL Injection Protection
 */
export class SQLInjectionProtector {
  private static readonly SQL_INJECTION_PATTERNS = [
    /(\b(ALTER|CREATE|DELETE|DROP|EXEC(UTE)?|INSERT|MERGE|SELECT|UPDATE|UNION|USE|BEGIN|COMMIT|ROLLBACK)\b)/gi,
    /(\b(SCRIPT|JAVASCRIPT|VBSCRIPT|IFRAME|OBJECT|EMBED|FORM)\b)/gi,
    /(['"](\s)*(OR|AND)(\s)*['"]?\w)/gi,
    /(\/\*|\*\/|--|#)/g,
    /(\b(XP_|SP_|OPENROWSET|OPENDATASOURCE)\b)/gi,
    /(WAITFOR\s+DELAY)/gi,
    /(BENCHMARK\s*\(|SLEEP\s*\()/gi,
  ];

  static sanitize(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }
    let sanitized = input.trim();
    // Remove SQL injection patterns
    for (const pattern of this.SQL_INJECTION_PATTERNS) {
      sanitized = sanitized.replace(pattern, '');
    }
    // Remove null bytes and control characters
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
    // Limit length
    if (sanitized.length > 10000) {
      sanitized = sanitized.substring(0, 10000);
    }
    return sanitized;
  }

  static validate(input: string): boolean {
    if (!input || typeof input !== 'string') {
      return true;
    }
    // Check for SQL injection patterns
    for (const pattern of this.SQL_INJECTION_PATTERNS) {
      if (pattern.test(input)) {
        return false;
      }
    }
    return true;
  }
}

/**
 * XSS Protection
 */
export class XSSProtector {
  static sanitize(input: string): string {
    // Use DOMPurify to sanitize HTML content
    return (DOMPurify as any).sanitize(input, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true,
    }) as string;
  }

  static sanitizeObject(obj: any): any {
    if (typeof obj === 'string') {
      return this.sanitize(obj);
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item));
    }
    if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[this.sanitize(key)] = this.sanitizeObject(value);
      }
      return sanitized;
    }
    return obj;
  }
}

/**
 * Input Validator Class
 */
export class InputValidator {
  /**
   * Validate and sanitize request data
   */
  static middleware() {
    // TypeScript: explicit any return type to handle Express middleware pattern
    return (req: Request, res: Response, next: NextFunction): any => {
      // Skip validation for OAuth callback routes
      // OAuth callbacks contain URL-encoded parameters and base64-like state tokens
      // that trigger false positives in injection detection
      // ENTERPRISE FIX: Support both /auth/* and /api/auth/* paths
      if (
        req.path.startsWith('/auth/google') ||
        req.path.startsWith('/auth/github') ||
        req.path.startsWith('/api/auth/google') ||
        req.path.startsWith('/api/auth/github')
      ) {
        return next();
      }

      try {
        // Sanitize request body
        if (req.body) {
          req.body = XSSProtector.sanitizeObject(req.body);
          // Validate SQL injection in string fields
          const validateSQL = (obj: any): void => {
            if (typeof obj === 'string') {
              if (!SQLInjectionProtector.validate(obj)) {
                throw new Error(
                  'Invalid input detected: potential SQL injection'
                );
              }
            } else if (Array.isArray(obj)) {
              obj.forEach(validateSQL);
            } else if (obj && typeof obj === 'object') {
              Object.values(obj).forEach(validateSQL);
            }
          };
          validateSQL(req.body);
        }
        // Sanitize query parameters
        if (req.query) {
          for (const [key, value] of Object.entries(req.query)) {
            if (typeof value === 'string') {
              if (!SQLInjectionProtector.validate(value)) {
                return res.status(400).json({
                  error: 'Invalid query parameter',
                  message: 'Potential security threat detected',
                  parameter: key,
                });
              }
              req.query[key] = XSSProtector.sanitize(value);
            }
          }
        }
        // Sanitize URL parameters
        if (req.params) {
          for (const [key, value] of Object.entries(req.params)) {
            if (typeof value === 'string') {
              if (!SQLInjectionProtector.validate(value)) {
                return res.status(400).json({
                  error: 'Invalid URL parameter',
                  message: 'Potential security threat detected',
                  parameter: key,
                });
              }
              req.params[key] = XSSProtector.sanitize(value);
            }
          }
        }
        // Log security events
        const logContext = {
          ip: req.ip || '',
          method: req.method,
          path: req.path,
          timestamp: new Date().toISOString(),
        };
        const userAgent = req.get('User-Agent');
        if (userAgent) {
          (logContext as any).userAgent = userAgent;
        }
        logger.info('Request validated and sanitized', logContext);
        next();
      } catch (_error) {
        const logContext: any = {
          error:
            _error instanceof Error
              ? (() => {
                  const errorObj: {
                    name: string;
                    message: string;
                    stack?: string;
                  } = {
                    name: _error.name,
                    message: _error.message,
                  };
                  if (_error.stack) {
                    errorObj.stack = _error.stack;
                  }
                  return errorObj;
                })()
              : {
                  name: 'UnknownError',
                  message: 'Unknown error occurred',
                },
          body: req.body,
        };
        const userAgent = req.get('User-Agent');
        if (userAgent) {
          logContext.userAgent = userAgent;
        }
        logger.error('Input validation failed', logContext);
        return res.status(400).json({
          error: 'Input validation failed',
          message:
            _error instanceof Error ? _error.message : 'Invalid input detected',
        });
      }
    };
  }
}

/**
 * Generate secure IP key with proper IPv6 subnet handling
 */
const generateSecureIPKey = (req: Request, keyPrefix: string): string => {
  // Check for API key first (authenticated users)
  if (req.headers['x-api-key']) {
    return `${keyPrefix}:api:${req.headers['x-api-key']}`;
  }

  // Handle IPv6 by masking to /64 subnet manually
  let ip = req.ip || 'unknown';
  if (ip.includes(':')) {
    ip = `${ip.split(':').slice(0, 4).join(':')}::/64`;
  }
  const userAgent = req.get('User-Agent') || 'unknown';

  return `${keyPrefix}:${ip}:${userAgent}`;
};

/**
 * Basic in-memory rate limiter implementation
 */
const createBasicRateLimiter = (config: {
  windowMs: number;
  max: number | ((req: Request) => number);
  message: string;
  keyGenerator: (req: Request) => string;
  handler?: (req: Request, res: Response) => void;
}) => {
  const requests = new Map<string, { count: number; timestamp: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = config.keyGenerator(req);
    const now = Date.now();
    const entry = requests.get(key) || { count: 0, timestamp: now };
    if (now - entry.timestamp > config.windowMs) {
      entry.count = 0;
      entry.timestamp = now;
    }
    entry.count++;
    requests.set(key, entry);

    const limit =
      typeof config.max === 'function' ? config.max(req) : config.max;
    if (entry.count > limit) {
      if (config.handler) {
        return config.handler(req, res);
      }
      res.status(429).json({ error: config.message });
      return;
    }
    next();
  };
};

/**
 * Rate Limiting Configuration
 */
export const createRateLimiter = (options: {
  windowMs: number;
  max: number;
  message: string;
  keyPrefix: string;
}) => {
  return createBasicRateLimiter({
    windowMs: options.windowMs,
    max: options.max,
    message: options.message,
    keyGenerator: (req: Request) => generateSecureIPKey(req, options.keyPrefix),
  });
};

/**
 * Enhanced Rate Limiting with per-user support
 */
export const createEnhancedRateLimiter = (options: {
  windowMs: number;
  max: number;
  message: string;
  keyPrefix: string;
  perUser?: boolean;
  userMax?: number;
}) => {
  return createBasicRateLimiter({
    windowMs: options.windowMs,
    message: options.message,
    keyGenerator: (req: Request) => {
      // Request already has user property via Express augmentation
      if (options.perUser && req.user?.id) {
        const userId = req.user.id;
        logger.info('Rate limiting per user', {
          userId,
          keyPrefix: options.keyPrefix,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        });
        return `${options.keyPrefix}:user:${userId}`;
      }
      return generateSecureIPKey(req, options.keyPrefix);
    },
    max: (req: Request) => {
      // Request already has user property via Express augmentation
      if (options.perUser && options.userMax && req.user?.id) {
        return options.userMax;
      }
      return options.max;
    },
    handler: (req: Request, res: Response) => {
      // Request already has user property via Express augmentation
      const isUser = options.perUser && req.user?.id;
      const auditDetails = {
        type: isUser ? 'user' : ('ip' as 'ip' | 'user'),
        identifier: isUser ? req.user?.id : req.ip || 'unknown',
        keyPrefix: options.keyPrefix,
        endpoint: req.path,
        method: req.method,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
        headers: {
          'x-forwarded-for': req.get('X-Forwarded-For'),
          'x-real-ip': req.get('X-Real-IP'),
        },
      };

      logger.warn('Rate limit exceeded', auditDetails);

      auditLogger.logRateLimitEvent({
        identifier: auditDetails.identifier || 'unknown',
        type: auditDetails.type,
        sourceIp: req.ip || 'unknown',
        userAgent: auditDetails.userAgent,
        endpoint: auditDetails.endpoint,
        method: auditDetails.method,
        keyPrefix: auditDetails.keyPrefix,
        metadata: {
          headers: auditDetails.headers,
          sessionId: req.sessionId,
        },
      });

      res.status(429).json({
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil(options.windowMs / 1000),
      });
    },
  });
};

/**
 * Security Headers Configuration
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", 'https://api.ectropy.construction'],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
  frameguard: {
    action: 'deny',
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

/**
 * Request Size Limiter
 */
export const createSizeLimiter = (maxSize = '10mb') => {
  // TypeScript: explicit any return type to handle Express middleware pattern
  return (req: Request, res: Response, next: NextFunction): any => {
    const contentLength = req.get('Content-Length');
    if (contentLength) {
      const sizeInBytes = parseInt(contentLength, 10);
      const maxSizeInBytes = parseSize(maxSize);
      if (sizeInBytes > maxSizeInBytes) {
        logger.warn('Request size limit exceeded', {
          size: sizeInBytes,
          limit: maxSizeInBytes,
        });

        return res.status(413).json({
          error: 'Request entity too large',
          message: `Request size exceeds limit of ${maxSize}`,
        });
      }
      next();
    }
  };
};

/**
 * Parse size string to bytes
 */
function parseSize(size: string): number {
  const units = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };

  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)(b|kb|mb|gb)$/);
  if (!match) {
    throw new Error(`Invalid size format: ${size}`);
  }

  const [, value, unit] = match;
  if (!value) {
    throw new Error(`Invalid size value: ${size}`);
  }

  return Math.floor(parseFloat(value) * units[unit as keyof typeof units]);
}

/**
 * Validation Rules
 */
export const validationRules = {
  // User validation
  email: body('email')
    .isEmail()
    .normalizeEmail()
    .isLength({ max: 254 })
    .withMessage('Valid email is required'),
  password: body('password')
    .isLength({ min: 8, max: 128 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage(
      'Password must contain at least 8 characters with uppercase, lowercase, number and special character'
    ),
  // Project validation
  projectName: body('name')
    .isLength({ min: 1, max: 100 })
    .matches(/^[a-zA-Z0-9\s\-_]+$/)
    .withMessage(
      'Project name must be 1-100 characters, alphanumeric with spaces, hyphens, underscores only'
    ),
  // UUID validation
  uuid: param('id').isUUID().withMessage('Valid UUID is required'),
  // Element validation
  elementType: body('elementType')
    .isIn([
      'wall',
      'floor',
      'ceiling',
      'door',
      'window',
      'beam',
      'column',
      'stair',
      'roof',
    ])
    .withMessage('Invalid element type'),
  // Pagination validation
  page: query('page')
    .optional()
    .isInt({ min: 1, max: 10000 })
    .withMessage('Page must be a positive integer'),
  limit: query('limit')
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
};

/**
 * Validation Error Handler
 */
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
): any => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn('Validation errors detected', {
      errors: errors.array(),
      ip: req.ip || '',
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString(),
    });
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Request contains invalid data',
      details: errors.array().map((error) => ({
        field: error.type === 'field' ? error.path : undefined,
        message: error.msg,
        value: error.type === 'field' ? error.value : undefined,
      })),
    });
  }
  next();
};
/**
 * Security Event Logger
 */
export const logSecurityEvent = (
  req: Request,
  event: string,
  additional?: any
) => {
  const userAgent = req.get('User-Agent');
  const logContext: any = {
    event,
    ip: req.ip,
    method: req.method,
    path: req.path,
    headers: req.headers,
    body: req.body,
    additional,
    timestamp: new Date().toISOString(),
  };

  if (userAgent) {
    logContext.userAgent = userAgent;
  }

  logger.warn('Security event detected', logContext);
};
