/**
 * OAuth Public Routes Test
 * Verifies that OAuth initiation endpoints are publicly accessible
 * and protected endpoints still require authentication
 */

import { AuthenticationMiddleware } from '../src/middleware/auth.middleware';

describe('OAuth Public Routes', () => {
  let authMiddleware: AuthenticationMiddleware;

  beforeAll(() => {
    // ENTERPRISE: Set required environment variables for AuthenticationMiddleware
    // REDIS_URL required by middleware constructor for session storage validation
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.SESSION_SECRET = 'test-session-secret-minimum-32-chars';
    process.env.NODE_ENV = 'test';

    authMiddleware = new AuthenticationMiddleware();
  });

  describe('publicRoutes configuration', () => {
    test('should include /api/auth/google in public routes', () => {
      expect(authMiddleware.publicRoutes).toContain('/api/auth/google');
    });

    test('should include /api/auth/github in public routes', () => {
      expect(authMiddleware.publicRoutes).toContain('/api/auth/github');
    });

    test('should include /api/auth/google/callback in public routes', () => {
      expect(authMiddleware.publicRoutes).toContain(
        '/api/auth/google/callback'
      );
    });

    test('should include /api/auth/github/callback in public routes', () => {
      expect(authMiddleware.publicRoutes).toContain(
        '/api/auth/github/callback'
      );
    });

    test('should include /health in public routes', () => {
      expect(authMiddleware.publicRoutes).toContain('/health');
    });

    test('should include /api/health in public routes', () => {
      expect(authMiddleware.publicRoutes).toContain('/api/health');
    });
  });

  describe('protected routes configuration', () => {
    test('should protect /api/* routes', () => {
      expect(authMiddleware.protectedRoutes).toContain('/api/*');
    });

    test('should protect /admin/* routes', () => {
      expect(authMiddleware.protectedRoutes).toContain('/admin/*');
    });

    test('should protect /dashboard/* routes', () => {
      expect(authMiddleware.protectedRoutes).toContain('/dashboard/*');
    });

    test('should protect /monitor/* routes', () => {
      expect(authMiddleware.protectedRoutes).toContain('/monitor/*');
    });
  });

  describe('OAuth route requirements', () => {
    test('OAuth initiation endpoints should NOT require authentication', () => {
      const publicRoutes = authMiddleware.publicRoutes;

      // These are the OAuth initiation endpoints that MUST be public
      const requiredPublicRoutes = [
        '/api/auth/google',
        '/api/auth/github',
        '/api/auth/google/callback',
        '/api/auth/github/callback',
        '/api/auth/login',
      ];

      requiredPublicRoutes.forEach((route) => {
        expect(publicRoutes).toContain(route);
      });
    });

    test('Auth management endpoints should be accessible without authentication middleware', () => {
      // /api/auth/me and /api/auth/logout are handled by their own route handlers
      // They should NOT be in protectedRoutes as they handle auth internally
      const protectedRoutes = authMiddleware.protectedRoutes;

      // These routes should NOT force global auth middleware
      expect(protectedRoutes).not.toContain('/api/auth/me');
      expect(protectedRoutes).not.toContain('/api/auth/logout');
    });
  });
});
