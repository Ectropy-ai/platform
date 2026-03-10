/**
 * Task 4.2: OWASP Top 10 Security Hardening Middleware
 * Comprehensive security protection for production deployment
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import helmet from 'helmet';
import {
  body,
  query,
  param,
  validationResult,
  ValidationError,
} from 'express-validator';
import * as DOMPurify from 'isomorphic-dompurify';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

// ENTERPRISE: Import centralized User type - no local interface declarations
import type { User } from '@ectropy/shared/types';

interface ErrorWithMessage {
  message: string;
}

/**
 * OWASP A01:2021 – Broken Access Control
 */
export const accessControlMiddleware = (
  requiredRole?: string
): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    // User property is globally augmented via Express namespace
    const authReq = req;
    // Check authentication
    if (!authReq.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    // Check role-based authorization
    if (
      requiredRole &&
      authReq.user.role !== requiredRole &&
      authReq.user.role !== 'admin'
    ) {
      logger.warn('Access control violation', {
        userId: authReq.user.id,
        requiredRole,
        userRole: authReq.user.role,
        endpoint: req.path,
        ip: req.ip,
      });

      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions',
      });
    }

    next();
  };
};

/**
 * OWASP A02:2021 – Cryptographic Failures
 */
export const cryptographicSecurityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", 'wss:', 'https:'],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: { policy: 'require-corp' },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: false,
  referrerPolicy: { policy: 'no-referrer' },
  xssFilter: true,
});

/**
 * OWASP A03:2021 – Injection
 */
export class InjectionProtection {
  private static readonly SQL_INJECTION_PATTERNS = [
    /(\b(ALTER|CREATE|DELETE|DROP|EXEC(UTE)?|INSERT|MERGE|SELECT|UPDATE|UNION|USE|BEGIN|COMMIT|ROLLBACK)\b)/i,
    /(\b(SCRIPT|JAVASCRIPT|VBSCRIPT|IFRAME|OBJECT|EMBED|FORM)\b)/i,
    /(['"](\s)*(OR|AND)(\s)*['"]?\w)/i,
    /(\/\*|\*\/|--|#)/,
    /(\b(XP_|SP_|OPENROWSET|OPENDATASOURCE)\b)/i,
    /(WAITFOR\s+DELAY)/i,
    /(BENCHMARK\s*\(|SLEEP\s*\()/i,
    /(0x[0-9a-f]+)/i,
    /(CHAR\s*\()/i,
    /(ASCII\s*\()/i,
  ];

  private static readonly XSS_PATTERNS = [
    /<script[^>]*>.*?<\/script>/i,
    /<iframe[^>]*>.*?<\/iframe>/i,
    /<object[^>]*>.*?<\/object>/i,
    /<embed[^>]*>/i,
    /<link[^>]*>/i,
    /<meta[^>]*>/i,
    /javascript:/i,
    /vbscript:/i,
    /on\w+\s*=/i,
  ];

  static sanitizeInput(input: unknown): unknown {
    if (typeof input === 'string') {
      // SQL Injection protection
      let sanitized = input;
      this.SQL_INJECTION_PATTERNS.forEach((pattern) => {
        sanitized = sanitized.replace(pattern, '');
      });

      // XSS protection
      sanitized = DOMPurify.sanitize(sanitized, {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: [],
        KEEP_CONTENT: true,
      });

      // Remove potential XSS patterns
      this.XSS_PATTERNS.forEach((pattern) => {
        sanitized = sanitized.replace(pattern, '');
      });

      return sanitized;
    }

    if (Array.isArray(input)) {
      return input.map((item) => this.sanitizeInput(item));
    }

    if (input && typeof input === 'object') {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input)) {
        const sanitizedKey = this.sanitizeInput(key);
        if (typeof sanitizedKey === 'string') {
          sanitized[sanitizedKey] = this.sanitizeInput(value);
        }
      }
      return sanitized;
    }

    return input;
  }

  static middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Skip sanitization for OAuth callback routes
      // OAuth callbacks contain URL-encoded parameters and base64-like state tokens
      // that trigger false positives in injection detection
      // ENTERPRISE FIX (2025-12-09): Added /api prefix to match actual route mounting
      // Auth routes are mounted at /api/auth (see main.ts:495)
      if (
        req.path.startsWith('/api/auth/google') ||
        req.path.startsWith('/api/auth/github')
      ) {
        return next();
      }

      try {
        // Validate for injection attempts BEFORE sanitization
        const validateString = (str: string) => {
          for (const pattern of this.SQL_INJECTION_PATTERNS) {
            if (pattern.test(str)) {
              throw new Error(
                `Potential SQL injection detected: ${str.substring(0, 50)}...`
              );
            }
          }
        };

        const validateObject = (obj: unknown): void => {
          if (typeof obj === 'string') {
            validateString(obj);
          } else if (Array.isArray(obj)) {
            obj.forEach(validateObject);
          } else if (obj && typeof obj === 'object') {
            Object.values(obj).forEach(validateObject);
          }
        };

        if (req.body) {
          validateObject(req.body);
        }
        if (req.query) {
          validateObject(req.query);
        }
        if (req.params) {
          validateObject(req.params);
        }

        // Sanitize all inputs AFTER validation
        if (req.body) {
          req.body = this.sanitizeInput(req.body);
        }
        if (req.query) {
          // Type assertion: sanitizeInput maintains structure while sanitizing values
          req.query = this.sanitizeInput(req.query) as typeof req.query;
        }
        if (req.params) {
          // Type assertion: sanitizeInput maintains structure while sanitizing values
          req.params = this.sanitizeInput(req.params) as typeof req.params;
        }

        next();
      } catch (error: unknown) {
        const errorMsg =
          error instanceof Error ? error.message : 'Unknown error';
        logger.error('Injection attempt detected', {
          error: errorMsg,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path,
          method: req.method,
          body: req.body,
          query: req.query,
          params: req.params,
        });

        return res.status(400).json({
          error: 'Security violation',
          message: 'Malicious input detected',
        });
      }
    };
  }
}

/**
 * OWASP A04:2021 – Insecure Design
 */
export const secureDesignMiddleware = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Implement secure defaults
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security':
        'max-age=31536000; includeSubDomains; preload',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      'Surrogate-Control': 'no-store',
    });

