/**
 * Passport.js OAuth Configuration
 *
 * Phase: 5a - Demo Readiness & BIM Viewer Integration
 * Deliverable: p5a-d5 - OAuth Integration
 * Issue: #1996
 *
 * Industry-standard OAuth implementation using Passport.js
 * Replaces 420+ lines of custom OAuth code with battle-tested library
 *
 * Benefits:
 * - 23,000+ GitHub stars, used by Fortune 500 companies
 * - RFC 6749 compliant out of the box
 * - Security patches maintained by community
 * - Simple strategy pattern for multiple providers
 * - Comprehensive documentation and ecosystem
 */

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { getPrismaClient } from '../database/prisma.js';
import { config, getAuthorizedUsers } from '../config/index.js';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

// Use shared Prisma Client singleton to prevent connection pool exhaustion
const prisma = getPrismaClient();

/**
 * User interface for session storage
 * Matches Prisma User model schema
 */
interface SessionUser {
  id: string;
  email: string;
  full_name: string;
  provider: string;
  role: string; // Legacy: single role (kept for backward compatibility)
  roles: string[]; // New: array of roles for multi-role support
  is_platform_admin: boolean; // Phase 1: Platform admin flag (@luh.tech domain auto-admin)
  tenant_id?: string; // Multi-tenant: user's active tenant for scoping project/resource operations
  company?: string;
}

/**
 * Serialization: Store minimal user data in session
 * Only store user ID to keep session size small
 */
passport.serializeUser((user: any, done) => {
  logger.info('🔐 [PASSPORT] Serializing user', {
    userId: user.id,
    email: user.email,
  });
  done(null, user.id);
});

/**
 * Deserialization: Retrieve full user data from database
 * Called on every authenticated request
 */
passport.deserializeUser(async (id: string, done) => {
  try {
    logger.info('🔓 [PASSPORT] Deserializing user', { userId: id });

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        full_name: true,
        role: true,
        roles: true,
        is_platform_admin: true,
        tenant_id: true,
        company: true,
        provider: true,
      },
    });

    if (!user) {
      logger.warn('⚠️ [PASSPORT] User not found during deserialization', {
        userId: id,
      });
      return done(null, false);
    }

    const sessionUser: SessionUser = {
      id: user.id,
      email: user.email,
      full_name: user.full_name || 'Unknown',
      provider: user.provider || 'google',
      role: user.role,
      roles: Array.isArray(user.roles)
        ? user.roles
        : [user.role || 'contractor'],
      is_platform_admin: user.is_platform_admin || false,
      tenant_id: user.tenant_id || undefined,
      company: user.company || undefined,
    };

    logger.debug('[PASSPORT] User deserialized', {
      userId: sessionUser.id,
      tenant_id: sessionUser.tenant_id || 'none',
    });

    // Cast to Express.User - session stores minimal data, full profile loaded on demand
    done(null, sessionUser as unknown as Express.User);
  } catch (error) {
    logger.error('❌ [PASSPORT] Deserialization error', {
      userId: id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    done(error, false);
  }
});

/**
 * Google OAuth 2.0 Strategy
 *
 * PHASE 1: @luh.tech Auto-Admin + is_authorized Database-Driven Authorization
 *
 * Authorization Flow:
 * 1. @luh.tech domain → Auto-create/update as platform admin (cross-tenant access)
 * 2. Existing user with is_authorized=true → Allow login
 * 3. AUTHORIZED_USERS env var → Bootstrap access (fallback for initial setup)
 * 4. All others → Reject with clear error message
 *
 * Security Guarantee:
 * - Only Google Workspace admin can create @luh.tech accounts
 * - Google OAuth guarantees email domain ownership
 * - Database-driven authorization enables n8n provisioning from CRM
 */
