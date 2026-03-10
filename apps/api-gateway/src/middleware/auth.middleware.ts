/**
 * OAUTH IMPLEMENTATION - CRITICAL SECURITY REQUIREMENT
 *
 * Authentication middleware implementing OAuth2 with Google provider
 * as specified in the problem statement. This MUST be completed before
 * any staging deployment.
 *
 * Features:
 * - OAuth2 providers (Google, GitHub, expandable)
 * - Session management with Redis
 * - Protected/Public route patterns
 * - Token expiration and refresh handling
 */

import { Request, Response, NextFunction, type RequestHandler } from 'express';
import Redis from 'ioredis';
import session, {
  SessionOptions,
  Session as ExpressSession,
} from 'express-session';
import RedisStore from 'connect-redis';
import { PrismaClient } from '@prisma/client';
import { createRedisClient } from '../config/redis.config.js';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

// ENTERPRISE: Import centralized User type - no local interface declarations
import type { User } from '@ectropy/shared/types';

// Session extensions using centralized User type
interface SessionWithUser extends ExpressSession {
  user?: User;
}

interface RequestWithSession extends Request {
  session: SessionWithUser;
}

interface RedisStoreConfig {
  client: Redis;
  prefix: string;
}

declare module 'express-session' {
  interface SessionData {
    user?: User;
  }
}

// Import OAuth types and providers from the existing implementation
import {
  EnterpriseOAuthProvider,
  OAuthConfig,
  OAUTH_PROVIDERS,
} from '../../../../libs/shared/oauth/src/oauth-provider.js';

export class AuthenticationMiddleware {
  private oauthProviders: Map<string, EnterpriseOAuthProvider> = new Map();
  private redis: Redis;
  private sessionStore: InstanceType<typeof RedisStore>;
  private prisma: PrismaClient;

  // OAuth2 providers as specified in requirements
  public providers = {
    google: 'GoogleOAuth2Strategy',
    github: 'GitHubOAuth2Strategy',
    // microsoft: 'AzureADStrategy'  // Add after first provider works
  };

  // Protected route patterns as specified
  public protectedRoutes = ['/api/*', '/admin/*', '/dashboard/*', '/monitor/*'];

  // Public routes (minimal) as specified
  public publicRoutes = [
    '/health', // Keep public for monitoring
    '/api/health', // API health endpoint (CRITICAL FIX)
    '/api/auth/login', // OAuth initiation
    '/api/auth/google', // Google OAuth initiation (CRITICAL FIX)
    '/api/auth/github', // GitHub OAuth initiation (CRITICAL FIX)
    '/api/auth/callback', // OAuth callback
    '/api/auth/google/callback',
    '/api/auth/github/callback',
    '/api/auth/health', // OAuth service health check
  ];

  constructor() {
    // Initialize Prisma for database persistence
    this.prisma = new PrismaClient();

    // CRITICAL FIX: Initialize Redis for session storage using factory
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error(
        'REDIS_URL environment variable is required for session storage'
      );
    }

    this.redis = createRedisClient(redisUrl, {
      db: 1, // Use DB 1 for sessions (separate from main and cache)
      keyPrefix: 'sess:',
    });

    this.sessionStore = new RedisStore({
      client: this.redis,
      prefix: 'ectropy:session:',
    });