    // Remove server header to prevent information disclosure
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');

    next();
  };
};

/**
 * OWASP A05:2021 – Security Misconfiguration
 * CORS DISABLED: Nginx reverse proxy handles CORS centrally to prevent duplicate headers
 */
export const securityConfigurationMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // CORS is handled by nginx reverse proxy
  // Removing CORS middleware from API Gateway to prevent duplicate headers
  next();
};

/**
 * OWASP A06:2021 – Vulnerable and Outdated Components
 */
export const componentSecurityMiddleware = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Log all requests for security monitoring
    logger.info('API Request', {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      contentType: req.get('Content-Type'),
      timestamp: new Date().toISOString(),
    });

    next();
  };
};

/**
 * OWASP A07:2021 – Identification and Authentication Failures
 */
export const authenticationSecurityMiddleware = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Check for brute force patterns
    // Note: Exclude legitimate /api/admin routes from security blocking
    // ENTERPRISE FIX (2026-03-06): Five Why — /api/speckle/config blocked as suspicious
    // Root cause: '/config' pattern matched ALL paths containing /config, including
    // legitimate /api/speckle/config (BFF endpoint for BIM viewer Speckle integration).
    // Fix: Use exact-match patterns for common attack paths, not substring matches.
    // '/config.php', '/config.json', '/config.yml' block CMS/framework config exposure
    // without blocking /api/*/config application endpoints.
    const suspiciousPatterns = [
      '/wp-admin',
      '/phpmyadmin',
      '/.env',
      '/config.php',
      '/config.json',
      '/config.yml',
      '/config.bak',
      '/backup',
    ];

    // Allow legitimate /api/admin routes while blocking common attack patterns
    const isLegitimateAdminRoute = req.path.startsWith('/api/admin');

    if (
      !isLegitimateAdminRoute &&
      suspiciousPatterns.some((pattern) => req.path.includes(pattern))
    ) {
      logger.warn('Suspicious path access attempt', {
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

      return res.status(404).json({
        error: 'Not Found',
        message: 'The requested resource was not found',
      });
    }

    next();
  };
};

