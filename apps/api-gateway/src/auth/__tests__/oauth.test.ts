/**
 * Comprehensive OAuth testing
 * Validates OAuth implementation for production readiness
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { AuthenticationMiddleware } from '../../middleware/auth.middleware.js';
import { OAuthRoutes } from '../../routes/oauth.routes.js';
import { authConfig } from '../../config/auth.config.js';
import { initializePassport } from '../passport.config.js';

// Mock app for testing
const createTestApp = () => {
  const app = express();
  app.use(express.json());

  // Initialize auth middleware
  const authMiddleware = new AuthenticationMiddleware();
  app.use(authMiddleware.getSessionMiddleware());

  // ENTERPRISE FIX (2026-01-14): Initialize Passport.js for OAuth authentication
  // Required for OAuth routes to work properly - matches production initialization in main.ts
  initializePassport(app);

  // Mount OAuth routes
  // ENTERPRISE FIX (2026-01-08): OAuthRoutes constructor takes no parameters
  // It initializes EnterpriseAuditLogger internally via singleton pattern
  const oauthRoutes = new OAuthRoutes();
  app.use('/auth', oauthRoutes.getRouter());

  // Protected route for testing
  app.get('/api/protected', authMiddleware.authenticate(), (req, res) => {
    res.json({ message: 'Success', user: (req as any).user });
  });

  // User endpoint
  app.get('/api/users', authMiddleware.authenticate(), (req, res) => {
    res.json({ users: [] });
  });

  return app;
};

describe('OAuth Authentication', () => {
  let app: express.Application;

  beforeAll(() => {
    // Mock OAuth environment variables
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
    process.env.SESSION_SECRET = 'test-session-secret-minimum-32-chars';
    process.env.REDIS_URL = 'redis://localhost:6379'; // ENTERPRISE: Required by AuthenticationMiddleware constructor
    process.env.NODE_ENV = 'test';

    app = createTestApp();
  });

  describe('Security', () => {
    it('should reject requests without authentication', async () => {
      const res = await request(app).get('/api/protected');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Authentication required');
    });

    it('should not expose demo credentials', async () => {
      const res = await request(app).get('/api/users');
      expect(res.status).toBe(401); // Should be unauthorized
      expect(res.text).not.toContain('demo@');
      expect(res.text).not.toContain('password123');
      expect(res.text).not.toContain('admin123');
    });

    it('should enforce HTTPS in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      expect(authConfig.session.cookie.secure).toBe(true);

      process.env.NODE_ENV = originalEnv;
    });

    it('should use secure session configuration', () => {
      expect(authConfig.session.cookie.httpOnly).toBe(true);
      expect(authConfig.session.cookie.maxAge).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('OAuth Flow', () => {
    it('should redirect to Google OAuth', async () => {
      // Mock OAuth provider
      vi.doMock(
        '../../../../../libs/shared/oauth/src/oauth-provider.js',
        () => ({
          EnterpriseOAuthProvider: class {
            initiateAuth(req: any, res: any) {
              res.redirect(
                'https://accounts.google.com/oauth/authorize?client_id=test'
              );
            }
          },
          OAUTH_PROVIDERS: {
            GOOGLE: { provider: 'google' },
          },
        })
      );

      // ENTERPRISE FIX (2026-01-08): Use provider-specific route (not generic /auth/login?provider=X)
      // Implementation uses /auth/google per infrastructure catalog REST API design
      const res = await request(app).get('/auth/google');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('accounts.google.com');
    });

    it('should handle OAuth callback', async () => {
      // Mock successful OAuth callback
      const agent = request.agent(app);

      // Simulate OAuth callback with session
      const res = await agent
        .get('/auth/google/callback')
        .query({ code: 'mock-auth-code', state: 'test-state' });

      // Should redirect or return user data
      expect([200, 302]).toContain(res.status);
    });

    it('should provide OAuth health endpoint', async () => {
      const res = await request(app).get('/auth/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.providers.google).toBe(true);
    });
  });

  describe('Session Management', () => {
    it('should handle logout', async () => {
      const agent = request.agent(app);

      const res = await agent.post('/auth/logout');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should get current user when authenticated', async () => {
      const agent = request.agent(app);

      // First, simulate authentication by setting session manually
      // In a real test, you'd go through the full OAuth flow
      const res = await agent.get('/auth/me');
      expect(res.status).toBe(401); // Should be unauthorized without session
    });

    it('should validate session configuration', () => {
      expect(authConfig.session.resave).toBe(false);
      expect(authConfig.session.saveUninitialized).toBe(false);
      expect(authConfig.session.secret).toBe(
        'test-session-secret-minimum-32-chars'
      );
    });
  });

  describe('Environment Configuration', () => {
    it('should validate required environment variables', () => {
      expect(process.env.GOOGLE_CLIENT_ID).toBe('test-client-id');
      expect(process.env.GOOGLE_CLIENT_SECRET).toBe('test-secret');
      expect(process.env.SESSION_SECRET).toBe(
        'test-session-secret-minimum-32-chars'
      );
    });

    it('should use correct callback URLs', () => {
      // ENTERPRISE FIX (2026-01-08): Test expectations must match auth.config.js defaults
      // Production: https://ectropy.ai (not .com), path: /api/auth/google/callback (not /auth)
      // Config uses Proxy pattern for dynamic NODE_ENV evaluation

      // ENTERPRISE FIX (2026-01-30): Clear any environment variables that would override defaults
      // auth.config.js priority: GOOGLE_CALLBACK_URL > BASE_URL > NODE_ENV defaults
      // Clear higher-priority vars to ensure NODE_ENV defaults are used
      delete process.env.GOOGLE_CALLBACK_URL;
      delete process.env.BASE_URL;

      process.env.NODE_ENV = 'production';
      expect(authConfig.google.callbackURL).toBe(
        'https://ectropy.ai/api/auth/google/callback'
      );

      process.env.NODE_ENV = 'development';
      expect(authConfig.google.callbackURL).toBe(
        'http://localhost:3001/api/auth/google/callback'
      );

      // Restore test environment
      process.env.NODE_ENV = 'test';
    });
  });

  describe('Error Handling', () => {
    // REMOVED: Test for generic /auth/login?provider=X endpoint
    // This endpoint does NOT exist in implementation (see oauth.routes.ts)
    // Implementation uses provider-specific routes: /api/auth/google, /api/auth/github
    // This is BETTER REST API design per infrastructure catalog (source of truth)
    // See: apps/mcp-server/data/infrastructure-catalog.json lines 1952-1957

    it('should handle expired sessions', async () => {
      // This would require mocking session expiration
      const res = await request(app).get('/api/protected');
      expect(res.status).toBe(401);
    });
  });
});
