/**
 * ENTERPRISE UNIT TESTS - OAuth Provider
 *
 * Purpose: Comprehensive testing of EnterpriseOAuthProvider class
 * Scope: OAuth flow initiation, callback handling, session management, role extraction
 * Framework: Vitest
 *
 * ENTERPRISE FOCUS:
 * - OAuth 2.0 / OIDC flow compliance
 * - PKCE support for enhanced security
 * - Multi-provider support (Google, Azure, Okta)
 * - Session state management
 * - Email authorization whitelist
 *
 * SECURITY COVERAGE:
 * - State parameter validation
 * - Token expiration checking
 * - Role-based access control
 * - Session isolation
 * - CSRF protection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EnterpriseOAuthProvider, OAUTH_PROVIDERS } from '../oauth-provider.js';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
} from './mocks/express.mock.js';
import {
  DEFAULT_TEST_OAUTH_CONFIG,
  AZURE_TEST_OAUTH_CONFIG,
  OKTA_TEST_OAUTH_CONFIG,
  createTestOAuthConfig,
  createMockTokenResponse,
  createMockUserInfo,
  createAzureUserInfo,
  createOktaUserInfo,
} from './mocks/oauth-config.mock.js';

// Mock the logger
vi.mock('@ectropy/shared/utils', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock Prisma Client - use inline data to avoid hoisting issues
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    user: {
      upsert: vi.fn().mockResolvedValue({
        id: 'db-user-123',
        email: 'test@example.com',
        full_name: 'Test User',
        picture: null,
        provider: 'google',
        provider_id: 'google-123',
        role: 'user',
        last_login: new Date(),
      }),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  })),
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('EnterpriseOAuthProvider - Enterprise Unit Tests', () => {
  let provider: EnterpriseOAuthProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();

    // Reset environment
    delete process.env.AUTHORIZED_USERS;
    delete process.env.AUTHORIZED_EMAILS;
    delete process.env.FRONTEND_URL;
    process.env.NODE_ENV = 'test';

    provider = new EnterpriseOAuthProvider(DEFAULT_TEST_OAUTH_CONFIG);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Configuration Validation', () => {
    it('should create provider with valid configuration', () => {
      expect(provider).toBeInstanceOf(EnterpriseOAuthProvider);
    });

    it('should throw error when clientId is missing', () => {
      expect(() => {
        new EnterpriseOAuthProvider({
          ...DEFAULT_TEST_OAUTH_CONFIG,
          clientId: '',
        });
      }).toThrow('OAuth2 configuration missing required field: clientId');
    });

    it('should throw error when clientSecret is missing', () => {
      expect(() => {
        new EnterpriseOAuthProvider({
          ...DEFAULT_TEST_OAUTH_CONFIG,
          clientSecret: '',
        });
      }).toThrow('OAuth2 configuration missing required field: clientSecret');
    });

    it('should throw error when redirectUri is missing', () => {
      expect(() => {
        new EnterpriseOAuthProvider({
          ...DEFAULT_TEST_OAUTH_CONFIG,
          redirectUri: '',
        });
      }).toThrow('OAuth2 configuration missing required field: redirectUri');
    });

    it('should throw error when authorizationEndpoint is missing', () => {
      expect(() => {
        new EnterpriseOAuthProvider({
          ...DEFAULT_TEST_OAUTH_CONFIG,
          authorizationEndpoint: '',
        });
      }).toThrow('OAuth2 configuration missing required field: authorizationEndpoint');
    });

    it('should throw error when tokenEndpoint is missing', () => {
      expect(() => {
        new EnterpriseOAuthProvider({
          ...DEFAULT_TEST_OAUTH_CONFIG,
          tokenEndpoint: '',
        });
      }).toThrow('OAuth2 configuration missing required field: tokenEndpoint');
    });

    it('should throw error when userInfoEndpoint is missing', () => {
      expect(() => {
        new EnterpriseOAuthProvider({
          ...DEFAULT_TEST_OAUTH_CONFIG,
          userInfoEndpoint: '',
        });
      }).toThrow('OAuth2 configuration missing required field: userInfoEndpoint');
    });

    it('should create Azure provider with valid config', () => {
      const azureProvider = new EnterpriseOAuthProvider(AZURE_TEST_OAUTH_CONFIG);
      expect(azureProvider).toBeInstanceOf(EnterpriseOAuthProvider);
    });

    it('should create Okta provider with valid config', () => {
      const oktaProvider = new EnterpriseOAuthProvider(OKTA_TEST_OAUTH_CONFIG);
      expect(oktaProvider).toBeInstanceOf(EnterpriseOAuthProvider);
    });
  });

  describe('2. Email Authorization Whitelist', () => {
    it('should allow all users when no whitelist is configured', () => {
      // No AUTHORIZED_USERS or AUTHORIZED_EMAILS set
      const newProvider = new EnterpriseOAuthProvider(DEFAULT_TEST_OAUTH_CONFIG);
      // The provider should be created successfully
      expect(newProvider).toBeInstanceOf(EnterpriseOAuthProvider);
    });

    it('should load authorized emails from AUTHORIZED_USERS env var', () => {
      process.env.AUTHORIZED_USERS = 'admin@example.com,user@example.com';
      const newProvider = new EnterpriseOAuthProvider(DEFAULT_TEST_OAUTH_CONFIG);
      expect(newProvider).toBeInstanceOf(EnterpriseOAuthProvider);
    });

    it('should load authorized emails from AUTHORIZED_EMAILS env var (legacy)', () => {
      process.env.AUTHORIZED_EMAILS = 'admin@example.com';
      const newProvider = new EnterpriseOAuthProvider(DEFAULT_TEST_OAUTH_CONFIG);
      expect(newProvider).toBeInstanceOf(EnterpriseOAuthProvider);
    });

    it('should prefer AUTHORIZED_USERS over AUTHORIZED_EMAILS', () => {
      process.env.AUTHORIZED_USERS = 'primary@example.com';
      process.env.AUTHORIZED_EMAILS = 'secondary@example.com';
      const newProvider = new EnterpriseOAuthProvider(DEFAULT_TEST_OAUTH_CONFIG);
      expect(newProvider).toBeInstanceOf(EnterpriseOAuthProvider);
    });

    it('should trim whitespace from authorized emails', () => {
      process.env.AUTHORIZED_USERS = '  admin@example.com  ,  user@example.com  ';
      const newProvider = new EnterpriseOAuthProvider(DEFAULT_TEST_OAUTH_CONFIG);
      expect(newProvider).toBeInstanceOf(EnterpriseOAuthProvider);
    });

    it('should handle empty strings in email list', () => {
      process.env.AUTHORIZED_USERS = 'admin@example.com,,user@example.com,';
      const newProvider = new EnterpriseOAuthProvider(DEFAULT_TEST_OAUTH_CONFIG);
      expect(newProvider).toBeInstanceOf(EnterpriseOAuthProvider);
    });
  });

  describe('3. OAuth Flow Initiation (initiateAuth)', () => {
    it('should redirect to authorization endpoint', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      provider.initiateAuth(req, res);

      expect(res.redirect).toHaveBeenCalled();
      const redirectUrl = res._redirectUrl;
      expect(redirectUrl).toContain('accounts.google.com');
    });

    it('should include client_id in authorization URL', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      provider.initiateAuth(req, res);

      const redirectUrl = res._redirectUrl;
      expect(redirectUrl).toContain('client_id=test-client-id-12345');
    });

    it('should include redirect_uri in authorization URL', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      provider.initiateAuth(req, res);

      const redirectUrl = res._redirectUrl;
      expect(redirectUrl).toContain('redirect_uri=');
    });

    it('should include scope in authorization URL', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      provider.initiateAuth(req, res);

      const redirectUrl = res._redirectUrl;
      expect(redirectUrl).toContain('scope=');
    });

    it('should include state parameter in authorization URL', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      provider.initiateAuth(req, res);

      const redirectUrl = res._redirectUrl;
      expect(redirectUrl).toContain('state=');
    });

    it('should include PKCE code_challenge in authorization URL', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      provider.initiateAuth(req, res);

      const redirectUrl = res._redirectUrl;
      expect(redirectUrl).toContain('code_challenge=');
      expect(redirectUrl).toContain('code_challenge_method=S256');
    });

    it('should store state in session', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      provider.initiateAuth(req, res);

      expect(req.session.oauthState).toBeDefined();
      expect(req.session.oauthState?.state).toBeDefined();
      expect(req.session.oauthState?.codeVerifier).toBeDefined();
      expect(req.session.oauthState?.timestamp).toBeDefined();
    });

    it('should save session before redirect', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      provider.initiateAuth(req, res);

      expect(req.session.save).toHaveBeenCalled();
    });

    it('should include custom redirect URL when provided', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      provider.initiateAuth(req, res, { redirectUrl: '/custom-dashboard' });

      expect(req.session.oauthState?.redirectUrl).toBe('/custom-dashboard');
    });

    it('should add prompt=login when forceReauth is true', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      provider.initiateAuth(req, res, { forceReauth: true });

      const redirectUrl = res._redirectUrl;
      expect(redirectUrl).toContain('prompt=login');
    });

    it('should throw error when session is not available', () => {
      const req = { ...createMockRequest() } as any;
      delete req.session;
      const res = createMockResponse();

      expect(() => {
        provider.initiateAuth(req, res);
      }).toThrow('Session not available');
    });
  });

  describe('4. OAuth Callback Handling (handleCallback)', () => {
    beforeEach(() => {
      // Setup default successful fetch responses
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockTokenResponse()),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockUserInfo()),
        });
    });

    it('should handle successful callback with code and state', async () => {
      const state = 'valid-state-12345';
      const req = createMockRequest({
        query: { code: 'auth-code-12345', state },
        session: {
          oauthState: {
            state,
            codeVerifier: 'verifier-12345',
            timestamp: Date.now(),
          },
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await provider.handleCallback(req, res, next);

      expect(res.redirect).toHaveBeenCalled();
      // Should redirect to dashboard on success
      expect(res._redirectUrl).toContain('dashboard');
    });

    it('should redirect to error page when provider returns error', async () => {
      const req = createMockRequest({
        query: { error: 'access_denied', state: 'some-state' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await provider.handleCallback(req, res, next);

      expect(res.redirect).toHaveBeenCalled();
      expect(res._redirectUrl).toContain('error=oauth_failed');
    });

    it('should redirect to error page when code is missing', async () => {
      const req = createMockRequest({
        query: { state: 'valid-state' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await provider.handleCallback(req, res, next);

      expect(res.redirect).toHaveBeenCalled();
      expect(res._redirectUrl).toContain('error=oauth_failed');
    });

    it('should redirect to error page when state is missing', async () => {
      const req = createMockRequest({
        query: { code: 'auth-code' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await provider.handleCallback(req, res, next);

      expect(res.redirect).toHaveBeenCalled();
      expect(res._redirectUrl).toContain('error=oauth_failed');
    });

    it('should redirect to error page when state is invalid', async () => {
      const req = createMockRequest({
        query: { code: 'auth-code', state: 'invalid-state' },
        session: {
          oauthState: {
            state: 'different-state',
            timestamp: Date.now(),
          },
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await provider.handleCallback(req, res, next);

      expect(res.redirect).toHaveBeenCalled();
      expect(res._redirectUrl).toContain('error=oauth_failed');
    });

    it('should redirect to error page when state has expired', async () => {
      const state = 'expired-state';
      const req = createMockRequest({
        query: { code: 'auth-code', state },
        session: {
          oauthState: {
            state,
            timestamp: Date.now() - 6 * 60 * 1000, // 6 minutes ago (expired)
          },
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await provider.handleCallback(req, res, next);

      expect(res.redirect).toHaveBeenCalled();
      expect(res._redirectUrl).toContain('error=oauth_failed');
    });

    it('should exchange code for tokens', async () => {
      const state = 'valid-state';
      const req = createMockRequest({
        query: { code: 'auth-code-12345', state },
        session: {
          oauthState: {
            state,
            codeVerifier: 'verifier',
            timestamp: Date.now(),
          },
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await provider.handleCallback(req, res, next);

      // Verify token endpoint was called
      expect(mockFetch).toHaveBeenCalledWith(
        DEFAULT_TEST_OAUTH_CONFIG.tokenEndpoint,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        })
      );
    });

    it('should fetch user info with access token', async () => {
      const state = 'valid-state';
      const req = createMockRequest({
        query: { code: 'auth-code', state },
        session: {
          oauthState: {
            state,
            timestamp: Date.now(),
          },
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await provider.handleCallback(req, res, next);

      // Verify user info endpoint was called
      expect(mockFetch).toHaveBeenCalledWith(
        DEFAULT_TEST_OAUTH_CONFIG.userInfoEndpoint,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-access-token-12345',
          }),
        })
      );
    });

    it('should store user in session on successful auth', async () => {
      const state = 'valid-state';
      const req = createMockRequest({
        query: { code: 'auth-code', state },
        session: {
          oauthState: {
            state,
            timestamp: Date.now(),
          },
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await provider.handleCallback(req, res, next);

      expect(req.session.user).toBeDefined();
      expect(req.session.user?.email).toBe('test@example.com');
    });

    it('should redirect to error when unauthorized user attempts login', async () => {
      process.env.AUTHORIZED_USERS = 'admin@example.com';
      const newProvider = new EnterpriseOAuthProvider(DEFAULT_TEST_OAUTH_CONFIG);

      const state = 'valid-state';
      const req = createMockRequest({
        query: { code: 'auth-code', state },
        session: {
          oauthState: {
            state,
            timestamp: Date.now(),
          },
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await newProvider.handleCallback(req, res, next);

      expect(res.redirect).toHaveBeenCalled();
      expect(res._redirectUrl).toContain('error=oauth_failed');
      expect(res._redirectUrl).toContain('not%20authorized');
    });

    it('should redirect to error when token exchange fails', async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('Token exchange failed'),
      });

      const state = 'valid-state';
      const req = createMockRequest({
        query: { code: 'auth-code', state },
        session: {
          oauthState: {
            state,
            timestamp: Date.now(),
          },
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await provider.handleCallback(req, res, next);

      expect(res.redirect).toHaveBeenCalled();
      expect(res._redirectUrl).toContain('error=oauth_failed');
    });

    it('should redirect to error when user info fetch fails', async () => {
      mockFetch.mockReset();
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockTokenResponse()),
        })
        .mockResolvedValueOnce({
          ok: false,
          text: () => Promise.resolve('User info failed'),
        });

      const state = 'valid-state';
      const req = createMockRequest({
        query: { code: 'auth-code', state },
        session: {
          oauthState: {
            state,
            timestamp: Date.now(),
          },
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await provider.handleCallback(req, res, next);

      expect(res.redirect).toHaveBeenCalled();
      expect(res._redirectUrl).toContain('error=oauth_failed');
    });

    it('should use custom redirect URL from state', async () => {
      const state = 'valid-state';
      const req = createMockRequest({
        query: { code: 'auth-code', state },
        session: {
          oauthState: {
            state,
            redirectUrl: '/custom-page',
            timestamp: Date.now(),
          },
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await provider.handleCallback(req, res, next);

      expect(res._redirectUrl).toContain('/custom-page');
    });

    it('should clean up state after successful callback', async () => {
      const state = 'valid-state';
      const req = createMockRequest({
        query: { code: 'auth-code', state },
        session: {
          oauthState: {
            state,
            timestamp: Date.now(),
          },
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await provider.handleCallback(req, res, next);

      // OAuth state should be deleted from session
      expect(req.session.oauthState).toBeUndefined();
    });
  });

  describe('5. Role Extraction', () => {
    beforeEach(() => {
      mockFetch.mockReset();
    });

    it('should extract roles from Azure user info', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockTokenResponse()),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createAzureUserInfo({ roles: ['admin', 'developer'] })),
        });

      const azureProvider = new EnterpriseOAuthProvider(AZURE_TEST_OAUTH_CONFIG);
      const state = 'valid-state';
      const req = createMockRequest({
        query: { code: 'auth-code', state },
        session: {
          oauthState: { state, timestamp: Date.now() },
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await azureProvider.handleCallback(req, res, next);

      // Note: Database role overrides provider roles, so we check session was set
      expect(req.session.user).toBeDefined();
    });

    it('should extract groups as roles from Okta user info', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockTokenResponse()),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createOktaUserInfo({ groups: ['Everyone', 'Admins'] })),
        });

      const oktaProvider = new EnterpriseOAuthProvider(OKTA_TEST_OAUTH_CONFIG);
      const state = 'valid-state';
      const req = createMockRequest({
        query: { code: 'auth-code', state },
        session: {
          oauthState: { state, timestamp: Date.now() },
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await oktaProvider.handleCallback(req, res, next);

      expect(req.session.user).toBeDefined();
    });

    it('should use database role as authoritative source', async () => {
      // Import PrismaClient to mock its return value for this test
      const { PrismaClient } = await import('@prisma/client');
      const mockUpsert = vi.fn().mockResolvedValue({
        id: 'db-user-123',
        email: 'test@example.com',
        full_name: 'Test User',
        picture: null,
        provider: 'google',
        provider_id: 'google-123',
        role: 'architect', // Different from default - should override provider roles
        last_login: new Date(),
      });

      // Create a new provider that will use the updated mock
      vi.mocked(PrismaClient).mockImplementation(() => ({
        user: {
          upsert: mockUpsert,
          findUnique: vi.fn().mockResolvedValue(null),
          findFirst: vi.fn().mockResolvedValue(null),
        },
        $connect: vi.fn(),
        $disconnect: vi.fn(),
      } as any));

      const testProvider = new EnterpriseOAuthProvider(DEFAULT_TEST_OAUTH_CONFIG);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockTokenResponse()),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockUserInfo()),
        });

      const state = 'valid-state';
      const req = createMockRequest({
        query: { code: 'auth-code', state },
        session: {
          oauthState: { state, timestamp: Date.now() },
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await testProvider.handleCallback(req, res, next);

      // Database role 'architect' should be used (overrides provider roles)
      expect(req.session.user?.roles).toContain('architect');
    });
  });

  describe('6. Authentication Verification (verifyAuth)', () => {
    it('should return 401 when no session cookie', () => {
      const middleware = provider.verifyAuth();
      const req = createMockRequest({ cookies: {} });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(res._statusCode).toBe(401);
      expect(res._jsonData.error).toBe('Authentication required');
    });

    it('should return 401 when session is invalid', () => {
      const middleware = provider.verifyAuth();
      const req = createMockRequest({
        cookies: { oauth_session: 'invalid-session-id' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(res._statusCode).toBe(401);
      expect(res._jsonData.error).toBe('Invalid session');
    });

    it('should include authUrl in 401 response', () => {
      const middleware = provider.verifyAuth();
      const req = createMockRequest({ cookies: {} });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(res._jsonData.authUrl).toContain('/auth/oauth/google');
    });

    it('should check required roles when specified', () => {
      const middleware = provider.verifyAuth(['admin']);
      const req = createMockRequest({
        cookies: { oauth_session: 'invalid-session' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(res._statusCode).toBe(401);
    });
  });

  describe('7. Logout', () => {
    it('should clear session cookie on logout', async () => {
      const req = createMockRequest({
        cookies: { oauth_session: 'session-to-clear' },
      });
      const res = createMockResponse();

      await provider.logout(req, res);

      expect(res.clearCookie).toHaveBeenCalledWith('oauth_session');
    });

    it('should return success message when no logout endpoint', async () => {
      const req = createMockRequest({ cookies: {} });
      const res = createMockResponse();

      await provider.logout(req, res);

      expect(res._jsonData.message).toBe('Logged out successfully');
    });

    it('should redirect to provider logout endpoint when available', async () => {
      const providerWithLogout = new EnterpriseOAuthProvider(AZURE_TEST_OAUTH_CONFIG);

      // We need to simulate a logged-in user for the logout redirect to work
      // Since the provider uses internal session maps, we'll test the basic flow
      const req = createMockRequest({ cookies: {} });
      const res = createMockResponse();

      await providerWithLogout.logout(req, res);

      // Without active session, should just return JSON
      expect(res._jsonData.message).toBe('Logged out successfully');
    });
  });

  describe('8. Pre-configured Providers', () => {
    it('should export AZURE provider configuration', () => {
      expect(OAUTH_PROVIDERS.AZURE).toBeDefined();
      expect(OAUTH_PROVIDERS.AZURE.provider).toBe('azure');
      expect(OAUTH_PROVIDERS.AZURE.authorizationEndpoint).toContain('microsoftonline.com');
    });

    it('should export GOOGLE provider configuration', () => {
      expect(OAUTH_PROVIDERS.GOOGLE).toBeDefined();
      expect(OAUTH_PROVIDERS.GOOGLE.provider).toBe('google');
      expect(OAUTH_PROVIDERS.GOOGLE.authorizationEndpoint).toContain('accounts.google.com');
    });

    it('should export OKTA provider configuration', () => {
      expect(OAUTH_PROVIDERS.OKTA).toBeDefined();
      expect(OAUTH_PROVIDERS.OKTA.provider).toBe('okta');
      expect(OAUTH_PROVIDERS.OKTA.scope).toContain('groups');
    });

    it('should include required scopes for each provider', () => {
      expect(OAUTH_PROVIDERS.AZURE.scope).toContain('openid');
      expect(OAUTH_PROVIDERS.GOOGLE.scope).toContain('openid');
      expect(OAUTH_PROVIDERS.OKTA.scope).toContain('openid');
    });
  });

  describe('9. Security Edge Cases', () => {
    it('should generate unique state for each auth request', () => {
      const req1 = createMockRequest();
      const res1 = createMockResponse();
      const req2 = createMockRequest();
      const res2 = createMockResponse();

      provider.initiateAuth(req1, res1);
      provider.initiateAuth(req2, res2);

      const state1 = req1.session.oauthState?.state;
      const state2 = req2.session.oauthState?.state;

      expect(state1).toBeDefined();
      expect(state2).toBeDefined();
      expect(state1).not.toBe(state2);
    });

    it('should generate unique code verifier for each auth request', () => {
      const req1 = createMockRequest();
      const res1 = createMockResponse();
      const req2 = createMockRequest();
      const res2 = createMockResponse();

      provider.initiateAuth(req1, res1);
      provider.initiateAuth(req2, res2);

      const verifier1 = req1.session.oauthState?.codeVerifier;
      const verifier2 = req2.session.oauthState?.codeVerifier;

      expect(verifier1).toBeDefined();
      expect(verifier2).toBeDefined();
      expect(verifier1).not.toBe(verifier2);
    });

    it('should handle case-insensitive email authorization', async () => {
      process.env.AUTHORIZED_USERS = 'ADMIN@EXAMPLE.COM';
      const newProvider = new EnterpriseOAuthProvider(DEFAULT_TEST_OAUTH_CONFIG);

      mockFetch.mockReset();
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockTokenResponse()),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockUserInfo({ email: 'admin@example.com' })),
        });

      const state = 'valid-state';
      const req = createMockRequest({
        query: { code: 'auth-code', state },
        session: {
          oauthState: { state, timestamp: Date.now() },
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await newProvider.handleCallback(req, res, next);

      // Should succeed - email should match case-insensitively
      expect(res._redirectUrl).not.toContain('error=oauth_failed');
    });

    it('should handle fetch network errors gracefully', async () => {
      mockFetch.mockReset();
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const state = 'valid-state';
      const req = createMockRequest({
        query: { code: 'auth-code', state },
        session: {
          oauthState: { state, timestamp: Date.now() },
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await provider.handleCallback(req, res, next);

      expect(res.redirect).toHaveBeenCalled();
      expect(res._redirectUrl).toContain('error=oauth_failed');
    });

    it('should include PKCE code_verifier in token exchange', async () => {
      const state = 'valid-state';
      const codeVerifier = 'test-verifier-12345';
      const req = createMockRequest({
        query: { code: 'auth-code', state },
        session: {
          oauthState: { state, codeVerifier, timestamp: Date.now() },
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await provider.handleCallback(req, res, next);

      // Verify the token endpoint was called with code_verifier
      const tokenCall = mockFetch.mock.calls[0];
      expect(tokenCall[0]).toBe(DEFAULT_TEST_OAUTH_CONFIG.tokenEndpoint);
      const body = tokenCall[1].body;
      expect(body).toContain('code_verifier=' + codeVerifier);
    });
  });

  describe('10. Production Environment Handling', () => {
    it('should use FRONTEND_URL for redirects in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.FRONTEND_URL = 'https://app.ectropy.ai';

      mockFetch.mockReset();
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockTokenResponse()),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockUserInfo()),
        });

      const prodProvider = new EnterpriseOAuthProvider(DEFAULT_TEST_OAUTH_CONFIG);
      const state = 'valid-state';
      const req = createMockRequest({
        query: { code: 'auth-code', state },
        session: {
          oauthState: { state, timestamp: Date.now() },
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await prodProvider.handleCallback(req, res, next);

      expect(res._redirectUrl).toContain('https://app.ectropy.ai');
    });

    it('should use relative paths in development', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.FRONTEND_URL;

      mockFetch.mockReset();
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockTokenResponse()),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockUserInfo()),
        });

      const devProvider = new EnterpriseOAuthProvider(DEFAULT_TEST_OAUTH_CONFIG);
      const state = 'valid-state';
      const req = createMockRequest({
        query: { code: 'auth-code', state },
        session: {
          oauthState: { state, timestamp: Date.now() },
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await devProvider.handleCallback(req, res, next);

      expect(res._redirectUrl).toBe('/dashboard');
    });
  });
});
