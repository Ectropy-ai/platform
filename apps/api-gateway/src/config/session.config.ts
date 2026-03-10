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
  // - Development: 'lax' (sameSite:'none' requires secure:true/HTTPS)
  // - Staging/Production: 'none' (allows OAuth redirects across subdomains with HTTPS)
  const sameSiteSetting = isSecureEnvironment ? 'none' : 'lax';

  logger.info('Session configuration', {
    isProduction,
    isStaging,
    isSecureEnvironment,
    secure: isSecureEnvironment,
    domain: isSecureEnvironment ? '.ectropy.ai' : undefined,
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
      sameSite: sameSiteSetting, // 'lax' in development, 'none' in staging/production
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      domain: isSecureEnvironment ? '.ectropy.ai' : undefined, // Subdomain sharing in staging/prod
      path: '/',
    },
  });
}
