/**
 * JWT Validation Integration Tests
 *
 * Comprehensive JWT token validation testing for production-ready authentication
 *
 * Test Coverage:
 * - JWT signature validation
 * - Token expiration handling
 * - Token claims validation
 * - Multi-tenant JWT isolation
 * - JWT rotation strategies
 * - Malformed token handling
 * - Algorithm confusion attacks
 * - Token tampering detection
 *
 * OWASP Coverage: A02 (Cryptographic Failures), A07 (Authentication Failures)
 *
 * @see apps/mcp-server/SECURITY_TESTING.md
 * @see apps/mcp-server/TESTING.md
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// STUB: ../../app and ../../db do not exist yet — JWT auth endpoints not implemented
// These integration tests require a running Express app with JWT middleware
// Skip until JWT auth layer is built (currently using session-based OAuth)
const app = {} as any;
const pool = { query: async () => ({ rows: [] }), end: async () => {} } as any;

// Test configuration
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';
const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-key';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

// Test data
interface TestUser {
  id: string;
  email: string;
  tenant_id: string;
  role: string;
}

const tenant1User: TestUser = {
  id: crypto.randomUUID(),
  email: 'jwt-test-tenant1@ectropy.ai',
  tenant_id: 'tenant-1',
  role: 'contractor',
};

const tenant2User: TestUser = {
  id: crypto.randomUUID(),
  email: 'jwt-test-tenant2@ectropy.ai',
  tenant_id: 'tenant-2',
  role: 'architect',
};

/**
 * Setup test database and users
 */
beforeAll(async () => {
  // Create test users in database
  await pool.query(
    `INSERT INTO users (id, email, tenant_id, role, created_at)
     VALUES ($1, $2, $3, $4, NOW()), ($5, $6, $7, $8, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [
      tenant1User.id,
      tenant1User.email,
      tenant1User.tenant_id,
      tenant1User.role,
      tenant2User.id,
      tenant2User.email,
      tenant2User.tenant_id,
      tenant2User.role,
    ]
  );
});

/**
 * Cleanup test data
 */
afterAll(async () => {
  // Delete test users
  await pool.query(
    `DELETE FROM users WHERE email LIKE 'jwt-test-%@ectropy.ai'`
  );

  // Delete test sessions
  await pool.query(`DELETE FROM sessions WHERE user_id IN ($1, $2)`, [
    tenant1User.id,
    tenant2User.id,
  ]);

  await pool.end();
});

/**
 * Clear sessions before each test
 */
beforeEach(async () => {
  await pool.query(`DELETE FROM sessions WHERE user_id IN ($1, $2)`, [
    tenant1User.id,
    tenant2User.id,
  ]);
});

/**
 * Helper: Generate valid JWT access token
 */
function generateAccessToken(
  user: TestUser,
  options: jwt.SignOptions = {}
): string {
  const payload = {
    sub: user.id,
    email: user.email,
    tenant_id: user.tenant_id,
    role: user.role,
    type: 'access',
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
    issuer: 'ectropy-api-gateway',
    audience: 'ectropy-services',
    ...options,
  });
}

/**
 * Helper: Generate valid JWT refresh token
 */
function generateRefreshToken(
  user: TestUser,
  options: jwt.SignOptions = {}
): string {
  const payload = {
    sub: user.id,
    tenant_id: user.tenant_id,
    type: 'refresh',
  };

  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
    issuer: 'ectropy-api-gateway',
    audience: 'ectropy-services',
    ...options,
  });
}

/**
 * Helper: Generate expired token
 */
function generateExpiredToken(user: TestUser): string {
  const payload = {
    sub: user.id,
    email: user.email,
    tenant_id: user.tenant_id,
    role: user.role,
    type: 'access',
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '-1h', // Expired 1 hour ago
    issuer: 'ectropy-api-gateway',
    audience: 'ectropy-services',
  });
}

// SKIP: JWT auth endpoints (/api/auth/me, /api/auth/refresh) not yet implemented
// Current auth uses session-based Google OAuth. JWT layer planned for Phase 6.
describe.skip('JWT Signature Validation', () => {
  it('should accept valid JWT with correct signature', async () => {
    const token = generateAccessToken(tenant1User);

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.user.id).toBe(tenant1User.id);
    expect(response.body.user.tenant_id).toBe(tenant1User.tenant_id);
  });

  it('should reject JWT with invalid signature', async () => {
    const token = generateAccessToken(tenant1User);
    const [header, payload] = token.split('.');
    const invalidSignature = crypto.randomBytes(32).toString('base64url');
    const tamperedToken = `${header}.${payload}.${invalidSignature}`;

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tamperedToken}`)
      .expect(401);

    expect(response.body.error).toMatch(/invalid signature|jwt malformed/i);
  });

  it('should reject JWT signed with wrong secret', async () => {
    const payload = {
      sub: tenant1User.id,
      email: tenant1User.email,
      tenant_id: tenant1User.tenant_id,
      role: tenant1User.role,
      type: 'access',
    };

    const wrongSecretToken = jwt.sign(payload, 'wrong-secret-key', {
      expiresIn: ACCESS_TOKEN_EXPIRY,
      issuer: 'ectropy-api-gateway',
      audience: 'ectropy-services',
    });

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${wrongSecretToken}`)
      .expect(401);

    expect(response.body.error).toMatch(/invalid signature/i);
  });

  it('should reject JWT with tampered payload', async () => {
    const token = generateAccessToken(tenant1User);
    const [header, payload, signature] = token.split('.');

    // Decode and modify payload
    const decodedPayload = JSON.parse(
      Buffer.from(payload, 'base64url').toString()
    );
    decodedPayload.role = 'admin'; // Privilege escalation attempt
    const tamperedPayload = Buffer.from(
      JSON.stringify(decodedPayload)
    ).toString('base64url');

    const tamperedToken = `${header}.${tamperedPayload}.${signature}`;

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tamperedToken}`)
      .expect(401);

    expect(response.body.error).toMatch(/invalid signature/i);
  });
});

