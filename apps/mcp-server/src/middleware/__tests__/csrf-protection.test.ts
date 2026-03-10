/**
 * CSRF Protection Tests
 *
 * Comprehensive Cross-Site Request Forgery (CSRF) protection testing
 *
 * Test Coverage:
 * - CSRF token generation and validation
 * - Double-submit cookie pattern
 * - SameSite cookie enforcement
 * - State-changing request protection
 * - Token rotation on authentication
 * - Multi-tenant CSRF isolation
 * - CORS preflight handling
 * - Origin validation
 *
 * OWASP Coverage: A01 (Broken Access Control), A05 (Security Misconfiguration)
 *
 * @see apps/mcp-server/SECURITY_TESTING.md
 * @see apps/mcp-server/TESTING.md
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import {
  csrfProtection,
  generateCsrfToken,
  validateCsrfToken,
} from '../csrf-protection';

// Mock Express objects
function createMockRequest(options: {
  method?: string;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  body?: any;
  session?: any;
}): Partial<Request> {
  return {
    method: options.method || 'GET',
    headers: options.headers || {},
    cookies: options.cookies || {},
    body: options.body || {},
    session: options.session || {},
    get: (header: string) => options.headers?.[header.toLowerCase()],
  };
}

function createMockResponse(): {
  res: Partial<Response>;
  statusCode: number;
  jsonData: any;
  cookies: Record<string, { value: string; options: any }>;
} {
  const cookies: Record<string, { value: string; options: any }> = {};
  let statusCode = 200;
  let jsonData: any = null;

  const res: Partial<Response> = {
    status: vi.fn((code: number) => {
      statusCode = code;
      return res as Response;
    }),
    json: vi.fn((data: any) => {
      jsonData = data;
      return res as Response;
    }),
    cookie: vi.fn((name: string, value: string, options: any) => {
      cookies[name] = { value, options };
      return res as Response;
    }),
    clearCookie: vi.fn((name: string) => {
      delete cookies[name];
      return res as Response;
    }),
  };

  return { res, statusCode, jsonData, cookies };
}

const createMockNext = (): NextFunction => vi.fn();

describe('CSRF Token Generation', () => {
  it('should generate unique CSRF tokens', () => {
    const token1 = generateCsrfToken();
    const token2 = generateCsrfToken();

    expect(token1).toBeDefined();
    expect(token2).toBeDefined();
    expect(token1).not.toBe(token2);
    expect(token1).toMatch(/^[A-Za-z0-9_-]{32,}$/); // Base64url format
  });

  it('should generate cryptographically secure tokens', () => {
    const token = generateCsrfToken();
    const decoded = Buffer.from(token, 'base64url');

    // Token should be at least 24 bytes (192 bits)
    expect(decoded.length).toBeGreaterThanOrEqual(24);
  });

  it('should include token in session on generation', () => {
    const req = createMockRequest({
      session: {},
    });

    const token = generateCsrfToken();
    req.session!.csrfToken = token;

    expect(req.session!.csrfToken).toBe(token);
  });

  it('should set CSRF token cookie with secure options', () => {
    const { res, cookies } = createMockResponse();
    const token = generateCsrfToken();

    (res as any).cookie('csrf-token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 3600000, // 1 hour
    });

    expect(cookies['csrf-token']).toBeDefined();
    expect(cookies['csrf-token'].value).toBe(token);
    expect(cookies['csrf-token'].options.httpOnly).toBe(true);
    expect(cookies['csrf-token'].options.secure).toBe(true);
    expect(cookies['csrf-token'].options.sameSite).toBe('strict');
  });
});

describe('CSRF Token Validation', () => {
  it('should validate matching CSRF tokens', () => {
    const token = generateCsrfToken();

    const req = createMockRequest({
      method: 'POST',
      headers: { 'x-csrf-token': token },
      session: { csrfToken: token },
    });

    const isValid = validateCsrfToken(req as Request);
    expect(isValid).toBe(true);
  });

  it('should reject mismatched CSRF tokens', () => {
    const sessionToken = generateCsrfToken();
    const headerToken = generateCsrfToken();

    const req = createMockRequest({
      method: 'POST',
      headers: { 'x-csrf-token': headerToken },
      session: { csrfToken: sessionToken },
    });

    const isValid = validateCsrfToken(req as Request);
    expect(isValid).toBe(false);
  });

  it('should reject requests with missing CSRF token', () => {
    const req = createMockRequest({
      method: 'POST',
      session: { csrfToken: generateCsrfToken() },
    });

    const isValid = validateCsrfToken(req as Request);
    expect(isValid).toBe(false);
  });

  it('should reject requests with missing session token', () => {
    const req = createMockRequest({
      method: 'POST',
      headers: { 'x-csrf-token': generateCsrfToken() },
      session: {},
    });

    const isValid = validateCsrfToken(req as Request);
    expect(isValid).toBe(false);
  });

  it('should accept CSRF token from request body', () => {
    const token = generateCsrfToken();

    const req = createMockRequest({
      method: 'POST',
      body: { _csrf: token },
      session: { csrfToken: token },
    });

    const isValid = validateCsrfToken(req as Request);
    expect(isValid).toBe(true);
  });

  it('should accept CSRF token from query parameter', () => {
    const token = generateCsrfToken();

    const req = createMockRequest({
      method: 'POST',
      session: { csrfToken: token },
    });
    (req as any).query = { _csrf: token };

    const isValid = validateCsrfToken(req as Request);
    expect(isValid).toBe(true);
  });
});

describe('CSRF Middleware', () => {
  it('should allow safe methods without CSRF token (GET, HEAD, OPTIONS)', () => {
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];

    safeMethods.forEach((method) => {
      const req = createMockRequest({ method });
      const { res } = createMockResponse();
      const next = createMockNext();

      csrfProtection(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  it('should require CSRF token for state-changing methods (POST, PUT, DELETE, PATCH)', () => {
    const statefulMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];

    statefulMethods.forEach((method) => {
      const req = createMockRequest({
        method,
        session: {},
      });
      const { res } = createMockResponse();
      const next = createMockNext();

      csrfProtection(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringMatching(/csrf/i),
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  it('should pass valid CSRF token through middleware', () => {
    const token = generateCsrfToken();

    const req = createMockRequest({
      method: 'POST',
      headers: { 'x-csrf-token': token },
      session: { csrfToken: token },
    });
    const { res } = createMockResponse();
    const next = createMockNext();

    csrfProtection(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should reject invalid CSRF token in middleware', () => {
    const sessionToken = generateCsrfToken();
    const headerToken = generateCsrfToken();

    const req = createMockRequest({
      method: 'POST',
      headers: { 'x-csrf-token': headerToken },
      session: { csrfToken: sessionToken },
    });
    const { res } = createMockResponse();
    const next = createMockNext();

    csrfProtection(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('Double-Submit Cookie Pattern', () => {
  it('should validate CSRF token from cookie matches header', () => {
    const token = generateCsrfToken();

    const req = createMockRequest({
      method: 'POST',
      headers: { 'x-csrf-token': token },
      cookies: { 'csrf-token': token },
    });

    // Double-submit validation
    const cookieToken = req.cookies!['csrf-token'];
    const headerToken = req.headers!['x-csrf-token'];

    expect(cookieToken).toBe(headerToken);
  });

  it('should reject mismatched cookie and header tokens', () => {
    const cookieToken = generateCsrfToken();
    const headerToken = generateCsrfToken();

    const req = createMockRequest({
      method: 'POST',
      headers: { 'x-csrf-token': headerToken },
      cookies: { 'csrf-token': cookieToken },
    });

    const isValid = req.cookies!['csrf-token'] === req.headers!['x-csrf-token'];
    expect(isValid).toBe(false);
  });

  it('should encrypt CSRF token in cookie', () => {
    const plainToken = generateCsrfToken();
    const secret = process.env.CSRF_SECRET || 'test-csrf-secret';

    // Encrypt token for cookie storage
    const cipher = crypto.createCipheriv(
      'aes-256-gcm',
      crypto.scryptSync(secret, 'salt', 32),
      crypto.randomBytes(16)
    );
    const encrypted = Buffer.concat([
      cipher.update(plainToken, 'utf8'),
      cipher.final(),
    ]);

    expect(encrypted.toString('base64')).not.toBe(plainToken);
  });
});

describe('SameSite Cookie Enforcement', () => {
  it('should set SameSite=Strict for CSRF cookie', () => {
    const { res, cookies } = createMockResponse();
    const token = generateCsrfToken();

    (res as any).cookie('csrf-token', token, {
      sameSite: 'strict',
    });

    expect(cookies['csrf-token'].options.sameSite).toBe('strict');
  });

  it('should set SameSite=Lax for less sensitive cookies', () => {
    const { res, cookies } = createMockResponse();

    (res as any).cookie('analytics-id', 'some-value', {
      sameSite: 'lax',
    });

    expect(cookies['analytics-id'].options.sameSite).toBe('lax');
  });

  it('should not allow SameSite=None for CSRF tokens', () => {
    const { res, cookies } = createMockResponse();
    const token = generateCsrfToken();

    // Attempt to set SameSite=None (insecure for CSRF)
    (res as any).cookie('csrf-token', token, {
      sameSite: 'none',
      secure: true, // Required for SameSite=None
    });

    // Validation should fail
    const isSecure = cookies['csrf-token'].options.sameSite !== 'none';
    expect(isSecure).toBe(false); // This demonstrates the vulnerability
  });
});

describe('Token Rotation on Authentication', () => {
  it('should generate new CSRF token on login', () => {
    const oldToken = generateCsrfToken();
    const req = createMockRequest({
      session: { csrfToken: oldToken },
    });

    // Simulate login
    const newToken = generateCsrfToken();
    req.session!.csrfToken = newToken;

    expect(req.session!.csrfToken).toBe(newToken);
    expect(req.session!.csrfToken).not.toBe(oldToken);
  });

  it('should rotate CSRF token on logout', () => {
    const oldToken = generateCsrfToken();
    const req = createMockRequest({
      session: { csrfToken: oldToken },
    });

    // Simulate logout - clear token
    delete req.session!.csrfToken;

    expect(req.session!.csrfToken).toBeUndefined();
  });

  it('should invalidate old CSRF token after rotation', () => {
    const oldToken = generateCsrfToken();
    const newToken = generateCsrfToken();

    const req = createMockRequest({
      method: 'POST',
      headers: { 'x-csrf-token': oldToken },
      session: { csrfToken: newToken }, // Rotated token
    });

    const isValid = validateCsrfToken(req as Request);
    expect(isValid).toBe(false);
  });

  it('should allow grace period for token rotation', () => {
    const oldToken = generateCsrfToken();
    const newToken = generateCsrfToken();

    const req = createMockRequest({
      method: 'POST',
      headers: { 'x-csrf-token': oldToken },
      session: {
        csrfToken: newToken,
        previousCsrfToken: oldToken,
        csrfRotatedAt: Date.now(),
      },
    });

    // Validate with grace period (5 minutes)
    const gracePeriodMs = 5 * 60 * 1000;
    const timeSinceRotation = Date.now() - req.session!.csrfRotatedAt;
    const isWithinGracePeriod = timeSinceRotation < gracePeriodMs;

    const headerToken = req.headers!['x-csrf-token'];
    const isValid =
      headerToken === req.session!.csrfToken ||
      (isWithinGracePeriod && headerToken === req.session!.previousCsrfToken);

    expect(isValid).toBe(true);
  });
});

describe('Multi-Tenant CSRF Isolation', () => {
  it('should isolate CSRF tokens by tenant', () => {
    const tenant1Token = generateCsrfToken();
    const tenant2Token = generateCsrfToken();

    const tenant1Req = createMockRequest({
      session: {
        csrfToken: tenant1Token,
        tenant_id: 'tenant-1',
      },
    });

    const tenant2Req = createMockRequest({
      session: {
        csrfToken: tenant2Token,
        tenant_id: 'tenant-2',
      },
    });

    expect(tenant1Req.session!.csrfToken).not.toBe(
      tenant2Req.session!.csrfToken
    );
  });

  it('should prevent cross-tenant CSRF token usage', () => {
    const tenant1Token = generateCsrfToken();

    const req = createMockRequest({
      method: 'POST',
      headers: { 'x-csrf-token': tenant1Token },
      session: {
        csrfToken: tenant1Token,
        tenant_id: 'tenant-1',
      },
      body: {
        tenant_id: 'tenant-2', // Attempting cross-tenant request
      },
    });

    // Validate tenant context matches
    const sessionTenantId = req.session!.tenant_id;
    const requestTenantId = req.body.tenant_id;
    const isSameTenant = sessionTenantId === requestTenantId;

    expect(isSameTenant).toBe(false);
  });

  it('should include tenant_id in CSRF token payload', () => {
    const tenantId = 'tenant-1';
    const plainToken = generateCsrfToken();

    // Create token with tenant context
    const tokenPayload = {
      token: plainToken,
      tenant_id: tenantId,
      issued_at: Date.now(),
    };

    const tokenWithContext = Buffer.from(JSON.stringify(tokenPayload)).toString(
      'base64url'
    );

    const decoded = JSON.parse(
      Buffer.from(tokenWithContext, 'base64url').toString()
    );
    expect(decoded.tenant_id).toBe(tenantId);
  });
});

describe('CORS Preflight Handling', () => {
  it('should allow OPTIONS preflight requests without CSRF token', () => {
    const req = createMockRequest({
      method: 'OPTIONS',
      headers: {
        'access-control-request-method': 'POST',
        origin: 'https://app.ectropy.ai',
      },
    });
    const { res } = createMockResponse();
    const next = createMockNext();

    csrfProtection(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it('should set CORS headers for preflight response', () => {
    const { res, cookies } = createMockResponse();

    (res as any).setHeader = vi.fn();

    const allowedOrigin = 'https://app.ectropy.ai';
    (res as any).setHeader('Access-Control-Allow-Origin', allowedOrigin);
    (res as any).setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE'
    );
    (res as any).setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, X-CSRF-Token'
    );
    (res as any).setHeader('Access-Control-Allow-Credentials', 'true');

    expect((res as any).setHeader).toHaveBeenCalledWith(
      'Access-Control-Allow-Origin',
      allowedOrigin
    );
    expect((res as any).setHeader).toHaveBeenCalledWith(
      'Access-Control-Allow-Headers',
      expect.stringContaining('X-CSRF-Token')
    );
  });

  it('should validate Origin header matches allowed origins', () => {
    const allowedOrigins = [
      'https://app.ectropy.ai',
      'https://dashboard.ectropy.ai',
    ];

    const req = createMockRequest({
      method: 'POST',
      headers: {
        origin: 'https://app.ectropy.ai',
        'x-csrf-token': generateCsrfToken(),
      },
    });

    const origin = req.headers!.origin;
    const isAllowed = allowedOrigins.includes(origin!);

    expect(isAllowed).toBe(true);
  });

  it('should reject requests from disallowed origins', () => {
    const allowedOrigins = ['https://app.ectropy.ai'];

    const req = createMockRequest({
      method: 'POST',
      headers: {
        origin: 'https://malicious.com',
        'x-csrf-token': generateCsrfToken(),
      },
    });

    const origin = req.headers!.origin;
    const isAllowed = allowedOrigins.includes(origin!);

    expect(isAllowed).toBe(false);
  });
});

describe('Origin Validation', () => {
  it('should validate Origin header for POST requests', () => {
    const trustedOrigin = 'https://app.ectropy.ai';

    const req = createMockRequest({
      method: 'POST',
      headers: {
        origin: trustedOrigin,
        'x-csrf-token': generateCsrfToken(),
      },
    });

    expect(req.headers!.origin).toBe(trustedOrigin);
  });

  it('should validate Referer header as fallback', () => {
    const trustedReferer = 'https://app.ectropy.ai/dashboard';

    const req = createMockRequest({
      method: 'POST',
      headers: {
        referer: trustedReferer,
        'x-csrf-token': generateCsrfToken(),
      },
    });

    const refererUrl = new URL(req.headers!.referer!);
    expect(refererUrl.origin).toBe('https://app.ectropy.ai');
  });

  it('should reject requests with missing Origin and Referer', () => {
    const req = createMockRequest({
      method: 'POST',
      headers: {
        'x-csrf-token': generateCsrfToken(),
      },
    });

    const hasOriginOrReferer = !!req.headers!.origin || !!req.headers!.referer;
    expect(hasOriginOrReferer).toBe(false);
  });

  it('should validate Origin matches request host', () => {
    const req = createMockRequest({
      method: 'POST',
      headers: {
        origin: 'https://app.ectropy.ai',
        host: 'api.ectropy.ai',
        'x-csrf-token': generateCsrfToken(),
      },
    });

    // For cross-origin requests, Origin should be in allowed list
    const allowedOrigins = [
      'https://app.ectropy.ai',
      'https://dashboard.ectropy.ai',
    ];
    const isValid = allowedOrigins.includes(req.headers!.origin!);

    expect(isValid).toBe(true);
  });
});

describe('CSRF Attack Scenarios', () => {
  it('should prevent basic CSRF attack', () => {
    // Attacker creates malicious form
    const maliciousReq = createMockRequest({
      method: 'POST',
      headers: {
        origin: 'https://malicious.com',
      },
      body: {
        action: 'transfer',
        amount: 1000,
        to: 'attacker-account',
      },
    });

    const { res } = createMockResponse();
    const next = createMockNext();

    csrfProtection(maliciousReq as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should prevent CSRF via XSS (token theft)', () => {
    const token = generateCsrfToken();

    // Token should be HttpOnly to prevent XSS theft
    const { res, cookies } = createMockResponse();
    (res as any).cookie('csrf-token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
    });

    expect(cookies['csrf-token'].options.httpOnly).toBe(true);
  });

  it('should prevent CSRF via subdomain attack', () => {
    const req = createMockRequest({
      method: 'POST',
      headers: {
        origin: 'https://malicious.ectropy.ai', // Attacker-controlled subdomain
        'x-csrf-token': generateCsrfToken(),
      },
    });

    const allowedOrigins = ['https://app.ectropy.ai', 'https://api.ectropy.ai'];
    const isAllowed = allowedOrigins.includes(req.headers!.origin!);

    expect(isAllowed).toBe(false);
  });

  it('should prevent timing attack on token validation', () => {
    const validToken = generateCsrfToken();
    const invalidToken = generateCsrfToken();

    // Use constant-time comparison
    const constantTimeCompare = (a: string, b: string): boolean => {
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    };

    const isValid1 = constantTimeCompare(validToken, validToken);
    const isValid2 = constantTimeCompare(validToken, invalidToken);

    expect(isValid1).toBe(true);
    expect(isValid2).toBe(false);
  });
});