passport.use(
  new GoogleStrategy(
    {
      clientID: config.GOOGLE_CLIENT_ID,
      clientSecret: config.GOOGLE_CLIENT_SECRET,
      callbackURL: config.OAUTH_CALLBACK_URL,
      scope: ['openid', 'profile', 'email'],
      // Security: Use state parameter to prevent CSRF
      state: true,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        logger.info('🔍 [PASSPORT] OAuth callback received', {
          provider: 'google',
          profileId: profile.id,
          email: profile.emails?.[0]?.value,
        });

        // Extract user data from Google profile
        const email = profile.emails?.[0]?.value;
        const name = profile.displayName || 'Unknown User';

        if (!email) {
          logger.error('❌ [PASSPORT] No email in Google profile', {
            profileId: profile.id,
          });
          return done(new Error('Email not provided by Google'), undefined);
        }

        const emailLower = email.toLowerCase();
        const isLuhTechDomain = emailLower.endsWith(`@${config.ADMIN_DOMAIN}`);

        // Phase 1: Check database for existing user
        let user = await prisma.user.findUnique({
          where: { email: emailLower },
        });

        if (user) {
          // EXISTING USER PATH
          logger.info('✅ [PASSPORT] Existing user found', {
            userId: user.id,
            email: user.email,
            is_authorized: user.is_authorized,
            is_platform_admin: user.is_platform_admin,
          });

          // Verify still authorized (or is @luh.tech domain)
          if (!user.is_authorized && !isLuhTechDomain) {
            logger.warn('🚫 [PASSPORT] User not authorized', {
              email: emailLower,
              is_authorized: user.is_authorized,
            });
            return done(
              new Error(`Account pending approval: ${email}`),
              undefined
            );
          }

          // @luh.tech users always authorized — auto-fix if somehow revoked
          if (
            isLuhTechDomain &&
            (!user.is_authorized || !user.is_platform_admin)
          ) {
            logger.info(
              '🔧 [PASSPORT] Auto-fixing @luh.tech user authorization',
              {
                email: emailLower,
                was_authorized: user.is_authorized,
                was_admin: user.is_platform_admin,
              }
            );
            user = await prisma.user.update({
              where: { id: user.id },
              data: {
                is_authorized: true,
                is_platform_admin: true,
                authorized_at: new Date(),
                role: 'admin',
                roles: ['admin'],
              },
            });
          }

          // Auto-heal: Provision trial tenant for existing authorized users missing tenant_id
          // This handles users created before trial tenant provisioning was added
          if (!user.tenant_id && !isLuhTechDomain) {
            logger.info(
              '🔧 [PASSPORT] Auto-healing missing tenant_id for existing user',
              { email: emailLower, userId: user.id }
            );

            const healSlug = `${emailLower
              .split('@')[0]
              .replace(/[^a-z0-9]/g, '-')}-trial-${Math.random()
              .toString(36)
              .substring(7)}`;

            const healTenant = await prisma.tenant.create({
              data: {
                slug: healSlug,
                name: `${name}'s Organization`,
                status: 'TRIAL',
                subscription_tier: 'FREE',
                primary_email: emailLower,
                max_projects: 3,
                max_users: 5,
                max_storage_gb: 1,
                data_region: 'us-west-2',
              },
              select: { id: true, slug: true },
            });

            user = await prisma.user.update({
              where: { id: user.id },
              data: {
                tenant_id: healTenant.id,
                last_login: new Date(),
                full_name: name,
              },
            });

            logger.info('✅ [PASSPORT] Auto-healed user with trial tenant', {
              userId: user.id,
              tenantId: healTenant.id,
              tenantSlug: healTenant.slug,
            });
          } else {
            // Update last login (tenant_id already set or platform admin)
            user = await prisma.user.update({
              where: { id: user.id },
              data: {
                last_login: new Date(),
                full_name: name,
              },
            });
          }
        } else {
          // NEW USER PATH
          if (isLuhTechDomain) {
            // @luh.tech → auto-create as platform admin (NO tenant_id - cross-tenant access)
            logger.info(
              '🏢 [PASSPORT] Auto-creating @luh.tech platform admin',
              {
                email: emailLower,
              }
            );

            user = await prisma.user.create({
              data: {
                email: emailLower,
                full_name: name,
                provider: 'google',
                provider_id: profile.id,
                is_authorized: true,
                is_platform_admin: true,
                authorized_at: new Date(),
                role: 'admin',
                roles: ['admin'],
                last_login: new Date(),
                // NO tenant_id for platform admins (cross-tenant access)
              },
            });

            logger.info('✅ [PASSPORT] @luh.tech admin created', {
              userId: user.id,
              email: user.email,
            });
          } else {
            // Non-luh.tech new user: check AUTHORIZED_USERS env var (bootstrap fallback)
            const authorizedUsers = getAuthorizedUsers();
            if (authorizedUsers.includes(emailLower)) {
              logger.info(
                '🆕 [PASSPORT] Creating authorized user (bootstrap)',
                {
                  email: emailLower,
                }
              );

              // PHASE 5.1: Auto-create trial tenant for CRM-authorized users
              logger.info('🚀 [PASSPORT] Creating trial tenant for new user', {
                email: emailLower,
              });

              // Generate tenant slug from email (e.g., john@example.com → john-example-trial)
              const tenantSlug = `${emailLower
                .split('@')[0]
                .replace(/[^a-z0-9]/g, '-')}-trial-${Math.random()
                .toString(36)
                .substring(7)}`;

              // Set trial expiration to 30 days from now
              const trialExpiresAt = new Date();
              trialExpiresAt.setDate(trialExpiresAt.getDate() + 30);

              // TODO: Import DatabaseManager from @ectropy/database for multi-DB operations
              // For now, create tenant in current database (will be migrated to platform DB)
              const trialTenant = await prisma.tenant.create({
                data: {
                  slug: tenantSlug,
                  name: `${name}'s Organization`,
                  status: 'TRIAL', // TenantStatus.TRIAL
                  subscription_tier: 'FREE', // SubscriptionTier.FREE (trial tier)
                  primary_email: emailLower,
                  max_projects: 3, // Trial limit: 3 projects
                  max_users: 5, // Trial limit: 5 users
                  max_storage_gb: 1, // Trial limit: 1GB storage
                  data_region: 'us-west-2',
                  // TODO: Add trial_expires_at field to Tenant schema
                  // trial_expires_at: trialExpiresAt,
                },
                select: { id: true, slug: true, name: true },
              });

              logger.info('✅ [PASSPORT] Trial tenant created', {
                tenantId: trialTenant.id,
                tenantSlug: trialTenant.slug,
                expiresAt: trialExpiresAt.toISOString(),
              });

              // TODO Phase 5.1 COMPLETE:
              // 1. Create tenant_registry entry in platform DB
              // 2. Create tenants entry in shared_trials DB with same UUID
              // 3. Set database_type='shared_trials', database_name='ectropy_shared_trials'
              // This requires DatabaseManager.getPlatformDatabase() and getTenantDatabase()

              user = await prisma.user.create({
                data: {
                  email: emailLower,
                  full_name: name,
                  provider: 'google',
                  provider_id: profile.id,
                  is_authorized: true,
                  is_platform_admin: false,
                  authorized_at: new Date(),
                  role: 'contractor',
                  roles: ['contractor'],
                  tenant_id: trialTenant.id,
                  last_login: new Date(),
                },
              });

              logger.info(
                '✅ [PASSPORT] Authorized user created with trial tenant',
                {
                  userId: user.id,
                  email: user.email,
                  tenantId: user.tenant_id,
                  tenantSlug: trialTenant.slug,
                }
              );
            } else {
              // NOT in database, NOT @luh.tech, NOT in AUTHORIZED_USERS → REJECT
              logger.warn('🚫 [PASSPORT] Unauthorized login attempt', {
                email: emailLower,
              });
              return done(
                new Error(
                  `Not registered: ${email}. Please contact support to request access.`
                ),
                undefined
              );
            }
          }
        }

        // Build session user
        const sessionUser: SessionUser = {
          id: user.id,
          email: user.email,
          full_name: user.full_name || 'Unknown',
          provider: user.provider || 'google',
          role: user.role,
          roles: Array.isArray(user.roles)
            ? user.roles
            : [user.role || 'contractor'],
          is_platform_admin: user.is_platform_admin || false,
          tenant_id: user.tenant_id || undefined,
          company: user.company || undefined,
        };

        logger.info('✅ [PASSPORT] Authentication successful', {
          userId: sessionUser.id,
          email: sessionUser.email,
          is_platform_admin: sessionUser.is_platform_admin,
          tenant_id: sessionUser.tenant_id || 'none (platform admin)',
        });

        done(null, sessionUser as unknown as Express.User);
      } catch (error) {
        logger.error('❌ [PASSPORT] OAuth strategy error', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        });
        done(error, undefined);
      }
    }
  )
);

