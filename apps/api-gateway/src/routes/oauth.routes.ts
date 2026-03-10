/**
 * OAuth Routes - Passport.js based authentication
 *
 * Phase: 5a - Demo Readiness & BIM Viewer Integration
 * Deliverable: p5a-d5 - OAuth Integration
 * Issue: #1996
 *
 * Clean, simple routes using industry-standard Passport.js
 * Replaces 100+ lines of custom OAuth logic with battle-tested library
 *
 * Endpoints:
 * - GET  /auth/google           - Initiate Google OAuth flow
 * - GET  /auth/google/callback  - OAuth callback from Google
 * - POST /auth/google/token     - Programmatic auth with access token (E2E/testing)
 * - GET  /auth/me               - Get current user info
 * - POST /auth/logout           - Logout and destroy session
 * - GET  /auth/health           - Service health check
 */

import express, { Router, Request, Response, NextFunction } from 'express';
import passport from '../auth/passport.config.js';
import { config, getAuthorizedUsers } from '../config/index.js';
import { logger } from '../../../../libs/shared/utils/src/logger.js';
import { EnterpriseAuditLogger } from '@ectropy/shared/audit';
import { getPrismaClient } from '../database/prisma.js';

// Use shared Prisma Client singleton to prevent connection pool exhaustion
const prisma = getPrismaClient();

export class OAuthRoutes {
  private auditLogger: EnterpriseAuditLogger;
  private router: Router;

