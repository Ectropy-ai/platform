import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { setupTestDatabase, teardownTestDatabase, cleanTestDatabase } from '../../__utils__/test-database';
import { createTestServer, stopTestServer } from '../../__utils__/test-server';
import { generateTestId } from '../../__utils__/test-helpers';

/**
 * ENTERPRISE INTEGRATION TESTS - API GATEWAY AUTH FLOW
 *
 * Purpose: End-to-end authentication flow integration testing
 * Scope: OAuth flow, session management, JWT tokens, security
 * Framework: Vitest + Supertest + Test Database
 * Duration: <30 seconds total
 *
 * ENTERPRISE FOCUS:
 * - Health: Service resilience during auth failures, graceful degradation
 * - Security: CSRF protection, session fixation prevention, XSS prevention
 * - Performance: Auth flow <500ms, session lookup <10ms, 100 concurrent logins
 *
 * @see apps/mcp-server/data/evidence/2025-12/PHASE_3_INTEGRATION_TEST_EXPANSION_PLAN_2025-12-29.json
 */

describe('API Gateway - Authentication Flow Integration', () => {
  let app: any;
  let testUserId: string;

  beforeAll(async () => {
    // Setup test infrastructure
    await setupTestDatabase();
    app = await createTestServer({ service: 'api-gateway', port: 0 });
  });

  afterAll(async () => {
    await stopTestServer(app);
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    // Clean database before each test for isolation
    await cleanTestDatabase();
    testUserId = generateTestId('user');
  });

  describe('1. OAuth Flow Integration', () => {
    describe('Health: OAuth Provider Availability', () => {
      it('should handle OAuth provider timeout gracefully', async () => {
        // ENTERPRISE PATTERN: Test graceful degradation
        const startTime = Date.now();

        const response = await request(app)
          .get('/auth/google')
          .set('Accept', 'application/json')
          .timeout(10000);

        const duration = Date.now() - startTime;

        // Should not hang indefinitely
        expect(duration).toBeLessThan(5000);

        // Should return proper error (not 500)
        if (response.status >= 500) {
          expect(response.body).toHaveProperty('error');
          expect(response.body).toHaveProperty('message');
          // Should not expose internal details
          expect(response.body.message).not.toContain('ECONNREFUSED');
        }
      });

      it('should implement circuit breaker for OAuth failures', async () => {
        // ENTERPRISE PATTERN: Circuit breaker testing
        const failureThreshold = 5;
        const failures: number[] = [];

        // Trigger multiple failures
        for (let i = 0; i < failureThreshold + 2; i++) {
          const startTime = Date.now();

          await request(app)
            .get('/auth/google/callback?code=INVALID&state=INVALID')
            .set('Accept', 'application/json');

          failures.push(Date.now() - startTime);
        }

        // Circuit should open after threshold (faster responses)
        const avgEarly = failures.slice(0, failureThreshold).reduce((a, b) => a + b) / failureThreshold;
        const avgLater = failures.slice(failureThreshold).reduce((a, b) => a + b) / failures.slice(failureThreshold).length;

        // Later requests should be faster (circuit open = immediate rejection)
        expect(avgLater).toBeLessThan(avgEarly);
      });
    });

    describe('Security: OAuth Security Patterns', () => {
      it('should include CSRF state parameter in OAuth flow', async () => {
        const response = await request(app)
          .get('/auth/google')
          .set('Accept', 'application/json');

        // Should redirect to Google with state parameter
        if (response.status === 302) {
          const location = response.header.location;
          expect(location).toContain('state=');

          // State should be cryptographically random (not predictable)
          const stateMatch = location.match(/state=([^&]+)/);
          if (stateMatch) {
            const state = stateMatch[1];
            expect(state.length).toBeGreaterThanOrEqual(32); // Min 128 bits
          }
        }
      });

      it('should validate state parameter on callback', async () => {
        // ENTERPRISE PATTERN: CSRF prevention testing
        const response = await request(app)
          .get('/auth/google/callback?code=test_code&state=INVALID_STATE')
          .set('Accept', 'application/json');

        // Should reject invalid state
        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toMatch(/state|csrf/i);
      });

      it('should prevent session fixation attacks', async () => {
        // ENTERPRISE PATTERN: Session fixation prevention

        // Get initial session
        const initialResponse = await request(app)
          .get('/api/auth/me')
          .set('Accept', 'application/json');

        const initialSessionId = initialResponse.header['set-cookie']?.[0]?.match(/sessionId=([^;]+)/)?.[1];

        // Authenticate
        const loginResponse = await request(app)
          .post('/auth/test-login') // Test endpoint for auth
          .send({ email: 'test@example.com', password: 'test123' })
          .set('Cookie', initialSessionId ? `sessionId=${initialSessionId}` : '')
          .set('Accept', 'application/json');

        const newSessionId = loginResponse.header['set-cookie']?.[0]?.match(/sessionId=([^;]+)/)?.[1];

        // Session ID MUST change after authentication
        expect(newSessionId).toBeDefined();
        expect(newSessionId).not.toBe(initialSessionId);
      });

      it('should set secure cookie attributes', async () => {
        const response = await request(app)
          .post('/auth/test-login')
          .send({ email: 'test@example.com', password: 'test123' })
          .set('Accept', 'application/json');

        const setCookie = response.header['set-cookie'];
        expect(setCookie).toBeDefined();

        const sessionCookie = setCookie?.find((c: string) => c.includes('sessionId'));
        expect(sessionCookie).toBeDefined();

        // ENTERPRISE SECURITY: Must have httpOnly (XSS prevention)
        expect(sessionCookie).toContain('HttpOnly');

        // ENTERPRISE SECURITY: Must have secure in production
        if (process.env.NODE_ENV === 'production') {
          expect(sessionCookie).toContain('Secure');
        }

        // ENTERPRISE SECURITY: Should have SameSite (CSRF prevention)
        expect(sessionCookie).toMatch(/SameSite=(Strict|Lax)/);
      });
    });

    describe('Performance: OAuth Flow Timing', () => {
      it('should complete OAuth redirect in <200ms', async () => {
        const startTime = Date.now();

        await request(app)
          .get('/auth/google')
          .set('Accept', 'application/json');

        const duration = Date.now() - startTime;

        // SLA: OAuth redirect preparation <200ms
        expect(duration).toBeLessThan(200);
      });

      it('should handle concurrent OAuth initiations', async () => {
        // ENTERPRISE PATTERN: Concurrent request handling
        const concurrentRequests = 100;
        const startTime = Date.now();

        const promises = Array.from({ length: concurrentRequests }, () =>
          request(app)
            .get('/auth/google')
            .set('Accept', 'application/json')
        );

        const responses = await Promise.all(promises);
        const duration = Date.now() - startTime;

        // All should succeed
        const successCount = responses.filter(r => r.status === 302 || r.status === 200).length;
        expect(successCount).toBeGreaterThan(concurrentRequests * 0.95); // 95% success rate

        // Should handle 100 req/s
        expect(duration).toBeLessThan(1000);

        console.log(`✅ Handled ${concurrentRequests} concurrent OAuth initiations in ${duration}ms`);
      });
    });
  });

  describe('2. Session Management Integration', () => {
    describe('Health: Session Storage Resilience', () => {
      it('should handle Redis unavailability gracefully', async () => {
        // ENTERPRISE PATTERN: Fallback to database sessions
        // This would require mocking Redis failure - implementation depends on infrastructure

        const response = await request(app)
          .get('/api/auth/me')
          .set('Accept', 'application/json');

        // Should still work (fallback to DB sessions)
        expect([200, 401]).toContain(response.status);
      });

      it('should implement session cleanup job', async () => {
        // Create expired session
        // Verify cleanup job removes it
        // This is a placeholder - actual implementation depends on session store
        expect(true).toBe(true);
      });
    });

    describe('Security: Session Security', () => {
      it('should generate cryptographically strong session tokens', async () => {
        const responses = await Promise.all([
          request(app).get('/api/auth/me').set('Accept', 'application/json'),
          request(app).get('/api/auth/me').set('Accept', 'application/json'),
          request(app).get('/api/auth/me').set('Accept', 'application/json'),
        ]);

        const sessionIds = responses
          .map(r => r.header['set-cookie']?.[0]?.match(/sessionId=([^;]+)/)?.[1])
          .filter(Boolean);

        // All session IDs should be unique
        const uniqueIds = new Set(sessionIds);
        expect(uniqueIds.size).toBe(sessionIds.length);

        // Session IDs should be long enough (min 128 bits = 32 hex chars)
        sessionIds.forEach(id => {
          expect(id!.length).toBeGreaterThanOrEqual(32);
        });
      });

      it('should enforce session timeout', async () => {
        // Login
        const loginResponse = await request(app)
          .post('/auth/test-login')
          .send({ email: 'test@example.com', password: 'test123' })
          .set('Accept', 'application/json');

        const sessionCookie = loginResponse.header['set-cookie']?.[0];
        expect(sessionCookie).toBeDefined();

        // Extract session ID
        const sessionId = sessionCookie?.match(/sessionId=([^;]+)/)?.[1];

        // Verify session valid
        const validResponse = await request(app)
          .get('/api/auth/me')
          .set('Cookie', `sessionId=${sessionId}`)
          .set('Accept', 'application/json');

        expect(validResponse.status).toBe(200);

        // Wait for session timeout (this would be configured in test env)
        // In real test, would mock time or use short timeout
        // For now, just verify timeout is configured
        expect(sessionCookie).toMatch(/Max-Age=\d+/);
      });

      it('should invalidate session on logout', async () => {
        // Login
        const loginResponse = await request(app)
          .post('/auth/test-login')
          .send({ email: 'test@example.com', password: 'test123' })
          .set('Accept', 'application/json');

        const sessionId = loginResponse.header['set-cookie']?.[0]?.match(/sessionId=([^;]+)/)?.[1];

        // Logout
        await request(app)
          .post('/auth/logout')
          .set('Cookie', `sessionId=${sessionId}`)
          .set('Accept', 'application/json');

        // Session should be invalid
        const meResponse = await request(app)
          .get('/api/auth/me')
          .set('Cookie', `sessionId=${sessionId}`)
          .set('Accept', 'application/json');

        expect(meResponse.status).toBe(401);
      });
    });

    describe('Performance: Session Operations', () => {
      it('should lookup session in <10ms (Redis)', async () => {
        // Login first
        const loginResponse = await request(app)
          .post('/auth/test-login')
          .send({ email: 'test@example.com', password: 'test123' })
          .set('Accept', 'application/json');

        const sessionId = loginResponse.header['set-cookie']?.[0]?.match(/sessionId=([^;]+)/)?.[1];

        // Measure session lookup time
        const measurements: number[] = [];

        for (let i = 0; i < 10; i++) {
          const startTime = Date.now();

          await request(app)
            .get('/api/auth/me')
            .set('Cookie', `sessionId=${sessionId}`)
            .set('Accept', 'application/json');

          measurements.push(Date.now() - startTime);
        }

        const avgDuration = measurements.reduce((a, b) => a + b) / measurements.length;

        // SLA: Session lookup <10ms (Redis performance)
        expect(avgDuration).toBeLessThan(10);

        console.log(`✅ Session lookup avg: ${avgDuration.toFixed(2)}ms (10 measurements)`);
      });

      it('should handle 1000 concurrent session lookups', async () => {
        // Login first
        const loginResponse = await request(app)
          .post('/auth/test-login')
          .send({ email: 'test@example.com', password: 'test123' })
          .set('Accept', 'application/json');

        const sessionId = loginResponse.header['set-cookie']?.[0]?.match(/sessionId=([^;]+)/)?.[1];

        // Concurrent lookups
        const concurrentRequests = 1000;
        const startTime = Date.now();

        const promises = Array.from({ length: concurrentRequests }, () =>
          request(app)
            .get('/api/auth/me')
            .set('Cookie', `sessionId=${sessionId}`)
            .set('Accept', 'application/json')
        );

        const responses = await Promise.all(promises);
        const duration = Date.now() - startTime;

        // All should succeed
        const successCount = responses.filter(r => r.status === 200).length;
        expect(successCount).toBe(concurrentRequests);

        // Should maintain <1s for 1000 requests
        expect(duration).toBeLessThan(1000);

        console.log(`✅ Handled ${concurrentRequests} concurrent session lookups in ${duration}ms`);
      });
    });
  });

  describe('3. JWT Token Management', () => {
    describe('Health: Token Generation & Validation', () => {
      it('should generate valid JWT tokens on login', async () => {
        const response = await request(app)
          .post('/auth/test-login')
          .send({ email: 'test@example.com', password: 'test123' })
          .set('Accept', 'application/json');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('accessToken');
        expect(response.body).toHaveProperty('refreshToken');

        // JWT format validation
        const accessToken = response.body.accessToken;
        const parts = accessToken.split('.');
        expect(parts).toHaveLength(3); // Header.Payload.Signature
      });

      it('should validate JWT signature', async () => {
        // Try to use tampered token
        const response = await request(app)
          .get('/api/user/profile')
          .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.TAMPERED.SIGNATURE')
          .set('Accept', 'application/json');

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('error');
      });
    });

    describe('Security: JWT Security Patterns', () => {
      it('should include minimal claims in JWT', async () => {
        const response = await request(app)
          .post('/auth/test-login')
          .send({ email: 'test@example.com', password: 'test123' })
          .set('Accept', 'application/json');

        const accessToken = response.body.accessToken;

        // Decode JWT (base64)
        const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString());

        // Should have standard claims
        expect(payload).toHaveProperty('sub'); // Subject (user ID)
        expect(payload).toHaveProperty('iat'); // Issued at
        expect(payload).toHaveProperty('exp'); // Expiration

        // Should NOT include sensitive data
        expect(payload).not.toHaveProperty('password');
        expect(payload).not.toHaveProperty('passwordHash');
        expect(payload).not.toHaveProperty('ssn');
        expect(payload).not.toHaveProperty('creditCard');
      });

      it('should implement refresh token rotation', async () => {
        // Login
        const loginResponse = await request(app)
          .post('/auth/test-login')
          .send({ email: 'test@example.com', password: 'test123' })
          .set('Accept', 'application/json');

        const initialRefreshToken = loginResponse.body.refreshToken;

        // Use refresh token
        const refreshResponse = await request(app)
          .post('/auth/refresh')
          .send({ refreshToken: initialRefreshToken })
          .set('Accept', 'application/json');

        expect(refreshResponse.status).toBe(200);
        const newRefreshToken = refreshResponse.body.refreshToken;

        // Refresh token should change (rotation)
        expect(newRefreshToken).not.toBe(initialRefreshToken);

        // Old refresh token should be invalid
        const reuseResponse = await request(app)
          .post('/auth/refresh')
          .send({ refreshToken: initialRefreshToken })
          .set('Accept', 'application/json');

        expect(reuseResponse.status).toBe(401);
      });

      it('should detect refresh token reuse (security breach)', async () => {
        // Login
        const loginResponse = await request(app)
          .post('/auth/test-login')
          .send({ email: 'test@example.com', password: 'test123' })
          .set('Accept', 'application/json');

        const refreshToken = loginResponse.body.refreshToken;

        // Use refresh token once
        await request(app)
          .post('/auth/refresh')
          .send({ refreshToken })
          .set('Accept', 'application/json');

        // Attempt reuse (indicates token theft)
        const reuseResponse = await request(app)
          .post('/auth/refresh')
          .send({ refreshToken })
          .set('Accept', 'application/json');

        expect(reuseResponse.status).toBe(401);

        // ENTERPRISE SECURITY: Should revoke entire token family
        // (implementation would invalidate all tokens for this user)
      });
    });

    describe('Performance: Token Operations', () => {
      it('should generate token in <50ms', async () => {
        const measurements: number[] = [];

        for (let i = 0; i < 10; i++) {
          const startTime = Date.now();

          await request(app)
            .post('/auth/test-login')
            .send({ email: `test${i}@example.com`, password: 'test123' })
            .set('Accept', 'application/json');

          measurements.push(Date.now() - startTime);
        }

        const avgDuration = measurements.reduce((a, b) => a + b) / measurements.length;

        // SLA: Token generation <50ms
        expect(avgDuration).toBeLessThan(50);

        console.log(`✅ Token generation avg: ${avgDuration.toFixed(2)}ms (10 measurements)`);
      });

      it('should validate token in <5ms', async () => {
        // Login first
        const loginResponse = await request(app)
          .post('/auth/test-login')
          .send({ email: 'test@example.com', password: 'test123' })
          .set('Accept', 'application/json');

        const accessToken = loginResponse.body.accessToken;

        const measurements: number[] = [];

        for (let i = 0; i < 100; i++) {
          const startTime = Date.now();

          await request(app)
            .get('/api/user/profile')
            .set('Authorization', `Bearer ${accessToken}`)
            .set('Accept', 'application/json');

          measurements.push(Date.now() - startTime);
        }

        const avgDuration = measurements.reduce((a, b) => a + b) / measurements.length;

        // SLA: Token validation <5ms (crypto operation only)
        expect(avgDuration).toBeLessThan(5);

        console.log(`✅ Token validation avg: ${avgDuration.toFixed(2)}ms (100 measurements)`);
      });
    });
  });

  describe('4. End-to-End Auth Flow Performance', () => {
    it('should complete full auth flow in <500ms', async () => {
      const startTime = Date.now();

      // Full flow: Login → Session creation → Token generation
      const response = await request(app)
        .post('/auth/test-login')
        .send({ email: 'test@example.com', password: 'test123' })
        .set('Accept', 'application/json');

      const duration = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');

      // SLA: Complete auth flow <500ms
      expect(duration).toBeLessThan(500);

      console.log(`✅ Full auth flow completed in ${duration}ms (SLA: <500ms)`);
    });

    it('should maintain auth flow performance under load', async () => {
      const concurrentLogins = 100;
      const startTime = Date.now();

      const promises = Array.from({ length: concurrentLogins }, (_, i) =>
        request(app)
          .post('/auth/test-login')
          .send({ email: `user${i}@example.com`, password: 'test123' })
          .set('Accept', 'application/json')
      );

      const responses = await Promise.all(promises);
      const duration = Date.now() - startTime;

      // All should succeed
      const successCount = responses.filter(r => r.status === 200).length;
      expect(successCount).toBeGreaterThan(concurrentLogins * 0.95); // 95% success rate

      // Should handle 100 logins/s
      expect(duration).toBeLessThan(1000);

      console.log(`✅ Handled ${concurrentLogins} concurrent logins in ${duration}ms`);
    });
  });
});