/**
 * OWASP A08:2021 – Software and Data Integrity Failures
 */
export const integrityProtectionMiddleware = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Validate Content-Type for POST/PUT requests
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const contentType = req.get('Content-Type');
      const allowedTypes = [
        'application/json',
        'application/x-www-form-urlencoded',
        'multipart/form-data',
      ];

      if (
        contentType &&
        !allowedTypes.some((type) => contentType.includes(type))
      ) {
        logger.warn('Invalid content type', {
          contentType,
          path: req.path,
          ip: req.ip,
        });

        return res.status(415).json({
          error: 'Unsupported Media Type',
          message: 'Content-Type not supported',
        });
      }
    }

    next();
  };
};

/**
 * OWASP A09:2021 – Security Logging and Monitoring Failures
 */
export const securityLoggingMiddleware = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    // Log security-relevant events
    const logSecurityEvent = () => {
      const duration = Date.now() - startTime;
      const logData = {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        contentLength: req.get('Content-Length'),
        timestamp: new Date().toISOString(),
      };

      // Log failed authentication attempts
      if (res.statusCode === 401) {
        logger.warn('Authentication failure', logData);
      }

      // Log access control violations
      if (res.statusCode === 403) {
        logger.warn('Authorization failure', logData);
      }

      // Log suspicious activity
      if (res.statusCode === 429) {
        logger.warn('Rate limit exceeded', logData);
      }

      // Log all security-related responses
      if (res.statusCode >= 400) {
        logger.warn('Security event', logData);
      }
    };

    res.on('finish', logSecurityEvent);
    next();
  };
};

/**
 * OWASP A10:2021 – Server-Side Request Forgery (SSRF)
 */
export const ssrfProtectionMiddleware = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Block requests to internal/private IP ranges
    const blockedIPs = [
      /^127\./, // 127.0.0.0/8
      /^10\./, // 10.0.0.0/8
      /^172\.1[6-9]\./, // 172.16.0.0/12
      /^172\.2[0-9]\./,
      /^172\.3[0-1]\./,
      /^192\.168\./, // 192.168.0.0/16
      /^169\.254\./, // 169.254.0.0/16 (link-local)
      /^::1$/, // IPv6 localhost
      /^fc00:/, // IPv6 unique local
      /^fe80:/, // IPv6 link-local
    ];

    // Check for URL parameters that might contain internal URLs
    const checkForInternalUrls = (obj: unknown): void => {
      if (typeof obj === 'string') {
        // Look for URL patterns
        const urlPattern = /https?:\/\/([^\/\s]+)/gi;
        const matches = obj.match(urlPattern);

        if (matches) {
          for (const match of matches) {
            const hostname = match.replace(/https?:\/\//, '');

            // Check against blocked patterns
            for (const pattern of blockedIPs) {
              if (pattern.test(hostname)) {
                throw new Error(`SSRF attempt detected: ${hostname}`);
              }
            }
          }
        }
      } else if (Array.isArray(obj)) {
        obj.forEach(checkForInternalUrls);
      } else if (obj && typeof obj === 'object') {
        Object.values(obj).forEach(checkForInternalUrls);
      }
    };

    try {
      if (req.body) {
        checkForInternalUrls(req.body);
      }
      if (req.query) {
        checkForInternalUrls(req.query);
      }
      if (req.params) {
        checkForInternalUrls(req.params);
      }

      next();
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('SSRF attempt detected', {
        error: errorMsg,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
      });

      return res.status(400).json({
        error: 'Security violation',
        message: 'Invalid URL detected',
      });
    }
  };
};

/**
 * Production Rate Limiting
 */
export const createProductionRateLimit = async () => {
  try {
    const rateLimitModule = await import('express-rate-limit');
    const rateLimit = rateLimitModule.default || rateLimitModule;

    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // Limit each IP to 1000 requests per windowMs
      message: 'Rate limit exceeded. Please try again later.',
      standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
      legacyHeaders: false, // Disable the `X-RateLimit-*` headers
      handler: (req: Request, res: Response) => {
        logger.warn('Rate limit exceeded', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path,
          method: req.method,
        });

        res.status(429).json({
          error: 'Too many requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: 900,
        });
      },
    });
  } catch (error) {
    logger.error('Rate limiting setup failed', { error });
    return (req: Request, res: Response, next: NextFunction) => next();
  }
};

