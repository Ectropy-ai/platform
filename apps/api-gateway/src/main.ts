/**
 * Main entry point for the API Gateway
 * This file starts the Express server and handles process lifecycle
 * Enhanced with production-ready authentication and security features
 */

// Load logger first for early diagnostics
import { logger } from '../../../libs/shared/utils/src/logger.js';
import { getCurrentVersion, VERSION_STRATEGY } from './utils/version.js';

// CRITICAL: Early startup diagnostics
logger.info('=== API Gateway Startup Diagnostics ===');
logger.info('Timestamp:', new Date().toISOString());
logger.info('Node version:', process.version);
logger.info('Platform:', process.platform);
logger.info('Architecture:', process.arch);
logger.info('Working directory:', process.cwd());
logger.info('Environment:', process.env.NODE_ENV);
logger.info('=======================================');

// Load environment variables FIRST (before any other imports)
import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';
// Load .env files in precedence order (idempotent — dotenv skips existing vars)
for (const envFile of [
  '.env',
  `.env.${process.env.NODE_ENV || 'development'}`,
  '.env.local',
]) {
  dotenvConfig({ path: resolve(process.cwd(), envFile) });
}
logger.info('✅ Environment variables loaded');

// Configure EventEmitter limits before any other imports
import '../../../src/config/event-emitter.config.js';
logger.info('✅ EventEmitter configured');

// CRITICAL: Global error handlers to prevent silent failures
process.on('uncaughtException', (error: Error) => {
  // DIAGNOSTIC FIX (2026-03-06): Use console.error as backup — Winston drops
  // string metadata args in JSON format, making error details invisible.
  // Template literals ensure error details appear in the message field itself.
  const errMsg = error?.message || String(error);
  const errName = error?.name || 'Unknown';
  const errStack = error?.stack || 'No stack trace available';
  console.error('========================================');
  console.error('FATAL: Uncaught Exception');
  console.error(`Error: ${errMsg}`);
  console.error(`Name: ${errName}`);
  console.error(`Stack: ${errStack}`);
  console.error(`Type: ${typeof error}`);
  console.error(`Constructor: ${error?.constructor?.name || 'unknown'}`);
  try {
    console.error(
      `JSON: ${JSON.stringify(error, Object.getOwnPropertyNames(error || {}), 2)}`
    );
  } catch {
    /* ignore serialization errors */
  }
  console.error('========================================');
  logger.error('========================================');
  logger.error('FATAL: Uncaught Exception');
  logger.error('========================================');
  logger.error(`Error: ${errMsg}`);
  logger.error(`Name: ${errName}`);
  logger.error(`Stack: ${errStack}`);
  logger.error('========================================');
  process.exit(1);
});

process.on(
  'unhandledRejection',
  (reason: unknown, promise: Promise<unknown>) => {
    const reasonStr =
      reason instanceof Error
        ? `${reason.name}: ${reason.message}\n${reason.stack}`
        : String(reason);
    console.error('========================================');
    console.error('FATAL: Unhandled Promise Rejection');
    console.error(`Reason: ${reasonStr}`);
    console.error('========================================');
    logger.error('========================================');
    logger.error('FATAL: Unhandled Promise Rejection');
    logger.error(`Reason: ${reasonStr}`);
    logger.error('========================================');
    process.exit(1);
  }
);

// AP-001 ENTERPRISE FIX (2026-01-01): Migrate to unified configuration system
// Replacing envalid-based config with env-schema.ts for zero hardcoded URLs
import {
  getEnvConfig,
  getApiUrl,
  getCorsOrigins,
} from '@ectropy/shared/config';
import {
  getRedisClient,
  closeRedisConnections,
} from './config/redis.config.js';
// DEPRECATED (2026-01-01): Legacy envalid config - will be removed after migration validation
// Use @ectropy/shared/config instead
import {
  validateConfig,
  ENV,
  isProduction,
  isStaging,
} from './config/index.js';
import {
  initializePassport,
  ensureAuthenticated,
} from './auth/passport.config.js';
// Phase 5.2: Trial expiration middleware
import { trialExpirationMiddleware } from './middleware/trial-expiration.middleware.js';
// ENTERPRISE FIX APPLIED: PermissionLevel enum bundling issue resolved
// Solution: Changed default parameter from enum value to string literal union type
import {
  requireProjectAccess,
  requireAuth,
} from './middleware/authorization.middleware.js';

logger.info('✅ Core imports loaded');

// P0 FIX (2026-01-05): REMOVE module-level getEnvConfig() call
// REASON: getEnvConfig() validates ALL env vars - must be called AFTER error handlers
// SOLUTION: Move inside bootstrap() async function (lazy evaluation)
const requiredEnvVars = [
  'JWT_SECRET',
  'DATABASE_HOST',
  'DATABASE_PORT',
  'DATABASE_NAME',
  'DATABASE_USER',
  'DATABASE_PASSWORD',
];

logger.info('Environment variables check:');
logger.info(
  '  - JWT_SECRET:',
  process.env['JWT_SECRET'] ? '✅ Set' : '❌ Missing'
);
logger.info('  - DATABASE_HOST:', process.env['DATABASE_HOST'] || '(not set)');
logger.info('  - DATABASE_PORT:', process.env['DATABASE_PORT'] || '(not set)');
logger.info('  - DATABASE_NAME:', process.env['DATABASE_NAME'] || '(not set)');
logger.info('  - DATABASE_USER:', process.env['DATABASE_USER'] || '(not set)');
logger.info(
  '  - DATABASE_PASSWORD:',
  process.env['DATABASE_PASSWORD'] ? '✅ Set' : '❌ Missing'
);

const missingVars = requiredEnvVars.filter(
  (varName) => !process.env[varName] || process.env[varName]?.trim() === ''
);

if (missingVars.length > 0) {
  // ENTERPRISE PATTERN: Use logger for fatal startup errors
  logger.error('========================================');
  logger.error('FATAL ERROR: Missing required environment variables');
  logger.error('========================================');
  logger.error('Missing variables:', missingVars.join(', '));
  logger.error('Please ensure all required environment variables are set.');
  logger.error('========================================');
  process.exit(1);
}
logger.info('✅ All required environment variables validated');
import express, {
  Application,
  type Request,
  type Response,
  type NextFunction,
} from 'express';

// ENTERPRISE: Import centralized Express type augmentations
// This provides User, Session, Request extensions from libs/shared/types/src/express.ts
import '@ectropy/shared/types/express';

import helmet from 'helmet';
import {
  initializeRateLimiters,
  cleanupRateLimiters,
} from './middleware/rate-limit.middleware.js';
import { body, param, validationResult } from 'express-validator';
import DOMPurify from 'isomorphic-dompurify';
import Redis from 'ioredis';
import { register, Counter, Histogram } from 'prom-client';
import { InputValidator } from '../../../libs/shared/security/src';
import { EnhancedJWTAuthService } from '../../../libs/auth/enhanced';
import { createGracefulShutdown } from './graceful-shutdown.js';
import { owaspSecurityStack } from './middleware/owasp-security';
// DEPRECATED: import { AuthenticationMiddleware } from './middleware/auth.middleware.js';
import { OAuthRoutes } from './routes/oauth.routes.js';
import { DashboardRoutes } from './routes/dashboard.routes.js';
import { DemoRoutes } from './routes/demo.routes.js';
import catalogRoutes from './routes/catalog.routes.js';
import portfolioRoutes from './routes/portfolio.routes.js';
import tenantRoutes from './routes/tenant.routes.js';
import { getSessionMiddleware } from './config/session.config.js';
// REMOVED: import { validateAuthConfig } from './config/auth.config.js'; (Phase 5a-d5 refactor)
import { securityMiddleware } from './middleware/security.middleware.js';
// ENTERPRISE SECURITY: Phase 1 Priority 1 - Nonce-based CSP (2025-11-30)
import {
  cspNonceMiddleware,
  cspReportHandler,
} from './middleware/csp-nonce.js';
// ENTERPRISE FEATURE: Real-time WebSocket for demo playback
import { initializeWebSocket } from './websocket/handler.js';
// ENTERPRISE SECURITY: Phase 1 Priority 2 - Audit Logging (2025-11-30)
import {
  auditService,
  AuditEventType,
  AuditResourceType,
} from './services/audit.service.js';
import {
  createAuditMiddleware,
  authAuditMiddleware,
  fileAuditMiddleware,
} from './middleware/audit.middleware.js';
// import { EnhancedAuthMiddleware } from '../../../libs/shared/middleware/auth.middleware.js';
// import { PasswordSecurityPolicy } from '../../../libs/auth/enhanced/security/password-policy.js';
// import { AccountSecurityService } from '../../../libs/auth/enhanced/security/account-security.js';
// import { TwoFactorAuthService } from '../../../libs/auth/enhanced/security/two-factor-auth.js';

// =============================================================================
// ENTERPRISE FIX (2026-03-05): Static imports for ALL route, service, and
// middleware modules. Eliminates webpack code-splitting (await import() creates
// separate chunks that fail silently at runtime in Docker).
// ROOT CAUSE: Five Why #FWY-2026-03-05 — /api/speckle/config 404 in production
// SOLUTION: Static imports fail at BUILD TIME, not silently at runtime.
// BELT+SUSPENDERS: LimitChunkCountPlugin({ maxChunks: 1 }) in webpack.config.cjs
// =============================================================================

// Route modules — static imports prevent runtime chunk loading failures
import { WaitlistRoutes } from './routes/waitlist.routes.js';
import { RegistrationRoutes } from './routes/registration.routes.js';
import { InvitationRoutes } from './routes/invitation.routes.js';
import { UserManagementAdminRoutes } from './routes/user-management-admin.routes.js';
import { CRMWebhookRoutes } from './routes/crm-webhook.routes.js';
import webhooksRoutes from './routes/webhooks.routes.js';
import bimRoutes from './routes/bim.routes.js';
import { ProjectRoutes } from './routes/project.routes.js';
import { VoxelRoutes } from './routes/voxels.routes.js';
import { GovernanceRoutes } from './routes/governance.routes.js';
import { DAORoutes } from './routes/dao.routes.js';
import { ManufacturerRoutes } from './routes/manufacturer.routes.js';
import { createIFCRoutes } from './routes/ifc.routes.js';
import speckleEnterpriseRoutes from './routes/speckle.routes.enterprise.js';
import aiRoutes from './routes/ai.routes.js';
import { AdminRoutes } from './routes/admin.routes.js';
import { ConsoleRoutes } from './routes/console/index.js';
import { ExternalIntegrationsRoutes } from './routes/external-integrations.routes.js';
import { createDemoProvisioningRoutes } from './routes/admin/provision-demo-user.route.js';
import { createSeedDemoDataRoutes } from './routes/admin/seed-demo-data.route.js';
import mcpProxyRoutes from './routes/mcp-proxy.routes.js';
import { TaskRoutes } from './routes/tasks.routes.js';
import { AlertRoutes } from './routes/alerts.routes.js';
import { createUploadRoutes } from './routes/upload.routes.js';
import { createContractUploadRoutes } from './routes/contract-upload.routes.js';