describe.skip('Token Expiration Handling', () => {
  it('should reject expired access token', async () => {
    const expiredToken = generateExpiredToken(tenant1User);

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);

    expect(response.body.error).toMatch(/token expired|jwt expired/i);
  });

  it('should accept token within valid time window', async () => {
    const token = generateAccessToken(tenant1User);

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.user.id).toBe(tenant1User.id);
  });

  it('should reject token with missing exp claim', async () => {
    const payload = {
      sub: tenant1User.id,
      email: tenant1User.email,
      tenant_id: tenant1User.tenant_id,
      role: tenant1User.role,
      type: 'access',
    };

    const tokenWithoutExp = jwt.sign(payload, JWT_SECRET, {
      noTimestamp: true,
      issuer: 'ectropy-api-gateway',
      audience: 'ectropy-services',
    });

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokenWithoutExp}`)
      .expect(401);

    expect(response.body.error).toMatch(/missing exp claim|token expired/i);
  });

  it('should enforce token expiration with clock skew tolerance', async () => {
    // Token expires in 5 seconds
    const shortLivedToken = generateAccessToken(tenant1User, {
      expiresIn: '5s',
    });

    // Immediate request should succeed
    const response1 = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${shortLivedToken}`)
      .expect(200);

    expect(response1.body.user.id).toBe(tenant1User.id);

    // Wait 6 seconds for expiration
    await new Promise((resolve) => setTimeout(resolve, 6000));

    // Request should fail after expiration
    const response2 = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${shortLivedToken}`)
      .expect(401);

    expect(response2.body.error).toMatch(/token expired/i);
  });
});

describe.skip('Token Claims Validation', () => {
  it('should validate required claims (sub, tenant_id, type)', async () => {
    const token = generateAccessToken(tenant1User);
    const decoded = jwt.decode(token) as any;

    expect(decoded.sub).toBe(tenant1User.id);
    expect(decoded.tenant_id).toBe(tenant1User.tenant_id);
    expect(decoded.type).toBe('access');
    expect(decoded.iss).toBe('ectropy-api-gateway');
    expect(decoded.aud).toBe('ectropy-services');
  });

  it('should reject token with missing sub claim', async () => {
    const payload = {
      email: tenant1User.email,
      tenant_id: tenant1User.tenant_id,
      role: tenant1User.role,
      type: 'access',
    };

    const tokenWithoutSub = jwt.sign(payload, JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
      issuer: 'ectropy-api-gateway',
      audience: 'ectropy-services',
    });

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokenWithoutSub}`)
      .expect(401);

    expect(response.body.error).toMatch(/missing sub claim|invalid token/i);
  });

  it('should reject token with missing tenant_id claim', async () => {
    const payload = {
      sub: tenant1User.id,
      email: tenant1User.email,
      role: tenant1User.role,
      type: 'access',
    };

    const tokenWithoutTenant = jwt.sign(payload, JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
      issuer: 'ectropy-api-gateway',
      audience: 'ectropy-services',
    });

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokenWithoutTenant}`)
      .expect(401);

    expect(response.body.error).toMatch(/missing tenant_id|invalid token/i);
  });

  it('should validate issuer claim', async () => {
    const payload = {
      sub: tenant1User.id,
      email: tenant1User.email,
      tenant_id: tenant1User.tenant_id,
      role: tenant1User.role,
      type: 'access',
    };

    const tokenWithWrongIssuer = jwt.sign(payload, JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
      issuer: 'malicious-issuer',
      audience: 'ectropy-services',
    });

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokenWithWrongIssuer}`)
      .expect(401);

    expect(response.body.error).toMatch(/invalid issuer|jwt issuer invalid/i);
  });

  it('should validate audience claim', async () => {
    const payload = {
      sub: tenant1User.id,
      email: tenant1User.email,
      tenant_id: tenant1User.tenant_id,
      role: tenant1User.role,
      type: 'access',
    };

    const tokenWithWrongAudience = jwt.sign(payload, JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
      issuer: 'ectropy-api-gateway',
      audience: 'malicious-audience',
    });

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokenWithWrongAudience}`)
      .expect(401);

    expect(response.body.error).toMatch(
      /invalid audience|jwt audience invalid/i
    );
  });
});

describe.skip('Multi-Tenant JWT Isolation', () => {
  it('should isolate JWT tokens by tenant', async () => {
    const tenant1Token = generateAccessToken(tenant1User);

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tenant1Token}`)
      .expect(200);

    expect(response.body.user.tenant_id).toBe('tenant-1');
    expect(response.body.user.id).toBe(tenant1User.id);
  });

  it('should prevent cross-tenant JWT token usage', async () => {
    // Create token with tenant-2 claim but tenant-1 user
    const payload = {
      sub: tenant1User.id,
      email: tenant1User.email,
      tenant_id: 'tenant-2', // Mismatched tenant
      role: tenant1User.role,
      type: 'access',
    };

    const maliciousToken = jwt.sign(payload, JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
      issuer: 'ectropy-api-gateway',
      audience: 'ectropy-services',
    });

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${maliciousToken}`)
      .expect(403);

    expect(response.body.error).toMatch(/tenant mismatch|unauthorized/i);
  });

  it('should validate tenant_id matches user record', async () => {
    const token = generateAccessToken(tenant1User);

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Verify tenant_id from database matches token
    const dbUser = await pool.query(
      `SELECT tenant_id FROM users WHERE id = $1`,
      [tenant1User.id]
    );

    expect(response.body.user.tenant_id).toBe(dbUser.rows[0].tenant_id);
  });

  it('should enforce tenant isolation in resource access', async () => {
    const tenant1Token = generateAccessToken(tenant1User);

    // Attempt to access tenant-2 resource with tenant-1 token
    const response = await request(app)
      .get('/api/projects?tenant_id=tenant-2')
      .set('Authorization', `Bearer ${tenant1Token}`)
      .expect(403);

    expect(response.body.error).toMatch(/unauthorized|forbidden/i);
  });
});

describe.skip('JWT Rotation Strategies', () => {
  it('should support token refresh with rotation', async () => {
    const refreshToken = generateRefreshToken(tenant1User);

    // Store refresh token in database
    await pool.query(
      `INSERT INTO sessions (id, user_id, refresh_token, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')`,
      [crypto.randomUUID(), tenant1User.id, refreshToken]
    );

    // Request new access token
    const response = await request(app)
      .post('/api/auth/refresh')
      .send({ refresh_token: refreshToken })
      .expect(200);

    expect(response.body.access_token).toBeDefined();
    expect(response.body.refresh_token).toBeDefined();
    expect(response.body.refresh_token).not.toBe(refreshToken); // New refresh token
  });

  it('should invalidate old refresh token after rotation', async () => {
    const refreshToken = generateRefreshToken(tenant1User);

    // Store refresh token
    await pool.query(
      `INSERT INTO sessions (id, user_id, refresh_token, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')`,
      [crypto.randomUUID(), tenant1User.id, refreshToken]
    );

    // First refresh
    const response1 = await request(app)
      .post('/api/auth/refresh')
      .send({ refresh_token: refreshToken })
      .expect(200);

    // Attempt to reuse old refresh token (should fail)
    const response2 = await request(app)
      .post('/api/auth/refresh')
      .send({ refresh_token: refreshToken })
      .expect(401);

    expect(response2.body.error).toMatch(
      /invalid refresh token|token revoked/i
    );
  });

  it('should maintain token family on rotation', async () => {
    const refreshToken = generateRefreshToken(tenant1User);
    const sessionId = crypto.randomUUID();

    // Store refresh token with family ID
    await pool.query(
      `INSERT INTO sessions (id, user_id, refresh_token, token_family, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days')`,
      [sessionId, tenant1User.id, refreshToken, sessionId]
    );

    // Refresh token
    const response = await request(app)
      .post('/api/auth/refresh')
      .send({ refresh_token: refreshToken })
      .expect(200);

    // Verify new token has same token_family
    const newSession = await pool.query(
      `SELECT token_family FROM sessions WHERE refresh_token = $1`,
      [response.body.refresh_token]
    );

    expect(newSession.rows[0].token_family).toBe(sessionId);
  });
});

