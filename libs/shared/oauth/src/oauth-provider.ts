/**
 * Enterprise OAuth2/OIDC Integration for SSO
 * Supports multiple identity providers for enterprise stakeholder access
 */

import { Request, Response, NextFunction } from 'express';
// import { logger } from '@ectropy/shared/audit';
import { logger } from '@ectropy/shared/utils';
import { randomBytes, createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

export interface OAuthConfig {
  provider: 'azure' | 'google' | 'okta' | 'auth0' | 'custom';
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string[];
  issuer?: string; // For OIDC
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
  jwksUri?: string; // For JWT verification
  logoutEndpoint?: string;
}

export interface OAuthUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  organization?: string;
  department?: string;
  provider: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  metadata?: Record<string, any>;
}

export interface OAuthState {
  state: string;
  codeVerifier?: string; // For PKCE
  redirectUrl?: string;
  timestamp: number;
}

export class EnterpriseOAuthProvider {
  private pendingStates = new Map<string, OAuthState>();
  private userSessions = new Map<string, OAuthUser>();
  private prisma: PrismaClient;
  private authorizedEmails: Set<string>;

  constructor(private config: OAuthConfig) {
    // Validate configuration
    this.validateConfig();
    
    // Initialize Prisma client for user persistence
    this.prisma = new PrismaClient();
    
    // Load authorized emails from environment
    this.authorizedEmails = this.loadAuthorizedEmails();
  }
  
  /**
   * Load authorized emails from environment variable
   * Supports comma-separated list in AUTHORIZED_USERS or AUTHORIZED_EMAILS
   */
  private loadAuthorizedEmails(): Set<string> {
    // Support both AUTHORIZED_USERS (new standard) and AUTHORIZED_EMAILS (legacy)
    const emailsEnv = process.env.AUTHORIZED_USERS || process.env.AUTHORIZED_EMAILS;
    
    if (!emailsEnv) {
      // No whitelist configured, allow all authenticated users
      return new Set();
    }
    
    const emails = emailsEnv
      .split(',')
      .map(email => email.trim().toLowerCase())
      .filter(email => email.length > 0);
    
    const source = process.env.AUTHORIZED_USERS ? 'AUTHORIZED_USERS' : 'AUTHORIZED_EMAILS';
    logger.info('Authorized emails loaded', {
      count: emails.length,
      source: `${source} environment variable`
    });
    
    return new Set(emails);
  }
  
  /**
   * Check if email is authorized to access the platform
   */
  private isEmailAuthorized(email: string): boolean {
    // If no whitelist is configured, allow all authenticated users
    if (this.authorizedEmails.size === 0) {
      return true;
    }
    
    return this.authorizedEmails.has(email.toLowerCase());
  }

  /**
   * Initiate OAuth2 authorization flow
   */
  initiateAuth(req: Request, res: Response, options?: {
    redirectUrl?: string;
    forceReauth?: boolean;
  }): void {
    const state = this.generateState();
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);

    // Store state in session (Redis-backed) for persistence across instances
    // CRITICAL FIX: Don't use in-memory Map - won't work with load balancers or restarts
    const session = (req as any).session;
    if (!session) {
      throw new Error('Session not available - ensure session middleware is configured');
    }

    session.oauthState = {
      state,
      codeVerifier,
      redirectUrl: options?.redirectUrl,
      timestamp: Date.now(),
    };

    // Also keep in memory for backwards compatibility and fast lookup
    this.pendingStates.set(state, {
      state,
      codeVerifier,
      redirectUrl: options?.redirectUrl,
      timestamp: Date.now(),
    });

