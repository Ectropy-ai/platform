/**
 * Centralized Session Configuration for Passport.js
 *
 * This replaces the session middleware from AuthenticationMiddleware
 * to ensure proper compatibility with Passport.js OAuth flows.
 *
 * Phase: Shared Session Store (Blue/Green)
 * Fix: Per-node Redis replaced with shared managed PostgreSQL.
 * Root cause: Blue and Green nodes ran isolated Redis containers.
 * Sessions created on one node were invisible to the other.
 */

import session from 'express-session';
import type { RequestHandler } from 'express';
import connectPgSimple from 'connect-pg-simple';
import pg from 'pg';
const { Pool } = pg;
import { config, isProduction, isStaging } from './index.js';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

/**
 * Create the sessions table if it does not exist.
 *
 * connect-pg-simple's createTableIfMissing reads table.sql from the package
 * directory at runtime. In Docker the bundler (esbuild) does NOT copy .sql
 * assets into /app/dist/, so the file is always ENOENT and the table is
 * never created. This function replaces that mechanism with inline SQL
 * executed directly against the pool — no file dependency.
 *
 * Idempotent: safe to call on every cold start.
 */
function ensureSessionsTable(pool: InstanceType<typeof Pool>): void {
  pool.query(`
    CREATE TABLE IF NOT EXISTS "sessions" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
    ) WITH (OIDS=FALSE)
  `).then(() => pool.query(`CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "sessions" ("expire")`))
    .then(() => logger.info('[session] sessions table ensured'))
    .catch((err) => logger.error('[session] Failed to create sessions table', { error: err.message }));
}

export function getSessionMiddleware(): RequestHandler {
  // Shared PostgreSQL session store — survives blue/green LB routing
  // Uses the same managed PostgreSQL cluster as the application DB
  const PgStore = connectPgSimple(session);

  // DigitalOcean managed PostgreSQL uses sslmode=require in DATABASE_URL.
  // This overrides ssl.rejectUnauthorized=false — pg treats sslmode=require
  // as ssl: true (rejectUnauthorized: true). Fix: strip sslmode from URL,
  // pass ssl config directly to Pool constructor.
  const dbUrl = (process.env.DATABASE_URL || '').replace(/[?&]sslmode=[^&]*/g, '');
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  ensureSessionsTable(pool);

  logger.info('Initializing session middleware (PostgreSQL store)', {
    hasDbUrl: !!process.env.DATABASE_URL,
  });

  const store = new PgStore({
    pool,
    tableName: 'sessions',
    // Disabled: reads table.sql from disk — file missing in Docker bundle (ENOENT).
    createTableIfMissing: false,
    ttl: 86400, // 24 hours — matches cookie maxAge
  });

  // Environment detection
  const isSecureEnvironment = isProduction || isStaging;

  // Cookie sameSite setting:
  // - All environments: 'lax' — allows cookies on top-level GET navigations
  //   (OAuth callback from Google is a top-level GET, so 'lax' works correctly)
  // - 'none' was causing failures because browsers increasingly block SameSite=None
  //   cookies as third-party cookies, even on OAuth redirects
  // - 'lax' is the browser default and the correct choice for OAuth flows
  const sameSiteSetting: 'lax' | 'none' | 'strict' = 'lax';

  logger.info('Session configuration', {
    isProduction,
    isStaging,
    isSecureEnvironment,
    secure: isSecureEnvironment,
    sameSite: sameSiteSetting,
    cookieName: 'oauth_session',
  });

  return session({
    store,
    secret: config.SESSION_SECRET,
    resave: true, // CRITICAL: Must be true for Passport OAuth state to persist
    saveUninitialized: true, // Required for OAuth - must save session with OAuth state
    proxy: true, // Trust X-Forwarded-Proto from load balancer
    name: 'oauth_session',
    cookie: {
      secure: isSecureEnvironment, // HTTPS only in staging/production
      httpOnly: true,
      sameSite: sameSiteSetting, // 'lax' always — correct for OAuth top-level GET callbacks
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      // domain omitted — browser defaults to exact origin (ectropy.ai)
      // Explicit '.ectropy.ai' domain was unnecessary (no subdomain sharing needed)
      // and could cause cookie matching issues with some proxy configurations
      path: '/',
    },
  });
}
