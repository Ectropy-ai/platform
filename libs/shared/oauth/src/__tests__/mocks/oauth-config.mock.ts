/**
 * ENTERPRISE MOCK - OAuth Configuration
 *
 * Purpose: Test configurations for OAuth providers
 * Pattern: Factory functions for different test scenarios
 */

import type { OAuthConfig } from '../../oauth-provider.js';

/**
 * Default test OAuth configuration (Google provider)
 */
export const DEFAULT_TEST_OAUTH_CONFIG: OAuthConfig = {
  provider: 'google',
  clientId: 'test-client-id-12345',
  clientSecret: 'test-client-secret-67890',
  redirectUri: 'http://localhost:3001/api/auth/google/callback',
  scope: ['openid', 'profile', 'email'],
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  userInfoEndpoint: 'https://www.googleapis.com/oauth2/v2/userinfo',
};

/**
 * Azure/Microsoft provider configuration
 */
export const AZURE_TEST_OAUTH_CONFIG: OAuthConfig = {
  provider: 'azure',
  clientId: 'azure-client-id-12345',
  clientSecret: 'azure-client-secret-67890',
  redirectUri: 'http://localhost:3001/api/auth/azure/callback',
  scope: ['openid', 'profile', 'email', 'User.Read'],
  authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  userInfoEndpoint: 'https://graph.microsoft.com/v1.0/me',
  logoutEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/logout',
};

/**
 * Okta provider configuration
 */
export const OKTA_TEST_OAUTH_CONFIG: OAuthConfig = {
  provider: 'okta',
  clientId: 'okta-client-id-12345',
  clientSecret: 'okta-client-secret-67890',
  redirectUri: 'http://localhost:3001/api/auth/okta/callback',
  scope: ['openid', 'profile', 'email', 'groups'],
  issuer: 'https://dev-12345.okta.com/oauth2/default',
  authorizationEndpoint: 'https://dev-12345.okta.com/oauth2/default/v1/authorize',
  tokenEndpoint: 'https://dev-12345.okta.com/oauth2/default/v1/token',
  userInfoEndpoint: 'https://dev-12345.okta.com/oauth2/default/v1/userinfo',
  jwksUri: 'https://dev-12345.okta.com/oauth2/default/v1/keys',
};

/**
 * Create test OAuth configuration with overrides
 */
export function createTestOAuthConfig(
  overrides: Partial<OAuthConfig> = {}
): OAuthConfig {
  return {
    ...DEFAULT_TEST_OAUTH_CONFIG,
    ...overrides,
  };
}

/**
 * Create invalid OAuth configuration (missing required fields)
 */
export function createInvalidOAuthConfig(): Partial<OAuthConfig> {
  return {
    provider: 'google',
    clientId: 'test-client-id',
    // Missing: clientSecret, redirectUri, endpoints
  };
}

/**
 * Mock token response from OAuth provider
 */
export interface MockTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
}

export function createMockTokenResponse(
  overrides: Partial<MockTokenResponse> = {}
): MockTokenResponse {
  return {
    access_token: 'mock-access-token-12345',
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token: 'mock-refresh-token-67890',
    ...overrides,
  };
}

/**
 * Mock user info response from OAuth provider
 */
export interface MockUserInfo {
  sub?: string;
  id?: string;
  email: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email_verified?: boolean;
  locale?: string;
  // Provider-specific fields
  roles?: string[];
  groups?: string[];
  organization?: string;
  company?: string;
  department?: string;
}

export function createMockUserInfo(
  overrides: Partial<MockUserInfo> = {}
): MockUserInfo {
  return {
    sub: 'google-user-id-12345',
    email: 'test@example.com',
    name: 'Test User',
    given_name: 'Test',
    family_name: 'User',
    picture: 'https://example.com/photo.jpg',
    email_verified: true,
    locale: 'en',
    ...overrides,
  };
}

/**
 * Create Azure-specific user info (uses different fields)
 */
export function createAzureUserInfo(
  overrides: Partial<MockUserInfo> = {}
): MockUserInfo {
  return {
    id: 'azure-user-id-12345',
    email: 'test@contoso.com',
    name: 'Test User',
    given_name: 'Test',
    family_name: 'User',
    roles: ['admin', 'user'],
    organization: 'Contoso',
    department: 'Engineering',
    ...overrides,
  };
}

/**
 * Create Okta-specific user info (uses groups)
 */
export function createOktaUserInfo(
  overrides: Partial<MockUserInfo> = {}
): MockUserInfo {
  return {
    sub: 'okta-user-id-12345',
    email: 'test@company.com',
    name: 'Test User',
    given_name: 'Test',
    family_name: 'User',
    groups: ['Everyone', 'Developers', 'Admins'],
    ...overrides,
  };
}