    // CRITICAL FIX: Save session before redirecting
    // Session save is async - must complete before redirect or state will be lost
    session.save((err: any) => {
      if (err) {
        logger.error('Failed to save OAuth session', {
          error: err.message,
          state,
          provider: this.config.provider
        });
        // Still continue - fallback to memory state
      }

      // Build authorization URL
      const authUrl = new URL(this.config.authorizationEndpoint);
      authUrl.searchParams.set('client_id', this.config.clientId);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('redirect_uri', this.config.redirectUri);
      authUrl.searchParams.set('scope', this.config.scope.join(' '));
      authUrl.searchParams.set('state', state);

      if (codeChallenge) {
        authUrl.searchParams.set('code_challenge', codeChallenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');
      }

      if (options?.forceReauth) {
        authUrl.searchParams.set('prompt', 'login');
      }

      // Log the auth initiation
      logger.info('OAuth authentication initiated', {
        sourceIp: req.ip || 'unknown',
        userAgent: req.get('User-Agent'),
        action: 'login',
        outcome: 'attempt',
        metadata: {
          provider: this.config.provider,
          state,
          redirectUrl: options?.redirectUrl,
          forceReauth: options?.forceReauth,
        },
      });

      logger.info('OAuth2 authorization initiated', {
        provider: this.config.provider,
        state,
        clientId: this.config.clientId,
        scope: this.config.scope,
      });

      res.redirect(authUrl.toString());
    });
  }

  /**
   * Handle OAuth2 callback
   */
  async handleCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { code, state, error } = req.query;
      
      logger.info('🔄 [OAUTH] OAuth callback initiated', {
        hasCode: !!code,
        hasState: !!state,
        hasError: !!error,
        provider: this.config.provider,
        sessionId: (req as any).session?.id
      });
      
      // Environment detection - declare once at function scope
      // ENTERPRISE: Cast NODE_ENV as string to allow comparison with 'staging'
      const env = process.env.NODE_ENV as string;
      const isProd = env === 'production';
      const isStage = env === 'staging';
      const isSecure = isProd || isStage;

      if (error) {
        logger.error('❌ [OAUTH] OAuth error from provider', { error });
        throw new Error(`OAuth2 error: ${error}`);
      }

      if (!code || !state) {
        logger.error('❌ [OAUTH] Missing authorization code or state');
        throw new Error('Missing authorization code or state');
      }

      // Verify state - check session first (Redis-backed), then memory fallback
      // CRITICAL FIX: Retrieve state from session for load balancer/restart resilience
      const session = (req as any).session;
      let stateData: OAuthState | undefined;

      if (session?.oauthState && session.oauthState.state === state) {
        stateData = session.oauthState;
        logger.info('✅ [OAUTH] State retrieved from session (Redis)');
      } else {
        // Fallback to memory (for local dev or fast lookup)
        stateData = this.pendingStates.get(state as string);
        if (stateData) {
          logger.info('⚠️ [OAUTH] State retrieved from memory (fallback)');
        }
      }

      if (!stateData) {
        logger.error('❌ [OAUTH] Invalid or expired state', {
          state,
          hasSession: !!session,
          sessionHasState: !!session?.oauthState
        });
        throw new Error('Invalid or expired state');
      }

      // Check state expiration (5 minutes)
      if (Date.now() - stateData.timestamp > 5 * 60 * 1000) {
        this.pendingStates.delete(state as string);
        if (session) {
          delete session.oauthState;
        }
        logger.error('❌ [OAUTH] State expired', {
          state,
          age: Date.now() - stateData.timestamp
        });
        throw new Error('State expired');
      }

      logger.info('✅ [OAUTH] State validated, exchanging code for tokens');
      
      // Exchange code for tokens
      const tokenResponse = await this.exchangeCodeForTokens(
        code as string,
        stateData.codeVerifier
      );

      logger.info('✅ [OAUTH] Tokens received, fetching user info');
      
      // Get user information
      const userInfo = await this.getUserInfo(tokenResponse.access_token);
      
      logger.info('✅ [OAUTH] User info received', {
        email: userInfo.email,
        sub: userInfo.sub || userInfo.id
      });

      // Check if user email is authorized
      if (!this.isEmailAuthorized(userInfo.email)) {
        logger.warn('Unauthorized user attempted login', {
          email: userInfo.email,
          provider: this.config.provider,
          sourceIp: req.ip || 'unknown'
        });
        
        throw new Error('User not authorized for demo access');
      }

