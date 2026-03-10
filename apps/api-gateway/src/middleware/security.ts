import helmet from 'helmet';

export const securityMiddleware = helmet({
  strictTransportSecurity: {
    maxAge: 31536000,
    includeSubDomains: true,
  },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  xContentTypeOptions: true,
  frameguard: { action: 'deny' },
  xssFilter: true,
});

/**
 * Enterprise Security Middleware for Ectropy Platform
 * Implements rate limiting, security headers, and threat protection
 */

import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { createHash, createHmac } from 'crypto';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

export interface SecurityConfig {
  rateLimitWindowMs?: number;
  rateLimitMaxRequests?: number;
  enableHelmet?: boolean;
  enableCSRF?: boolean;
  enableCORS?: boolean;
  trustedProxies?: number;
  secretKey?: string;
}

export class SecurityMiddleware {
  private config: Required<SecurityConfig>;
  private suspiciousIPs: Map<string, { count: number; lastAttempt: number }>;
  private blockedIPs: Set<string>;

  constructor(config: SecurityConfig = {}) {
    this.config = {
      rateLimitWindowMs: config.rateLimitWindowMs || 15 * 60 * 1000, // 15 minutes
      rateLimitMaxRequests: config.rateLimitMaxRequests || 100,
      enableHelmet: config.enableHelmet !== false,
      enableCSRF: config.enableCSRF !== false,
      enableCORS: config.enableCORS !== false,
      trustedProxies: config.trustedProxies || 1,
      secretKey:
        config.secretKey ||
        process.env.SECURITY_SECRET_KEY ||
        this.generateSecretKey(),
    };

    this.suspiciousIPs = new Map();
    this.blockedIPs = new Set();

    // Clean up old entries every hour
    setInterval(() => this.cleanupOldEntries(), 60 * 60 * 1000);
  }

  /**
   * Get all security middleware
   */
  public getMiddleware() {
    const middleware: any[] = [];

    // Helmet security headers
    if (this.config.enableHelmet) {
      middleware.push(this.getHelmetConfig());
    }

    // Rate limiting
    middleware.push(this.getRateLimitConfig());

    // Custom security checks
    middleware.push(this.customSecurityCheck.bind(this));

    // Request validation
    middleware.push(this.requestValidation.bind(this));

    // Security monitoring
    middleware.push(this.securityMonitoring.bind(this));

    return middleware;
  }