/**
 * Initialize Passport middleware
 * Call this in your Express app setup
 */
export function initializePassport(app: any): void {
  logger.info('🚀 [PASSPORT] Initializing Passport.js');

  // Initialize Passport and restore authentication state from session
  app.use(passport.initialize());
  app.use(passport.session());

  logger.info('✅ [PASSPORT] Passport.js initialized successfully');
}

/**
 * Authentication middleware - Use instead of custom auth checks
 *
 * ENTERPRISE FIX: Wrapped in try-catch to prevent process crashes
 * Issue: localhost-architecture-fixes.json ISSUE-001
 *
 * Usage in routes:
 * app.get('/protected', ensureAuthenticated, (req, res) => { ... })
 */
export function ensureAuthenticated(req: any, res: any, next: any): void {
  try {
    if (req.isAuthenticated()) {
      logger.info('✅ [AUTH] User authenticated', {
        userId: req.user?.id,
        path: req.path,
      });
      return next();
    }

    logger.warn('🚫 [AUTH] Unauthenticated request to protected route', {
      path: req.path,
      method: req.method,
    });

    res.status(401).json({
      error: 'Authentication required',
      message: 'Please sign in to access this resource',
      loginUrl: '/api/auth/google',
    });
  } catch (error) {
    // CRITICAL FIX: Catch any authentication errors to prevent process crash
    logger.error('❌ [AUTH] Authentication middleware error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      path: req.path,
      method: req.method,
    });

    // Return 401 instead of crashing the process
    if (!res.headersSent) {
      res.status(401).json({
        error: 'Authentication failed',
        message: 'An error occurred during authentication',
      });
    }
  }
}