      // Create user session
      const user: OAuthUser = {
        id: userInfo.sub || userInfo.id,
        email: userInfo.email,
        name: userInfo.name || `${userInfo.given_name} ${userInfo.family_name}`,
        roles: this.extractRoles(userInfo),
        organization: userInfo.organization || userInfo.company,
        department: userInfo.department,
        provider: this.config.provider,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt: new Date(Date.now() + (tokenResponse.expires_in * 1000)),
        metadata: {
          userInfo,
          tokenType: tokenResponse.token_type,
        },
      };

      // Persist user to database
      try {
        const dbUser = await this.prisma.user.upsert({
          where: {
            provider_provider_id: {
              provider: this.config.provider,
              provider_id: user.id
            }
          },
          update: {
            last_login: new Date(),
            full_name: user.name,
            picture: userInfo.picture || null,
            email: user.email
          },
          create: {
            email: user.email,
            full_name: user.name,
            picture: userInfo.picture || null,
            provider: this.config.provider,
            provider_id: user.id,
            last_login: new Date()
          }
        });

        // CRITICAL FIX: Update user ID to use database ID instead of provider ID
        user.id = dbUser.id;
        
        // CRITICAL FIX: Use database role as the authoritative source
        // The database role field is a StakeholderRole enum (admin, owner, architect, etc.)
        // This overrides any roles from OAuth provider claims
        if (dbUser.role) {
          user.roles = [dbUser.role];
          logger.info('User role synchronized from database', {
            dbUserId: dbUser.id,
            email: dbUser.email,
            role: dbUser.role,
            provider: this.config.provider
          });
        }
        
        user.metadata = {
          ...user.metadata,
          dbUserId: dbUser.id,
          providerId: userInfo.sub || userInfo.id,
          dbRole: dbUser.role
        };

        logger.info('User persisted to database', {
          dbUserId: dbUser.id,
          email: dbUser.email,
          role: dbUser.role,
          provider: this.config.provider
        });
      } catch (dbError) {
        logger.error('Failed to persist user to database', {
          error: dbError instanceof Error ? dbError.message : String(dbError),
          email: user.email,
          provider: this.config.provider
        });
        // Continue with authentication even if DB save fails
      }

      // Store user session in both internal map and Express session
      const sessionId = this.generateSessionId();
      this.userSessions.set(sessionId, user);

      // CRITICAL FIX: Store user in Express session for session persistence
      // This ensures the session is persisted in Redis and survives page refreshes
      if ((req as any).session) {
        logger.info('🔄 [OAUTH] Storing user data in Express session', {
          userId: user.id,
          email: user.email,
          provider: user.provider,
          sessionId: (req as any).session.id
        });
        
        (req as any).session.user = {
          id: user.id,
          email: user.email,
          name: user.name,
          roles: user.roles,
          organization: user.organization,
          provider: user.provider,
          expiresAt: user.expiresAt.toISOString(),
        };
        
        logger.info('✅ [OAUTH] User data assigned to session object', {
          sessionHasUser: !!(req as any).session.user,
          userFields: Object.keys((req as any).session.user || {})
        });
        
        // CRITICAL FIX: Retry logic for session.save() to prevent race condition
        // Redis writes are asynchronous and may not complete before redirect
        await this.saveSessionWithRetry(req, user, 3);
        
        // CRITICAL FIX: Verify session was actually written to Redis with user data
        await this.verifySessionInRedis(req, user);
        
        logger.info('✅ [OAUTH] Session saved and verified in Redis', {
          userId: user.id,
          email: user.email,
          sessionId: (req as any).session.id
        });
        
        // CRITICAL FIX: Add 50ms safety delay to ensure Redis write completes
        // This prevents race condition where redirect happens before Redis flush
        await new Promise(resolve => setTimeout(resolve, 50));
      } else {
        logger.warn('⚠️ [OAUTH] Express session not available, session may not persist');
      }

      // Clean up state from both memory and session
      this.pendingStates.delete(state as string);
      if (session) {
        delete session.oauthState;
      }

