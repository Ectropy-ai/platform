/**
 * Task 4.2: OWASP Top 10 Security Tests
 * Comprehensive security testing for production deployment
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import {
  owaspSecurityStack,
  createOwaspSecurityStackSync,
  InjectionProtection,
  validationRules,
  handleValidationErrors,
  accessControlMiddleware,
  strictApiRateLimit,
} from '../owasp-security';

describe('OWASP Top 10 Security Protection Tests', () => {
  let app: express.Application;

  // Helper function for setting up OWASP stack in tests
  const setupSecurityStack = (app: express.Application) => {
    const middlewareStack = createOwaspSecurityStackSync();
    middlewareStack.forEach((middleware) => {
      if (middleware) app.use(middleware);
    });
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('A01:2021 – Broken Access Control', () => {
    it('should block unauthorized access', async () => {
      app.use('/protected', accessControlMiddleware('admin'));
      app.get('/protected', (req, res) => res.json({ message: 'protected' }));

      const response = await request(app).get('/protected');
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');
    });

    it('should allow authorized access', async () => {
      app.use('/protected', (req: any, res, next) => {
        req.user = { id: '123', role: 'admin' };
        next();
      });
      app.use('/protected', accessControlMiddleware('admin'));
      app.get('/protected', (req, res) => res.json({ message: 'protected' }));

      const response = await request(app).get('/protected');
      expect(response.status).toBe(200);
    });

    it('should block insufficient role access', async () => {
      app.use('/admin-only', (req: any, res, next) => {
        req.user = { id: '123', role: 'user' };
        next();
      });
      app.use('/admin-only', accessControlMiddleware('admin'));
      app.get('/admin-only', (req, res) => res.json({ message: 'admin' }));

      const response = await request(app).get('/admin-only');
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Forbidden');
    });
  });

  describe('A02:2021 – Cryptographic Failures', () => {
    it('should set secure headers', async () => {
      setupSecurityStack(app);
      app.get('/test', (req, res) => res.json({ message: 'test' }));

      const response = await request(app).get('/test');

      expect(response.headers['strict-transport-security']).toBeDefined();
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
    });

    it('should enforce HTTPS in production', async () => {
      setupSecurityStack(app);
      app.get('/test', (req, res) => res.json({ message: 'test' }));

      const response = await request(app).get('/test');
      expect(response.headers['strict-transport-security']).toContain(
        'max-age=31536000'
      );
    });
  });

  describe('A03:2021 – Injection', () => {
    it('should block SQL injection attempts', async () => {
      app.use(InjectionProtection.middleware());
      app.post('/test', (req, res) => res.json({ received: req.body }));

      const sqlInjectionPayloads = [
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "admin'/*",
        '1; DELETE FROM users',
        'UNION SELECT * FROM users',
      ];

      for (const payload of sqlInjectionPayloads) {
        const response = await request(app)
          .post('/test')
          .send({ input: payload });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Security violation');
      }
    });

    it('should block XSS attempts', async () => {
      app.use(InjectionProtection.middleware());
      app.post('/test', (req, res) => res.json({ received: req.body }));

      const xssPayloads = [
        '<script>alert("xss")</script>',
        '<iframe src="javascript:alert(1)"></iframe>',
        '<object data="javascript:alert(1)"></object>',
        '<img src="x" onerror="alert(1)">',
        'javascript:alert(1)',
      ];

      for (const payload of xssPayloads) {
        const response = await request(app)
          .post('/test')
          .send({ input: payload });

        // Should either block or sanitize
        expect([200, 400]).toContain(response.status);

        if (response.status === 200) {
          // If allowed through, should be sanitized
          expect(response.body.received.input).not.toContain('<script>');
          expect(response.body.received.input).not.toContain('javascript:');
        }
      }
    });

    it('should sanitize input without blocking legitimate content', async () => {
      app.use(InjectionProtection.middleware());
      app.post('/test', (req, res) => res.json({ received: req.body }));

      const legitimateInputs = [
        'Normal text content',
        'User@example.com',
        'Project-Name_123',
        'Construction & Engineering',
      ];

      for (const input of legitimateInputs) {
        const response = await request(app).post('/test').send({ input });

        expect(response.status).toBe(200);
        expect(response.body.received.input).toBeTruthy();
      }
    });

    it('should bypass sanitization for OAuth callback routes', async () => {
      app.use(InjectionProtection.middleware());
      app.get('/auth/google/callback', (req, res) =>
        res.json({
          query: req.query,
          path: req.path,
        })
      );
      app.get('/auth/github/callback', (req, res) =>
        res.json({
          query: req.query,
          path: req.path,
        })
      );

      // OAuth state tokens often contain URL-encoded parameters and base64-like strings
      // These should NOT trigger the injection detection
      const oauthStateToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ';
      const encodedRedirect = 'https%3A%2F%2Fstaging.ectropy.ai%2Fdashboard';

      // Test Google OAuth callback
      const googleResponse = await request(app)
        .get('/auth/google/callback')
        .query({
          state: oauthStateToken,
          code: 'test-auth-code-12345',
          redirect_uri: encodedRedirect,
        });

      expect(googleResponse.status).toBe(200);
      expect(googleResponse.body.query.state).toBe(oauthStateToken);
      expect(googleResponse.body.query.code).toBe('test-auth-code-12345');

      // Test GitHub OAuth callback
      const githubResponse = await request(app)
        .get('/auth/github/callback')
        .query({
          state: oauthStateToken,
          code: 'test-auth-code-67890',
          redirect_uri: encodedRedirect,
        });

      expect(githubResponse.status).toBe(200);
      expect(githubResponse.body.query.state).toBe(oauthStateToken);
      expect(githubResponse.body.query.code).toBe('test-auth-code-67890');
    });

    it('should still apply sanitization to non-OAuth routes', async () => {
      app.use(InjectionProtection.middleware());
      app.post('/api/regular', (req, res) => res.json({ received: req.body }));

      // SQL injection should still be blocked on regular routes
      const response = await request(app)
        .post('/api/regular')
        .send({ input: "'; DROP TABLE users; --" });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Security violation');
    });
  });

  describe('A04:2021 – Insecure Design', () => {
    it('should implement secure defaults', async () => {
      setupSecurityStack(app);
      app.get('/test', (req, res) => res.json({ message: 'test' }));

      const response = await request(app).get('/test');

      expect(response.headers['cache-control']).toContain('no-store');
      expect(response.headers['pragma']).toBe('no-cache');
      expect(response.headers['expires']).toBe('0');
    });

    it('should remove information disclosure headers', async () => {
      setupSecurityStack(app);
      app.get('/test', (req, res) => res.json({ message: 'test' }));

      const response = await request(app).get('/test');

      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(response.headers['server']).toBeUndefined();
    });
  });

  describe('A05:2021 – Security Misconfiguration', () => {
    it('should not set CORS headers (handled by nginx)', async () => {
      setupSecurityStack(app);
      app.get('/test', (req, res) => res.json({ message: 'test' }));

      // CORS is now handled by nginx reverse proxy to prevent duplicate headers
      // API Gateway should not set CORS headers
      const response = await request(app)
        .get('/test')
        .set('Origin', 'http://localhost:3000');

      expect(response.status).toBe(200);
      // Verify no CORS headers are set by API Gateway (nginx will add them)
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('should not enforce HTTP methods at API level (handled by nginx)', async () => {
      setupSecurityStack(app);
      app.get('/test', (req, res) => res.json({ message: 'test' }));

      const response = await request(app).options('/test');

      // Method enforcement is now handled by nginx reverse proxy
      // API Gateway no longer sets these headers
      expect(response.headers['access-control-allow-methods']).toBeUndefined();
    });
  });

  describe('A07:2021 – Identification and Authentication Failures', () => {
    it('should block access to sensitive attack paths', async () => {
      setupSecurityStack(app);
      app.get('*', (req, res) => res.json({ message: 'test' }));

      // FIX (2026-03-06): '/config' changed to specific file extensions to avoid
      // blocking legitimate /api/speckle/config (Five Why RC-3)
      const sensitivePaths = [
        '/.env',
        '/wp-admin',
        '/phpmyadmin',
        '/config.php',
        '/backup',
      ];

      for (const path of sensitivePaths) {
        const response = await request(app).get(path);
        expect(response.status).toBe(404);
      }
    });

    it('should allow legitimate /api/admin routes', async () => {
      setupSecurityStack(app);
      app.get('/api/admin/health', (req, res) => res.json({ status: 'ok' }));

      // Legitimate admin API routes should not be blocked
      const response = await request(app).get('/api/admin/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    });

    it('should enforce strong password validation', async () => {
      app.use(express.json());
      app.post(
        '/test',
        validationRules.password,
        handleValidationErrors,
        (req, res) => {
          res.json({ message: 'password valid' });
        }
      );

      // Test weak passwords
      const weakPasswords = [
        'password',
        '12345678',
        'Password1',
        'password123',
        'Password!',
      ];

      for (const password of weakPasswords) {
        const response = await request(app).post('/test').send({ password });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Validation failed');
      }

      // Test strong password
      const strongPassword = 'SecureP@ssw0rd123!';
      const response = await request(app)
        .post('/test')
        .send({ password: strongPassword });

      expect(response.status).toBe(200);
    });
  });

  describe('A08:2021 – Software and Data Integrity Failures', () => {
    it('should validate content types', async () => {
      setupSecurityStack(app);
      app.post('/test', (req, res) => res.json({ message: 'test' }));

      // Test invalid content type
      const response = await request(app)
        .post('/test')
        .set('Content-Type', 'application/xml')
        .send('<xml>test</xml>');

      expect(response.status).toBe(415);
      expect(response.body.error).toBe('Unsupported Media Type');
    });

    it('should accept valid content types', async () => {
      setupSecurityStack(app);
      app.post('/test', (req, res) => res.json({ message: 'test' }));

      const validContentTypes = [
        'application/json',
        'application/x-www-form-urlencoded',
        'multipart/form-data',
      ];

      for (const contentType of validContentTypes) {
        const response = await request(app)
          .post('/test')
          .set('Content-Type', contentType)
          .send('{}');

        expect([200, 400]).toContain(response.status); // 400 might be due to malformed data, not content type
      }
    });
  });

  describe('A10:2021 – Server-Side Request Forgery (SSRF)', () => {
    it('should block requests to internal IPs', async () => {
      setupSecurityStack(app);
      app.post('/test', (req, res) => res.json({ received: req.body }));

      const internalUrls = [
        'http://127.0.0.1:8080/admin',
        'http://10.0.0.1/config',
        'http://192.168.1.1/router',
        'http://172.16.0.1/internal',
        'http://169.254.169.254/metadata', // AWS metadata
      ];

      for (const url of internalUrls) {
        const response = await request(app)
          .post('/test')
          .send({ webhook_url: url });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Security violation');
      }
    });

    it('should allow external URLs', async () => {
      setupSecurityStack(app);
      app.post('/test', (req, res) => res.json({ received: req.body }));

      const externalUrls = [
        'https://api.github.com/repos',
        'https://httpbin.org/post',
        'https://jsonplaceholder.typicode.com/posts',
      ];

      for (const url of externalUrls) {
        const response = await request(app)
          .post('/test')
          .send({ webhook_url: url });

        expect(response.status).toBe(200);
      }
    });
  });

  describe('Input Validation', () => {
    it('should validate email format', async () => {
      app.post(
        '/test',
        validationRules.email,
        handleValidationErrors,
        (req, res) => {
          res.json({ message: 'email valid' });
        }
      );

      // Test invalid emails
      const invalidEmails = [
        'not-an-email',
        '@example.com',
        'user@',
        'user..name@example.com',
      ];

      for (const email of invalidEmails) {
        const response = await request(app).post('/test').send({ email });

        expect(response.status).toBe(400);
      }

      // Test valid email
      const response = await request(app)
        .post('/test')
        .send({ email: 'user@example.com' });

      expect(response.status).toBe(200);
    });

    it('should validate UUID format', async () => {
      app.get(
        '/user/:id',
        validationRules.uuid,
        handleValidationErrors,
        (req, res) => {
          res.json({ message: 'uuid valid' });
        }
      );

      // Test invalid UUIDs
      const invalidUUIDs = ['not-a-uuid', '123', 'invalid-uuid-format'];

      for (const uuid of invalidUUIDs) {
        const response = await request(app).get(`/user/${uuid}`);
        expect(response.status).toBe(400);
      }

      // Test valid UUID
      const validUUID = '123e4567-e89b-12d3-a456-426614174000';
      const response = await request(app).get(`/user/${validUUID}`);
      expect(response.status).toBe(200);
    });
  });
});