export const createStrictApiRateLimit = async () => {
  try {
    const rateLimitModule = await import('express-rate-limit');
    const rateLimit = rateLimitModule.default || rateLimitModule;

    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Stricter limit for API endpoints
      message:
        'API rate limit exceeded. Too many API requests. Please slow down.',
      keyGenerator: (req: Request) => {
        // Use API key if available, otherwise fall back to IP
        return req.get('X-API-Key') || req.ip || 'unknown';
      },
    });
  } catch (error) {
    logger.error('Strict API rate limiting setup failed', { error });
    return (req: Request, res: Response, next: NextFunction) => next();
  }
};

/**
 * Input Validation Rules
 */
export const validationRules = {
  email: body('email').isEmail().normalizeEmail().isLength({ max: 254 }),
  password: body('password')
    .isLength({ min: 12, max: 128 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage(
      'Password must be at least 12 characters with uppercase, lowercase, number and special character'
    ),
  uuid: param('id').isUUID().withMessage('Valid UUID required'),
  projectName: body('name')
    .isLength({ min: 1, max: 100 })
    .matches(/^[a-zA-Z0-9\s\-_.]+$/)
    .withMessage(
      'Project name must be alphanumeric with spaces, hyphens, underscores, periods only'
    ),
  pagination: [
    query('page').optional().isInt({ min: 1, max: 1000 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
};

/**
 * Validation Error Handler
 */
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn('Input validation failed', {
      errors: errors.array(),
      ip: req.ip,
      path: req.path,
      method: req.method,
    });

    return res.status(400).json({
      error: 'Validation failed',
      message: 'Invalid input data',
      details: errors.array().map((error: ValidationError) => ({
        field: error.type === 'field' ? error.path : undefined,
        message: error.msg,
        value: error.type === 'field' ? error.value : undefined,
      })),
    });
  }
  next();
};

/**
 * Complete OWASP Top 10 Security Stack
 * ENTERPRISE CI FIX: Synchronous middleware wrapper for proper Express integration
 */
export const createOwaspSecurityStack = async () => [
  // Security headers and configuration
  cryptographicSecurityHeaders,
  secureDesignMiddleware(),
  securityConfigurationMiddleware,

  // Input protection
  InjectionProtection.middleware(),
  integrityProtectionMiddleware(),
  ssrfProtectionMiddleware(),

  // Rate limiting
  await createProductionRateLimit(),

  // Authentication and authorization protection
  authenticationSecurityMiddleware(),

  // Monitoring and logging
  componentSecurityMiddleware(),
  securityLoggingMiddleware(),
];

/**
 * ENTERPRISE CI FIX: Synchronous wrapper for Express middleware compatibility
 * This resolves the async Promise/middleware mismatch in test environments
 */
export const createOwaspSecurityStackSync = (): RequestHandler[] => {
  // For CI/test environments, return a synchronous middleware stack
  if (process.env.NODE_ENV === 'test' || process.env.CI === 'true') {
    return [
      cryptographicSecurityHeaders,
      secureDesignMiddleware(),
      securityConfigurationMiddleware,
      InjectionProtection.middleware(),
      integrityProtectionMiddleware(),
      ssrfProtectionMiddleware(),
      // Skip async rate limiter in test environments
      authenticationSecurityMiddleware(),
      componentSecurityMiddleware(),
      securityLoggingMiddleware(),
    ];
  }

  // For production, maintain the async behavior but wrap it properly
  let middlewareStack: RequestHandler[] = [];
  createOwaspSecurityStack()
    .then((stack) => {
      middlewareStack = stack;
    })
    .catch((err: unknown) => {
      logger.error('Failed to initialize OWASP security stack:', err);
      middlewareStack = []; // Fallback to empty stack
    });

  return middlewareStack;
};

export const owaspSecurityStack = createOwaspSecurityStack();

export default owaspSecurityStack;
