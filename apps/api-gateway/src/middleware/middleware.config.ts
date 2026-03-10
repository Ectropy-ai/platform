/**
 * Middleware Configuration
 * Centralized middleware setup extracted from enhanced-server.ts
 */

import type { Application, Request, Response, NextFunction } from 'express';
import express from 'express';
// Reference to Node.js types for Buffer
/// <reference types="node" />
import {
  InputValidator,
  securityHeaders,
  createRateLimiter,
  createEnhancedRateLimiter,
  createSizeLimiter,
} from '../../../../libs/shared/security/src/security.middleware.js';
import { ValidationError } from '../../../../libs/shared/errors/src/error-handler.js';
import { logger } from '../../../../libs/shared/utils/src/logger.js';
import type { EnhancedAuthMiddleware } from '../../../../libs/shared/middleware/auth.middleware.js';
import type { EnvironmentConfig } from '../../../../libs/shared/config/src/config.validator.js';
export class MiddlewareConfig {
  private app: Application;
  private config: EnvironmentConfig;
  private authMiddleware: EnhancedAuthMiddleware;
  constructor(
    app: Application,
    config: EnvironmentConfig,
    authMiddleware: EnhancedAuthMiddleware
  ) {
    this.app = app;
    this.config = config;
    this.authMiddleware = authMiddleware;
  }
  /**
   * Setup all application middleware
   */
  setupMiddleware(): void {
    this.setupTrustProxy();
    this.setupHTTPSRedirect();
    this.setupSecurityHeaders();
    this.setupLogging();
    this.setupInputValidation();
    this.setupBodyParsing();
    this.setupRateLimiting();
    this.setupSessionManagement();
    logger.info('Security middleware configured');
  }

  /**
   * Setup trust proxy for accurate IP addresses
   */
  private setupTrustProxy(): void {
    // Always enable for staging/production, or when explicitly enabled via env var
    if (this.config.nodeEnv === 'production' || this.config.nodeEnv === 'staging' || process.env.TRUST_PROXY === 'true') {
      this.app.set('trust proxy', 1);
    }
  }

  /**
   * Enforce HTTPS in production
   */
  private setupHTTPSRedirect(): void {
    if (this.config.nodeEnv === 'production') {
      this.app.use((req: Request, res: Response, next: NextFunction) => {
        const proto = req.headers['x-forwarded-proto'];
        if (req.secure || proto === 'https') {
          return next();
        }
        const hostHeader = req.headers['host'];
        const host = typeof hostHeader === 'string' ? hostHeader : 'localhost';
        res.redirect(301, `https://${host}${req.url}`);
      });
    }
  }

  /**
   * Setup security headers
   */
  private setupSecurityHeaders(): void {
    this.app.use(securityHeaders);
  }

  /**
   * Setup request logging
   */
  private setupLogging(): void {
    this.app.use(logger.requestMiddleware());
  }

  /**
   * Setup input validation and sanitization
   */
  private setupInputValidation(): void {
    this.app.use(InputValidator.middleware());
    this.app.use(createSizeLimiter('10mb'));
  }

  /**
   * Setup body parsing with size limits and validation
   */
  private setupBodyParsing(): void {
    // JSON body parsing with validation
    this.app.use(
      express.json({
        limit: '10mb',
        verify: (req: Request, res: Response, buf: Buffer) => {
          // Validate JSON payload
          try {
            JSON.parse(buf.toString());
          } catch (_error) {
            throw new ValidationError('Invalid JSON payload');
          }
        },
      })
    );
    // URL-encoded body parsing
    this.app.use(
      express.urlencoded({
        extended: true,
        limit: '50mb',
      })
    );
  }

  /**
   * Setup rate limiting for different endpoints
   */
  private setupRateLimiting(): void {
    // Auth endpoints - stricter rate limiting with per-user support
    this.app.use(
      '/api/auth',
      createEnhancedRateLimiter({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 10, // 10 requests per window for IP-based
        message: 'Too many authentication requests',
        keyPrefix: 'auth',
        perUser: true,
        userMax: 5, // 5 requests per user for authenticated requests
      })
    );

    // API endpoints - enhanced rate limiting with per-user support
    this.app.use(
      '/api/v1',
      createEnhancedRateLimiter({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: this.config.security?.rateLimitMax ?? 100, // IP-based limit
        message: 'Too many API requests',
        keyPrefix: 'api',
        perUser: true,
        userMax: this.config.security?.rateLimitMaxPerUser ?? 500, // Per-user limit (higher)
      })
    );

    // Special endpoints with tighter controls
    this.app.use(
      '/api/v1/secrets',
      createEnhancedRateLimiter({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 10, // Very restrictive for secrets endpoints
        message: 'Too many requests to secrets endpoint',
        keyPrefix: 'secrets',
        perUser: true,
        userMax: 20, // Slightly higher for authenticated users
      })
    );

    // Admin endpoints - very strict rate limiting
    this.app.use(
      '/api/v1/admin',
      createEnhancedRateLimiter({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 5, // Very restrictive for admin endpoints
        message: 'Too many requests to admin endpoint',
        keyPrefix: 'admin',
        perUser: true,
        userMax: 10, // Only slightly higher for authenticated admins
      })
    );
  }

  /**
   * Setup session management
   */
  private setupSessionManagement(): void {
    this.app.use(this.authMiddleware.sessionManagement());
  }

  /**
   * Setup CORS if needed
   */
  setupCORS(): void {
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const allowedOrigins =
        this.config.nodeEnv === 'production'
          ? ['https://localhost', 'https://your-domain.com']
          : ['*'];
      const origin = req.headers['origin'];
      const originStr = typeof origin === 'string' ? origin : undefined;
      if (
        allowedOrigins.includes('*') ||
        (originStr && allowedOrigins.includes(originStr))
      ) {
        res.header('Access-Control-Allow-Origin', originStr || '*');
      }
      res.header(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept, Authorization'
      );
      res.header(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, OPTIONS'
      );
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });
  }
}
