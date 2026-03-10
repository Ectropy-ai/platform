/**
 * Authentication Configuration Module
 *
 * Enterprise-grade OAuth configuration with environment-based URL construction.
 * Implements proper precedence: GOOGLE_CALLBACK_URL > BASE_URL > NODE_ENV defaults
 *
 * Pattern: Configuration as code with explicit URL construction logic
 * Testing: Enables proper unit testing of callback URL generation
 */

/**
 * Construct OAuth callback URL based on environment
 *
 * Priority order:
 * 1. GOOGLE_CALLBACK_URL (explicit override - highest priority)
 * 2. BASE_URL + /api/auth/google/callback (custom base domain)
 * 3. NODE_ENV-based defaults (environment-specific)
 *
 * @returns {string} Fully qualified OAuth callback URL
 */
function getOAuthCallbackURL() {
  const {
    GOOGLE_CALLBACK_URL,
    BASE_URL,
    NODE_ENV = 'development',
  } = process.env;

  // Priority 1: Explicit callback URL (full URL override)
  if (GOOGLE_CALLBACK_URL) {
    return GOOGLE_CALLBACK_URL;
  }

  // Priority 2: Construct from BASE_URL if provided
  if (BASE_URL) {
    return `${BASE_URL}/api/auth/google/callback`;
  }

  // Priority 3: Environment-based defaults
  const defaultUrls = {
    production: 'https://ectropy.ai/api/auth/google/callback',
    staging: 'https://staging.ectropy.ai/api/auth/google/callback',
    development: 'http://localhost:3001/api/auth/google/callback',
    test: 'http://localhost:3001/api/auth/google/callback',
  };

  return defaultUrls[NODE_ENV] || defaultUrls.development;
}

/**
 * Redis configuration with URL fallback
 */
function getRedisConfig() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  return {
    url: redisUrl,
  };
}

/**
 * Session configuration with environment-aware security
 */
function getSessionConfig() {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    secret:
      process.env.SESSION_SECRET || 'dev-session-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction, // HTTPS-only in production
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  };
}

/**
 * Google OAuth configuration
 */
function getGoogleConfig() {
  return {
    clientID: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackURL: getOAuthCallbackURL(),
  };
}

/**
 * Unified auth configuration export with dynamic evaluation
 *
 * Uses Proxy for test isolation - returns fresh config on each property access.
 * This allows tests to modify process.env and see updated values without module reload.
 *
 * Pattern: Configuration as Proxy for true dynamic behavior in tests
 */
export const authConfig = new Proxy(
  {},
  {
    get(target, prop) {
      // Evaluate configuration fresh on each access
      const config = {
        google: getGoogleConfig(),
        session: getSessionConfig(),
        redis: getRedisConfig(),
      };
      return config[prop];
    },
  }
);

/**
 * Default export for CommonJS compatibility
 */
export default authConfig;