// Database modules (prisma uses lazy factory — safe for static import)
import { getPrismaClient } from './database/prisma.js';

// Service modules
import { ProjectService } from './services/project.service.js';
import { ProposalService } from './services/proposal.service.js';

// Middleware modules
import { validationRules, validate } from './middleware/validation.js';
import { cacheConfigs, initializeCache } from './middleware/cache.js';
import { metricsEndpoint } from './middleware/performance-monitor.js';

// Audit modules
import {
  EnterpriseAuditLogger,
  AuditPersistenceService,
} from '../../../libs/shared/audit/src/index.js';

// WebSocket modules
import { initializeVoxelStream, getVoxelStreamHandler } from './websocket/voxel-stream.js';
import { initializeRedisPubSub } from './websocket/redis-pubsub.js';

// P0 FIX (2026-01-05): Moved getEnvConfig() into bootstrap() function
// REASON: getEnvConfig() validates ALL 83 environment variables
// ERROR: If called at module level (line 183), runs BEFORE uncaughtException handler
// SOLUTION: Lazy evaluation - moved into bootstrap() async function (line 227)

logger.info('✅ All static imports loaded');

// Prometheus Metrics Setup
const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'],
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['method', 'path'],
  buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000],
});

// Service health tracking
const startTime = Date.now();
const healthStatus: {
  status: string;
  database: string;
  redis: string;
  auth: string;
  lastCheck: string;
} = {
  status: 'starting',
  database: 'unknown',
  redis: 'unknown',
  auth: 'unknown',
  lastCheck: new Date().toISOString(),
};
async function bootstrap(): Promise<void> {
  // P0 FIX (2026-01-05): Load configuration INSIDE bootstrap() (lazy evaluation)
  // REASON: getEnvConfig() validates ALL 83 environment variables
  // ERROR: If called at module level, runs BEFORE uncaughtException handler
  // SOLUTION: Call here (after error handlers registered, inside async function)
  const envConfig = getEnvConfig();
  const NODE_ENV: string = envConfig.nodeEnv;
  const PORT: number = envConfig.apiPort;
  const DATABASE_URL: string = envConfig.databaseUrl;
  const REDIS_URL: string = envConfig.redisUrl;

  const JWT_SECRET: string = process.env['JWT_SECRET'] || '';
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
  }

  logger.info('========================================');
  logger.info('🚀 Starting API Gateway Bootstrap');
  logger.info('========================================');
  logger.info('Port:', PORT);
  logger.info('Environment:', NODE_ENV);
  logger.info('Database Host:', process.env['DATABASE_HOST']);
  logger.info('Database Port:', process.env['DATABASE_PORT']);
  logger.info('Database Name:', process.env['DATABASE_NAME']);
  logger.info('Redis Host:', process.env['REDIS_HOST']);
  logger.info('Redis Port:', process.env['REDIS_PORT']);
  logger.info('========================================');

  try {
    // Validate OAuth configuration using centralized config (Phase 5a-d5 refactor)
    logger.info('Step 1/8: Validating OAuth configuration...');
    console.time('oauth-validation');
    validateConfig(); // Centralized configuration validation
    console.timeEnd('oauth-validation');
    logger.info('✅ OAuth configuration validated');

    // Initialize Redis connection with timeout
    logger.info('Step 2/8: Initializing Redis connection...');
    console.time('redis-connection');
    let redis: Redis | null = null;
    try {
      if (REDIS_URL) {
        // CRITICAL FIX: Use centralized factory instead of inline Redis client creation
        redis = getRedisClient(REDIS_URL);

        // Additional event handlers for health status tracking
        redis.on('error', (err) => {
          healthStatus.redis = 'unhealthy';
        });

        redis.on('connect', () => {
          healthStatus.redis = 'healthy';
        });

        redis.on('ready', () => {
          healthStatus.redis = 'healthy';
        });

        redis.on('close', () => {
          healthStatus.redis = 'disconnected';
        });

        redis.on('reconnecting', (ms: number) => {
          healthStatus.redis = 'reconnecting';
        });

        // Set timeout for ping operation
        await Promise.race([
          redis.ping(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Redis ping timeout')), 5000)
          ),
        ]);

        healthStatus.redis = 'healthy';
        logger.info('✅ Redis connection established and verified');
      } else {
        logger.warn(
          '⚠️ Redis URL not provided, Redis configuration required for production'
        );
        healthStatus.redis = 'configuration_required';
      }
    } catch (error) {
      logger.error('Redis connection failed during initialization', { error });
      healthStatus.redis = 'unhealthy';
      // Don't fail startup if Redis is unavailable - graceful degradation
      if (redis) {
        // Even if initial connection failed, keep the client for retries
        logger.warn('⚠️  Continuing without Redis - caching disabled');
      } else {
        redis = null;
      }
    }
    console.timeEnd('redis-connection');

    // Initialize enhanced authentication services
    logger.info('Step 3/8: Initializing authentication services...');
    const authService = new EnhancedJWTAuthService(redis || undefined);
    // const authMiddleware = new EnhancedAuthMiddleware();
    // const passwordPolicy = new PasswordSecurityPolicy();
    // const accountSecurity = redis ? new AccountSecurityService(redis) : null;
    // const twoFactorAuth = redis ? new TwoFactorAuthService(redis) : null;
    healthStatus.auth = 'healthy';
    logger.info('✅ Authentication services initialized');

    logger.info('Step 4/8: Creating Express application...');
    const app: Application = express();

    // CRITICAL: Trust proxy for HTTPS deployment
    // Load balancer terminates SSL, connection to this app is HTTP
    // Must trust X-Forwarded-Proto header for secure cookies to work
    // Using centralized environment detection from config (Phase 5a-d5 refactor)
    if (isProduction || isStaging || process.env.TRUST_PROXY === 'true') {
      app.set('trust proxy', 1);
      logger.info('✅ Trust proxy enabled for HTTPS deployment', {
        isProduction,
        isStaging,
        environment: ENV,
      });
    }

    // =========================================================================
    // INFRASTRUCTURE PROBES — Registered BEFORE all middleware (industry standard)
    // =========================================================================
    // Pattern: Kubernetes /livez, Spring Boot Actuator, AWS ALB health checks
    // Rationale: Health probes must bypass rate limiting, auth, CORS, body parsing.
    //   Express processes middleware in registration order — routes registered here
    //   are served before any middleware that could interfere (rate limiter, CSRF, etc.)
    // Source: Kubernetes health check best practices, OWASP API Security guidance,
    //   Node.js Reference Architecture (Red Hat/Nodeshift)
    // =========================================================================

    // Liveness probe: Zero-dependency — confirms process is alive and responsive
    // Docker HEALTHCHECK and infrastructure monitoring use this endpoint.
    // MUST NOT check DB, Redis, or any external dependency (prevents cascading
    // restarts when a dependency is temporarily down — Google SRE best practice).
    app.get('/livez', (_req: Request, res: Response) => {
      res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        pid: process.pid,
        uptime: Math.floor(process.uptime()),
        buildSha: process.env['BUILD_SHA'] || 'unknown',
      });
    });
    logger.info(
      '✅ Liveness probe registered at /livez (before all middleware)'
    );

    // OWASP Top 10 Security Hardening (Task 4.2)
    logger.info('Step 5/8: Applying OWASP security stack...');
    console.time('owasp-security-stack');
    const securityMiddlewares = await owaspSecurityStack;
    console.timeEnd('owasp-security-stack');
    securityMiddlewares.forEach((middleware) => app.use(middleware));

    // Security Layer Implementation (Step 4)
    // ENTERPRISE SECURITY: Helmet for general security headers
    // CSP is disabled here - using dedicated nonce-based CSP middleware below
    app.use(
      helmet({
        contentSecurityPolicy: false, // Disabled - using nonce-based CSP instead
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        },
      })
    );

    // ENTERPRISE SECURITY: Phase 1 Priority 1 - Nonce-based CSP
    // Replaces helmet's CSP with enterprise-grade nonce-based policy
    // ELIMINATES 'unsafe-inline' vulnerability (OWASP A03:2021)
    app.use(cspNonceMiddleware());
    logger.info('✅ Nonce-based CSP enabled (strict mode, no unsafe-inline)');

    // ENTERPRISE RATE LIMITING (wired 2026-02-27)
    // Resolves ROOT CAUSE #221 (broken CI env detection), #223 (shared LB IP bucket),
    // and #190/191 (double rate limiting on OAuth).
    //
    // The enterprise system (rate-limit.middleware.ts) provides:
    //   - X-Forwarded-For key generator (real client IPs, not LB internal 10.20.0.7)
    //   - Per-user rate limit keys (IP:userId) — each user gets their own bucket
    //   - Redis-backed storage with memory fallback
    //   - 4 tiers: standard (100/15min), auth (3/5min failed-only), upload (10/hr), readOnly (300/15min)
    //   - Opt-out security pattern (DISABLE_RATE_LIMITING blocked in prod/staging)
    //
    // This eliminates the need for CI env detection (per-user keys solve the shared bucket)
    // and the broken process.env.CI check (env var only exists on GH Actions runner, not in Docker).
    // Evidence: FIVE_WHY_RATE_LIMIT_ENTERPRISE_WIRING_2026-02-27.json
    const limiters = await initializeRateLimiters();

    // Wrapper middleware to exclude infrastructure and auth routes from global rate limiting
    //
    // EXEMPT PATHS (industry standard — health probes must never be rate-limited):
    //   /livez        — Liveness probe (Docker HEALTHCHECK, Kubernetes pattern)
    //   /health       — Full readiness check with dependency status
    //   /api/health   — Same as /health, nginx /api/ route compatibility
    //   /health/detailed — Detailed health with dependency breakdown
    //   /metrics      — Prometheus scraping (continuous, high-frequency)
    //   /api/auth/*   — OAuth routes have dedicated auth limiter below
    //
    // RATIONALE: Rate-limiting health probes causes false-negative health status.
    //   Infrastructure interprets 429 as "unhealthy" → triggers restarts or traffic
    //   removal → feedback loop destabilizes the entire deployment.
    //   (Five Why: FIVE_WHY_HEALTH_RATE_LIMIT_2026-02-27.json)
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (
        req.path === '/livez' ||
        req.path === '/health' ||
        req.path === '/api/health' ||
        req.path === '/health/detailed' ||
        req.path === '/metrics' ||
        req.path.startsWith('/api/auth/')
      ) {
        return next();
      }
      return limiters.standard(req, res, next);
    });

    // ENTERPRISE AUTH RATE LIMITING (rate-limit.middleware.ts)
    // Strategy: 3 req/5min, skipSuccessfulRequests — only FAILED auth attempts count
    // Per-IP via X-Forwarded-For (not LB internal IP)
    // Replaces inline oauthLimiter (50-200/15min counting ALL requests)
    app.use('/api/auth/google', limiters.auth);
    app.use('/api/auth/github', limiters.auth);

    // Note: Password/credential endpoints should get their own stricter rate limiter
    // when implemented. For now, OAuth is the only active authentication method.

    // CORS middleware - CRITICAL for cross-origin requests from web dashboard
    // AP-001 ENTERPRISE FIX (2026-01-01): Use getCorsOrigins() - ZERO hardcoded URLs
    // P0 FIX (2026-01-05): LAZY CORS initialization - getCorsOrigins() called on first request
    // REASON: getCorsOrigins() calls getEnvConfig() which validates ALL environment variables
    // ERROR: If called at module load (before error handlers), crashes with empty error logs
    // SOLUTION: Use cors() with function callback - evaluated per-request (lazy)
    // Enterprise architecture: Application layer handles CORS, not nginx
    const cors = require('cors');
    app.use(
      cors({
        origin: (
          origin: string | undefined,
          callback: (err: Error | null, allow?: boolean) => void
        ) => {
          try {
            const corsOrigins = getCorsOrigins(); // Lazy evaluation on first request
            const allowedOrigins = [
              ...corsOrigins,
              // Multi-tenant subdomain patterns
              /^https:\/\/[a-z0-9][a-z0-9-]+--staging\.ectropy\.ai$/, // Staging tenants
              /^https:\/\/[a-z0-9][a-z0-9-]+\.ectropy\.ai$/, // Production tenants
              // GitHub Codespaces domains (regex patterns)
              /^https:\/\/.*\.github\.dev$/,
              /^https:\/\/.*\.preview\.app\.github\.dev$/,
            ];

            // Check if origin is allowed
            const isAllowed =
              !origin ||
              allowedOrigins.some((allowed) => {
                if (allowed instanceof RegExp) {
                  return allowed.test(origin);
                }
                return allowed === origin;
              });

            callback(null, isAllowed);
          } catch (error) {
            // If CORS origins can't be loaded, fail closed (security-first)
            logger.error('Failed to load CORS origins', error as Error);
            callback(new Error('CORS configuration failed'));
          }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
        allowedHeaders: [
          'Content-Type',
          'Authorization',
          'X-Requested-With',
          'X-CSRF-Token',
        ],
      })
    );
    logger.info('✅ CORS configured for cross-origin requests');

    // Metrics middleware - track all requests
    app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();

      res.on('finish', () => {
        const duration = Date.now() - start;
        const path = req.route?.path || req.path;

        httpRequestDuration.labels(req.method, path).observe(duration);

        httpRequestsTotal
          .labels(req.method, path, res.statusCode.toString())
          .inc();
      });

      next();
    });

    // Input validation and sanitization middleware
    const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
      // Skip sanitization for OAuth callback routes
      // OAuth callbacks contain URL-encoded parameters that should not be sanitized
      // Covers: /api/auth/google, /api/auth/google/callback, /api/auth/github, /api/auth/github/callback
      if (req.path.startsWith('/api/auth/')) {
        return next();
      }

      if (req.body && typeof req.body === 'object') {
        for (const key in req.body) {
          if (typeof req.body[key] === 'string') {
            req.body[key] = DOMPurify.sanitize(req.body[key]);
          }
        }
      }
      next();
    };
    app.use(sanitizeInput);
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    app.use(InputValidator.middleware());

    // ENTERPRISE SECURITY: CSP Violation Reporting Endpoint (Phase 1 Priority 1)
    // Must be defined early, uses express.json() for parsing CSP reports
    app.post(
      '/api/csp-report',
      express.json({ type: 'application/csp-report' }),
      cspReportHandler
    );
    logger.info('✅ CSP violation reporting endpoint configured');

    logger.info('Step 6/8: Setting up authentication and routes...');

    // PHASE 5a-d5 REFACTOR: Passport.js OAuth Implementation
    // Using industry-standard Passport.js with centralized session config

    // CRITICAL: Session middleware MUST be initialized BEFORE Passport and CSRF
    // Using centralized session configuration for proper Passport.js compatibility
    app.use(getSessionMiddleware());
    logger.info(
      '✅ Session middleware initialized (centralized config for Passport.js)'
    );

    // Initialize Passport.js for OAuth authentication
    initializePassport(app);
    logger.info('✅ Passport.js initialized with Google OAuth strategy');

    // Enhanced security middleware with CSRF protection
    // MUST come AFTER session middleware as it depends on req.session
    securityMiddleware.forEach((middleware) => app.use(middleware));

    // ENTERPRISE SECURITY: Phase 1 Priority 2 - Audit Logging
    // Comprehensive audit trail for compliance (SOC2, GDPR, HIPAA)
    // Excludes health checks, metrics, and CSP reports
    app.use(
      '/api',
      createAuditMiddleware({
        excludePaths: [/^\/api\/health/, /^\/api\/csp-report/, /^\/metrics/],
        logRequestBody: false, // Security: don't log request bodies by default
        logResponseBody: false,
      })
    );
    logger.info(
      '✅ Enterprise audit logging enabled (tamper-evident hash chaining)'
    );

    // Mount OAuth routes - REQUIRED before staging deployment
    // Updated to use Passport.js (no AuthenticationMiddleware parameter needed)
    // Mount at /api/auth to match frontend expectations and other API routes
    const oauthRoutes = new OAuthRoutes();
    app.use('/api/auth', oauthRoutes.getRouter());
    logger.info('✅ OAuth routes mounted at /api/auth');

    // Mount Dashboard routes - Authenticated landing page
    const dashboardRoutes = new DashboardRoutes();
    app.use('/dashboard', dashboardRoutes.getRouter());
    logger.info('✅ Dashboard routes mounted at /dashboard');

    // Mount Demo routes - Public demo statistics
    const demoRoutes = new DemoRoutes();
    app.use('/api/demo', demoRoutes.getRouter());
    logger.info('✅ Demo routes mounted at /api/demo');

    // Mount Catalog routes - Public model catalog (Phase 4)
    app.use('/api/catalog', catalogRoutes);
    logger.info('✅ Catalog routes mounted at /api/catalog');

    // Mount Portfolio routes - User portfolio management (Phase 4)
    // Phase 5.2: Trial expiration check applied
    app.use('/api/portfolio', trialExpirationMiddleware, portfolioRoutes);
    logger.info(
      '✅ Portfolio routes mounted at /api/portfolio (with trial expiration check)'
    );

    // Mount Tenant routes - User tenant usage and limits (Phase 8.3)
    app.use('/api/tenant', tenantRoutes);
    logger.info('✅ Tenant routes mounted at /api/tenant');

    // PUBLIC ENDPOINTS (no authentication required) - MUST come before authentication middleware

    // ENTERPRISE FIX (2026-03-05): Single database pool import for all routes
    // connection.js creates Pool at module level (reads env vars) — must be dynamic
    // to ensure dotenv has loaded. All other modules are static imports (see top of file).
    const { pool, testConnection, healthCheck } =
      await import('./database/connection.js');

    // Mount Waitlist routes - Public email capture for landing page
    try {
      const waitlistRoutes = new WaitlistRoutes(pool);
      app.use('/api/waitlist', waitlistRoutes.getRouter());
      logger.info('✅ Waitlist routes mounted at /api/waitlist');
    } catch (error) {
      logger.error('Failed to load Waitlist routes', { error });
    }

    // ===========================================================================
    // USER MANAGEMENT ROUTES (M3.1-M3.4)
    // ===========================================================================
    // Self-service customer onboarding and team collaboration
    // Milestone: User Management M3 (API Endpoints Layer)
    // ===========================================================================

    // Mount Registration routes - Self-service customer registration (M3.1)
    try {
      const prisma = getPrismaClient();
      const frontendUrl = envConfig.frontendUrl || 'https://ectropy.ai';
      const verificationLinkPattern = `${frontendUrl}/verify-email?token={{token}}`;

      const registrationRoutes = new RegistrationRoutes({
        prisma,
        frontendUrl,
        verificationLinkPattern,
      });
      app.use('/api/registration', registrationRoutes.getRouter());
      logger.info('✅ Registration routes mounted at /api/registration');
    } catch (error) {
      logger.error('Failed to load Registration routes', { error });
    }

    // Mount Invitation routes - Team collaboration (M3.2)
    try {
      const prisma = getPrismaClient();
      const frontendUrl = envConfig.frontendUrl || 'https://ectropy.ai';
      const invitationLinkPattern = `${frontendUrl}/accept-invitation?token={{token}}`;

      const invitationRoutes = new InvitationRoutes({
        prisma,
        frontendUrl,
        invitationLinkPattern,
      });
      app.use('/api/invitations', invitationRoutes.getRouter());
      logger.info('✅ Invitation routes mounted at /api/invitations');
    } catch (error) {
      logger.error('Failed to load Invitation routes', { error });
    }

    // Mount User Management Admin routes - Platform admin operations (M3.3)
    try {
      const prisma = getPrismaClient();

      const userManagementAdminRoutes = new UserManagementAdminRoutes({
        prisma,
      });
      app.use(
        '/api/admin/user-management',
        userManagementAdminRoutes.getRouter()
      );
      logger.info(
        '✅ User Management Admin routes mounted at /api/admin/user-management'
      );
    } catch (error) {
      logger.error('Failed to load User Management Admin routes', { error });
    }

    // Mount CRM Webhook routes - Twenty CRM integration (M3.4)
    try {
      const prisma = getPrismaClient();
      const crmWebhookSecret = process.env['CRM_WEBHOOK_SECRET'];

      const crmWebhookRoutes = new CRMWebhookRoutes({
        prisma,
        crmWebhookSecret,
      });
      app.use('/api/webhooks/crm', crmWebhookRoutes.getRouter());
      logger.info('✅ CRM Webhook routes mounted at /api/webhooks/crm');
    } catch (error) {
      logger.error('Failed to load CRM Webhook routes', { error });
    }

    // Mount Payment Webhook routes - Stripe subscription events (Phase 6)
    try {
      app.use('/api/webhooks', webhooksRoutes as unknown as express.Router);
      logger.info(
        '✅ Payment webhook routes mounted at /api/webhooks (Stripe integration architecture)'
      );
    } catch (error) {
      logger.error('Failed to load payment webhook routes', { error });
    }

    // Enhanced health check endpoint with database status
    app.get('/health', async (req: Request, res: Response) => {
      try {
        const uptime = Math.floor((Date.now() - startTime) / 1000);

        // Get database health status
        let dbHealth = { status: 'unknown', latency: 0 };
        try {
          dbHealth = await healthCheck();
        } catch (error) {
          logger.error('Health check database error', { error });
        }

        // Calculate health score (0-100) based on component health
        let score = 100;

        // Database health impact
        if (dbHealth.status === 'unhealthy') {
          score -= 50;
        } else if (dbHealth.status === 'degraded') {
          score -= 30;
        } else if (dbHealth.status === 'unknown') {
          score -= 20;
        }

        // Redis health impact
        if (healthStatus.redis === 'unhealthy') {
          score -= 30;
        } else if (
          healthStatus.redis === 'disconnected' ||
          healthStatus.redis === 'reconnecting'
        ) {
          score -= 20;
        } else if (
          healthStatus.redis === 'configuration_required' ||
          healthStatus.redis === 'unknown'
        ) {
          score -= 10;
        }

        // Memory check
        const memUsage = process.memoryUsage();
        const memPercent = memUsage.heapUsed / memUsage.heapTotal;
        if (memPercent > 0.9) {
          score -= 20;
        } else if (memPercent > 0.8) {
          score -= 10;
        }

        // Ensure score stays within 0-100 range
        score = Math.max(0, Math.min(100, score));

        // Determine overall status based on score
        const status =
          score >= 70 ? 'healthy' : score >= 40 ? 'degraded' : 'unhealthy';

        const health = {
          status,
          score, // CRITICAL: Numeric health score 0-100
          timestamp: new Date().toISOString(),
          uptime,
          uptimeHuman: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`,
          service: 'Enhanced API Gateway',
          version: getCurrentVersion(),
          versionStrategy: VERSION_STRATEGY.type,
          buildSha: process.env['BUILD_SHA'] || 'unknown',
          environment: NODE_ENV,
          features: {
            authentication: 'enhanced',
            database: 'persistent',
            caching: 'redis',
            validation: 'comprehensive',
            websockets: 'enabled',
          },
          websocket: (() => {
            const vsHandler = getVoxelStreamHandler();
            if (vsHandler) {
              const wsStats = vsHandler.getStats();
              return {
                voxelStream: {
                  status: 'ok',
                  connectedClients: wsStats.totalConnections,
                  activeProjects: wsStats.activeProjects,
                  uptime: wsStats.uptime,
                  redisPubSub: wsStats.redisPubSub,
                },
              };
            }
            return { voxelStream: { status: 'not_initialized', connectedClients: 0 } };
          })(),
          database: {
            status: dbHealth.status,
            latency: dbHealth.latency,
            connections:
              'connections' in dbHealth
                ? dbHealth.connections
                : { total: 0, idle: 0, waiting: 0 },
          },
          memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            external: Math.round(process.memoryUsage().external / 1024 / 1024),
            percent: Math.round(memPercent * 100),
          },
          services: healthStatus,
        };

        // Return 503 if unhealthy, 200 otherwise
        const statusCode = score >= 40 ? 200 : 503;
        // CRITICAL FIX: Add explicit return to prevent double header send
        return res.status(statusCode).json(health);
      } catch (error) {
        // CRITICAL: Handle errors gracefully without crashing
        logger.error('Health check failed catastrophically', { error });
        // Check if headers already sent to prevent ERR_HTTP_HEADERS_SENT
        if (!res.headersSent) {
          return res.status(503).json({
            status: 'unhealthy',
            error: 'Health check failed',
            timestamp: new Date().toISOString(),
          });
        }
      }
    });

    // ROOT CAUSE #90 FIX: Prometheus metrics endpoint
    // PROBLEM: Prometheus configuration (prometheus.yml) scrapes /metrics but endpoint returns 404
    // ROOT CAUSE: performance-monitor.ts exports metricsEndpoint handler but route never mounted
    // SOLUTION: Mount /metrics endpoint using existing performance-monitor middleware
    // PATTERN: Enterprise observability standard (Google SRE, Netflix, Datadog)
    app.get('/metrics', async (req: Request, res: Response) => {
      try {
        // Call the metrics handler (returns Prometheus format with correct Content-Type)
        await metricsEndpoint(req, res);
      } catch (error) {
        logger.error('Metrics endpoint error', { error });
        if (!res.headersSent) {
          res.status(500).send('Error generating metrics');
        }
      }
    });

    // API health check endpoint (for load balancers)
    // This is the same as /health but at /api/health for compatibility with nginx routing
    app.get('/api/health', async (req: Request, res: Response) => {
      try {
        const uptime = Math.floor((Date.now() - startTime) / 1000);

        // Get database health status
        let dbHealth = { status: 'unknown', latency: 0 };
        try {
          dbHealth = await healthCheck();
        } catch (error) {
          logger.error('Health check database error', { error });
        }

        // Calculate health score (0-100) based on component health
        let score = 100;

        // Database health impact
        if (dbHealth.status === 'unhealthy') {
          score -= 50;
        } else if (dbHealth.status === 'degraded') {
          score -= 30;
        } else if (dbHealth.status === 'unknown') {
          score -= 20;
        }

        // Redis health impact
        if (healthStatus.redis === 'unhealthy') {
          score -= 30;
        } else if (
          healthStatus.redis === 'disconnected' ||
          healthStatus.redis === 'reconnecting'
        ) {
          score -= 20;
        } else if (
          healthStatus.redis === 'configuration_required' ||
          healthStatus.redis === 'unknown'
        ) {
          score -= 10;
        }

        // Memory check
        const memUsage = process.memoryUsage();
        const memPercent = memUsage.heapUsed / memUsage.heapTotal;
        if (memPercent > 0.9) {
          score -= 20;
        } else if (memPercent > 0.8) {
          score -= 10;
        }

        // Ensure score stays within 0-100 range
        score = Math.max(0, Math.min(100, score));

        // Determine overall status based on score
        const status =
          score >= 70 ? 'healthy' : score >= 40 ? 'degraded' : 'unhealthy';

        const health = {
          status,
          score, // CRITICAL: Numeric health score 0-100
          timestamp: new Date().toISOString(),
          uptime,
          uptimeHuman: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`,
          service: 'Enhanced API Gateway',
          version: getCurrentVersion(),
          versionStrategy: VERSION_STRATEGY.type,
          buildSha: process.env['BUILD_SHA'] || 'unknown',
          environment: NODE_ENV,
          features: {
            authentication: 'enhanced',
            database: 'persistent',
            caching: 'redis',
            validation: 'comprehensive',
            websockets: 'enabled',
          },
          websocket: (() => {
            const vsHandler = getVoxelStreamHandler();
            if (vsHandler) {
              const wsStats = vsHandler.getStats();
              return {
                voxelStream: {
                  status: 'ok',
                  connectedClients: wsStats.totalConnections,
                  activeProjects: wsStats.activeProjects,
                  uptime: wsStats.uptime,
                  redisPubSub: wsStats.redisPubSub,
                },
              };
            }
            return { voxelStream: { status: 'not_initialized', connectedClients: 0 } };
          })(),
          database: {
            status: dbHealth.status,
            latency: dbHealth.latency,
            connections:
              'connections' in dbHealth
                ? dbHealth.connections
                : { total: 0, idle: 0, waiting: 0 },
          },
          memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            external: Math.round(process.memoryUsage().external / 1024 / 1024),
            percent: Math.round(memPercent * 100),
          },
          services: healthStatus,
        };

        // Return 503 if unhealthy, 200 otherwise
        const statusCode = score >= 40 ? 200 : 503;
        // CRITICAL FIX: Add explicit return to prevent double header send
        return res.status(statusCode).json(health);
      } catch (error) {
        // CRITICAL: Handle errors gracefully without crashing
        logger.error('Health check failed catastrophically', { error });
        // Check if headers already sent to prevent ERR_HTTP_HEADERS_SENT
        if (!res.headersSent) {
          return res.status(503).json({
            status: 'unhealthy',
            error: 'Health check failed',
            timestamp: new Date().toISOString(),
          });
        }
      }
    });

    // Metrics endpoint for Prometheus
    app.get('/metrics', async (req: Request, res: Response) => {
      try {
        res.set('Content-Type', register.contentType);
        const metrics = await register.metrics();
        res.end(metrics);
      } catch (error) {
        logger.error('Error generating metrics', { error });
        res.status(500).end('Error generating metrics');
      }
    });
    // Detailed health check endpoint
    app.get('/health/detailed', async (req: Request, res: Response) => {
      try {
        const checks = {
          api: true,
          services: {
            database: healthStatus.database,
            redis: healthStatus.redis,
            filesystem: 'healthy',
          },
          system: {
            platform: process.platform,
            nodeVersion: process.version,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(),
          },
        };
        const allHealthy = Object.values(checks.services).every(
          (status) => status === 'healthy' || status === 'unknown'
        );
        // CRITICAL FIX: Add explicit return to prevent double header send
        return res.status(allHealthy ? 200 : 503).json({
          status: allHealthy ? 'healthy' : 'degraded',
          ...checks,
        });
      } catch (error) {
        logger.error('Detailed health check failed', { error });
        if (!res.headersSent) {
          return res.status(503).json({
            status: 'unhealthy',
            error: 'Detailed health check failed',
          });
        }
      }
    });
    // Ready endpoint (for load balancers)
    app.get('/ready', (req: Request, res: Response) => {
      try {
        const isReady = healthStatus.status === 'healthy';
        // CRITICAL FIX: Add explicit return to prevent double header send
        return res.status(isReady ? 200 : 503).json({
          ready: isReady,
        });
      } catch (error) {
        logger.error('Ready check failed', { error });
        if (!res.headersSent) {
          return res.status(503).json({
            ready: false,
            error: 'Ready check failed',
          });
        }
      }
    });

    // PROTECTED ENDPOINTS - Authentication required from here on
    // NOTE: OAuth routes handle authentication via Passport.js
    // For other protected routes, use ensureAuthenticated from passport.config.ts
    // Example: app.get('/protected', ensureAuthenticated, handler)
    // Global authentication disabled to allow public endpoints (/health, /metrics, etc.)

    // Import BIM routes for AEC features
    try {
      if (bimRoutes) {
        app.use('/api/bim', bimRoutes as unknown as express.Router);
        logger.info('BIM routes mounted successfully at /api/bim');
      }
    } catch (error) {
      logger.error('Failed to mount BIM routes', { error });
    }

    // Import Project management routes
    try {
      const projectRoutes = new ProjectRoutes(pool);
      app.use('/api', projectRoutes.getRouter());
      logger.info('Project routes mounted successfully at /api/projects');
    } catch (error) {
      logger.error('Failed to load Project routes', { error });
    }

    // Import Voxel routes for ROS MRO coordination view (Sprint 5 - 2026-01-24)
    try {
      const voxelRoutes = new VoxelRoutes(pool);
      app.use('/api/v1', voxelRoutes.getRouter());
      logger.info(
        'Voxel routes mounted successfully at /api/v1/projects/:projectId/voxels'
      );
    } catch (error) {
      logger.error('Failed to load Voxel routes', { error });
    }

    // Import Governance routes for DAO proposals and voting
    try {
      const governanceRoutes = new GovernanceRoutes(pool);
      app.use('/api', governanceRoutes.getRouter());
      logger.info('Governance routes mounted successfully at /api/proposals');
    } catch (error) {
      logger.error('Failed to load Governance routes', { error });
    }

    // Import DAO routes for dashboard-level governance views
    try {
      const daoRoutes = new DAORoutes(pool);
      // ENTERPRISE: Mount at /api/v1/dao for API versioning consistency
      app.use('/api/v1/dao', daoRoutes.getRouter());
      logger.info('DAO routes mounted successfully at /api/v1/dao');
    } catch (error) {
      logger.error('Failed to load DAO routes', { error });
    }

    // Import Manufacturer routes for product catalog and supplier management
    try {
      const manufacturerRoutes = new ManufacturerRoutes(pool);
      app.use('/api/v1/manufacturer', manufacturerRoutes.getRouter());
      logger.info(
        'Manufacturer routes mounted successfully at /api/v1/manufacturer'
      );
    } catch (error) {
      logger.error('Failed to load Manufacturer routes', { error });
    }

    // Import IFC routes for BIM file processing
    try {
      const ifcRoutes = createIFCRoutes(pool);
      app.use('/api/ifc', ifcRoutes);
      logger.info('IFC routes mounted successfully at /api/ifc');
    } catch (error) {
      logger.error('Failed to load IFC routes', { error });
    }

    // ROOT CAUSE #138 FIX: Use enterprise Speckle routes for BIM viewer support
    // PROBLEM: Base routes (speckle.routes.ts) missing critical endpoints for BIM viewer:
    //   - GET /config (returns 404, blocking viewer initialization)
    //   - POST /graphql (BFF proxy for Speckle API calls)
    //   - GET /objects/:streamId/:objectId (object loader for viewer)
    // SOLUTION: Enterprise routes have all viewer endpoints + enhanced security
    // Previous comment about "404s" was incorrect - 404s occur WITHOUT enterprise routes
    // ENTERPRISE FIX (2026-03-05): Converted from dynamic import to static import
    // ROOT CAUSE: await import() created webpack chunk that failed to load in Docker
    try {
      if (speckleEnterpriseRoutes) {
        app.use(
          '/api/speckle',
          speckleEnterpriseRoutes as unknown as express.Router
        );
        logger.info(
          '✅ Speckle enterprise routes mounted at /api/speckle (BIM viewer support enabled)'
        );
      } else {
        logger.warn(
          '⚠️  Speckle routes module loaded but no default export found'
        );
      }
    } catch (error) {
      logger.error('❌ Failed to mount Speckle routes', { error });
    }

    // Import AI routes for cost estimation
    try {
      if (aiRoutes) {
        app.use('/api/ai', aiRoutes as unknown as express.Router);
        logger.info('AI routes mounted successfully at /api/ai');
      }
    } catch (error) {
      logger.error('Failed to mount AI routes', { error });
    }

    // Import Admin routes for system administration
    try {
      const adminRoutes = new AdminRoutes({
        dbPool: pool,
        redis: redis!,
        jwtSecret: JWT_SECRET,
      });

      // DIAGNOSTIC: Add request logging middleware for /api/admin routes
      app.use(
        '/api/admin',
        (req: Request, res: Response, next: NextFunction) => {
          const startTime = Date.now();
          logger.info('[ADMIN ROUTE DIAGNOSTIC] Request received', {
            method: req.method,
            path: req.path,
            fullUrl: req.originalUrl,
            hasUser: !!req.user,
            userId: req.user?.id,
            userRoles: req.user?.roles,
            userRole: req.user?.role,
            isAuthenticated: req.isAuthenticated?.(),
          });

          // Monitor response
          const originalJson = res.json.bind(res);
          res.json = function (body: any) {
            const duration = Date.now() - startTime;
            logger.info('[ADMIN ROUTE DIAGNOSTIC] Response sent', {
              statusCode: res.statusCode,
              duration,
              bodyPreview: JSON.stringify(body).substring(0, 200),
            });
            return originalJson(body);
          };

          next();
        }
      );

      app.use('/api/admin', adminRoutes.getRouter());
      logger.info('✅ Admin routes mounted successfully at /api/admin');
    } catch (error) {
      logger.error('Failed to load Admin routes', { error });
    }

    // ECTROPY CONSOLE ROUTES (Jan 2026): Platform admin console for tenant/user management
    // Provides APIs for the Ectropy Employee Console (console.ectropy.ai)
    // Migration Note: Will move to ectropy-business repository post-split
    try {
      const consoleRoutes = new ConsoleRoutes({ prisma: getPrismaClient() });
      app.use('/api/console', consoleRoutes.getRouter());
      logger.info('✅ Console routes mounted successfully at /api/console');
    } catch (error) {
      logger.error('Failed to load Console routes', { error });
    }

    // BUSINESS-TOOLS INTEGRATION (2026-02-09): External Integrations API for n8n workflows
    // Strategic Alignment: Unified User System v2 (business-tools CRM → Ectropy platform)
    // Purpose: Enable automated user provisioning from business-tools to Ectropy
    // Authentication: API key with scope-based authorization (Milestone 1)
    // Endpoints: authorize-user, demo-users, revoke, health (Milestone 2)
    try {
      const externalIntegrationsRoutes = new ExternalIntegrationsRoutes({});
      app.use('/api/admin', externalIntegrationsRoutes.getRouter());
      logger.info(
        '✅ External Integrations routes mounted successfully at /api/admin'
      );
    } catch (error) {
      logger.error('Failed to load External Integrations routes', { error });
    }

    // DEMO PROVISIONING PIPELINE (2026-03-10): n8n demo-approval-pipeline endpoints
    // Endpoints: provision-demo-user, seed-demo-data
    // Authentication: API key with scope-based authorization
    try {
      app.use('/api/admin', createDemoProvisioningRoutes());
      app.use('/api/admin', createSeedDemoDataRoutes());
      logger.info(
        '✅ Demo Provisioning routes mounted successfully at /api/admin'
      );
    } catch (error) {
      logger.error('Failed to load Demo Provisioning routes', { error });
    }

    // ENTERPRISE FIX (2025-12-18): ROOT CAUSE #62 - Register MCP Proxy Routes
    // Problem: MCP deliverables endpoints returning 404 (apps/api-gateway/mcp-proxy.routes.ts existed but not registered)
    // Evidence: Frontend error "GET /api/mcp/deliverables/next? 404 (Not Found)"
    // Solution: Import and mount MCP proxy routes at /api/mcp
    try {
      if (mcpProxyRoutes) {
        app.use('/api/mcp', mcpProxyRoutes as unknown as express.Router);
        logger.info('✅ MCP proxy routes mounted successfully at /api/mcp');
      }
    } catch (error) {
      logger.error('Failed to mount MCP proxy routes', { error });
    }

    // ENTERPRISE ENDPOINTS (Sprint 5 - 2026-01-24): Engineering Tasks API
    // Provides task management for engineering workflows using PMDecision model
    try {
      const taskRoutes = new TaskRoutes({
        dbPool: pool,
        redis: redis!,
        jwtSecret: JWT_SECRET,
      });
      app.use('/api/v1/tasks', taskRoutes.getRouter());
      // Mount project-scoped tasks at /api/v1/projects/:projectId/tasks
      // Uses separate router to avoid shadowing project CRUD routes (Five Why 2026-02-26)
      app.use('/api/v1/projects', taskRoutes.getProjectScopedRouter());
      logger.info(
        '✅ Task routes mounted successfully at /api/v1/tasks + /api/v1/projects/:projectId/tasks'
      );
    } catch (error) {
      logger.error('Failed to load Task routes', { error });
    }

    // ENTERPRISE ENDPOINTS (Sprint 5 - 2026-01-24): Structural Alerts API
    // Provides alerts management for construction workflows using VoxelAlert model
    try {
      const alertRoutes = new AlertRoutes({
        dbPool: pool,
        redis: redis!,
        jwtSecret: JWT_SECRET,
      });
      app.use('/api/v1/alerts', alertRoutes.getRouter());
      // Mount project-scoped alerts at /api/v1/projects/:projectId/alerts
      // Uses separate router to avoid shadowing project CRUD routes (Five Why 2026-02-26)
      app.use('/api/v1/projects', alertRoutes.getProjectScopedRouter());
      logger.info(
        '✅ Alert routes mounted successfully at /api/v1/alerts + /api/v1/projects/:projectId/alerts'
      );
    } catch (error) {
      logger.error('Failed to load Alert routes', { error });
    }

    // IFC upload endpoint with multer file handling
    try {
      const uploadRoutes = createUploadRoutes();
      app.use(uploadRoutes);
      logger.info('✅ Upload routes mounted successfully');
    } catch (error) {
      logger.error('Failed to load Upload routes', { error });
      // Fallback: simple stub endpoint
      app.post('/api/upload/ifc', (req: Request, res: Response) => {
        res.json({
          success: true,
          message: 'File received (fallback)',
          modelId: `model-${Date.now()}`,
          filename: 'uploaded.ifc',
        });
      });
    }

    // Contract upload endpoint (Demo 4)
    try {
      const contractUploadRoutes = createContractUploadRoutes();
      app.use(contractUploadRoutes);
      logger.info(
        '✅ Contract upload routes mounted successfully at /api/upload/contract'
      );
    } catch (error) {
      logger.error('Failed to load Contract upload routes', { error });
    }
    // Basic API endpoints
    app.get('/api/v1/test', (req: Request, res: Response) => {
      res.json({
        message: 'API Gateway is working!',
      });
    });

    // Enhanced authentication endpoints
    app.post('/api/auth/login', async (req: Request, res: Response) => {
      try {
        const { email, password } = req.body;
        // Basic validation
        if (!email || !password) {
          return res.status(400).json({
            success: false,
            error: 'Email and password are required',
            timestamp: new Date().toISOString(),
          });
        }

        const deviceInfo = {
          ipAddress: req.ip || req.connection?.remoteAddress || 'unknown',
          userAgent: Array.isArray(req.headers['user-agent'])
            ? req.headers['user-agent'][0]
            : req.headers['user-agent'] || 'unknown',
          deviceFingerprint: req.headers['x-device-fingerprint'] as string,
        };
        const result = await authService.authenticate(
          email,
          password,
          deviceInfo
        );
        if (result && result.success && result.user && result.tokens) {
          const permissions = await authService.getRolePermissions(
            result.user.role
          );

          // Validate tokens exist - SECURITY: Never return placeholder tokens
          if (!result.tokens.accessToken || !result.tokens.refreshToken) {
            return res.status(500).json({
              success: false,
              error: 'Authentication service error - tokens not generated',
              timestamp: new Date().toISOString(),
            });
          }

          // ENTERPRISE SECURITY: Audit successful login
          auditService
            .logAuth(AuditEventType.AUTH_LOGIN_SUCCESS, result.user.id, {
              email: result.user.email,
              role: result.user.role,
              twoFactorEnabled: result.user.twoFactorEnabled,
              ipAddress: deviceInfo.ipAddress,
            })
            .catch((error) => {
              logger.warn('[Audit] Failed to log login success', { error });
            });

          return res.json({
            success: true,
            data: {
              user: {
                id: result.user.id,
                email: result.user.email,
                full_name: result.user.username,
                role: result.user.role,
                permissions,
                twoFactorEnabled: result.user.twoFactorEnabled,
              },
              accessToken: result.tokens.accessToken,
              refreshToken: result.tokens.refreshToken,
              expiresIn: result.tokens.expiresIn,
              tokenType: result.tokens.tokenType,
            },
          });
        } else if (result && result.requiresTwoFactor) {
          // Validate two-factor token exists - SECURITY: Never return placeholder tokens
          if (!result.twoFactorToken) {
            return res.status(500).json({
              success: false,
              error:
                'Authentication service error - two-factor token not generated',
              timestamp: new Date().toISOString(),
            });
          }

          return res.status(202).json({
            requiresTwoFactor: true,
            twoFactorToken: result.twoFactorToken,
            message: 'Two-factor authentication required',
          });
        } else if (result && result.accountLocked) {
          return res.status(423).json({
            error: result.error,
            accountLocked: true,
            lockoutTimeRemaining: result.lockoutTimeRemaining,
          });
        } else {
          // ENTERPRISE SECURITY: Audit failed login
          auditService
            .logAuth(AuditEventType.AUTH_LOGIN_FAILED, email || 'unknown', {
              email,
              reason: result?.error || 'Authentication failed',
              ipAddress: deviceInfo.ipAddress,
            })
            .catch((error) => {
              logger.warn('[Audit] Failed to log login failure', { error });
            });

          return res.status(401).json({
            error: result?.error || 'Authentication failed',
          });
        }
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: 'Internal server error',
          timestamp: new Date().toISOString(),
        });
      }
    });
    // Logout endpoint
    app.post('/api/auth/logout', async (req: Request, res: Response) => {
      try {
        const { refreshToken } = req.body;
        const user = (req as any).user;
        const userId = user?.id || user?.userId || 'unknown';

        if (refreshToken) {
          await authService.logout(refreshToken);
        }

        // ENTERPRISE SECURITY: Audit logout event
        auditService
          .logAuth(AuditEventType.AUTH_LOGOUT, userId, {
            ipAddress: req.ip || 'unknown',
          })
          .catch((error) => {
            logger.warn('[Audit] Failed to log logout', { error });
          });

        return res.json({
          success: true,
          message: 'Logged out successfully',
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: 'Logout failed',
        });
      }
    });

    // Token validation endpoint
    app.get('/api/auth/validate', async (req: Request, res: Response) => {
      try {
        const authHeader = req.headers.authorization;
        if (
          !authHeader ||
          typeof authHeader !== 'string' ||
          !authHeader.startsWith('Bearer ')
        ) {
          return res.status(401).json({
            error: 'No valid token provided',
          });
        }
        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        const validationResult = await authService.validateAccessToken(token);
        if (validationResult && validationResult.user) {
          const permissions = await authService.getRolePermissions(
            validationResult.user.role
          );
          return res.json({
            valid: true,
            user: {
              id: validationResult.user.id,
              email: validationResult.user.email,
              full_name: validationResult.user.username,
              role: validationResult.user.role,
              permissions,
            },
            session: validationResult.session || null,
          });
        } else {
          return res.status(401).json({
            error: 'Invalid token',
          });
        }
      } catch (error) {
        return res.status(500).json({
          error: 'Token validation failed',
        });
      }
    });
    // Database services and middleware (now static imports at top of file)
    logger.info('✅ Database services available (static imports)');

    // Initialize services
    logger.info('Initializing services...');
    const projectService = new ProjectService(pool);
    const proposalService = new ProposalService(pool);
    logger.info('✅ Services initialized');

    // ENTERPRISE SECURITY FIX: Initialize audit logging with database persistence
    logger.info('Initializing enterprise audit logging...');
    const auditPersistence = new AuditPersistenceService(pool);
    const auditLogger = EnterpriseAuditLogger.getInstance(
      {
        enablePersistence: true,
        retentionDays: 2555, // 7 years for SOX compliance
        complianceFrameworks: ['SOX', 'CMMC', 'GDPR'],
        sensitiveFieldRedaction: true,
      },
      auditPersistence
    );
    logger.info(
      '✅ Enterprise audit logging initialized with database persistence'
    );

    // Initialize caching with Redis (handle null case)
    if (redis) {
      logger.info('Initializing cache with Redis...');
      initializeCache(redis);
      logger.info('✅ Cache initialized');
    }

    // Test database connection and update health status with retry logic
    logger.info('Testing database connection (with retries)...');
    const dbConnected = await testConnection(10, 2000); // 10 retries, 2 second delay
    healthStatus.database = dbConnected ? 'healthy' : 'unhealthy';

    if (!dbConnected) {
      logger.warn(
        '⚠️  Database connection failed, but continuing startup (graceful degradation)'
      );
      logger.warn(
        '⚠️  Some features may be unavailable until database connection is established'
      );
    } else {
      logger.info('✅ Database connection established successfully');
    }

    // Projects endpoint with database persistence
    // ENTERPRISE SECURITY FIX: Add authentication to prevent unauthorized access
    app.get(
      '/api/v1/projects',
      ensureAuthenticated,
      cacheConfigs.projects,
      async (req: Request, res: Response) => {
        try {
          // ENTERPRISE PATTERN: Validate authentication
          if (!req.user || !req.user.id) {
            return res.status(401).json({
              success: false,
              error: 'Authentication required',
              message: 'Please sign in to view projects',
            });
          }

          // ENTERPRISE SECURITY FIX: Filter projects by user access (owner OR member)
          // Returns only projects where user is owner OR has active role
          const projects = await projectService.getProjects(req.user.id);

          return res.json({
            success: true,
            data: projects,
          });
        } catch (error) {
          const err = error as Error;
          logger.error('Failed to fetch projects', {
            userId: req.user?.id,
            error: err.message,
          });

          // ENTERPRISE ERROR HANDLING: Proper status codes
          if (
            err.message?.includes('Authentication') ||
            err.message?.includes('Unauthorized')
          ) {
            return res.status(401).json({
              success: false,
              error: 'Authentication required',
            });
          }

          return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: 'Failed to retrieve projects',
          });
        }
      }
    );

    // Create project endpoint (v1 API)
    // ENTERPRISE SECURITY FIX (2026-03-01): Add ensureAuthenticated middleware
    // Five Why: POST /api/v1/projects was publicly accessible — no auth guard
    app.post(
      '/api/v1/projects',
      ensureAuthenticated,
      async (req: Request, res: Response) => {
        try {
          const userId = req.user?.id;
          const { name, description, status, stakeholders } = req.body;

          if (!name) {
            return res.status(400).json({
              success: false,
              error: 'Project name is required',
            });
          }

          if (!userId) {
            return res.status(401).json({
              success: false,
              error: 'Authentication required to create a project',
            });
          }

          // Multi-tenant: Extract tenant_id from session user
          // Platform admins (no tenant_id) can specify tenant_id in request body
          // Five Why (2026-03-01): Platform admins have tenant_id=null by design
          // — auto-provision a default tenant when creating projects
          let tenantId = req.user?.tenant_id || req.body.tenant_id;

          if (!tenantId && req.user?.is_platform_admin) {
            // Platform admin without tenant context — find or create admin workspace tenant
            try {
              const prismaClient = getPrismaClient();

              const existingAdminTenant = await prismaClient.tenant.findFirst({
                where: {
                  primary_email: req.user.email,
                  status: 'ACTIVE',
                },
                select: { id: true },
              });

              if (existingAdminTenant) {
                tenantId = existingAdminTenant.id;
              } else {
                const adminSlug = `admin-${req.user.email
                  .split('@')[0]
                  .replace(/[^a-z0-9]/g, '-')}`;

                const adminTenant = await prismaClient.tenant.create({
                  data: {
                    slug: adminSlug,
                    name: `${req.user.name || req.user.firstName || 'Admin'}'s Workspace`,
                    status: 'ACTIVE',
                    subscription_tier: 'ENTERPRISE',
                    primary_email: req.user.email,
                    max_projects: 100,
                    max_users: 100,
                    max_storage_gb: 100,
                    data_region: 'us-west-2',
                  },
                  select: { id: true },
                });

                tenantId = adminTenant.id;

                // Persist tenant_id on user for future requests
                await prismaClient.user.update({
                  where: { id: userId },
                  data: { tenant_id: adminTenant.id },
                });

                logger.info(
                  '[PROJECTS] Auto-provisioned admin workspace tenant',
                  {
                    userId,
                    tenantId: adminTenant.id,
                    slug: adminSlug,
                  }
                );
              }
            } catch (tenantError) {
              logger.error('[PROJECTS] Failed to auto-provision admin tenant', {
                userId,
                error:
                  tenantError instanceof Error
                    ? tenantError.message
                    : 'Unknown error',
              });
            }
          }

          if (!tenantId) {
            return res.status(400).json({
              success: false,
              error: 'Tenant context required to create a project',
              message:
                'User has no tenant_id. Platform admins must specify tenant_id in request body.',
            });
          }

          const project = await projectService.createProject({
            name,
            description: description || '',
            status: status || 'planning',
            stakeholders: stakeholders || [],
            owner_id: userId,
            tenant_id: tenantId,
          });

          return res.status(201).json({
            success: true,
            data: project,
          });
        } catch (error) {
          logger.error('Failed to create project', { error });
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to create project';
          return res.status(500).json({
            success: false,
            error: errorMessage,
          });
        }
      }
    );

    // Project elements endpoint (v1 API)
    // ENTERPRISE SECURITY FIX: Add authentication and authorization middleware
    // Issue: Route was unprotected, returning 500 for auth failures instead of 401
    // Fix: Add ensureAuthenticated + requireProjectAccess middleware
    app.get(
      '/api/v1/projects/:projectId/elements',
      ensureAuthenticated,
      requireProjectAccess(),
      async (req: Request, res: Response) => {
        try {
          const { projectId } = req.params;

          // ENTERPRISE PATTERN: Validate user has project access (set by requireProjectAccess middleware)
          if (!req.user || !req.user.id) {
            logger.warn('Authentication bypass detected', {
              path: req.path,
              ip: req.ip,
            });
            return res.status(401).json({
              success: false,
              error: 'Authentication required',
              message: 'Please sign in to access this resource',
            });
          }

          const result = await projectService.getProjectElements(projectId);

          return res.json({
            success: true,
            data: result.elements,
            metadata: result.metadata,
          });
        } catch (error) {
          // ENTERPRISE ERROR HANDLING: Return appropriate HTTP status codes
          const err = error as Error;
          logger.error('Failed to fetch project elements', {
            projectId: req.params.projectId,
            userId: req.user?.id,
            error: err.message,
            stack: err.stack,
          });

          // Determine appropriate error response
          if (
            err.message?.includes('Authentication') ||
            err.message?.includes('Unauthorized')
          ) {
            return res.status(401).json({
              success: false,
              error: 'Authentication required',
              message: 'Please sign in to access this resource',
            });
          }

          if (
            err.message?.includes('Access denied') ||
            err.message?.includes('Forbidden')
          ) {
            return res.status(403).json({
              success: false,
              error: 'Access denied',
              message: 'You do not have permission to access this project',
            });
          }

          if (
            err.message?.includes('not found') ||
            err.message?.includes('Not Found')
          ) {
            return res.status(404).json({
              success: false,
              error: 'Project not found',
              message: 'The requested project does not exist',
            });
          }

          // Default to 500 for actual server errors
          return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: 'Failed to retrieve project elements',
          });
        }
      }
    );

    // Get single project by ID (v1 API)
    // ENTERPRISE SECURITY FIX: Add authentication and authorization
    app.get(
      '/api/v1/projects/:projectId',
      ensureAuthenticated,
      requireProjectAccess(),
      async (req: Request, res: Response) => {
        try {
          const { projectId } = req.params;

          // ENTERPRISE PATTERN: Defense in depth - double-check authentication
          if (!req.user || !req.user.id) {
            return res.status(401).json({
              success: false,
              error: 'Authentication required',
              message: 'Please sign in to access this resource',
            });
          }

          const project = await projectService.getProjectById(projectId);

          if (!project) {
            return res.status(404).json({
              success: false,
              error: 'Project not found',
              message: 'The requested project does not exist',
            });
          }

          return res.json({
            success: true,
            data: project,
          });
        } catch (error) {
          const err = error as Error;
          logger.error('Failed to fetch project', {
            projectId: req.params.projectId,
            userId: req.user?.id,
            error: err.message,
          });

          // ENTERPRISE ERROR HANDLING: Proper HTTP status codes
          if (
            err.message?.includes('Authentication') ||
            err.message?.includes('Unauthorized')
          ) {
            return res.status(401).json({
              success: false,
              error: 'Authentication required',
            });
          }

          if (
            err.message?.includes('Access denied') ||
            err.message?.includes('Forbidden')
          ) {
            return res.status(403).json({
              success: false,
              error: 'Access denied',
            });
          }

          return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: 'Failed to retrieve project',
          });
        }
      }
    );

    // Get my role for a specific project (v1 API)
    // ROOT CAUSE FIX (2026-02-28): Frontend calls /api/v1/projects/:id/my-role
    // but ProjectRoutes is mounted at /api (not /api/v1), causing 404.
    // This v1 handler queries project_roles directly, matching the v1 pattern.
    // Reference: FIVE_WHY_E2E_VIEWER_OAUTH_STAGING_2026-02-28.json
    app.get(
      '/api/v1/projects/:projectId/my-role',
      ensureAuthenticated,
      async (req: Request, res: Response) => {
        try {
          if (!req.user || !req.user.id) {
            return res.status(401).json({
              success: false,
              error: 'Authentication required',
            });
          }

          const { projectId } = req.params;
          const userId = req.user.id;

          const result = await pool.query(
            `SELECT role, permissions, voting_power, project_id, assigned_at
             FROM project_roles
             WHERE user_id = $1 AND project_id = $2 AND is_active = true`,
            [userId, projectId]
          );

          if (result.rows.length === 0) {
            return res.status(404).json({
              success: false,
              error: 'Role not found',
              message: 'User not assigned to this project',
            });
          }

          const row = result.rows[0];
          return res.json({
            success: true,
            data: {
              role: row.role,
              permissions: row.permissions || [],
              votingPower: row.voting_power,
              projectId: row.project_id,
              assignedAt: row.assigned_at,
            },
          });
        } catch (error) {
          const err = error as Error;
          logger.error('Failed to fetch project role', {
            projectId: req.params.projectId,
            userId: req.user?.id,
            error: err.message,
          });
          return res.status(500).json({
            success: false,
            error: 'Internal server error',
          });
        }
      }
    );

    // Get project proposals (v1 API)
    // ENTERPRISE SECURITY FIX: Add authentication and authorization middleware
    // Issue: Route was unprotected, allowing unauthorized access to project proposals
    // Fix: Add ensureAuthenticated + requireProjectAccess middleware
    app.get(
      '/api/v1/projects/:projectId/proposals',
      ensureAuthenticated,
      requireProjectAccess(),
      async (req: Request, res: Response) => {
        try {
          const { projectId } = req.params;
          // Return empty array for now - proposals table may not exist yet
          return res.json({
            success: true,
            data: [],
          });
        } catch (error) {
          logger.error('Failed to fetch project proposals', { error });
          return res.status(500).json({
            success: false,
            error: 'Failed to retrieve proposals',
          });
        }
      }
    );

    // Create project proposal (v1 API)
    // ENTERPRISE SECURITY FIX: Add authentication and authorization middleware
    // Issue: Route had manual auth check but no middleware, inconsistent with other endpoints
    // Fix: Add ensureAuthenticated + requireProjectAccess middleware for consistency
    app.post(
      '/api/v1/projects/:projectId/proposals',
      ensureAuthenticated,
      requireProjectAccess('WRITE'),
      async (req: Request, res: Response) => {
        try {
          const { projectId } = req.params;
          const userId = req.user?.id;

          if (!userId) {
            return res.status(401).json({
              success: false,
              error: 'Authentication required',
            });
          }

          const { title, description, proposalType, votingDays } = req.body;

          // Return a mock proposal for now
          const proposal = {
            id: `prop-${Date.now()}`,
            title,
            description,
            proposalType,
            status: 'active',
            proposer: {
              id: userId,
              name: 'Current User',
              role: 'member',
            },
            votes: {
              for: 0,
              against: 0,
              abstain: 0,
              total: 0,
              required: 3,
            },
            deadline: new Date(
              Date.now() + votingDays * 24 * 60 * 60 * 1000
            ).toISOString(),
            createdAt: new Date().toISOString(),
          };

          return res.status(201).json({
            success: true,
            data: proposal,
          });
        } catch (error) {
          logger.error('Failed to create proposal', { error });
          return res.status(500).json({
            success: false,
            error: 'Failed to create proposal',
          });
        }
      }
    );

    // Get proposal by ID (v1 API)
    app.get(
      '/api/v1/proposals/:proposalId',
      async (req: Request, res: Response) => {
        try {
          const { proposalId } = req.params;
          // Return a mock proposal for now
          return res.json({
            success: true,
            data: {
              id: proposalId,
              title: 'Mock Proposal',
              description: 'This is a mock proposal',
              proposalType: 'general',
              status: 'active',
              proposer: {
                id: 'user-1',
                name: 'Test User',
                role: 'member',
              },
              votes: {
                for: 0,
                against: 0,
                abstain: 0,
                total: 0,
                required: 3,
              },
              votesList: [],
              deadline: new Date(
                Date.now() + 7 * 24 * 60 * 60 * 1000
              ).toISOString(),
              createdAt: new Date().toISOString(),
            },
          });
        } catch (error) {
          logger.error('Failed to fetch proposal', { error });
          return res.status(500).json({
            success: false,
            error: 'Failed to retrieve proposal',
          });
        }
      }
    );

    // Vote on proposal (v1 API)
    app.post(
      '/api/v1/proposals/:proposalId/vote',
      async (req: Request, res: Response) => {
        try {
          const { proposalId } = req.params;
          const userId = req.user?.id;

          if (!userId) {
            return res.status(401).json({
              success: false,
              error: 'Authentication required',
            });
          }

          const { decision, comment } = req.body;

          // Return a mock vote for now
          return res.status(201).json({
            success: true,
            data: {
              id: `vote-${Date.now()}`,
              proposalId,
              voterId: userId,
              decision,
              comment,
              weight: 1,
              timestamp: new Date().toISOString(),
            },
          });
        } catch (error) {
          logger.error('Failed to cast vote', { error });
          return res.status(500).json({
            success: false,
            error: 'Failed to cast vote',
          });
        }
      }
    );

    // Project elements endpoint with database persistence (legacy)
    // ENTERPRISE SECURITY FIX: Add authentication and authorization middleware
    // Issue: Legacy route was unprotected, allowing unauthorized access to project elements
    // Fix: Add ensureAuthenticated + requireProjectAccess middleware
    app.get(
      '/api/projects/:projectId/elements',
      ensureAuthenticated,
      requireProjectAccess(),
      validate([validationRules.projectId]),
      cacheConfigs.projectElements,
      async (req: Request, res: Response) => {
        try {
          const { projectId } = req.params;
          const result = await projectService.getProjectElements(projectId);

          return res.json({
            success: true,
            data: result,
          });
        } catch (error) {
          logger.error('Failed to fetch project elements', { error });
          return res.status(500).json({
            success: false,
            error: 'Failed to retrieve project elements',
          });
        }
      }
    );

    // Create project element endpoint
    // ENTERPRISE SECURITY FIX: Add authentication and authorization middleware
    // Issue: Legacy route was unprotected, allowing unauthorized element creation
    // Fix: Add ensureAuthenticated + requireProjectAccess('WRITE') middleware
    app.post(
      '/api/projects/:projectId/elements',
      ensureAuthenticated,
      requireProjectAccess('WRITE'),
      validate([
        validationRules.projectId,
        validationRules.elementType,
        validationRules.elementName,
        validationRules.elementStatus,
        validationRules.geometry,
        validationRules.properties,
      ]),
      async (req: Request, res: Response) => {
        try {
          const { projectId } = req.params;
          const elementData = {
            ...req.body,
            project_id: projectId,
          };

          const element = await projectService.createBIMElement(
            projectId,
            elementData
          );

          return res.status(201).json({
            success: true,
            data: element,
          });
        } catch (error) {
          logger.error('Failed to create project element', { error });
          return res.status(500).json({
            success: false,
            error: 'Failed to create project element',
          });
        }
      }
    );

    // Update project element endpoint
    // ENTERPRISE SECURITY FIX: Add authentication and authorization middleware
    // Issue: Legacy route was unprotected, allowing unauthorized element updates
    // Fix: Add ensureAuthenticated + requireProjectAccess('WRITE') middleware
    app.put(
      '/api/projects/:projectId/elements/:elementId',
      ensureAuthenticated,
      requireProjectAccess('WRITE'),
      validate([
        validationRules.projectId,
        param('elementId').isUUID().withMessage('Invalid element ID'),
      ]),
      async (req: Request, res: Response) => {
        try {
          const { elementId } = req.params;
          const updates = req.body;

          const element = await projectService.updateElement(
            elementId,
            updates
          );

          if (!element) {
            return res.status(404).json({
              success: false,
              error: 'Element not found',
            });
          }

          return res.json({
            success: true,
            data: element,
          });
        } catch (error) {
          logger.error('Failed to update project element', { error });
          return res.status(500).json({
            success: false,
            error: 'Failed to update project element',
          });
        }
      }
    );

    // Proposals endpoint with database persistence
    app.get(
      '/api/proposals',
      cacheConfigs.proposals,
      async (req: Request, res: Response) => {
        try {
          const filters = {
            status: req.query.status as string,
            type: req.query.type as string,
            limit: req.query.limit
              ? parseInt(req.query.limit as string)
              : undefined,
            offset: req.query.offset
              ? parseInt(req.query.offset as string)
              : undefined,
          };

          const proposals = await proposalService.getProposals(filters);

          return res.json({
            success: true,
            data: proposals,
            metadata: {
              count: proposals.length,
              timestamp: new Date().toISOString(),
            },
          });
        } catch (error) {
          logger.error('Failed to fetch proposals', { error });
          return res.status(500).json({
            success: false,
            error: 'Failed to retrieve proposals',
          });
        }
      }
    );

    // Create proposal endpoint
    app.post(
      '/api/proposals',
      validate([
        validationRules.proposalTitle,
        validationRules.proposalDescription,
        validationRules.proposalType,
        body('proposer_id')
          .isUUID()
          .withMessage('Valid proposer ID is required'),
      ]),
      async (req: Request, res: Response) => {
        try {
          const proposal = await proposalService.createProposal(req.body);

          return res.status(201).json({
            success: true,
            data: proposal,
          });
        } catch (error) {
          logger.error('Failed to create proposal', { error });
          return res.status(500).json({
            success: false,
            error: 'Failed to create proposal',
          });
        }
      }
    );

    // Vote on proposal endpoint
    app.post(
      '/api/proposals/:proposalId/vote',
      validate([
        param('proposalId').isUUID().withMessage('Invalid proposal ID'),
        validationRules.voteType,
        body('user_id').isUUID().withMessage('Valid user ID is required'),
      ]),
      async (req: Request, res: Response) => {
        try {
          const { proposalId } = req.params;
          const { user_id, vote_type } = req.body;

          const result = await proposalService.castVote(
            proposalId,
            user_id,
            vote_type
          );

          if (!result.success) {
            return res.status(400).json(result);
          }

          return res.json(result);
        } catch (error) {
          logger.error('Failed to cast vote', { error });
          return res.status(500).json({
            success: false,
            error: 'Failed to cast vote',
          });
        }
      }
    );

    // DAO Proposals endpoint (alias for backward compatibility)
    app.get(
      '/api/daq/proposals',
      cacheConfigs.proposals,
      async (req: Request, res: Response) => {
        try {
          const proposals = await proposalService.getProposals({
            type: 'governance',
          });

          return res.json({
            success: true,
            data: proposals,
            metadata: {
              count: proposals.length,
              timestamp: new Date().toISOString(),
            },
          });
        } catch (error) {
          logger.error('Failed to fetch DAO proposals', { error });
          return res.status(500).json({
            success: false,
            error: 'Failed to retrieve DAO proposals',
          });
        }
      }
    );
    // Error handling middleware - use standardized error handler
    // CRITICAL FIX (2026-01-15): Replace hardcoded 500 status with proper error type detection
    // Root cause: All errors (including 401 auth) were returning HTTP 500
    // Solution: Use AppError classes from libs/shared/errors for proper status codes
    app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      // Check if headers already sent - prevents ERR_HTTP_HEADERS_SENT
      if (res.headersSent) {
        logger.error('⚠️  Error occurred after response sent:', {
          error: err.message,
          path: req.path,
          method: req.method,
          stack: err.stack,
        });
        return next(err); // Delegate to Express default handler
      }

      // Determine status code from error type
      let statusCode = 500;
      let errorType = 'Internal Server Error';

      // Check for AppError instances (from libs/shared/errors)
      if ('statusCode' in err && typeof (err as any).statusCode === 'number') {
        statusCode = (err as any).statusCode;
      }
      // Check for authentication errors
      else if (
        err.message?.includes('Authentication required') ||
        err.message?.includes('Not authenticated') ||
        err.name === 'UnauthorizedError'
      ) {
        statusCode = 401;
        errorType = 'Unauthorized';
      }
      // Check for authorization/permission errors
      else if (
        err.message?.includes('Insufficient permissions') ||
        err.message?.includes('Access denied') ||
        err.name === 'ForbiddenError'
      ) {
        statusCode = 403;
        errorType = 'Forbidden';
      }
      // Check for validation errors
      else if (err.name === 'ValidationError') {
        statusCode = 400;
        errorType = 'Bad Request';
      }

      // Log error with appropriate level (warn for client errors, error for server errors)
      const logLevel = statusCode >= 500 ? 'error' : 'warn';
      logger[logLevel]('❌ Request error:', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        statusCode,
      });

      // Send error response with correct status code
      res.status(statusCode).json({
        error: errorType,
        message: err.message,
        timestamp: new Date().toISOString(),
        ...(NODE_ENV === 'development' && {
          details: err.message,
          stack: err.stack,
        }),
      });
    });
    // 404 handler
    app.use((req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not Found',
        path: req.originalUrl,
      });
    });

    logger.info('Step 7/8: Starting HTTP server...');
    logger.info(`Attempting to listen on port ${PORT}...`);

    // Start server
    const server = app.listen(PORT, '0.0.0.0', () => {
      healthStatus.status = 'healthy';
      healthStatus.lastCheck = new Date().toISOString();

      logger.info('========================================');
      // AP-001 ENTERPRISE FIX (2026-01-01): Use getApiUrl() - ZERO hardcoded localhost
      const apiUrl = getApiUrl();
      logger.info('✅ API GATEWAY STARTED SUCCESSFULLY');
      logger.info('========================================');
      logger.info(`🔗 Server listening on: http://0.0.0.0:${PORT}`);
      logger.info(`🔗 Health check: ${apiUrl}/health`);
      logger.info(`🔗 Detailed health: ${apiUrl}/health/detailed`);
      logger.info(`🔗 Metrics: ${apiUrl}/metrics`);
      logger.info('========================================');
      logger.info('Environment:', NODE_ENV);
      logger.info('Database:', healthStatus.database);
      logger.info('Redis:', healthStatus.redis);
      logger.info('Auth:', healthStatus.auth);
      logger.info('========================================');

      logger.info('✅ API Gateway started successfully', {
        port: PORT,
        environment: NODE_ENV,
        health: healthStatus,
      });

      // ENTERPRISE SECURITY: Log system startup to audit trail
      auditService
        .log({
          eventType: AuditEventType.SYSTEM_STARTUP,
          resourceId: 'api-gateway',
          resourceType: AuditResourceType.SYSTEM,
          actorId: 'system',
          eventData: {
            port: PORT,
            environment: NODE_ENV,
            version: process.env['npm_package_version'] || '1.0.0',
            nodeVersion: process.version,
            platform: process.platform,
            healthStatus,
          },
          severity: 'low',
        })
        .catch((error) => {
          logger.warn('[Audit] Failed to log system startup', { error });
        });
    });

    // ENTERPRISE FEATURE: Initialize WebSocket server for real-time demo playback
    logger.info('Initializing WebSocket server for demo playback...');
    const wsHandler = initializeWebSocket(server);
    logger.info('✅ WebSocket server initialized', {
      path: '/ws/demo-playback',
      stats: wsHandler.getStats(),
    });

    // SPRINT 5 ROS MRO: Initialize voxel stream WebSocket for real-time updates
    logger.info('Initializing voxel stream WebSocket server...');
    const voxelStreamHandler = initializeVoxelStream(server);
    logger.info('✅ Voxel stream WebSocket initialized', {
      path: '/ws/voxel-stream',
      stats: voxelStreamHandler.getStats(),
    });

    // WS UPGRADE ROUTER — replaces per-WSS server: mode
    // ws v8.19.0 abortHandshake(400) on path mismatch kills the socket before
    // a second WSS can handle it. Single upgrade listener routes by pathname.
    server.on('upgrade', (req: import('http').IncomingMessage, socket: import('net').Socket, head: Buffer) => {
      const { pathname } = new URL(req.url!, 'http://localhost');
      if (pathname === '/ws/demo-playback') {
        wsHandler.getWss().handleUpgrade(req, socket, head, (ws) => {
          wsHandler.getWss().emit('connection', ws, req);
        });
      } else if (pathname === '/ws/voxel-stream') {
        voxelStreamHandler.getWss().handleUpgrade(req, socket, head, (ws) => {
          voxelStreamHandler.getWss().emit('connection', ws, req);
        });
      } else {
        socket.destroy();
      }
    });
    logger.info('✅ WebSocket upgrade router installed', {
      paths: ['/ws/demo-playback', '/ws/voxel-stream'],
    });

    // M5.2 ENTERPRISE: Initialize Redis Pub/Sub adapter for horizontal WebSocket scaling
    if (redis) {
      logger.info(
        'Initializing Redis Pub/Sub adapter for WebSocket scaling...'
      );
      try {
        // Create a duplicate Redis client for subscribing (required by Redis Pub/Sub)
        const subClient = redis.duplicate();

        const instanceId = `api-gateway-${process.pid}-${Date.now()}`;
        initializeRedisPubSub({
          publisher: redis,
          subscriber: subClient,
          instanceId,
          onMessage: (channel, message) => {
            // Forward cross-instance messages to local WebSocket clients
            voxelStreamHandler.handleCrossInstanceMessage(channel, message);
          },
          verbose: NODE_ENV === 'development',
        });

        logger.info('✅ Redis Pub/Sub adapter initialized', {
          instanceId,
          mode: 'horizontal-scaling-enabled',
        });
      } catch (redisPubSubError) {
        logger.warn(
          '⚠️ Redis Pub/Sub initialization failed, continuing with local-only broadcasts',
          {
            error:
              redisPubSubError instanceof Error
                ? redisPubSubError.message
                : 'Unknown',
          }
        );
      }
    } else {
      logger.info(
        'ℹ️ Redis not available, WebSocket broadcasts will be local-only'
      );
    }

    logger.info('Step 8/8: Configuring graceful shutdown handlers...');
    // Graceful shutdown
    const gracefulShutdown = createGracefulShutdown(
      server,
      redis,
      healthStatus
    );
    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM signal, initiating graceful shutdown...');
      cleanupRateLimiters(); // Close Redis connection for rate limiters
      gracefulShutdown('SIGTERM');
    });
    process.on('SIGINT', () => {
      logger.info('Received SIGINT signal, initiating graceful shutdown...');
      cleanupRateLimiters(); // Close Redis connection for rate limiters
      gracefulShutdown('SIGINT');
    });
    logger.info('✅ Graceful shutdown handlers configured');
    logger.info('========================================');
    logger.info('🎉 Bootstrap complete!');
    logger.info('========================================');
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : 'No stack trace';
    console.error('❌ FATAL: Bootstrap Failed');
    console.error(`Error: ${errMsg}`);
    console.error(`Stack: ${errStack}`);
    logger.error('========================================');
    logger.error('❌ FATAL: Bootstrap Failed');
    logger.error(`Error: ${errMsg}`);
    logger.error(`Stack: ${errStack}`);
    logger.error('========================================');
    process.exit(1);
  }
}

// Start the application
logger.info('Calling bootstrap()...');
bootstrap().catch((error) => {
  const errMsg = error instanceof Error ? error.message : String(error);
  const errStack = error instanceof Error ? error.stack : 'No stack trace';
  console.error('❌ FATAL: Application Startup Failed');
  console.error(`Error: ${errMsg}`);
  console.error(`Stack: ${errStack}`);
  logger.error('========================================');
  logger.error('❌ FATAL: Application Startup Failed');
  logger.error(`Error: ${errMsg}`);
  logger.error(`Stack: ${errStack}`);
  logger.error('========================================');
  process.exit(1);
});

// Build timestamp: 2026-01-29T14:10:00Z - Force webpack rebuild (ROOT CAUSE #74: M3 routes missing from bundle)