describe.skip('Malformed Token Handling', () => {
  it('should reject token with invalid format', async () => {
    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid-token-format')
      .expect(401);

    expect(response.body.error).toMatch(/jwt malformed|invalid token/i);
  });

  it('should reject token with missing parts', async () => {
    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer header.payload') // Missing signature
      .expect(401);

    expect(response.body.error).toMatch(/jwt malformed|invalid token/i);
  });

  it('should reject token with invalid base64url encoding', async () => {
    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid!!!.payload!!!.signature!!!')
      .expect(401);

    expect(response.body.error).toMatch(/jwt malformed|invalid token/i);
  });

  it('should reject empty token', async () => {
    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer ')
      .expect(401);

    expect(response.body.error).toMatch(/missing token|no token provided/i);
  });
});

describe.skip('Algorithm Confusion Attack Prevention', () => {
  it('should reject JWT with none algorithm', async () => {
    const payload = {
      sub: tenant1User.id,
      email: tenant1User.email,
      tenant_id: tenant1User.tenant_id,
      role: tenant1User.role,
      type: 'access',
    };

    const header = Buffer.from(
      JSON.stringify({ alg: 'none', typ: 'JWT' })
    ).toString('base64url');
    const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString(
      'base64url'
    );
    const noneToken = `${header}.${payloadEncoded}.`;

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${noneToken}`)
      .expect(401);

    expect(response.body.error).toMatch(
      /algorithm not allowed|invalid signature/i
    );
  });

  it('should only accept HS256 algorithm for access tokens', async () => {
    const payload = {
      sub: tenant1User.id,
      email: tenant1User.email,
      tenant_id: tenant1User.tenant_id,
      role: tenant1User.role,
      type: 'access',
    };

    // Attempt to use RS256 (asymmetric) instead of HS256 (symmetric)
    const wrongAlgToken = jwt.sign(payload, JWT_SECRET, {
      algorithm: 'HS512', // Wrong algorithm
      expiresIn: ACCESS_TOKEN_EXPIRY,
      issuer: 'ectropy-api-gateway',
      audience: 'ectropy-services',
    });

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${wrongAlgToken}`)
      .expect(401);

    expect(response.body.error).toMatch(
      /invalid algorithm|algorithm not allowed/i
    );
  });
});

describe.skip('Token Type Validation', () => {
  it('should reject refresh token used as access token', async () => {
    const refreshToken = generateRefreshToken(tenant1User);

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${refreshToken}`)
      .expect(401);

    expect(response.body.error).toMatch(/invalid token type|wrong token type/i);
  });

  it('should reject access token used as refresh token', async () => {
    const accessToken = generateAccessToken(tenant1User);

    const response = await request(app)
      .post('/api/auth/refresh')
      .send({ refresh_token: accessToken })
      .expect(401);

    expect(response.body.error).toMatch(/invalid token type|wrong token type/i);
  });

  it('should validate token type claim matches expected value', async () => {
    const token = generateAccessToken(tenant1User);
    const decoded = jwt.decode(token) as any;

    expect(decoded.type).toBe('access');
  });
});
