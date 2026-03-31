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
import { config, isProduction, isStaging } from './index.js';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

export function getSessionMiddleware(): RequestHandler {
  // Shared PostgreSQL session store — survives blue/green LB routing
  // Uses the same managed PostgreSQL cluster as the application DB
  const PgStore = connectPgSimple(session);

  logger.info('Initializing session middleware (PostgreSQL store)', {
    hasDbUrl: !!process.env.DATABASE_URL,
  });

  const store = new PgStore({
    conString: process.env.DATABASE_URL,
    tableName: 'sessions',
    createTableIfMissing: true,
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
