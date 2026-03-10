/**
 * Playwright Authentication Fixtures
 *
 * Provides authenticated page context for E2E tests
 * Mocks OAuth authentication flow without requiring real Google OAuth
 *
 * Usage:
 * ```typescript
 * import { test } from './fixtures/auth.fixture';
 *
 * test('should access protected page', async ({ authenticatedPage, mockUser }) => {
 *   await authenticatedPage.goto('/dashboard');
 *   await expect(authenticatedPage.getByText(mockUser.email)).toBeVisible();
 * });
 * ```
 */

import { test as base, Page, BrowserContext } from '@playwright/test';
import type { User } from '@ectropy/shared/types';

/**
 * Mock user profiles for different roles
 */
export const MOCK_USERS = {
  architect: {
    id: 'user-architect-001',
    email: 'architect@ectropy.test',
    name: 'Test Architect',
    username: 'Test Architect',
    role: 'architect',
    organization: 'Ectropy Test Org',
    provider: 'google',
    active: true,
    createdAt: new Date().toISOString(),
  } as User,
  engineer: {
    id: 'user-engineer-001',
    email: 'engineer@ectropy.test',
    name: 'Test Engineer',
    username: 'Test Engineer',
    role: 'engineer',
    organization: 'Ectropy Test Org',
    provider: 'google',
    active: true,
    createdAt: new Date().toISOString(),
  } as User,
  contractor: {
    id: 'user-contractor-001',
    email: 'contractor@ectropy.test',
    name: 'Test Contractor',
    username: 'Test Contractor',
    role: 'contractor',
    organization: 'Ectropy Test Org',
    provider: 'google',
    active: true,
    createdAt: new Date().toISOString(),
  } as User,
  owner: {
    id: 'user-owner-001',
    email: 'owner@ectropy.test',
    name: 'Test Owner',
    username: 'Test Owner',
    role: 'owner',
    organization: 'Ectropy Test Org',
    provider: 'google',
    active: true,
    createdAt: new Date().toISOString(),
  } as User,
  admin: {
    id: 'user-admin-001',
    email: 'admin@ectropy.test',
    name: 'Test Admin',
    username: 'Test Admin',
    role: 'admin',
    organization: 'Ectropy Test Org',
    provider: 'google',
    active: true,
    createdAt: new Date().toISOString(),
  } as User,
};

interface AuthFixtures {
  /**
   * Authenticated page with mocked OAuth session
   */
  authenticatedPage: Page;

  /**
   * Mock user object (default: contractor)
   */
  mockUser: User;

  /**
   * Create authenticated page with specific role
   */
  createAuthenticatedPage: (role: keyof typeof MOCK_USERS) => Promise<Page>;
}

/**
 * Extended Playwright test with authentication fixtures
 */
export const test = base.extend<AuthFixtures>({
  /**
   * Default mock user (contractor role)
   */
  mockUser: async ({}, use) => {
    await use(MOCK_USERS.contractor);
  },

  /**
   * Factory function to create authenticated pages for different roles
   */
  createAuthenticatedPage: async ({ context }, use) => {
    const createPage = async (role: keyof typeof MOCK_USERS): Promise<Page> => {
      const user = MOCK_USERS[role];
      const page = await context.newPage();

      // Mock the /api/auth/me endpoint to return authenticated user
      await page.route('**/api/auth/me', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
              organization: user.organization,
              provider: user.provider,
            },
            session: {
              expiresAt: new Date(
                Date.now() + 24 * 60 * 60 * 1000
              ).toISOString(), // 24 hours
            },
          }),
        });
      });

      // Set authentication cookies (dynamic domain based on PLAYWRIGHT_BASE_URL)
      const baseURL =
        process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
      const cookieDomain = baseURL.includes('staging.ectropy.ai')
        ? 'staging.ectropy.ai'
        : baseURL.includes('ectropy.ai')
          ? 'ectropy.ai'
          : 'localhost';

      await context.addCookies([
        {
          name: 'oauth_session',
          value: `mock_session_${user.role}_${Date.now()}`,
          domain: cookieDomain,
          path: '/',
          httpOnly: true,
          sameSite: 'Lax',
          expires: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
        },
      ]);

      return page;
    };

    await use(createPage);
  },

  /**
   * Default authenticated page (contractor role)
   */
  authenticatedPage: async ({ createAuthenticatedPage }, use) => {
    const page = await createAuthenticatedPage('contractor');
    await use(page);
    await page.close();
  },
});

/**
 * Helper function to setup authentication for a specific role
 *
 * @param page - Playwright page object
 * @param role - User role to mock
 */
export async function setupAuthForRole(
  page: Page,
  role: keyof typeof MOCK_USERS
): Promise<User> {
  const user = MOCK_USERS[role];

  // Mock the /api/auth/me endpoint
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organization: user.organization,
          provider: user.provider,
        },
        session: {
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
      }),
    });
  });

  // Set authentication cookie (dynamic domain based on PLAYWRIGHT_BASE_URL)
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
  const cookieDomain = baseURL.includes('staging.ectropy.ai')
    ? 'staging.ectropy.ai'
    : baseURL.includes('ectropy.ai')
      ? 'ectropy.ai'
      : 'localhost';

  await page.context().addCookies([
    {
      name: 'oauth_session',
      value: `mock_session_${user.role}_${Date.now()}`,
      domain: cookieDomain,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      expires: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    },
  ]);

  return user;
}

/**
 * Helper function to mock unauthenticated state
 *
 * @param page - Playwright page object
 */
export async function setupUnauthenticated(page: Page): Promise<void> {
  // Mock the /api/auth/me endpoint to return 401
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'Not authenticated',
        message: 'Please sign in to access this resource',
      }),
    });
  });

  // Clear authentication cookies
  await page.context().clearCookies();
}

/**
 * Helper to verify authentication state in tests
 */
export async function verifyAuthenticated(
  page: Page,
  expectedUser: User
): Promise<void> {
  // Check if user info endpoint returns correct data
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
  const response = await page.request.get(`${baseURL}/api/auth/me`);
  const data = await response.json();

  if (!data.user || data.user.id !== expectedUser.id) {
    throw new Error(
      `Authentication verification failed: Expected user ${expectedUser.id}, got ${data.user?.id}`
    );
  }
}

export { expect } from '@playwright/test';

// =============================================================================
// REAL BACKEND AUTHENTICATION (ENTERPRISE PATTERN)
// =============================================================================

/**
 * Re-export real authentication functions for enterprise E2E testing
 * These create actual backend sessions instead of mocking
 *
 * Usage:
 * ```typescript
 * import { setupRealAuth } from './fixtures/auth.fixture';
 *
 * test('admin feature', async ({ page, context }) => {
 *   // Creates real backend session via /api/auth/google/token
 *   const user = await setupRealAuth(page, context, 'https://staging.ectropy.ai');
 *   await page.goto('/admin');
 *   // Backend req.user is properly populated (no 401/403 errors)
 * });
 * ```
 *
 * Requires environment variables:
 * - TEST_GOOGLE_REFRESH_TOKEN
 * - GOOGLE_CLIENT_ID
 * - GOOGLE_CLIENT_SECRET
 */
export { setupRealAuth, clearSessionCache, logout } from './real-auth.fixture';
