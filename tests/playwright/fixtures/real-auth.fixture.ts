/**
 * REAL BACKEND AUTHENTICATION FIXTURES - ENTERPRISE E2E TESTING
 *
 * PURPOSE: Create authentic backend sessions using programmatic OAuth endpoint
 * REPLACES: Mock authentication patterns that don't create real sessions
 *
 * ARCHITECTURE:
 * - Uses TEST_GOOGLE_REFRESH_TOKEN from environment (GitHub Secrets)
 * - Exchanges refresh token for access token via Google OAuth2 API
 * - Calls POST /api/auth/google/token to establish real Passport.js session
 * - Session persisted in Redis/Postgres (same as production OAuth flow)
 * - Backend req.user is properly populated (no more 401/403 errors)
 *
 * ENTERPRISE PATTERNS:
 * - Token refresh with retry logic (handles transient Google API errors)
 * - Session caching (avoid unnecessary token exchanges)
 * - Comprehensive error handling with actionable messages
 * - Audit logging integration
 * - Environment-aware (works in CI, staging, local)
 *
 * SECURITY:
 * - Refresh token never exposed in logs or test artifacts
 * - Access tokens short-lived (1 hour)
 * - Sessions follow same security model as production
 * - Authorization checks enforced by backend (not frontend mocks)
 *
 * Date: December 23, 2025
 * Phase: 5a-d3 - Demo Readiness & BIM Viewer Integration
 * Issue: Fix E2E test authentication gap (mock → real sessions)
 */

import { Page, BrowserContext } from '@playwright/test';
import { logger } from '../../../libs/shared/utils/src/logger';

// =============================================================================
// CONFIGURATION
// =============================================================================

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

interface AuthenticatedUser {
  id: string;
  email: string;
  full_name: string;
  provider: string;
  role: string;
  roles: string[];
  company?: string;
}

interface AuthSessionResponse {
  success: boolean;
  user: AuthenticatedUser;
  sessionId: string;
  message?: string;
}

interface TokenCacheEntry {
  access_token: string;
  expires_at: number; // Unix timestamp
}

// Token cache (in-memory, per test run)
// Reduces Google API calls - refresh tokens can be reused for 1 hour
const tokenCache = new Map<string, TokenCacheEntry>();

// Session cache (maps email → cookies)
// Avoids redundant OAuth flows when running multiple tests
const sessionCache = new Map<string, string[]>();

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry

// =============================================================================
// GOOGLE OAUTH2 TOKEN EXCHANGE
// =============================================================================

/**
 * Exchange refresh token for access token
 * ENTERPRISE PATTERN: Token refresh with retry logic and caching
 */
async function getAccessTokenFromRefreshToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  // Check cache first
  const cacheKey = `${refreshToken.substring(0, 20)}...`; // Partial token as key (don't log full token)
  const cached = tokenCache.get(cacheKey);

  if (cached && cached.expires_at > Date.now() + TOKEN_EXPIRY_BUFFER_MS) {
    logger.info('🔄 [REAL-AUTH] Using cached access token', {
      expiresIn: Math.floor((cached.expires_at - Date.now()) / 1000),
    });
    return cached.access_token;
  }

  logger.info('🔄 [REAL-AUTH] Exchanging refresh token for access token');

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Google token exchange failed (${response.status}): ${errorText}`
        );
      }

      const data: GoogleTokenResponse = await response.json();

      // Cache the token
      const expiresAt = Date.now() + data.expires_in * 1000;
      tokenCache.set(cacheKey, {
        access_token: data.access_token,
        expires_at: expiresAt,
      });

      logger.info('✅ [REAL-AUTH] Access token obtained', {
        expiresIn: data.expires_in,
        scope: data.scope,
      });

      return data.access_token;
    } catch (error) {
      lastError = error as Error;
      logger.warn(
        `⚠️ [REAL-AUTH] Token exchange attempt ${attempt}/${maxRetries} failed`,
        {
          error: lastError.message,
        }
      );

      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const backoffMs = Math.pow(2, attempt - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  throw new Error(
    `Failed to exchange refresh token after ${maxRetries} attempts: ${lastError?.message}`
  );
}

// =============================================================================
// BACKEND SESSION CREATION
// =============================================================================

/**
 * Create real backend session using programmatic OAuth endpoint
 * CRITICAL: This creates a real Passport.js session in Redis/Postgres
 */
async function createBackendSession(
  baseUrl: string,
  accessToken: string,
  userProfile: { email: string; name: string }
): Promise<AuthSessionResponse> {
  logger.info('🔐 [REAL-AUTH] Creating backend session', {
    endpoint: `${baseUrl}/api/auth/google/token`,
    email: userProfile.email,
  });

  const response = await fetch(`${baseUrl}/api/auth/google/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      access_token: accessToken,
      profile: userProfile,
    }),
    credentials: 'include', // Include cookies in request/response
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Backend session creation failed (${response.status}): ${errorText}`
    );
  }

  const data: AuthSessionResponse = await response.json();

  if (!data.success) {
    throw new Error(
      `Backend session creation failed: ${data.message || 'Unknown error'}`
    );
  }

  logger.info('✅ [REAL-AUTH] Backend session created', {
    userId: data.user.id,
    email: data.user.email,
    role: data.user.role,
    sessionId: data.sessionId.substring(0, 16) + '...',
  });

  return data;
}

// =============================================================================
// PLAYWRIGHT INTEGRATION
// =============================================================================

/**
 * Setup real backend authentication for a Playwright page
 * ENTERPRISE PATTERN: Real OAuth flow simulation for E2E tests
 *
 * @param page - Playwright page instance
 * @param context - Playwright browser context (for cookie access)
 * @param baseUrl - API base URL (e.g., https://staging.ectropy.ai)
 * @param options - Optional configuration
 * @returns Authenticated user object
 *
 * USAGE:
 * ```typescript
 * import { setupRealAuth } from './fixtures/real-auth.fixture';
 *
 * test('admin demo feature', async ({ page, context }) => {
 *   const user = await setupRealAuth(page, context, 'https://staging.ectropy.ai');
 *   await page.goto('/admin');
 *   // User is now authenticated with real backend session
 * });
 * ```
 *
 * REQUIREMENTS:
 * - TEST_GOOGLE_REFRESH_TOKEN environment variable
 * - GOOGLE_CLIENT_ID environment variable
 * - GOOGLE_CLIENT_SECRET environment variable
 * - Backend must be running and accessible
 */
export async function setupRealAuth(
  page: Page,
  context: BrowserContext,
  baseUrl: string,
  options: {
    email?: string; // Override user email (default from Google profile)
    name?: string; // Override user name
    skipIfCached?: boolean; // Use cached session if available (default: true)
  } = {}
): Promise<AuthenticatedUser> {
  const { skipIfCached = true } = options;

  // Step 1: Validate environment variables
  const refreshToken = process.env.TEST_GOOGLE_REFRESH_TOKEN;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!refreshToken) {
    throw new Error(
      'TEST_GOOGLE_REFRESH_TOKEN environment variable is required for real auth. ' +
        'This should be a long-lived refresh token from Google OAuth2. ' +
        'See: https://developers.google.com/identity/protocols/oauth2#refresh'
    );
  }

  if (!clientId || !clientSecret) {
    throw new Error(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables are required. ' +
        'These should match the OAuth app configured in Google Cloud Console.'
    );
  }

  logger.info('🚀 [REAL-AUTH] Setting up real backend authentication', {
    baseUrl,
    hasRefreshToken: true,
    hasClientCreds: true,
  });

  // Step 2: Exchange refresh token for access token
  const accessToken = await getAccessTokenFromRefreshToken(
    refreshToken,
    clientId,
    clientSecret
  );

  // Step 3: Get user profile from Google
  const userInfoResponse = await fetch(
    'https://www.googleapis.com/oauth2/v2/userinfo',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!userInfoResponse.ok) {
    throw new Error(
      `Failed to fetch user profile from Google (${userInfoResponse.status})`
    );
  }

  const googleProfile = await userInfoResponse.json();
  const userProfile = {
    email: options.email || googleProfile.email,
    name: options.name || googleProfile.name || 'Test User',
  };

  logger.info('👤 [REAL-AUTH] Google profile retrieved', {
    email: userProfile.email,
    name: userProfile.name,
  });

  // Step 4: Check session cache
  const cacheKey = userProfile.email;
  if (skipIfCached && sessionCache.has(cacheKey)) {
    logger.info('🔄 [REAL-AUTH] Using cached session', { email: cacheKey });

    const cookies = sessionCache.get(cacheKey)!;
    await context.addCookies(cookies.map((cookie) => JSON.parse(cookie)));

    // Validate session still works
    const meResponse = await page.request.get(`${baseUrl}/api/auth/me`, {
      headers: {
        Cookie: cookies
          .map((c) => JSON.parse(c).name + '=' + JSON.parse(c).value)
          .join('; '),
      },
    });

    if (meResponse.ok()) {
      const userData = await meResponse.json();
      logger.info('✅ [REAL-AUTH] Cached session valid');
      return userData.user;
    } else {
      logger.warn(
        '⚠️ [REAL-AUTH] Cached session invalid, creating new session'
      );
      sessionCache.delete(cacheKey);
    }
  }

  // Step 5: Create backend session
  const sessionData = await createBackendSession(
    baseUrl,
    accessToken,
    userProfile
  );

  // Step 6: Extract session cookies and add to browser context
  // The backend returns Set-Cookie headers with the session cookie
  // We need to intercept these and add them to the Playwright context

  // Make a request to get the cookies
  const cookieResponse = await page.request.post(
    `${baseUrl}/api/auth/google/token`,
    {
      data: {
        access_token: accessToken,
        profile: userProfile,
      },
    }
  );

  const setCookieHeaders = cookieResponse
    .headersArray()
    .filter((header) => header.name.toLowerCase() === 'set-cookie');

  const cookies = setCookieHeaders.map((header) => {
    const cookieParts = header.value.split(';');
    const [nameValue] = cookieParts;
    const [name, value] = nameValue.split('=');

    // Parse cookie attributes
    const cookie: any = {
      name: name.trim(),
      value: value.trim(),
      domain: new URL(baseUrl).hostname,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax' as const,
    };

    // Parse additional attributes
    for (let i = 1; i < cookieParts.length; i++) {
      const part = cookieParts[i].trim().toLowerCase();
      if (part.startsWith('domain=')) {
        cookie.domain = part.substring(7);
      } else if (part.startsWith('path=')) {
        cookie.path = part.substring(5);
      } else if (part === 'secure') {
        cookie.secure = true;
      } else if (part.startsWith('expires=')) {
        cookie.expires = new Date(part.substring(8)).getTime() / 1000;
      } else if (part.startsWith('max-age=')) {
        const maxAge = parseInt(part.substring(8), 10);
        cookie.expires = Math.floor(Date.now() / 1000) + maxAge;
      }
    }

    return cookie;
  });

  await context.addCookies(cookies);

  // Cache the session
  sessionCache.set(
    cacheKey,
    cookies.map((c) => JSON.stringify(c))
  );

  logger.info('✅ [REAL-AUTH] Real backend authentication complete', {
    userId: sessionData.user.id,
    email: sessionData.user.email,
    role: sessionData.user.role,
    sessionEstablished: true,
  });

  return sessionData.user;
}

/**
 * Clear all cached sessions (useful for tests that need fresh auth)
 */
export function clearSessionCache(): void {
  logger.info('🧹 [REAL-AUTH] Clearing session cache');
  sessionCache.clear();
  tokenCache.clear();
}

/**
 * Logout and destroy backend session
 * ENTERPRISE PATTERN: Proper session cleanup
 */
export async function logout(
  page: Page,
  baseUrl: string,
  email: string
): Promise<void> {
  logger.info('🚪 [REAL-AUTH] Logging out and destroying session', { email });

  try {
    const response = await page.request.post(`${baseUrl}/api/auth/logout`);

    if (response.ok()) {
      logger.info('✅ [REAL-AUTH] Backend session destroyed');
    } else {
      logger.warn('⚠️ [REAL-AUTH] Logout request failed (non-critical)', {
        status: response.status(),
      });
    }
  } catch (error) {
    logger.warn('⚠️ [REAL-AUTH] Logout error (non-critical)', {
      error: (error as Error).message,
    });
  }

  // Clear from cache
  sessionCache.delete(email);
}