      // Log successful authentication
      logger.info('OAuth authentication successful', {
        userId: user.id,
        sessionId,
        sourceIp: req.ip || 'unknown',
        userAgent: req.get('User-Agent'),
        action: 'login',
        outcome: 'success',
        provider: this.config.provider,
        email: user.email,
        organization: user.organization,
        roles: user.roles,
      });

      logger.info('OAuth2 authentication successful', {
        userId: user.id,
        email: user.email,
        provider: this.config.provider,
        organization: user.organization,
        sessionId,
      });

      // CRITICAL FIX: Redirect to frontend dashboard, not backend route
      // The frontend is served on the same domain, so we use a relative path
      const frontendUrl = process.env.FRONTEND_URL || '';
      const redirectPath = stateData.redirectUrl || '/dashboard';
      
      // Handle trailing slashes to prevent double slashes in URL
      const cleanFrontendUrl = frontendUrl.replace(/\/+$/, '');
      const cleanRedirectPath = redirectPath.startsWith('/') ? redirectPath : '/' + redirectPath;
      
      const finalRedirectUrl = (isSecure && cleanFrontendUrl) 
        ? cleanFrontendUrl + cleanRedirectPath 
        : cleanRedirectPath;
      
      logger.info('🔀 [OAUTH] Redirecting user after successful authentication', {
        userId: user.id,
        email: user.email,
        redirectUrl: finalRedirectUrl,
        isSecure,
        frontendUrl: cleanFrontendUrl,
        redirectPath: cleanRedirectPath,
        sessionId: (req as any).session?.id,
        sessionHasUser: !!(req as any).session?.user
      });
      
      // In staging/production, redirect to full URL with domain
      // In development, redirect to relative path
      res.redirect(finalRedirectUrl);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'OAuth2 callback failed';
      
      // Audit log failed authentication
      logger.info('OAuth authentication failed', {
        sourceIp: req.ip || 'unknown',
        userAgent: req.get('User-Agent'),
        action: 'login',
        outcome: 'failure',
        metadata: {
          provider: this.config.provider,
          error: errorMessage,
          state: req.query.state,
        },
      });

      logger.error('OAuth2 callback failed', {
        error: errorMessage,
        provider: this.config.provider,
        query: req.query,
      });

      // CRITICAL FIX: Redirect to frontend with error instead of returning JSON
      // This ensures users see a friendly error page instead of raw JSON
      const frontendUrl = process.env.FRONTEND_URL || '';
      const cleanFrontendUrl = frontendUrl.replace(/\/+$/, '');

      // Build error URL with query parameters
      const errorUrl = `${cleanFrontendUrl || ''}/?error=oauth_failed&message=${encodeURIComponent(errorMessage)}`;

      logger.info('🔀 [OAUTH] Redirecting user after failed authentication', {
        errorMessage,
        redirectUrl: errorUrl,
        provider: this.config.provider
      });