/**
 * Role-based authorization middleware
 *
 * ENTERPRISE FIX: Wrapped in try-catch to prevent process crashes
 * Issue: localhost-architecture-fixes.json ISSUE-001
 *
 * Usage:
 * app.get('/admin', requireRoles(['admin']), (req, res) => { ... })
 */
export function requireRoles(roles: string[]) {
  return (req: any, res: any, next: any): void => {
    try {
      if (!req.isAuthenticated()) {
        logger.warn(
          '🚫 [AUTH] Unauthenticated request to role-protected route',
          {
            path: req.path,
            requiredRoles: roles,
          }
        );
        return res.status(401).json({
          error: 'Authentication required',
          message: 'Please sign in to access this resource',
        });
      }

      const user = req.user as SessionUser;
      const userRole = user.role;
      const hasRequiredRole = roles.includes(userRole);

      if (!hasRequiredRole) {
        logger.warn('🚫 [AUTH] Insufficient permissions', {
          userId: user.id,
          userRole,
          requiredRoles: roles,
          path: req.path,
        });
        return res.status(403).json({
          error: 'Insufficient permissions',
          message: `This resource requires one of the following roles: ${roles.join(', ')}`,
          current: userRole,
          required: roles,
        });
      }

      logger.info('✅ [AUTH] User authorized', {
        userId: user.id,
        userRole,
        path: req.path,
      });

      next();
    } catch (error) {
      // CRITICAL FIX: Catch any authorization errors to prevent process crash
      logger.error('❌ [AUTH] Authorization middleware error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        path: req.path,
        requiredRoles: roles,
      });

      // Return 403 instead of crashing the process
      if (!res.headersSent) {
        res.status(403).json({
          error: 'Authorization failed',
          message: 'An error occurred during authorization',
        });
      }
    }
  };
}

export default passport;