  /**
   * Helmet configuration for construction platform
   */
  private getHelmetConfig() {
    return helmet({
      // Content Security Policy for construction applications
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'", // Required for some BIM viewers
            'https://cdn.speckle.systems', // Speckle BIM integration
            'https://unpkg.com', // Three.js and other BIM libraries
          ],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://fonts.googleapis.com',
          ],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: [
            "'self'",
            'data:',
            'blob:', // Required for BIM model textures
            'https:', // Construction images and drawings
          ],
          connectSrc: [
            "'self'",
            'https://api.speckle.systems',
            'wss:', // WebSocket connections for real-time collaboration
            'https:', // API endpoints
          ],
          frameSrc: [
            "'self'",
            'https://app.speckle.systems', // Speckle BIM viewer
          ],
          workerSrc: [
            "'self'",
            'blob:', // Required for BIM processing workers
          ],
          objectSrc: ["'none'"],
          upgradeInsecureRequests:
            process.env.NODE_ENV === 'production' ? [] : null,
        },
      },

      // HSTS for production
      hsts:
        process.env.NODE_ENV === 'production'
          ? {
              maxAge: 31536000, // 1 year
              includeSubDomains: true,
              preload: true,
            }
          : false,

      // X-Frame-Options
      frameguard: { action: 'sameorigin' },

      // Hide X-Powered-By header
      hidePoweredBy: true,

      // X-Content-Type-Options
      noSniff: true,

      // Referrer Policy
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    });
  }

  /**
   * Rate limiting configuration
   */
  private getRateLimitConfig() {
    return rateLimit({
      windowMs: this.config.rateLimitWindowMs,

      // Custom key generator (considers user authentication)
      keyGenerator: (req: Request) => {
        const ip = this.getClientIP(req);
        const user = (req as any).user?.id;
        return user ? `user:${user}:${ip}` : `ip:${ip}`;
      },

      // Dynamic limits based on endpoint sensitivity
      max: (req: Request) => {
        const path = req.path;
        const user = (req as any).user;

        // Higher limits for authenticated construction professionals
        if (
          user &&
          ['architect', 'engineer', 'contractor', 'owner'].includes(user.role)
        ) {
          if (path.startsWith('/api/v1/projects/')) return 200; // Project operations
          if (path.startsWith('/api/v1/elements/')) return 300; // BIM operations
          return 150; // Default authenticated
        }

        // Stricter limits for sensitive endpoints
        if (path.startsWith('/api/v1/auth/')) return 10; // Authentication
        if (path.startsWith('/api/v1/admin/')) return 20; // Admin operations
        if (path.startsWith('/api/v1/files/upload')) return 5; // File uploads

        return this.config.rateLimitMaxRequests; // Default
      },

      // Custom message for construction context
      message:
        'Rate limit exceeded. Construction platform access temporarily restricted.',

      // Headers
      standardHeaders: true,
      legacyHeaders: false,

      // Handler for limit exceeded
      handler: (req: Request, res: Response) => {
        const ip = this.getClientIP(req);
        this.recordSuspiciousActivity(ip, 'rate_limit_exceeded');

        logger.warn(`🚨 Rate limit exceeded for IP: ${ip} on ${req.path}`);

        res.status(429).json({
          error: 'Rate limit exceeded',
          message: 'Too many requests. Please slow down.',
          retryAfter: Math.ceil(this.config.rateLimitWindowMs / 1000),
          type: 'RATE_LIMIT_EXCEEDED',
          timestamp: new Date().toISOString(),
        });
      },
    });
  }

  /**
   * Custom security checks
   */
  private customSecurityCheck(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    const ip = this.getClientIP(req);

    // Check if IP is blocked
    if (this.blockedIPs.has(ip)) {
      logger.warn(`🚨 Blocked IP attempted access: ${ip}`);
      res.status(403).json({
        error: 'Access denied',
        message: 'Your IP address has been blocked due to suspicious activity.',
        type: 'IP_BLOCKED',
      });
      return;
    }

    // Check for suspicious patterns in construction context
    const path = req.path.toLowerCase();
    const userAgent = req.get('User-Agent') || '';

    // Detect potential attacks on construction data
    const suspiciousPatterns = [
      /\b(union|select|insert|update|delete|drop|create|alter)\b/i, // SQL injection
      /\b(script|javascript|vbscript|onload|onerror)\b/i, // XSS
      /\.\.(\/|\\)/g, // Path traversal
      /\b(admin|root|administrator|sa)\b/i, // Privileged account probing
    ];

    const queryString = req.url;
    const suspicious = suspiciousPatterns.some(
      (pattern) =>
        pattern.test(queryString) ||
        pattern.test(JSON.stringify(req.body || {}))
    );

    if (suspicious) {
      this.recordSuspiciousActivity(ip, 'suspicious_pattern', {
        path: req.path,
        method: req.method,
        userAgent,
        body: req.body,
      });

      logger.warn(
        `🚨 Suspicious activity detected from ${ip}: ${req.method} ${req.path}`
      );
    }

    // Validate construction-specific headers
    if (
      req.path.startsWith('/api/v1/bim/') ||
      req.path.startsWith('/api/v1/elements/')
    ) {
      const projectId = req.headers['x-project-id'];
      if (!projectId || typeof projectId !== 'string' || projectId.length < 5) {
        res.status(400).json({
          error: 'Missing or invalid project context',
          message: 'BIM operations require valid project identification.',
          type: 'INVALID_PROJECT_CONTEXT',
        });
        return;
      }
    }

    next();
  }

  /**
   * Request validation middleware
   */
  private requestValidation(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    // Validate content length
    const contentLength = parseInt(req.get('Content-Length') || '0');
    const maxSize = req.path.startsWith('/api/v1/files/')
      ? 100 * 1024 * 1024
      : 10 * 1024 * 1024; // 100MB for files, 10MB for others

    if (contentLength > maxSize) {
      res.status(413).json({
        error: 'Request too large',
        message: `Request size ${contentLength} exceeds maximum ${maxSize} bytes`,
        type: 'REQUEST_TOO_LARGE',
      });
      return;
    }

    // Validate required headers for API endpoints
    if (req.path.startsWith('/api/v1/') && req.method !== 'OPTIONS') {
      const contentType = req.get('Content-Type');

      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        if (
          !contentType ||
          (!contentType.includes('application/json') &&
            !contentType.includes('multipart/form-data'))
        ) {
          res.status(400).json({
            error: 'Invalid content type',
            message:
              'API endpoints require application/json or multipart/form-data content type',
            type: 'INVALID_CONTENT_TYPE',
          });
          return;
        }
      }
    }

    // Add security headers to response
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'X-XSS-Protection': '1; mode=block',
      'X-Ectropy-Security': 'enabled',
      'Content-Security-Policy': 
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; frame-ancestors 'none'; object-src 'none';",
      'Strict-Transport-Security':
        process.env.NODE_ENV === 'production'
          ? 'max-age=31536000; includeSubDomains'
          : undefined,
    });

    next();
  }

  /**
   * Security monitoring and logging
   */
  private securityMonitoring(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    const startTime = Date.now();
    const ip = this.getClientIP(req);
    const userAgent = req.get('User-Agent') || 'unknown';

    // Log security-relevant requests
    if (this.isSecurityRelevant(req)) {
      logger.info(
        `🔒 Security monitoring: ${ip} ${req.method} ${req.path} - ${userAgent}`
      );
    }

    // Monitor response for security indicators
    const originalSend = res.send;
    res.send = function (data) {
      const responseTime = Date.now() - startTime;

      // Log slow requests (potential DoS)
      if (responseTime > 5000) {
        logger.warn(
          `⚠️ Slow response detected: ${responseTime}ms for ${req.method} ${req.path} from ${ip}`
        );
      }

      // Log error responses
      if (res.statusCode >= 400) {
        logger.warn(
          `⚠️ Error response: ${res.statusCode} for ${req.method} ${req.path} from ${ip}`
        );
      }

      return originalSend.call(this, data);
    };

    next();
  }

  /**
   * Get client IP address considering proxies
   */
  private getClientIP(req: Request): string {
    const forwarded = req.get('X-Forwarded-For');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }

    return (
      req.get('X-Real-IP') ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      '127.0.0.1'
    );
  }

  /**
   * Record suspicious activity
   */
  private recordSuspiciousActivity(
    ip: string,
    type: string,
    details?: any
  ): void {
    const now = Date.now();
    const existing = this.suspiciousIPs.get(ip);

    if (existing) {
      existing.count++;
      existing.lastAttempt = now;

      // Block IP after 10 suspicious activities
      if (existing.count >= 10) {
        this.blockedIPs.add(ip);
        logger.error(`🚨 IP blocked due to suspicious activity: ${ip}`);
      }
    } else {
      this.suspiciousIPs.set(ip, { count: 1, lastAttempt: now });
    }

    logger.warn(
      `🚨 Suspicious activity recorded: ${type} from ${ip}`,
      details || ''
    );
  }

  /**
   * Check if request is security-relevant
   */
  private isSecurityRelevant(req: Request): boolean {
    const path = req.path.toLowerCase();
    return (
      path.includes('auth') ||
      path.includes('admin') ||
      path.includes('upload') ||
      path.includes('password') ||
      req.method === 'DELETE'
    );
  }

  /**
   * Clean up old suspicious IP entries
   */
  private cleanupOldEntries(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [ip, data] of this.suspiciousIPs.entries()) {
      if (now - data.lastAttempt > maxAge) {
        this.suspiciousIPs.delete(ip);
      }
    }

    logger.info(
      `🧹 Cleaned up old suspicious IP entries. Active: ${this.suspiciousIPs.size}, Blocked: ${this.blockedIPs.size}`
    );
  }

  /**
   * Generate a secret key if none provided
   */
  private generateSecretKey(): string {
    return createHash('sha256')
      .update(`ectropy-platform-${Date.now()}-${Math.random()}`)
      .digest('hex');
  }

  /**
   * Get security status
   */
  public getSecurityStatus() {
    return {
      suspiciousIPs: this.suspiciousIPs.size,
      blockedIPs: this.blockedIPs.size,
      config: {
        rateLimitWindow: this.config.rateLimitWindowMs / 1000 / 60, // minutes
        rateLimitMax: this.config.rateLimitMaxRequests,
        helmetEnabled: this.config.enableHelmet,
      },
    };
  }

  /**
   * Unblock IP address (admin function)
   */
  public unblockIP(ip: string): boolean {
    const wasBlocked = this.blockedIPs.has(ip);
    this.blockedIPs.delete(ip);
    this.suspiciousIPs.delete(ip);

    if (wasBlocked) {
      logger.info(`✅ IP unblocked: ${ip}`);
    }

    return wasBlocked;
  }

  /**
   * Enhanced Content Security Policy middleware for XSS prevention
   */
  public static cspMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      res.setHeader('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https:; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "connect-src 'self' wss: https:; " +
        "frame-ancestors 'none'; " +
        "object-src 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self'; " +
        "upgrade-insecure-requests"
      );
      next();
    };
  }
}
