/**
 * Centralized Session Configuration for Passport.js
 *
 * This replaces the session middleware from AuthenticationMiddleware
 * to ensure proper compatibility with Passport.js OAuth flows.
 *
 * Phase: OAuth Architecture Fix
 * Issue: Session state not persisting during OAuth callback
 */

import session from 'express-session';
import type { RequestHandler } from 'express';
import RedisStore from 'connect-redis';
import { createRedisClient } from './redis.config.js';
import { config, isProduction, isStaging } from './index.js';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

export function getSessionMiddleware(): RequestHandler {
  // Build Redis URL from environment variables
  const REDIS_URL =
    process.env.REDIS_URL ||
    `redis://:${encodeURIComponent(process.env.REDIS_PASSWORD || '')}@${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`;

  logger.info('Initializing session middleware for Passport.js', {
    redisHost: process.env.REDIS_HOST || 'localhost',
    redisPort: process.env.REDIS_PORT || '6379',
  });

  // Create dedicated Redis client for sessions (no keyPrefix to avoid conflicts with Passport)
  const redisClient = createRedisClient(REDIS_URL, {
    db: 1, // Use DB 1 for sessions to isolate from main app (DB 0)
  });

  // Create Redis store with connect-redis v7 (built-in types)
  const store = new RedisStore({
    client: redisClient,
    prefix: 'ectropy:session:',
    ttl: 86400, // 24 hours in seconds
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