      res.redirect(errorUrl);
    }
  }

  /**
   * Middleware to verify OAuth2 authentication
   */
  verifyAuth(requiredRoles?: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const sessionId = req.cookies?.oauth_session;
      
      if (!sessionId) {
        this.auditUnauthorizedAccess(req, 'no_session');
        res.status(401).json({
          error: 'Authentication required',
          authUrl: `/auth/oauth/${this.config.provider}`,
        });
        return;
      }

      const user = this.userSessions.get(sessionId);
      if (!user) {
        this.auditUnauthorizedAccess(req, 'invalid_session');
        res.status(401).json({
          error: 'Invalid session',
          authUrl: `/auth/oauth/${this.config.provider}`,
        });
        return;
      }

      // Check token expiration
      if (user.expiresAt < new Date()) {
        this.userSessions.delete(sessionId);
        this.auditUnauthorizedAccess(req, 'expired_token', user.id);
        res.status(401).json({
          error: 'Token expired',
          authUrl: `/auth/oauth/${this.config.provider}`,
        });
        return;
      }

      // Check required roles
      if (requiredRoles && !this.hasRequiredRoles(user.roles, requiredRoles)) {
        logger.info('Authorization failed: insufficient permissions', {
          userId: user.id,
          sourceIp: req.ip || 'unknown',
          userAgent: req.get('User-Agent'),
          resource: req.path,
          action: req.method,
          outcome: 'failure',
          requiredPermissions: requiredRoles,
          actualPermissions: user.roles,
        });

        res.status(403).json({
          error: 'Insufficient permissions',
          required: requiredRoles,
          actual: user.roles,
        });
        return;
      }

      // Audit successful authorization
      logger.info('User authorization successful', {
        userId: user.id,
        sessionId,
        sourceIp: req.ip || 'unknown',
        userAgent: req.get('User-Agent'),
        resource: req.path,
        action: req.method,
        outcome: 'success',
        requiredPermissions: requiredRoles,
        actualPermissions: user.roles,
      });

      // Attach user to request
      (req as any).user = user;
      next();
    };
  }

  /**
   * Logout user
   */
  async logout(req: Request, res: Response): Promise<void> {
    const sessionId = req.cookies?.oauth_session;
    const user = sessionId ? this.userSessions.get(sessionId) : undefined;

    if (sessionId) {
      this.userSessions.delete(sessionId);
      res.clearCookie('oauth_session');
    }

    // Audit log logout
    logger.info('User logout successful', {
      userId: user?.id,
      sessionId,
      sourceIp: req.ip || 'unknown',
      userAgent: req.get('User-Agent'),
      action: 'logout',
      outcome: 'success',
      metadata: {
        provider: this.config.provider,
      },
    });

    logger.info('User logged out', {
      userId: user?.id,
      sessionId,
      provider: this.config.provider,
    });

    // Redirect to provider logout if available
    if (this.config.logoutEndpoint && user?.accessToken) {
      const logoutUrl = new URL(this.config.logoutEndpoint);
      logoutUrl.searchParams.set('post_logout_redirect_uri', req.get('origin') || '/');
      logoutUrl.searchParams.set('id_token_hint', user.accessToken);
      res.redirect(logoutUrl.toString());
    } else {
      res.json({ message: 'Logged out successfully' });
    }
  }

  /**
   * Exchange authorization code for tokens
   */
  private async exchangeCodeForTokens(code: string, codeVerifier?: string): Promise<any> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    if (codeVerifier) {
      params.set('code_verifier', codeVerifier);
    }

    const response = await fetch(this.config.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    return response.json();
  }

  /**
   * Get user information from provider
   */
  private async getUserInfo(accessToken: string): Promise<any> {
    const response = await fetch(this.config.userInfoEndpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`User info request failed: ${error}`);
    }

    return response.json();
  }

  /**
   * Extract roles from user info based on provider
   */
  private extractRoles(userInfo: any): string[] {
    // Provider-specific role extraction
    switch (this.config.provider) {
      case 'azure':
        return userInfo.roles || userInfo.groups || [];
      case 'google':
        return userInfo['https://ectropy.construction/roles'] || [];
      case 'okta':
        return userInfo.groups || [];
      default:
        return userInfo.roles || [];
    }
  }

  /**
   * Check if user has required roles
   */
  private hasRequiredRoles(userRoles: string[], requiredRoles: string[]): boolean {
    return requiredRoles.every(role => userRoles.includes(role));
  }

  /**
   * Generate secure state parameter
   */
  private generateState(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Generate PKCE code verifier
   */
  private generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Generate PKCE code challenge
   */
  private generateCodeChallenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Save session to Redis with retry logic
   * Implements retry mechanism to handle race conditions where Redis writes may be delayed
   */
  private async saveSessionWithRetry(req: Request, user: OAuthUser, maxRetries: number): Promise<void> {
    let attempt = 0;
    let lastError: any;
    
    while (attempt < maxRetries) {
      attempt++;
      
      try {
        await new Promise<void>((resolve, reject) => {
          (req as any).session.save((err: any) => {
            if (err) {
              logger.error('Failed to save session to Redis', { 
                error: err,
                attempt,
                maxRetries,
                userId: user.id,
                email: user.email
              });
              reject(err);
            } else {
              logger.info('Session saved to Redis successfully', { 
                userId: user.id,
                email: user.email,
                attempt,
                sessionId: (req as any).session.id
              });
              resolve();
            }
          });
        });
        
        // Success - exit retry loop
        return;
      } catch (err) {
        lastError = err;
        
        if (attempt < maxRetries) {
          // Wait before retry with exponential backoff
          const delayMs = 100 * Math.pow(2, attempt - 1);
          logger.warn('Retrying session save after delay', {
            attempt,
            maxRetries,
            delayMs,
            userId: user.id
          });
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }
    
    // All retries failed
    logger.error('Failed to save session after all retries', {
      maxRetries,
      userId: user.id,
      email: user.email,
      lastError: lastError instanceof Error ? lastError.message : String(lastError)
    });
    throw new Error(`Failed to save session after ${maxRetries} attempts`);
  }

  /**
   * Verify session was written to Redis with user data
   * This prevents the race condition where session exists but contains no user data
   */
  private async verifySessionInRedis(req: Request, user: OAuthUser): Promise<void> {
    const session = (req as any).session;
    
    if (!session || !session.id) {
      logger.warn('Cannot verify session - no session ID available', {
        userId: user.id,
        email: user.email
      });
      return;
    }
    
    // Check if user data is present in session
    if (!session.user || !session.user.id || !session.user.email) {
      logger.error('Session verification failed - user data missing from session', {
        sessionId: session.id,
        hasUser: !!session.user,
        userId: session.user?.id,
        expectedUserId: user.id,
        expectedEmail: user.email
      });
      throw new Error('Session verification failed - user data not properly saved');
    }
    
    // Verify user data matches what we expected to save
    if (session.user.id !== user.id || session.user.email !== user.email) {
      logger.error('Session verification failed - user data mismatch', {
        sessionId: session.id,
        sessionUserId: session.user.id,
        expectedUserId: user.id,
        sessionUserEmail: session.user.email,
        expectedEmail: user.email
      });
      throw new Error('Session verification failed - user data mismatch');
    }
    
    logger.info('Session verification successful - user data confirmed in Redis', {
      sessionId: session.id,
      userId: user.id,
      email: user.email
    });
  }

  /**
   * Audit unauthorized access attempts
   */
  private auditUnauthorizedAccess(req: Request, reason: string, userId?: string): void {
    logger.info('Unauthorized access attempt', {
      userId,
      sourceIp: req.ip || 'unknown',
      userAgent: req.get('User-Agent'),
      action: 'login',
      outcome: 'failure',
      metadata: {
        reason,
        provider: this.config.provider,
        path: req.path,
        method: req.method,
      },
    });
  }

  /**
   * Validate OAuth configuration
   */
  private validateConfig(): void {
    const required = ['clientId', 'clientSecret', 'redirectUri', 'authorizationEndpoint', 'tokenEndpoint', 'userInfoEndpoint'];
    for (const field of required) {
      if (!(field in this.config) || !this.config[field as keyof OAuthConfig]) {
        throw new Error(`OAuth2 configuration missing required field: ${field}`);
      }
    }
  }
}

/**
 * Pre-configured OAuth2 providers for common enterprise identity systems
 */
export const OAUTH_PROVIDERS = {
  AZURE: {
    provider: 'azure' as const,
    authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    userInfoEndpoint: 'https://graph.microsoft.com/v1.0/me',
    scope: ['openid', 'profile', 'email', 'User.Read'],
  },
  GOOGLE: {
    provider: 'google' as const,
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    userInfoEndpoint: 'https://www.googleapis.com/oauth2/v2/userinfo',
    scope: ['openid', 'profile', 'email'],
  },
  OKTA: {
    provider: 'okta' as const,
    scope: ['openid', 'profile', 'email', 'groups'],
  },
} as const;