  constructor() {
    this.auditLogger = EnterpriseAuditLogger.getInstance();
    this.router = express.Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    /**
     * Google OAuth Initiation
     * Redirects user to Google login page
     */
    this.router.get(
      '/google',
      (req: Request, res: Response, next: NextFunction) => {
        logger.info('🚀 [OAUTH] Initiating OAuth flow', {
          sessionID: req.sessionID,
          hasSession: !!req.session,
          hasCookie: !!req.headers.cookie,
        });

        // CRITICAL FIX: Override res.redirect to ensure session is saved before redirect
        // passport-oauth2 stores OAuth state in session, then immediately calls res.redirect()
        // With async Redis session store, we must intercept and save before redirecting
        // This is the ROOT CAUSE of "Unable to verify authorization request state"
        const originalRedirect = res.redirect.bind(res);

        res.redirect = function (
          url: string | number,
          status?: number | string
        ): any {
          // Handle Express redirect overloads: redirect(url) or redirect(status, url)
          const redirectUrl =
            typeof url === 'number' ? String(status) : String(url);
          const statusCode =
            typeof url === 'number'
              ? url
              : typeof status === 'number'
                ? status
                : 302;

          logger.info(
            '💾 [OAUTH] Intercepting redirect, saving session first',
            {
              sessionID: req.sessionID,
              redirectUrl: redirectUrl.substring(0, 100), // Log first 100 chars
              sessionKeys: Object.keys(req.session || {}),
            }
          );

          // Save session to Redis before allowing the redirect
          req.session.save((saveErr) => {
            if (saveErr) {
              logger.error('❌ [OAUTH] Session save failed', {
                error: saveErr.message || saveErr,
                sessionID: req.sessionID,
              });
              return originalRedirect(
                `${config.FRONTEND_URL}?oauth_error=session_save_failed`
              );
            }

            logger.info(
              '✅ [OAUTH] Session saved, proceeding with redirect to Google',
              {
                sessionID: req.sessionID,
                redirectUrl: redirectUrl.substring(0, 100),
              }
            );

            // Session saved, now perform the actual redirect
            if (typeof status === 'number') {
              return originalRedirect(statusCode as number, redirectUrl);
            } else {
              return originalRedirect(redirectUrl);
            }
          });
        } as any;

        // Now call Passport authenticate - it will use our wrapped redirect
        passport.authenticate('google', {
          scope: ['openid', 'profile', 'email'],
        })(req, res, next);
      }
    );

    /**
     * Google OAuth Callback
     * Handles redirect from Google after authentication
     */
    this.router.get(
      '/google/callback',
      (req: Request, res: Response, next: NextFunction) => {
        logger.info('🔍 [OAUTH] Callback received', {
          hasCode: !!req.query.code,
          hasState: !!req.query.state,
          hasError: !!req.query.error,
          query: req.query,
          sessionID: req.sessionID,
          hasSession: !!req.session,
          hasCookie: !!req.headers.cookie,
          cookieHeader: req.headers.cookie,
          sessionKeys: Object.keys(req.session || {}),
          sessionData: JSON.stringify(req.session),
        });

        // Log full session state for debugging
        const oauthStateKey = 'oauth2:accounts.google.com';
        const storedOAuthData = (req.session as any)?.[oauthStateKey];
        const storedStateValue = storedOAuthData?.state;
        const queryState = req.query.state as string;

        // ENTERPRISE: Log state validation without exposing sensitive data
        logger.debug('[OAUTH] Session state validation', {
          sessionID: req.sessionID,
          hasOAuthState: !!storedOAuthData,
          statesMatch: storedStateValue === queryState,
        });

        passport.authenticate('google', (err: any, user: any, info: any) => {
          if (err) {
            const errorMsg = err.message || String(err);
            logger.error('❌ [OAUTH] Authentication error', {
              error: errorMsg,
              stack: err.stack,
              info,
              oauthErrorCode: err.oauthError?.statusCode,
              oauthErrorData: err.oauthError?.data,
            });

            // Classify error for user-facing redirect
            let errorCode = 'server_error';
            let reason = '';
            if (errorMsg.includes('pending approval')) {
              errorCode = 'not_authorized';
              reason = 'Account pending approval';
            } else if (errorMsg.includes('Not registered')) {
              errorCode = 'not_registered';
              reason = 'Account not registered';
            } else if (
              errorMsg.includes('Failed to obtain access token') ||
              errorMsg.includes('Failed to fetch')
            ) {
              errorCode = 'token_exchange_failed';
              reason = 'Google token exchange failed';
            } else if (
              errorMsg.includes('email') ||
              errorMsg.includes('Email')
            ) {
              errorCode = 'no_email';
              reason = 'Email not provided';
            } else {
              reason = errorMsg.substring(0, 100);
            }

            const redirectUrl = reason
              ? `${config.FRONTEND_URL}?oauth_error=${errorCode}&reason=${encodeURIComponent(reason)}`
              : `${config.FRONTEND_URL}?oauth_error=${errorCode}`;
            return res.redirect(redirectUrl);
          }

          if (!user) {
            // Audit log: Failed OAuth authentication
            this.auditLogger.logAuthenticationEvent({
              sessionId: req.sessionID,
              sourceIp: req.ip || req.connection.remoteAddress || 'unknown',
              userAgent: req.headers['user-agent'],
              action: 'login',
              outcome: 'failure',
              metadata: {
                provider: 'google',
                reason: info?.message || 'unknown',
              },
            });

            logger.warn('⚠️ [OAUTH] Authentication failed - no user', {
              info,
              message: info?.message,
            });
            return res.redirect(
              `${config.FRONTEND_URL}?oauth_error=auth_failed&reason=${encodeURIComponent(info?.message || 'unknown')}`
            );
          }

          // ENTERPRISE SECURITY: Session regeneration prevents session fixation attacks
          // Regenerate session ID after successful authentication to ensure attacker
          // cannot pre-set a session ID and hijack the authenticated session
          req.session.regenerate((regenErr) => {
            if (regenErr) {
              logger.error('❌ [OAUTH] Session regeneration error', {
                error: regenErr.message || regenErr,
                userId: user?.id,
              });
              return res.redirect(
                `${config.FRONTEND_URL}?oauth_error=session_regen_failed`
              );
            }

            // Login user after session regeneration
            req.logIn(user, (loginErr) => {
              if (loginErr) {
                logger.error('❌ [OAUTH] Login error', {
                  error: loginErr.message || loginErr,
                  userId: user?.id,
                });
                return res.redirect(
                  `${config.FRONTEND_URL}?oauth_error=login_failed`
                );
              }

              // CRITICAL: Save session to Redis BEFORE redirect
              // With async Redis store, session.passport.user must be persisted
              // before the browser receives the redirect response
              req.session.save((saveErr) => {
                if (saveErr) {
                  logger.error('❌ [OAUTH] Session save error after login', {
                    error: saveErr.message || saveErr,
                    userId: user?.id,
                  });
                  return res.redirect(
                    `${config.FRONTEND_URL}?oauth_error=session_save_failed`
                  );
                }

                logger.info('✅ [OAUTH] Authentication successful', {
                  userId: user?.id,
                  email: user?.email,
                  sessionID: req.sessionID,
                  sessionRegenerated: true,
                });

                // Audit log: Successful OAuth authentication
                this.auditLogger.logAuthenticationEvent({
                  userId: user?.id,
                  sessionId: req.sessionID,
                  sourceIp: req.ip || req.connection.remoteAddress || 'unknown',
                  userAgent: req.headers['user-agent'],
                  action: 'login',
                  outcome: 'success',
                  metadata: { provider: 'google', email: user?.email },
                });

                res.redirect(`${config.FRONTEND_URL}/dashboard`);
              });
            });
          });
        })(req, res, next);
      }
    );

    /**
     * Programmatic OAuth Token Authentication
     * ENTERPRISE PATTERN: Token-based authentication for E2E testing and programmatic access
     */
    this.router.post('/google/token', async (req: Request, res: Response) => {
      try {
        logger.info('🔐 [OAUTH TOKEN] E2E OAuth endpoint called', {
          hasAccessToken: !!req.body.access_token,
          hasProfile: !!req.body.profile,
          email: req.body.profile?.email,
        });

        const { access_token, profile } = req.body;

        if (!access_token || !profile?.email) {
          logger.warn('⚠️ [OAUTH TOKEN] Missing required fields', {
            hasAccessToken: !!access_token,
            hasProfile: !!profile,
            hasEmail: !!profile?.email,
          });
          return res.status(400).json({
            success: false,
            error: 'Bad Request',
            message: 'Missing access_token or profile.email',
          });
        }

        // Verify token with Google
        logger.info('🔍 [OAUTH TOKEN] Verifying token with Google');
        const userInfoResponse = await fetch(
          'https://www.googleapis.com/oauth2/v2/userinfo',
          { headers: { Authorization: `Bearer ${access_token}` } }
        );

        if (!userInfoResponse.ok) {
          logger.warn('⚠️ [OAUTH TOKEN] Google token verification failed', {
            status: userInfoResponse.status,
            statusText: userInfoResponse.statusText,
          });
          return res.status(401).json({
            success: false,
            error: 'Unauthorized',
            message: 'Invalid access token',
          });
        }

        const googleProfile = await userInfoResponse.json();
        logger.info('✅ [OAUTH TOKEN] Token verified with Google', {
          email: googleProfile.email,
        });

        if (googleProfile.email !== profile.email) {
          logger.warn('⚠️ [OAUTH TOKEN] Email mismatch', {
            googleEmail: googleProfile.email,
            profileEmail: profile.email,
          });
          return res.status(401).json({
            success: false,
            error: 'Unauthorized',
            message: 'Email mismatch',
          });
        }

        // Authorization check - User Management M1: Database-driven authorization
        // MIGRATION PATH: Checks both database AND env var during transition period
        // Once M1-M6 complete, env var check can be removed (blue-green deployment)
        const email = googleProfile.email;

        // STEP 1: Check database authorization (NEW - User Management M1)
        const existingUser = await prisma.user.findUnique({
          where: { email },
          select: { is_authorized: true, is_platform_admin: true },
        });

        const isDatabaseAuthorized =
          existingUser?.is_authorized || existingUser?.is_platform_admin;

        // STEP 2: Fallback to env var check (DEPRECATED - to be removed in M6)
        const authorizedUsers = getAuthorizedUsers();
        const isEnvVarAuthorized =
          authorizedUsers.length === 0 ||
          authorizedUsers.includes(email.toLowerCase());

        // STEP 3: Combined authorization (allows migration without breaking existing users)
        const isAuthorized = isDatabaseAuthorized || isEnvVarAuthorized;

        logger.info(
          '🔐 [OAUTH TOKEN] Checking authorization (M1 hybrid mode)',
          {
            email,
            isDatabaseAuthorized,
            isEnvVarAuthorized,
            isAuthorized,
            migrationNote:
              'Hybrid mode: Checks DB first, falls back to env var for transition',
          }
        );

        if (!isAuthorized) {
          logger.warn('⚠️ [OAUTH TOKEN] User not authorized', {
            email,
            reason: 'Not in database AND not in AUTHORIZED_USERS env var',
          });
          return res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: `User ${email} is not authorized. Contact your administrator for access.`,
          });
        }

        // Find or create user
        logger.info('🔍 [OAUTH TOKEN] Looking up user in database', { email });
        let user = await prisma.user.findUnique({ where: { email } });

        if (user) {
          logger.info('✅ [OAUTH TOKEN] User found, updating last_login', {
            userId: user.id,
            email: user.email,
          });
          user = await prisma.user.update({
            where: { id: user.id },
            data: {
              last_login: new Date(),
              full_name: profile.name || 'Unknown',
            },
          });
        } else {
          // ROOT CAUSE #75 FIX: MULTI-TENANT USER CREATION
          // All non-admin users MUST have a tenant_id per users_tenant_consistency_check constraint
          // Pattern proven in passport.config.ts:180-229
          logger.info('🏢 [OAUTH TOKEN] Fetching default tenant for new user', {
            email,
          });
          let defaultTenant = await prisma.tenant.findUnique({
            where: { slug: 'default-tenant' },
            select: { id: true, slug: true, name: true },
          });

          // Create default tenant if it doesn't exist (defensive programming)
          if (!defaultTenant) {
            logger.warn(
              '⚠️ [OAUTH TOKEN] Default tenant not found, creating it'
            );
            defaultTenant = await prisma.tenant.create({
              data: {
                slug: 'default-tenant',
                name: 'Default Organization',
                status: 'ACTIVE',
                subscription_tier: 'ENTERPRISE',
                primary_email: 'admin@ectropy.ai',
                max_projects: 9999,
                max_users: 9999,
                max_storage_gb: 9999,
                data_region: 'us-west-2',
              },
              select: { id: true, slug: true, name: true },
            });
            logger.info('✅ [OAUTH TOKEN] Default tenant created', {
              tenantId: defaultTenant.id,
              slug: defaultTenant.slug,
            });
          }

          logger.info('📍 [OAUTH TOKEN] Assigning user to default tenant', {
            email,
            tenantId: defaultTenant.id,
            tenantSlug: defaultTenant.slug,
          });

          logger.info(
            '➕ [OAUTH TOKEN] Creating new user with tenant assignment',
            {
              email,
              tenantId: defaultTenant.id,
              isAuthorized,
            }
          );

          user = await prisma.user.create({
            data: {
              email,
              full_name: profile.name || 'Unknown',
              role: 'contractor',
              roles: ['contractor'],
              provider: 'google',
              provider_id: googleProfile.id || email,
              last_login: new Date(),
              // User Management M1: Auto-authorize if passed authorization check
              is_authorized: isAuthorized,
              authorized_at: isAuthorized ? new Date() : null,
              // ROOT CAUSE #75 FIX: Assign tenant_id to satisfy users_tenant_consistency_check constraint
              tenant_id: defaultTenant.id,
              is_platform_admin: false, // Explicitly set to false (not a platform admin)
            },
          });

          logger.info(
            '✅ [OAUTH TOKEN] User created successfully with tenant',
            {
              userId: user.id,
              email: user.email,
              tenantId: user.tenant_id,
              isAuthorized,
            }
          );
        }

        // Establish session
        const sessionUser = {
          id: user.id,
          email: user.email,
          full_name: user.full_name || 'Unknown',
          provider: user.provider || 'google',
          role: user.role,
          roles: user.roles || [user.role],
          company: user.company || undefined,
        };

        logger.info('🔄 [OAUTH TOKEN] Regenerating session', {
          userId: user.id,
          email: user.email,
        });

        req.session.regenerate((regenErr) => {
          if (regenErr) {
            logger.error('❌ [OAUTH TOKEN] Session regeneration failed', {
              error: regenErr.message || regenErr,
              userId: user.id,
            });
            return res.status(500).json({
              success: false,
              message: 'Session regeneration failed',
            });
          }

          logger.info('🔐 [OAUTH TOKEN] Logging in user');
          req.logIn(sessionUser as any, (loginErr) => {
            if (loginErr) {
              logger.error('❌ [OAUTH TOKEN] Login failed', {
                error: loginErr.message || loginErr,
                userId: user.id,
              });
              return res.status(500).json({
                success: false,
                message: 'Login failed',
              });
            }

            logger.info('💾 [OAUTH TOKEN] Saving session to Redis');
            req.session.save((saveErr) => {
              if (saveErr) {
                logger.error('❌ [OAUTH TOKEN] Session save failed', {
                  error: saveErr.message || saveErr,
                  userId: user.id,
                });
                return res.status(500).json({
                  success: false,
                  message: 'Session save failed',
                });
              }

              logger.info(
                '✅ [OAUTH TOKEN] Authentication successful - returning user',
                {
                  userId: sessionUser.id,
                  email: sessionUser.email,
                  sessionId: req.sessionID,
                }
              );

              this.auditLogger.logAuthenticationEvent({
                userId: sessionUser.id,
                sessionId: req.sessionID,
                sourceIp: req.ip || 'unknown',
                userAgent: req.headers['user-agent'],
                action: 'login',
                outcome: 'success',
                metadata: {
                  provider: 'google',
                  method: 'token',
                  email: sessionUser.email,
                },
              });

              res.json({
                success: true,
                user: sessionUser,
                sessionId: req.sessionID,
              });
            });
          });
        });
      } catch (error) {
        // CRITICAL: Log all error details for debugging
        logger.error('❌ [OAUTH TOKEN] E2E OAuth endpoint failed', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          errorType: error?.constructor?.name,
          hasBody: !!req.body,
          bodyKeys: req.body ? Object.keys(req.body) : [],
        });

        res.status(500).json({
          success: false,
          error: 'Internal Server Error',
          message: 'Authentication failed',
        });
      }
    });

    /**
     * Get Current User
     * Returns authenticated user info or 401 if not authenticated
     */
    this.router.get('/me', (req: Request, res: Response) => {
      if (!req.isAuthenticated()) {
        logger.warn('🚫 [AUTH] Unauthenticated /me request');
        return res.status(401).json({
          error: 'Not authenticated',
          message: 'Please sign in to access this resource',
        });
      }

      logger.info('✅ [AUTH] Returning user info', {
        userId: (req.user as any)?.id,
      });

      // Return user data from session, including active role if set
      const user = req.user as any;
      const activeRole = (req.session as any)?.activeRole || user?.role;

      res.json({
        user: {
          ...user,
          activeRole,
        },
      });
    });

    // PHASE 1: Role Switcher Removal (2026-02-09)
    // POST /switch-role endpoint DELETED
    // Rationale: Role switching removed - users have project-specific roles via project_roles table
    // See: apps/mcp-server/data/evidence/2026-02/FIVE_WHY_ROLE_SWITCHER_REMOVAL_2026-02-09.json

    /**
     * Logout
     * ENTERPRISE PATTERN: Full session destruction with proper cleanup
     * 1. Call passport logout to remove user from session
     * 2. Destroy session in Redis store
     * 3. Clear session cookie from browser
     * 4. Audit log the logout event
     */
    this.router.post(
      '/logout',
      (req: Request, res: Response, next: NextFunction) => {
        const userId = (req.user as any)?.id;
        const sessionId = req.sessionID;

        // Even if not authenticated, ensure clean slate
        if (!req.isAuthenticated()) {
          logger.info('🚪 [AUTH] Logout request with no active session');
          res.clearCookie('oauth_session');
          return res.json({
            success: true,
            message: 'No active session found',
          });
        }

        // Step 1: Passport logout (removes user from session)
        req.logout((logoutErr) => {
          if (logoutErr) {
            logger.error('❌ [AUTH] Passport logout error', {
              error: logoutErr,
              userId,
            });
            return next(logoutErr);
          }

          // Step 2: Destroy session in Redis store
          req.session.destroy((destroyErr) => {
            if (destroyErr) {
              logger.error('❌ [AUTH] Session destroy error', {
                error: destroyErr,
                userId,
              });
              // Still clear cookie even if destroy fails
              res.clearCookie('oauth_session');
              return res.status(500).json({
                success: false,
                message: 'Error destroying session',
              });
            }

            // Step 3: Clear session cookie from browser
            res.clearCookie('oauth_session');

            // Step 4: Audit log
            this.auditLogger.logAuthenticationEvent({
              userId,
              sessionId,
              sourceIp: req.ip || req.connection.remoteAddress || 'unknown',
              userAgent: req.headers['user-agent'],
              action: 'logout',
              outcome: 'success',
            });

            logger.info('✅ [AUTH] User logged out and session destroyed', {
              userId,
              sessionId,
            });

            res.json({
              success: true,
              message: 'Logged out successfully',
            });
          });
        });
      }
    );

    /**
     * Health Check
     * Returns service status and configured providers
     */
    this.router.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        service: 'oauth-auth',
        implementation: 'passport.js',
        providers: {
          google: !!config.GOOGLE_CLIENT_ID,
        },
        timestamp: new Date().toISOString(),
      });
    });

    /**
     * OAuth Health Check - ENTERPRISE PATTERN
     * ROOT CAUSE #216 FIX: Comprehensive health check for OAuth callback infrastructure
     *
     * Validates all dependencies required for successful OAuth authentication:
     * - Google OAuth 2.0 API connectivity (token validation)
     * - Database connection pool availability (user create/update)
     * - Redis session store connectivity (session creation)
     * - Prisma Client operational (ORM queries)
     *
     * USAGE:
     * - Called by E2E test workflow before running tests
     * - Prevents test execution if OAuth infrastructure is down
     * - Returns detailed status for each component with latency metrics
     *
     * WHY THIS MATTERS:
     * - Current health checks validate frontend routes but NOT backend OAuth
     * - Gap: Frontend can be healthy while OAuth callback is down
     * - Impact: E2E tests fail with 502 errors, blocking validation
     * - Solution: Validate full OAuth stack before test execution
     */
    this.router.get('/health/oauth', async (req: Request, res: Response) => {
      const startTime = Date.now();
      const checks: Record<string, any> = {};

      let overallStatus: 'ok' | 'degraded' | 'down' = 'ok';

      // Check 1: Google OAuth API connectivity
      // ROOT CAUSE #216.1 FIX: Token endpoint doesn't support HEAD (returns 404)
      // Solution: Use userinfo endpoint which supports GET
      // Expected: HTTP 401 (unauthorized) = API is up and responding
      // Expected: HTTP 200 = API is up (if we had valid token)
      // Fail: Network error or timeout = API is down
      try {
        const tokenValidationStart = Date.now();
        const testTokenResponse = await fetch(
          'https://www.googleapis.com/oauth2/v3/userinfo',
          {
            method: 'GET',
            // No auth header - we expect 401, which proves API is reachable
          }
        ).catch(() => null);

        const tokenValidationLatency = Date.now() - tokenValidationStart;

        // Accept both 401 (unauthorized, expected) and 200 (ok) as "up"
        // Any response from Google OAuth API means it's reachable
        if (
          !testTokenResponse ||
          (testTokenResponse.status !== 401 && !testTokenResponse.ok)
        ) {
          checks.googleOAuth = {
            status: 'down',
            latency: tokenValidationLatency,
            error: 'Unable to reach Google OAuth API',
            httpStatus: testTokenResponse?.status || 'no response',
          };
          overallStatus = 'down';
          logger.error('❌ [OAUTH HEALTH] Google OAuth API unreachable');
        } else {
          checks.googleOAuth = {
            status: 'ok',
            latency: tokenValidationLatency,
            httpStatus: testTokenResponse.status, // 401 or 200
          };
          logger.debug('✅ [OAUTH HEALTH] Google OAuth API reachable');
        }
      } catch (error) {
        checks.googleOAuth = {
          status: 'down',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
        overallStatus = 'down';
        logger.error('❌ [OAUTH HEALTH] Google OAuth API check failed', {
          error,
        });
      }

      // Check 2: Database connectivity via Prisma
      try {
        const dbStart = Date.now();
        // Simple query to verify database is responsive
        await prisma.$queryRaw`SELECT 1`;
        const dbLatency = Date.now() - dbStart;

        checks.database = {
          status: 'ok',
          latency: dbLatency,
        };
        logger.debug('✅ [OAUTH HEALTH] Database connection OK');
      } catch (error) {
        checks.database = {
          status: 'down',
          error: error instanceof Error ? error.message : 'Database error',
        };
        overallStatus = 'down';
        logger.error('❌ [OAUTH HEALTH] Database check failed', { error });
      }

      // Check 3: Prisma Client operational
      try {
        const prismaStart = Date.now();
        // Verify Prisma can execute queries
        const userCount = await prisma.user.count();
        const prismaLatency = Date.now() - prismaStart;

        checks.prisma = {
          status: 'ok',
          latency: prismaLatency,
          metadata: { userCount },
        };
        logger.debug('✅ [OAUTH HEALTH] Prisma Client operational');
      } catch (error) {
        checks.prisma = {
          status: 'down',
          error: error instanceof Error ? error.message : 'Prisma error',
        };
        overallStatus = 'down';
        logger.error('❌ [OAUTH HEALTH] Prisma check failed', { error });
      }

      // Check 4: OAuth configuration valid
      const configValid =
        !!config.GOOGLE_CLIENT_ID &&
        !!config.GOOGLE_CLIENT_SECRET &&
        !!config.FRONTEND_URL;

      if (!configValid) {
        checks.configuration = {
          status: 'down',
          error: 'Missing required OAuth configuration',
          missing: {
            clientId: !config.GOOGLE_CLIENT_ID,
            clientSecret: !config.GOOGLE_CLIENT_SECRET,
            frontendUrl: !config.FRONTEND_URL,
          },
        };
        overallStatus = 'down';
        logger.error('❌ [OAUTH HEALTH] OAuth configuration invalid');
      } else {
        checks.configuration = {
          status: 'ok',
        };
        logger.debug('✅ [OAUTH HEALTH] OAuth configuration valid');
      }

      const totalLatency = Date.now() - startTime;

      const response = {
        status: overallStatus,
        service: 'oauth-callback',
        timestamp: new Date().toISOString(),
        totalLatency,
        checks,
      };

      logger.info('🔍 [OAUTH HEALTH] Health check completed', {
        status: overallStatus,
        totalLatency,
      });

      // Return appropriate HTTP status based on overall health
      const httpStatus = overallStatus === 'ok' ? 200 : 503;

      res.status(httpStatus).json(response);
    });
  }

  public getRouter(): Router {
    return this.router;
  }
}