    // Initialize OAuth providers
    this.initializeProviders();
  }

  /**
   * Initialize OAuth2 providers starting with Google as specified
   */
  private initializeProviders(): void {
    // Step 1: Basic Google OAuth (TODAY) - as specified in requirements
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      const googleConfig: OAuthConfig = {
        ...OAUTH_PROVIDERS.GOOGLE,
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri: `${process.env.API_BASE_URL || 'http://localhost:4000'}/api/auth/google/callback`,
        scope: ['openid', 'profile', 'email'] as string[],
      };

      this.oauthProviders.set(
        'google',
        new EnterpriseOAuthProvider(googleConfig)
      );
    }

    // GitHub provider (expandable)
    if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
      const githubConfig: OAuthConfig = {
        provider: 'custom',
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        redirectUri: `${process.env.API_BASE_URL || 'http://localhost:4000'}/api/auth/github/callback`,
        scope: ['user:email'],
        authorizationEndpoint: 'https://github.com/login/oauth/authorize',
        tokenEndpoint: 'https://github.com/login/oauth/access_token',
        userInfoEndpoint: 'https://api.github.com/user',
      };

      this.oauthProviders.set(
        'github',
        new EnterpriseOAuthProvider(githubConfig)
      );
    }
  }

  /**
   * Session middleware configuration
   *
   * SECURITY: Configures secure session handling for HTTPS deployment
   * - Trust proxy headers from load balancer (X-Forwarded-Proto)
   * - Enable secure flag on cookies in staging/production
   * - Configure sameSite for CSRF protection while allowing OAuth
   * - Set domain for cookie sharing across subdomains
   */
  public getSessionMiddleware(): RequestHandler {
    // Environment detection
    // CRITICAL FIX: Detect staging based on hostname, not NODE_ENV
    // Staging deployment uses NODE_ENV=production for optimization,
    // so we must check the actual hostname to differentiate environments
    const hostname = process.env.API_BASE_URL || '';
    const isStaging = hostname.includes('staging');
    const isProduction = process.env.NODE_ENV === 'production' && !isStaging;
    const isSecureEnvironment = isProduction || isStaging;

    // ENTERPRISE SECURITY (2025-12-19): SESSION_SECRET enforcement
    // No fallback allowed - validation happens at startup in validateConfig()
    // If we reach this point, SESSION_SECRET is guaranteed to be valid
    const sessionSecret = process.env.SESSION_SECRET;
    if (!sessionSecret) {
      throw new Error(
        'CRITICAL: SESSION_SECRET not set - application should not have started'
      );
    }

    return session({
      store: this.sessionStore,
      secret: sessionSecret,
      resave: false, // Don't save session if unmodified
      saveUninitialized: false, // Don't create session until something stored
      proxy: true, // CRITICAL: Trust load balancer proxy for X-Forwarded-Proto
      name: 'oauth_session',
      cookie: {
        // SECURITY: Enable secure flag in staging and production
        // Ensures cookies only transmitted over HTTPS, preventing interception
        // Must be false in development (no SSL) but true when behind load balancer
        secure: isSecureEnvironment,

        // SECURITY: HttpOnly prevents JavaScript access, mitigating XSS attacks
        httpOnly: true,

        // SECURITY: SameSite protects against CSRF attacks
        // 'lax' allows OAuth callbacks to work while providing protection
        // 'strict' would break OAuth flows
        sameSite: 'lax',

        // Session expires after 24 hours of inactivity
        maxAge: 24 * 60 * 60 * 1000,

        // SECURITY: Domain setting for cookie scope
        // For staging: use undefined to let browser auto-detect (staging.ectropy.ai)
        // For production: use '.ectropy.ai' for subdomain sharing
        // Leading dot can cause issues in some browsers, so only use in production
        // Development uses undefined (localhost doesn't support domain attribute)
        domain: isProduction ? '.ectropy.ai' : undefined,
      },
    });
  }

  /**
   * OAuth initiation route handler
   */
  public initiateAuth(provider: string) {
    return (req: Request, res: Response, next: NextFunction) => {
      const oauthProvider = this.oauthProviders.get(provider);

      if (!oauthProvider) {
        return res.status(400).json({
          error: 'Unsupported OAuth provider',
          supportedProviders: Array.from(this.oauthProviders.keys()),
        });
      }

      try {
        oauthProvider.initiateAuth(req, res, {
          redirectUrl: req.query.redirect_uri as string,
        });
      } catch (error) {
        logger.error(`OAuth initiation error for ${provider}:`, error);
        res.status(500).json({ error: 'OAuth initiation failed' });
      }
    };
  }

  /**
   * OAuth callback handler
   */
  public handleCallback(provider: string) {
    return async (req: Request, res: Response, next: NextFunction) => {
      const oauthProvider = this.oauthProviders.get(provider);

      if (!oauthProvider) {
        return res.status(400).json({
          error: 'Unsupported OAuth provider',
        });
      }

      try {
        await oauthProvider.handleCallback(req, res, next);
      } catch (error) {
        logger.error(`OAuth callback error for ${provider}:`, error);
        res.status(500).json({ error: 'OAuth authentication failed' });
      }
    };
  }

  /**
   * Check if route is protected
   */
  private isProtectedRoute(path: string): boolean {
    // Check if path matches any public route first
    for (const publicRoute of this.publicRoutes) {
      const pattern = publicRoute.replace('*', '.*');
      if (new RegExp(`^${pattern}$`).test(path)) {
        return false;
      }
    }

    // Check if path matches any protected route pattern
    for (const protectedRoute of this.protectedRoutes) {
      const pattern = protectedRoute.replace('*', '.*');
      if (new RegExp(`^${pattern}$`).test(path)) {
        return true;
      }
    }

    // Default to protected for security
    return true;
  }

  /**
   * Authentication middleware for protecting routes
   */
  public authenticate(requiredRoles?: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
      // Allow public routes
      if (!this.isProtectedRoute(req.path)) {
        return next();
      }

      // Check for session authentication
      const reqWithSession = req as RequestWithSession;
      const session = reqWithSession.session;
      if (!session?.user) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'Please sign in with OAuth provider',
          loginUrl: '/auth/login',
        });
      }

      // Check token expiration
      const user = session.user;
      if (user.expiresAt && new Date() > new Date(user.expiresAt)) {
        // Clear expired session
        session.destroy(() => {
          // Session destroyed
        });
        return res.status(401).json({
          error: 'Session expired',
          message: 'Please sign in again',
          loginUrl: '/auth/login',
        });
      }

      // Check required roles
      if (requiredRoles && requiredRoles.length > 0) {
        const userRole = user.role;
        const hasRequiredRole = userRole && requiredRoles.includes(userRole);

        if (!hasRequiredRole) {
          return res.status(403).json({
            error: 'Insufficient permissions',
            required: requiredRoles,
            current: userRole,
          });
        }
      }

      // Set user on request for downstream middleware
      req.user = user;
      next();
    };
  }

  /**
   * Logout handler
   */
  public logout() {
    return (req: Request, res: Response) => {
      const reqWithSession = req as RequestWithSession;
      const session = reqWithSession.session;

      if (session) {
        session.destroy((err: Error | null) => {
          if (err) {
            logger.error('Session destruction error:', err);
            return res.status(500).json({ error: 'Logout failed' });
          }

          res.clearCookie('oauth_session');
          res.json({
            success: true,
            message: 'Logged out successfully',
          });
        });
      } else {
        res.json({
          success: true,
          message: 'No active session found',
        });
      }
    };
  }

  /**
   * Get current user info
   *
   * CRITICAL FIX: Check Express session for user data stored during OAuth callback
   * This ensures the frontend can verify authentication state after OAuth completes
   */
  public getCurrentUser() {
    return (req: Request, res: Response) => {
      const reqWithSession = req as RequestWithSession;
      const session = reqWithSession.session;

      // ENHANCED DIAGNOSTIC LOGGING for production debugging
      // SECURITY: Do not log sensitive cookie data - only log presence
      const diagnosticInfo = {
        hasSession: !!session,
        sessionId: session?.id || 'none',
        hasUser: !!session?.user,
        userKeys: session?.user ? Object.keys(session.user) : [],
        hasCookies: !!req.cookies,
        requestPath: req.path,
        requestMethod: req.method,
        timestamp: new Date().toISOString(),
      };

      logger.info('🔍 [AUTH] getCurrentUser diagnostic', diagnosticInfo);

      // Check if user exists in Express session (stored during OAuth callback)
      if (!session?.user) {
        logger.warn('❌ [AUTH] No user in session, returning 401', {
          sessionId: session?.id,
          path: req.path,
        });
        return res.status(401).json({
          error: 'Not authenticated',
          message: 'No active session found. Please sign in.',
          debug: {
            hasSession: !!session,
            hasUser: false,
            sessionId: session?.id || 'none',
          },
        });
      }

      const user = session.user;
      logger.info('✅ [AUTH] User found in session', {
        userId: user.id,
        email: user.email,
        provider: user.provider,
        hasExpiresAt: !!user.expiresAt,
      });

      // Check if session/token is expired
      if (user.expiresAt && new Date() > new Date(user.expiresAt)) {
        logger.warn('⏰ [AUTH] Session expired, destroying session', {
          userId: user.id,
          expiresAt: user.expiresAt,
        });
        // Clear expired session
        session.destroy((err: Error | null) => {
          if (err) {
            logger.error('Failed to destroy expired session', { error: err });
          }
        });

        return res.status(401).json({
          error: 'Session expired',
          message: 'Your session has expired. Please sign in again.',
        });
      }

      logger.info('✅ [AUTH] Returning user data successfully', {
        userId: user.id,
      });
      // Return sanitized user data
      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organization: user.organization,
          provider: user.provider,
        },
        session: {
          expiresAt: user.expiresAt,
        },
      });
    };
  }
}
